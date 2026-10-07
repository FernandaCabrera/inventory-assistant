require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");
const { Resend } = require("resend");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { createPaypalPlan, isSubscriptionId } = require("./paypal");
const { createAccounts, cleanEmail } = require("./accounts");
const { memoryStore, supabaseStore } = require("./store");

const app = express();

// Hosting platforms put a proxy in front of the app, so the visitor's address arrives in the
// X-Forwarded-For header. Set TRUST_PROXY=false only if the server is exposed directly.
app.set("trust proxy", process.env.TRUST_PROXY !== "false");

// Set ALLOWED_ORIGINS (comma-separated) to accept browser calls only from your own sites,
// e.g. ALLOWED_ORIGINS=https://inventory-assistant-theta.vercel.app,https://app.mikardex.cl
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors(allowedOrigins.length > 0 ? { origin: allowedOrigins } : undefined));
app.use(express.json({ limit: "2mb" }));

process.on("uncaughtException", (err) => {
  console.error("FATAL - uncaughtException:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("FATAL - unhandledRejection:", err);
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

const ALERT_RECIPIENT = process.env.ALERT_RECIPIENT || "fcabrerar@micsh.cl";
const ALERT_SENDER = process.env.ALERT_SENDER || "Inventory Assistant <onboarding@resend.dev>";
// Where plan requests from the app are sent
const LEADS_RECIPIENT = process.env.LEADS_RECIPIENT || ALERT_RECIPIENT;

// ---- PLANS AND LIMITS ----
// The paid plan is unlocked with an access code. There are two kinds:
//   - Codes you hand out yourself. They live in the ACCESS_CODES environment variable,
//     comma-separated (ACCESS_CODES=CAFE-2291,TIENDA-8840). Remove a code to switch it off.
//   - A PayPal subscription. Whoever subscribes with the PayPal button gets their subscription
//     id (I-...) as their code, and it works for as long as the subscription is active. See paypal.js.
function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

const ACCESS_CODES = new Set((process.env.ACCESS_CODES || "").split(",").map(normalizeCode).filter(Boolean));

// Off until PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are set. PAYPAL_PLAN_ID is optional but
// recommended: with it, only a subscription to that plan unlocks. PAYPAL_ENV=sandbox for testing.
const paypalPlan = createPaypalPlan({
  clientId: process.env.PAYPAL_CLIENT_ID,
  secret: process.env.PAYPAL_CLIENT_SECRET,
  planId: process.env.PAYPAL_PLAN_ID,
  env: process.env.PAYPAL_ENV === "sandbox" ? "sandbox" : "live",
  apiBase: process.env.PAYPAL_API_BASE || undefined, // only for tests
});

// The visitor's network address, which the limits "per address" count by. Behind the host's proxy
// it comes from the X-Forwarded-For header, and on some hosts a visitor can write that header
// themselves and so look like someone new on every request. CLIENT_IP_HEADER names a header that
// the host sets and a visitor cannot (on Render, which sits behind Cloudflare: cf-connecting-ip).
// When it is not set, or a request comes without it, the address is the one Express works out.
const CLIENT_IP_HEADER = (process.env.CLIENT_IP_HEADER || "").trim().toLowerCase();
let saidHeaderMissing = false;
function clientIp(req) {
  if (CLIENT_IP_HEADER) {
    const value = String(req.get(CLIENT_IP_HEADER) || "").trim();
    if (net.isIP(value)) return value;
    if (!saidHeaderMissing) {
      saidHeaderMissing = true;
      console.warn(`[LIMITS] A request came without the header ${CLIENT_IP_HEADER} (CLIENT_IP_HEADER): its address was taken from X-Forwarded-For instead.`);
    }
  }
  return req.ip || "unknown";
}

function intEnv(name, fallback) {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const LIMITS = {
  // questions per day from one network address without a code (the app itself stops at 3 per browser)
  freePerIp: intEnv("FREE_DAILY_QUESTIONS_PER_IP", 10),
  // questions per day for one access code
  plan: intEnv("PLAN_DAILY_QUESTIONS", 100),
  // questions per day across everyone: the ceiling on what the AI can cost in a day
  global: intEnv("GLOBAL_DAILY_QUESTIONS", 200),
  codeFailuresPerIp: 20,
  requestsPerIp: 5,
  // signing in: requests for a code per day from one address, and codes typed per day from one
  signInsPerIp: 30,
  codeTriesPerIp: 60,
  // codes emailed per day to one address. With 5 tries per code this is also what bounds guessing
  // someone's code, whatever network address the guesses come from.
  signInsPerEmail: 10,
  // codes emailed per day in total, so that nobody can use up the day's allowance of the mail
  // service (100 a day on Resend's free plan) and leave nothing for the other emails
  signInEmailsPerDay: intEnv("SIGN_IN_EMAILS_PER_DAY", 80),
  // files recorded per day by one account
  analysesPerAccount: 300,
};

// SKUs sent to the AI per question. Larger inventories send the most urgent ones first.
const MAX_ITEMS_FOR_AI = intEnv("MAX_ITEMS_FOR_AI", 800);

// Daily counters, kept in memory: they reset at 00:00 UTC and when the server restarts.
const counters = { day: "", counts: new Map() };

function rollDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (counters.day !== today) {
    counters.day = today;
    counters.counts = new Map();
  }
}

function used(key) {
  rollDay();
  return counters.counts.get(key) || 0;
}

function take(key, max) {
  const current = used(key);
  if (current >= max) return false;
  counters.counts.set(key, current + 1);
  return true;
}

// Undo a take() that turned out not to be used
function giveBack(key) {
  const current = used(key);
  if (current > 0) counters.counts.set(key, current - 1);
}

// Is this code a paid plan? "active" | "inactive" | "unknown" (a PayPal code that could not be
// checked right now). An address that has sent too many wrong codes today gets no more questions
// to PayPal, only what is already known, so made-up codes cannot be used to flood PayPal.
async function planStatus(code, ip) {
  if (code === "") return "inactive";
  if (ACCESS_CODES.has(code)) return "active";
  const tooManyWrongCodes = used(`codefail:${ip}`) >= LIMITS.codeFailuresPerIp;
  return paypalPlan.check(code, { cacheOnly: tooManyWrongCodes });
}

// ---- ACCOUNTS ----
// Visitors sign in with their email and a 6-digit code (accounts.js). Off until the server has a
// database (SUPABASE_URL and SUPABASE_SECRET_KEY, with the tables of accounts.sql) and an address
// it may send email from (AUTH_SENDER, on a domain verified in Resend). While it is off the page
// works as before: no sign-in, and the free uploads are counted in the browser.
//
// ACCOUNTS_DEV=true is for trying accounts on your own computer without either: accounts are kept
// in memory and the codes are written to this log instead of emailed. Never set it on a live server.
const AUTH_SENDER = (process.env.AUTH_SENDER || "").trim();
const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const hasDatabase = SUPABASE_URL !== "" && SUPABASE_KEY !== "";
const canEmailCodes = Boolean(process.env.RESEND_API_KEY) && AUTH_SENDER !== "";
const ACCOUNTS_DEV = process.env.ACCOUNTS_DEV === "true" && !hasDatabase;

function signInEmail(code, lang) {
  const es = lang === "es";
  const lines = es
    ? { subject: `Tu código de MiKardex: ${code}`, lead: "Tu código para entrar a MiKardex es:", note: "Vence en 10 minutos. Si no lo pediste, ignora este correo: nadie puede entrar sin él." }
    : { subject: `Your MiKardex code: ${code}`, lead: "Your code to sign in to MiKardex is:", note: "It expires in 10 minutes. If you did not ask for it, ignore this email: nobody can sign in without it." };
  return {
    subject: lines.subject,
    text: `${lines.lead} ${code}\n\n${lines.note}\n\nMiKardex · mikardex.cl`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#15181A;">
        <div style="background:#15181A;color:#F4F1EA;padding:14px 20px;border-radius:10px 10px 0 0;font-size:13px;letter-spacing:2px;">MIKARDEX</div>
        <div style="border:1px solid #DADFD7;border-top:none;border-radius:0 0 10px 10px;padding:20px;">
          <p style="margin:0 0 12px;font-size:15px;">${lines.lead}</p>
          <p style="margin:0 0 16px;font-size:32px;font-weight:bold;letter-spacing:6px;font-family:monospace;">${code}</p>
          <p style="margin:0;font-size:13px;color:#6B7268;line-height:1.5;">${lines.note}</p>
        </div>
      </div>`,
  };
}

async function sendSignInCode({ email, code, lang }) {
  if (!canEmailCodes) {
    console.log(`[ACCOUNTS DEV] sign-in code for ${email}: ${code}`);
    return;
  }
  const { error } = await resend.emails.send({ from: AUTH_SENDER, to: email, ...signInEmail(code, lang) });
  if (error) throw new Error(error.message || "Resend did not accept the email");
}

// A new account is a new lead: the owner gets an email about it. The log line is the backup copy.
// A visitor's address is only ever emailed to a recipient set on purpose (LEADS_RECIPIENT or
// ALERT_RECIPIENT), never to the address written in this file as a fallback.
const ACCOUNT_NOTICE_TO = (process.env.LEADS_RECIPIENT || process.env.ALERT_RECIPIENT || "").trim();
async function tellOwnerAboutAccount(account) {
  console.log(`[ACCOUNT] new account: ${account.email} | lang=${account.lang} | news=${account.marketingOk ? "yes" : "no"}`);
  if (!canEmailCodes || !ACCOUNT_NOTICE_TO) return;
  const { error } = await resend.emails.send({
    from: AUTH_SENDER,
    to: ACCOUNT_NOTICE_TO,
    replyTo: account.email,
    subject: `MiKardex: new account ${account.email}`,
    text:
      `${account.email} opened an account to upload their own file.\n` +
      `Language: ${account.lang === "es" ? "Spanish" : "English"}\n` +
      `Wants tips and news by email: ${account.marketingOk ? "yes" : "no"}\n\n` +
      "Reply to this email to write to them directly.",
  });
  if (error) throw new Error(error.message || "Resend did not accept the email");
}

const accounts = createAccounts({
  store: hasDatabase ? supabaseStore({ url: SUPABASE_URL, key: SUPABASE_KEY }) : ACCOUNTS_DEV ? memoryStore() : null,
  sendCode: canEmailCodes || ACCOUNTS_DEV ? sendSignInCode : null,
  onNewAccount: tellOwnerAboutAccount,
  freeUploads: intEnv("FREE_UPLOADS", 3),
});

// The key a signed-in browser sends: "Authorization: Bearer <key>"
function sessionKey(req) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get("authorization") || "");
  return match ? match[1] : "";
}

// What the page gets to know about an account
async function accountView(account, ip) {
  const plan = account.planCode ? await planStatus(normalizeCode(account.planCode), ip) : "inactive";
  return {
    email: account.email,
    createdAt: account.createdAt,
    marketingOk: account.marketingOk,
    plan, // "active" | "inactive" | "unknown" (PayPal could not be asked right now)
    planCode: account.planCode,
    uploadsUsed: account.uploadsUsed,
    uploadsMax: accounts.freeUploads,
    analyses: await accounts.history(account),
  };
}

// The same without asking anyone anything, for when the rest could not be fetched just now
function accountBasics(account) {
  return {
    email: account.email,
    createdAt: account.createdAt,
    marketingOk: account.marketingOk,
    plan: account.planCode ? "unknown" : "inactive",
    planCode: account.planCode,
    uploadsUsed: account.uploadsUsed,
    uploadsMax: accounts.freeUploads,
    analyses: [],
  };
}

// The database may be down or asleep: the page is told "unavailable" and carries on without the
// account, instead of getting an error it cannot explain.
function withAccounts(handler) {
  return async (req, res) => {
    if (!accounts.enabled) return res.status(503).json({ error: "disabled" });
    try {
      await handler(req, res);
    } catch (error) {
      console.error("[ACCOUNTS]", error && error.message);
      if (!res.headersSent) res.status(503).json({ error: "unavailable" });
    }
  };
}

// For the routes that need someone signed in: answers 401 itself when nobody is
function withAccount(handler) {
  return withAccounts(async (req, res) => {
    const account = await accounts.authenticate(sessionKey(req));
    if (!account) return res.status(401).json({ error: "signed_out" });
    return handler(req, res, account);
  });
}

// Supabase pauses a free database after a week without use. Visits to the page call /api/health,
// so the database is asked something small from there, at most once an hour.
let lastDatabasePing = 0;
function keepDatabaseAwake() {
  if (!accounts.enabled || Date.now() - lastDatabasePing < 60 * 60 * 1000) return;
  lastDatabasePing = Date.now();
  accounts.ping().catch((error) => console.error("[ACCOUNTS] The database could not be reached:", error && error.message));
}

const SYSTEM_PROMPT = `You are a senior inventory planning analyst advising the owner or operations manager of a small or
mid-sized business. They need clear, decision-ready answers — not raw data dumps.
You will be given the current inventory dataset as JSON and a question.

THE DATA:
- Each record has: sku, name, warehouse, stock (units on hand), reorder_point, lead_time_days,
  avg_daily_usage (units per day, from recent sales) and sometimes unit_cost (cost per unit, in the
  business's own currency) and on_order (units already ordered from the supplier and not yet received).
- When on_order is present, count it before recommending a new order: what matters is stock + on_order
  against the reorder point. Say when a product is low but an order is already on its way.
- A field that is missing from a record is unknown — say so rather than assuming a value.
- avg_daily_usage of 0 with stock above 0 means the product did not sell in the period: that stock is
  capital tied up. Never recommend reordering it; recommend what to do with it (hold purchases, promote,
  bundle, liquidate).
- When unit_cost is present, quantify money where it helps the decision (stock x unit_cost). When it is
  absent, say that value cannot be calculated without a unit cost column.

DATA DISCIPLINE:
- Answer only using information derived from the dataset — never invent SKUs, quantities, or dates.
- If a question requires data you don't have (e.g. sales forecast, supplier reliability), say so explicitly rather than guessing.
- You are read-only: you report and recommend, but you never modify inventory records.
- If a question is unrelated to this inventory (e.g. general chat, other topics), say plainly that it's
  outside what you can help with here, and redirect to what you can do — do not attempt to answer it anyway.
- If the dataset is too thin to support real confidence (e.g. no historical trend, no seasonality data),
  say so rather than presenting a recommendation with more certainty than the data actually supports.
- If a note says only part of the inventory is included, base totals on the summary in that note and say
  that the detail covers the most urgent SKUs.

HOW TO ANALYZE:
- When asked about stockouts or reorder status, compare "stock" against "reorder_point" for every relevant SKU.
- For each item you flag, calculate days of cover remaining: stock ÷ avg_daily_usage.
- When a reorder is needed, show the math: avg_daily_usage x lead_time_days = minimum units needed to survive
  the lead time, then note that a safety buffer on top of that is standard practice.
- Rank multiple flagged items by urgency (lowest days of cover first), not by SKU order or dataset order.
- Where relevant, name the likely operational cause in plain terms, but only when the dataset supports the
  inference — do not fabricate causes like weather or supplier issues that aren't in the data.

HOW TO RECOMMEND:
- Every flagged item should end with a concrete recommended action: what to order, roughly how much
  (base need + buffer), and by when.
- If several items are urgent, state which one to act on first and why.
- If nothing is urgent, say so plainly and briefly.

STYLE (for the "narrative" field):
- Detect the language of the question (Spanish or English) and respond in that same language. Everything
  you write — narrative, section headings, issues and recommended actions — is in that language.
- Write like an experienced analyst briefing a manager: direct, concise, no filler.
- Do NOT use markdown headers (#), tables, or bullet symbols (-, *) at the start of lines.
- You MAY wrap the single most important conclusion or figure in double asterisks like **this** — sparingly.
- If listing multiple items, use plain numbered lines like "1." not markdown lists.
- If the question asks for a full inventory status report (the kind presented in a weekly or monthly
  operations review meeting), structure the narrative into these plain-text sections, each starting on
  its own line and ending with a colon, still with no markdown symbols:
  "Executive Summary:", "Stock Status Overview:", "Reorder Actions Required:",
  "Excess & Slow-Moving Inventory:", "Recommendations:"
  (in Spanish: "Resumen ejecutivo:", "Estado general del stock:", "Acciones de reposición requeridas:",
  "Inventario en exceso y de baja rotación:", "Recomendaciones:")
  Keep each section tight — this is a report a manager reads in 2 minutes before a meeting, not a document
  they study for 20.

OUTPUT FORMAT — respond with ONLY valid JSON, no other text, no markdown code fences, matching this shape:
{
  "narrative": "the full conversational answer as plain text, following the STYLE rules above",
  "action_items": [
    {
      "sku": "SKU code or empty string if not applicable",
      "issue": "short description of the issue, e.g. 'Below reorder point, 2 days of cover'",
      "recommended_action": "short concrete action, e.g. 'Order 60 units by Aug 20'",
      "priority": "High" | "Medium" | "Low" | "None"
    }
  ],
  "relevant_charts": ["status_overview" | "days_of_cover" | "warehouse_distribution"]
}
The "priority" value is always one of those four English words, whatever the language of the answer.
Only include entries in action_items for SKUs that actually need action given the question asked. If the
question doesn't naturally produce SKU-level actions (e.g. a general question with no flagged items), return
an empty array for action_items — do not force irrelevant rows.

For relevant_charts, pick only the charts that actually help answer THIS question — do not default to all three:
- "status_overview": a bar count of SKUs by status (critical/low/ok/no sales/excess) — use for broad status
  questions and full reports.
- "days_of_cover": days of cover per SKU, ranked — use for reorder/stockout/urgency questions.
- "warehouse_distribution": total units per warehouse — use for questions about warehouse balance or
  where stock is concentrated.
For a full inventory status report, include all three. For a narrow question (e.g. only about excess stock,
or only about one SKU), include only the chart(s) that are genuinely relevant, which may be zero.`;

// ---- DATA PROTECTION ----
// Fields that should never be sent to the AI, even if a future dataset includes them
// (e.g. if customer/buyer records get merged into inventory data down the line).
const SENSITIVE_FIELD_PATTERNS = [
  /email/i,
  /phone/i,
  /customer.*name/i,
  /buyer.*name/i,
  /contact/i,
  /address/i,
  /ssn/i,
  /sin/i, // Canadian Social Insurance Number
  /tax.?id/i,
  /credit.?card/i,
  /account.?number/i,
];

function isSensitiveField(key) {
  return SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(key));
}

function sanitizeInventory(inventory) {
  if (!Array.isArray(inventory)) return inventory;
  return inventory.map((item) => {
    const clean = {};
    for (const [key, value] of Object.entries(item)) {
      if (!isSensitiveField(key)) {
        clean[key] = value;
      }
    }
    return clean;
  });
}

// Second layer: only the fields the analysis uses go to the AI, whatever the browser sent.
const ITEM_FIELDS = ["sku", "name", "warehouse", "stock", "reorder_point", "lead_time_days", "avg_daily_usage", "unit_cost", "on_order"];

function compactItem(item) {
  const out = {};
  for (const key of ITEM_FIELDS) {
    const value = item[key];
    if (typeof value === "string" && value !== "") out[key] = value.slice(0, 120);
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

function statusFor(item) {
  const stock = Math.max(0, Number(item.stock) || 0);
  const usage = typeof item.avg_daily_usage === "number" ? item.avg_daily_usage : null;
  const reorder = typeof item.reorder_point === "number" ? item.reorder_point : null;
  if (usage !== null && usage <= 0) return stock > 0 ? "idle" : "ok";
  if (reorder !== null && reorder > 0) {
    const ratio = stock / reorder;
    if (ratio < 0.5) return "critical";
    if (ratio < 1) return "low";
    if (ratio > 3) return "excess";
  }
  return "ok";
}

const URGENCY = { critical: 0, low: 1, idle: 2, excess: 3, ok: 4 };

function prepareInventory(inventory) {
  const clean = sanitizeInventory(inventory.filter((item) => item && typeof item === "object" && !Array.isArray(item)))
    .map(compactItem)
    .filter((item) => item.sku !== undefined || item.name !== undefined);

  if (clean.length <= MAX_ITEMS_FOR_AI) return { items: clean, note: "" };

  const counts = { critical: 0, low: 0, ok: 0, idle: 0, excess: 0 };
  let units = 0;
  const ranked = clean.map((item, index) => {
    const status = statusFor(item);
    counts[status] += 1;
    units += Math.max(0, Number(item.stock) || 0);
    return { item, index, rank: URGENCY[status] };
  });
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);

  const note =
    `NOTE: this inventory has ${clean.length} SKUs. Only the ${MAX_ITEMS_FOR_AI} most urgent are listed below ` +
    `(critical first, then low, no sales, excess, ok). Whole-inventory summary: ${counts.critical} critical, ` +
    `${counts.low} low, ${counts.idle} with no sales, ${counts.excess} excess, ${counts.ok} ok; ${units} units in total.\n\n`;
  return { items: ranked.slice(0, MAX_ITEMS_FOR_AI).map((r) => r.item), note };
}

app.post("/api/ask", async (req, res) => {
  const body = req.body || {};
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length > 2000 || !Array.isArray(body.inventory) || body.inventory.length === 0) {
    return res.status(400).json({ error: "bad_request" });
  }

  const ip = clientIp(req);
  let code = normalizeCode(body.code);
  // No code in this browser: the plan may be on the account that is signed in
  if (!code && accounts.enabled && sessionKey(req)) {
    try {
      const account = await accounts.authenticate(sessionKey(req));
      if (account) code = normalizeCode(account.planCode);
    } catch (error) {
      console.error("[ACCOUNTS]", error && error.message); // the question goes ahead on the free limits
    }
  }
  const plan = await planStatus(code, ip);
  const hasPlan = plan === "active";
  // a PayPal code that is not a live subscription counts as a wrong code for this address
  if (plan === "inactive" && isSubscriptionId(code)) take(`codefail:${ip}`, LIMITS.codeFailuresPerIp);

  if (used("global") >= LIMITS.global) {
    console.warn(`[LIMIT] global daily limit reached (${LIMITS.global})`);
    return res.status(429).json({ error: "limit", scope: "global" });
  }
  const allowed = hasPlan ? take(`plan:${code}`, LIMITS.plan) : take(`free:${ip}`, LIMITS.freePerIp);
  if (!allowed) {
    return res.status(429).json({ error: "limit", scope: hasPlan ? "plan" : "free" });
  }
  take("global", LIMITS.global);

  try {
    const { items, note } = prepareInventory(body.inventory);
    console.log(`[ASK] ${hasPlan ? "plan" : "free"} skus=${body.inventory.length} sent=${items.length} today=${used("global")}`);

    // Reconstruct prior turns as plain alternating user/assistant messages.
    // The dataset is re-attached only to the CURRENT question, so every call
    // always reasons over fresh data while still remembering prior exchanges.
    const priorTurns = Array.isArray(body.history)
      ? body.history
          .slice(-6)
          .filter((h) => h && typeof h.text === "string" && h.text.trim() !== "")
          .map((h) => ({
            role: h.role === "user" ? "user" : "assistant",
            content: h.text.slice(0, 6000),
          }))
      : [];

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        ...priorTurns,
        {
          role: "user",
          content: `${note}INVENTORY DATASET:\n${JSON.stringify(items)}\n\nQUESTION: ${question}`,
        },
      ],
    });

    const raw = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    let parsed;
    try {
      const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      parsed = { narrative: raw, action_items: [] };
    }

    res.json({
      answer: parsed.narrative || raw,
      actionItems: Array.isArray(parsed.action_items) ? parsed.action_items : [],
      relevantCharts: Array.isArray(parsed.relevant_charts) ? parsed.relevant_charts : [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ answer: "Sorry, something went wrong processing that question.", actionItems: [] });
  }
});

// The page calls this when it opens, so a sleeping server is awake by the time the visitor asks something.
// It also says whether PayPal is set up, so the page only offers to pay when a payment can be confirmed,
// and whether accounts are, so the page only asks to sign in when signing in can work.
app.get("/api/health", (req, res) => {
  keepDatabaseAwake();
  res.json({ ok: true, paypal: paypalPlan.enabled, accounts: accounts.enabled });
});

// ---- SIGNING IN ----

// Step 1: the visitor typed their email; a code is emailed to them.
app.post(
  "/api/auth/start",
  withAccounts(async (req, res) => {
    const ip = clientIp(req);
    const body = req.body || {};
    const email = cleanEmail(body.email);
    if (!email) return res.status(400).json({ error: "email" });
    if (!take(`signin:${ip}`, LIMITS.signInsPerIp)) return res.status(429).json({ error: "limit" });
    // The allowances of the email and of the day are for codes that were really emailed: they are
    // held while the code is sent and given back when none went out ("wait a minute", an error).
    const perEmail = `signinmail:${email}`;
    if (!take(perEmail, LIMITS.signInsPerEmail)) return res.status(429).json({ error: "limit" });
    if (!take("signinmail:all", LIMITS.signInEmailsPerDay)) {
      giveBack(perEmail);
      // said once a day
      if (take("signinmail:said", 1)) console.error(`[ACCOUNTS] ${LIMITS.signInEmailsPerDay} sign-in codes were emailed today (SIGN_IN_EMAILS_PER_DAY): no more until 00:00 UTC. Visitors can still upload without an account.`);
      return res.status(503).json({ error: "unavailable" });
    }
    let sent = false;
    try {
      const result = await accounts.start(email, { lang: body.lang });
      sent = result.ok;
      if (result.ok) return res.json({ ok: true });
      if (result.error === "wait") return res.status(429).json({ error: "wait", seconds: result.seconds });
      if (result.error === "email") return res.status(400).json({ error: "email" });
      return res.status(503).json({ error: "unavailable" });
    } finally {
      if (!sent) {
        giveBack(perEmail);
        giveBack("signinmail:all");
      }
    }
  })
);

// Step 2: they typed the code. The answer carries the key the browser keeps to stay signed in.
app.post(
  "/api/auth/verify",
  withAccounts(async (req, res) => {
    const ip = clientIp(req);
    const body = req.body || {};
    if (!take(`codetry:${ip}`, LIMITS.codeTriesPerIp)) return res.status(429).json({ error: "limit" });
    const result = await accounts.verify(body.email, body.code, { lang: body.lang, marketingOk: body.marketingOk === true });
    if (!result.ok) return res.status(400).json({ error: result.error, left: result.left });
    // The code is used up by now: the key is handed over even if the history cannot be read just
    // now, or the visitor would be left with a spent code and no way in.
    let account;
    try {
      account = await accountView(result.account, ip);
    } catch (error) {
      console.error("[ACCOUNTS] Signed in, but the rest of the account could not be read:", error && error.message);
      account = accountBasics(result.account);
    }
    res.json({ ok: true, token: result.token, created: result.created, account });
  })
);

app.post(
  "/api/auth/signout",
  withAccounts(async (req, res) => {
    await accounts.signOut(sessionKey(req));
    res.json({ ok: true });
  })
);

// ---- THE ACCOUNT ----

app.get(
  "/api/me",
  withAccount(async (req, res, account) => {
    res.json({ account: await accountView(account, clientIp(req)) });
  })
);

// What the visitor can change: whether they want tips and news by email
app.patch(
  "/api/account",
  withAccount(async (req, res, account) => {
    const body = req.body || {};
    const updated = typeof body.marketingOk === "boolean" ? await accounts.setMarketing(account, body.marketingOk) : account;
    res.json({ account: await accountView(updated || account, clientIp(req)) });
  })
);

app.delete(
  "/api/account",
  withAccount(async (req, res, account) => {
    await accounts.remove(account);
    console.log("[ACCOUNT] an account was deleted by its owner");
    res.json({ ok: true });
  })
);

// A code the visitor already has (a PayPal subscription or one handed out) is tied to the account,
// so the plan follows them to any browser they sign in on.
app.post(
  "/api/account/plan",
  withAccount(async (req, res, account) => {
    const ip = clientIp(req);
    if (used(`codefail:${ip}`) >= LIMITS.codeFailuresPerIp) return res.status(429).json({ valid: false, error: "limit" });
    const code = normalizeCode(req.body && req.body.code);
    const status = await planStatus(code, ip);
    if (status === "unknown") return res.status(503).json({ error: "unavailable" });
    if (status !== "active") {
      take(`codefail:${ip}`, LIMITS.codeFailuresPerIp);
      return res.json({ valid: false });
    }
    const updated = await accounts.setPlanCode(account, code);
    res.json({ valid: true, account: await accountView(updated || account, ip) });
  })
);

// A file was analyzed in the browser: its figures (not its products) join the account's history.
app.post(
  "/api/analyses",
  withAccount(async (req, res, account) => {
    const ip = clientIp(req);
    const body = req.body || {};
    if (!take(`analyses:${account.id}`, LIMITS.analysesPerAccount)) return res.status(429).json({ error: "limit" });
    const paid = account.planCode !== "" && (await planStatus(normalizeCode(account.planCode), ip)) === "active";
    const result = await accounts.recordAnalysis(account, { fileName: body.fileName, figures: body.figures }, { paid });
    if (!result.ok) return res.status(402).json({ error: "limit", account: await accountView(account, ip) });
    res.json({ ok: true, analysisId: result.analysis.id, account: await accountView(result.account, ip) });
  })
);

app.delete(
  "/api/analyses",
  withAccount(async (req, res, account) => {
    await accounts.clearHistory(account);
    res.json({ ok: true, account: await accountView(account, clientIp(req)) });
  })
);

// The AI's instructions are private by default. Set EXPOSE_SYSTEM_PROMPT=true (together with
// SHOW_PROMPT in src/config.js) to show them in the app, e.g. for a demo.
app.get("/api/system-prompt", (req, res) => {
  if (process.env.EXPOSE_SYSTEM_PROMPT !== "true") return res.status(404).json({ error: "not_found" });
  res.json({ prompt: SYSTEM_PROMPT });
});

// ---- ACCESS CODES ----

app.post("/api/validate-code", async (req, res) => {
  const ip = clientIp(req);
  if (used(`codefail:${ip}`) >= LIMITS.codeFailuresPerIp) {
    return res.status(429).json({ valid: false, error: "limit" });
  }
  const code = normalizeCode(req.body && req.body.code);
  const status = await planStatus(code, ip);
  // PayPal could not be reached: say so instead of "not valid", so the page keeps the
  // customer's code and tries again on their next visit.
  if (status === "unknown") return res.status(503).json({ error: "unavailable" });
  const valid = status === "active";
  if (!valid) take(`codefail:${ip}`, LIMITS.codeFailuresPerIp);
  res.json({ valid });
});

// ---- PAYPAL ----
// The visitor has just subscribed with the PayPal button: the page sends the subscription id and,
// once PayPal confirms it is active, gets it back as the access code.
app.post("/api/paypal/activate", async (req, res) => {
  const ip = clientIp(req);
  if (used(`codefail:${ip}`) >= LIMITS.codeFailuresPerIp) {
    return res.status(429).json({ valid: false, error: "limit" });
  }
  const subscriptionId = normalizeCode(req.body && req.body.subscriptionId);
  const result = await paypalPlan.activate(subscriptionId);

  if (result.ok) {
    // the code opens the plan, so only its last characters go in the log (enough to find it in PayPal)
    console.log(`[PLAN] PayPal subscription activated: I-...${result.code.slice(-5)}`);
    // Whoever pays while signed in has the plan on their account from now on
    let linked = false;
    if (accounts.enabled && sessionKey(req)) {
      try {
        const account = await accounts.authenticate(sessionKey(req));
        if (account) linked = Boolean(await accounts.setPlanCode(account, result.code));
      } catch (error) {
        console.error("[ACCOUNTS] The subscription could not be tied to the account:", error && error.message);
      }
    }
    return res.json({ valid: true, code: result.code, linked });
  }
  // could not be confirmed right now: the page keeps the subscription id and tries again
  if (result.error === "unavailable" || result.error === "disabled" || result.error === "pending") {
    if (result.error === "disabled") console.error("[PAYPAL] A subscription came in but PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set.");
    return res.status(503).json({ error: result.error === "pending" ? "pending" : "unavailable" });
  }
  take(`codefail:${ip}`, LIMITS.codeFailuresPerIp);
  res.json({ valid: false, error: result.error });
});

// ---- PLAN REQUESTS ----
// Someone in the app asked for the paid plan: email it to the owner.

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const REASONS = {
  upload: "wanted to load another file",
  questions: "ran out of free questions",
  dashboard: "wanted the dashboard",
  orders: "wanted the full order list",
  counts: "wanted the cycle count report in Excel",
};

app.post("/api/upgrade-request", async (req, res) => {
  const body = req.body || {};
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  const lang = body.lang === "es" ? "es" : "en";
  const skuCount = Number.isFinite(Number(body.skuCount)) ? Math.max(0, Math.round(Number(body.skuCount))) : 0;
  const reason = REASONS[body.reason] || "opened the plan";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: "email" });
  }
  const ip = clientIp(req);
  if (!take(`request:${ip}`, LIMITS.requestsPerIp)) {
    return res.status(429).json({ ok: false, error: "limit" });
  }

  // The log line is the backup copy if the email cannot be delivered.
  console.log(`[PLAN REQUEST] ${email} | lang=${lang} | skus=${skuCount} | ${reason} | ${note}`);

  try {
    const { error } = await resend.emails.send({
      from: ALERT_SENDER,
      to: LEADS_RECIPIENT,
      replyTo: email,
      subject: `MiKardex: plan request from ${email}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
          <div style="background:#15181A;color:#F4F1EA;padding:16px 20px;border-radius:10px 10px 0 0;">
            <h2 style="margin:0;font-size:16px;">New plan request</h2>
          </div>
          <div style="border:1px solid #DADFD7;border-top:none;border-radius:0 0 10px 10px;padding:16px 20px;font-size:14px;color:#15181A;line-height:1.6;">
            <p style="margin:0 0 8px;"><strong>Email:</strong> ${escapeHTML(email)}</p>
            <p style="margin:0 0 8px;"><strong>Language:</strong> ${lang === "es" ? "Spanish" : "English"}</p>
            <p style="margin:0 0 8px;"><strong>Products loaded:</strong> ${skuCount || "sample data only"}</p>
            <p style="margin:0 0 8px;"><strong>What happened:</strong> ${escapeHTML(reason)}</p>
            <p style="margin:0 0 8px;"><strong>Their note:</strong> ${note ? escapeHTML(note) : "—"}</p>
            <p style="font-size:12px;color:#6B7268;margin:14px 0 0;">Reply to this email to write to them directly.</p>
          </div>
        </div>`,
    });
    if (error) {
      console.error("Plan request email failed:", error);
      return res.status(502).json({ ok: false, error: "send" });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Plan request email failed:", err);
    res.status(502).json({ ok: false, error: "send" });
  }
});

// ---- EMAIL ALERTS ----

function loadInventory() {
  const filePath = path.join(__dirname, "..", "src", "data", "inventory.json");
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function buildAlertHTML(criticalItems) {
  const rows = criticalItems
    .map((item) => {
      const daysOfCover = (item.stock / item.avg_daily_usage).toFixed(1);
      return `
        <tr style="border-bottom:1px solid #EEEBE1;">
          <td style="padding:8px 10px;font-family:monospace;font-size:12px;color:#232323;">${item.sku}</td>
          <td style="padding:8px 10px;font-size:13px;color:#232323;">${item.name}</td>
          <td style="padding:8px 10px;font-size:13px;color:#232323;">${item.warehouse}</td>
          <td style="padding:8px 10px;font-size:13px;color:#B3261E;font-weight:600;">${item.stock} / ${item.reorder_point}</td>
          <td style="padding:8px 10px;font-size:13px;color:#232323;">${daysOfCover} days</td>
        </tr>`;
    })
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1C3D2E;color:#F4F1EA;padding:16px 20px;border-radius:10px 10px 0 0;">
        <h2 style="margin:0;font-size:16px;">⚠️ ${criticalItems.length} SKU${criticalItems.length > 1 ? "s" : ""} need reordering</h2>
      </div>
      <div style="border:1px solid #EEEBE1;border-top:none;border-radius:0 0 10px 10px;padding:16px 20px;">
        <p style="font-size:13px;color:#4A4838;">
          Your inventory assistant flagged the following as critical or below reorder point:
        </p>
        <table style="width:100%;border-collapse:collapse;margin-top:10px;">
          <thead>
            <tr style="background:#F4F1EA;">
              <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6B6858;">SKU</th>
              <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6B6858;">Name</th>
              <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6B6858;">Warehouse</th>
              <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6B6858;">Stock/Reorder</th>
              <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6B6858;">Days of Cover</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="font-size:11px;color:#8A8677;margin-top:16px;">
          Sent automatically because stock fell below reorder point. Open the assistant to ask follow-up questions.
        </p>
      </div>
    </div>`;
}

async function checkInventoryAndAlert(triggeredManually = false) {
  try {
    const inventory = loadInventory();
    const flagged = inventory.filter((item) => {
      const status = statusFor(item);
      return status === "critical" || status === "low";
    });

    if (flagged.length === 0) {
      console.log(`[${new Date().toLocaleTimeString()}] Inventory check: all clear, no alert sent.`);
      return { sent: false, reason: "No SKUs below reorder point." };
    }

    const { data, error } = await resend.emails.send({
      from: ALERT_SENDER,
      to: ALERT_RECIPIENT,
      subject: `⚠️ ${flagged.length} SKU${flagged.length > 1 ? "s" : ""} need reordering today`,
      html: buildAlertHTML(flagged),
    });

    if (error) {
      console.error("Resend error:", error);
      return { sent: false, reason: error.message };
    }

    console.log(`[${new Date().toLocaleTimeString()}] Alert sent to ${ALERT_RECIPIENT} (${flagged.length} SKUs flagged).${triggeredManually ? " (manual trigger)" : " (cron trigger)"}`);
    return { sent: true, flaggedCount: flagged.length, emailId: data?.id };
  } catch (err) {
    console.error("Alert check failed:", err);
    return { sent: false, reason: err.message };
  }
}

// Manual trigger endpoint — lets you test without waiting for the cron schedule
app.post("/api/send-alert", async (req, res) => {
  if (!take(`alert:${clientIp(req)}`, 10)) {
    return res.status(429).json({ sent: false, reason: "Daily limit for manual alerts reached." });
  }
  const result = await checkInventoryAndAlert(true);
  res.json(result);
});

// Cron: daily at 8:00 AM (server time) on the sample dataset.
// For a live demo, set ALERT_CRON="*/5 * * * *" to run every 5 minutes.
// The alert and the plan requests share one Resend account, so a 5-minute schedule
// left on in production can use up the daily email allowance.
const ALERT_CRON = cron.validate(process.env.ALERT_CRON || "") ? process.env.ALERT_CRON : "0 8 * * *";
cron.schedule(ALERT_CRON, () => {
  checkInventoryAndAlert(false);
});

console.log(`Email alert cron scheduled: ${ALERT_CRON}`);

// Malformed or oversized requests get a short JSON answer instead of a stack trace.
app.use((err, req, res, next) => {
  if (err && err.type === "entity.too.large") return res.status(413).json({ error: "too_large" });
  if (err instanceof SyntaxError) return res.status(400).json({ error: "bad_json" });
  console.error(err);
  res.status(500).json({ error: "server" });
});

console.log(
  `Plans: ${ACCESS_CODES.size} access code(s) loaded. Daily limits: ${LIMITS.freePerIp} free per address, ` +
    `${LIMITS.plan} per code, ${LIMITS.global} in total.`
);
console.log(
  paypalPlan.enabled
    ? `PayPal: on (${process.env.PAYPAL_ENV === "sandbox" ? "sandbox" : "live"})${process.env.PAYPAL_PLAN_ID ? `, only for plan ${process.env.PAYPAL_PLAN_ID}` : ""}.`
    : "PayPal: off (set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to accept subscriptions)."
);

if (accounts.enabled) {
  console.log(`Accounts: on (${hasDatabase ? "Supabase" : "kept in memory, codes written to this log: only for trying it out"}). Free uploads per account: ${accounts.freeUploads}.`);
  // said once at start, so a wrong key or missing tables show up in the log and not with the first visitor
  accounts
    .ping()
    .then(() => console.log("Accounts: the database answered."))
    .catch((error) => console.error(`Accounts: the database could NOT be reached. Check SUPABASE_URL and SUPABASE_SECRET_KEY, and that accounts.sql was run. (${error && error.message})`));
} else {
  const missing = [!hasDatabase && "SUPABASE_URL and SUPABASE_SECRET_KEY", !canEmailCodes && "AUTH_SENDER (and RESEND_API_KEY)"].filter(Boolean).join(", ");
  console.log(`Accounts: off (set ${missing} to let visitors sign in).`);
}
console.log(
  CLIENT_IP_HEADER
    ? `Limits per address: counted by the header ${CLIENT_IP_HEADER}.`
    : "Limits per address: counted by X-Forwarded-For. If the host lets visitors write that header, set CLIENT_IP_HEADER (on Render: cf-connecting-ip)."
);

const PORT = 4001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
