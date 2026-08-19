require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");
const { Resend } = require("resend");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

process.on("uncaughtException", (err) => {
  console.error("FATAL - uncaughtException:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("FATAL - unhandledRejection:", err);
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

const ALERT_RECIPIENT = "fcabrerar@micsh.cl";
const ALERT_SENDER = "Inventory Assistant <onboarding@resend.dev>";

const SYSTEM_PROMPT = `You are a senior inventory planning analyst for a food manufacturing company.
You are advising an operations manager who needs clear, decision-ready answers — not raw data dumps.
You will be given the current inventory dataset as JSON and a question.

DATA DISCIPLINE:
- Answer only using information derived from the dataset — never invent SKUs, quantities, or dates.
- If a question requires data you don't have (e.g. sales forecast, supplier reliability), say so explicitly rather than guessing.
- You are read-only: you report and recommend, but you never modify inventory records.
- If a question is unrelated to this inventory (e.g. general chat, other topics), say plainly that it's
  outside what you can help with here, and redirect to what you can do — do not attempt to answer it anyway.
- If the dataset is too thin to support real confidence (e.g. no historical trend, no seasonality data),
  say so rather than presenting a recommendation with more certainty than the data actually supports.

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
- Detect the language of the question and respond in the same language.
- Write like an experienced analyst briefing a manager: direct, concise, no filler.
- Do NOT use markdown headers (#), tables, or bullet symbols (-, *) at the start of lines.
- You MAY wrap the single most important conclusion or figure in double asterisks like **this** — sparingly.
- If listing multiple items, use plain numbered lines like "1." not markdown lists.
- If the question asks for a full inventory status report (the kind presented in a weekly or monthly
  operations review meeting), structure the narrative into these plain-text sections, each starting on
  its own line and ending with a colon, still with no markdown symbols:
  "Executive Summary:", "Stock Status Overview:", "Reorder Actions Required:",
  "Excess & Slow-Moving Inventory:", "Recommendations:"
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
Only include entries in action_items for SKUs that actually need action given the question asked. If the
question doesn't naturally produce SKU-level actions (e.g. a general question with no flagged items), return
an empty array for action_items — do not force irrelevant rows.

For relevant_charts, pick only the charts that actually help answer THIS question — do not default to all three:
- "status_overview": a bar count of SKUs by status (critical/low/ok/excess) — use for broad status questions
  and full reports.
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

app.post("/api/ask", async (req, res) => {
  try {
    const { question, inventory, history } = req.body;
    const safeInventory = sanitizeInventory(inventory);

    // Reconstruct prior turns as plain alternating user/assistant messages.
    // The dataset is re-attached only to the CURRENT question, so every call
    // always reasons over fresh data while still remembering prior exchanges.
    const priorTurns = Array.isArray(history)
      ? history.slice(-6).map((h) => ({
          role: h.role === "user" ? "user" : "assistant",
          content: h.text,
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
          content: `INVENTORY DATASET:\n${JSON.stringify(safeInventory)}\n\nQUESTION: ${question}`,
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

app.get("/api/system-prompt", (req, res) => {
  res.json({ prompt: SYSTEM_PROMPT });
});

// ---- EMAIL ALERTS ----

function loadInventory() {
  const filePath = path.join(__dirname, "..", "src", "data", "inventory.json");
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function statusFor(item) {
  const ratio = item.stock / item.reorder_point;
  if (ratio < 0.5) return "critical";
  if (ratio < 1) return "low";
  if (ratio > 3) return "excess";
  return "ok";
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
  const result = await checkInventoryAndAlert(true);
  res.json(result);
});

// Cron: runs every 5 minutes for today's demo.
// For production, change to daily: "0 8 * * *" (8:00 AM every day)
cron.schedule("*/5 * * * *", () => {
  checkInventoryAndAlert(false);
});

console.log("Email alert cron scheduled: every 5 minutes (demo mode).");

const PORT = 4001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));