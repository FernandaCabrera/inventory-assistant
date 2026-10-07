// Accounts: signing in with an email and a 6-digit code, and what an account keeps.
//
// How signing in works:
//   1. The visitor types their email. A 6-digit code is emailed to them; only a hash of it is stored.
//   2. They type the code. If it matches, their account is found (or created) and the browser
//      gets a session key. Only a hash of the key is stored, so it cannot be read back.
//   3. From then on the browser sends the key with each request. There is no password.
//
// What an account keeps: the email, the state of the plan, how many files were analyzed, and the
// summary of each analysis (date, file name and key figures). Never the products of an inventory.
//
// Where it is kept is decided by the store (store.js); how the email is sent, by sendCode.

const crypto = require("crypto");

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const DEFAULTS = {
  codeTtlMs: 10 * MINUTE, // a code works for this long
  resendWaitMs: MINUTE, // and a new one can be asked for after this long
  maxAttempts: 5, // wrong tries before the code is dropped
  sessionDays: 180, // a browser stays signed in this long
  freeUploads: 3, // files an account can analyze without a plan
  historyRows: 60, // analyses sent to the page
};

const EMAIL = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/;
const TOKEN = /^[A-Za-z0-9_-]{40,60}$/;

function cleanEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email.length <= 200 && EMAIL.test(email) ? email : "";
}

const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");
// The email is part of the hash, so a code only fits the address it was sent to
const codeHash = (email, code) => sha256(`${email}:${code}`);
const sameHash = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// The figures of an analysis that are kept. Whatever else the page sends is dropped.
const FIGURES = [
  "skus", "warehouses", "units", "critical", "low", "ok", "idle", "excess", "belowReorder", "stockouts",
  "availability", "inventoryValue", "tiedUp", "orderLines", "orderUnits", "orderCost", "lateLines", "daysOfInventory",
];
function cleanFigures(input) {
  const source = input && typeof input === "object" ? input : {};
  const figures = { hasCost: source.hasCost === true };
  FIGURES.forEach((name) => {
    const value = source[name];
    if (typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 1e15) figures[name] = Math.round(value * 100) / 100;
  });
  return figures;
}

// store: see store.js. sendCode({ email, code, lang }): emails the code, throws if it cannot.
// onNewAccount(account): called once when an account is created (to tell the owner).
function createAccounts(options = {}) {
  const config = { ...DEFAULTS, ...options };
  const { store, sendCode, onNewAccount } = config;
  const now = config.now || Date.now;
  const randomCode = config.randomCode || (() => String(crypto.randomInt(0, 1000000)).padStart(6, "0"));
  const randomToken = config.randomToken || (() => crypto.randomBytes(32).toString("base64url"));
  const enabled = Boolean(store) && typeof sendCode === "function";
  // Emails with a code on its way right now: a second request for the same one waits its turn,
  // so several at once cannot each send an email.
  const sending = new Set();

  // Step 1: email a code. { ok } or { ok: false, error: "email" | "wait" | "disabled" | "unavailable", seconds }
  async function start(emailInput, { lang } = {}) {
    if (!enabled) return { ok: false, error: "disabled" };
    const email = cleanEmail(emailInput);
    if (!email) return { ok: false, error: "email" };

    if (sending.has(email)) return { ok: false, error: "wait", seconds: Math.ceil(config.resendWaitMs / 1000) };
    sending.add(email);
    try {
      const last = await store.getLoginCode(email);
      if (last && last.sentAt !== null && now() - last.sentAt < config.resendWaitMs) {
        return { ok: false, error: "wait", seconds: Math.ceil((config.resendWaitMs - (now() - last.sentAt)) / 1000) };
      }
      const code = randomCode();
      await store.saveLoginCode({ email, codeHash: codeHash(email, code), expiresAt: now() + config.codeTtlMs });
      try {
        await sendCode({ email, code, lang: lang === "es" ? "es" : "en" });
      } catch (error) {
        // no email went out: the code is dropped so another can be asked for at once
        await store.deleteLoginCode(email).catch(() => {});
        console.error("[ACCOUNTS] The sign-in code could not be emailed:", error && error.message);
        return { ok: false, error: "unavailable" };
      }
      return { ok: true };
    } finally {
      sending.delete(email);
    }
  }

  // Step 2: check the code. { ok, token, account, created } or
  // { ok: false, error: "code" | "expired" | "locked" | "email" | "disabled", left }
  async function verify(emailInput, codeInput, { lang, marketingOk } = {}) {
    if (!enabled) return { ok: false, error: "disabled" };
    const email = cleanEmail(emailInput);
    if (!email) return { ok: false, error: "email" };
    const code = String(codeInput || "").replace(/\D/g, "");

    const sent = await store.getLoginCode(email);
    if (!sent || sent.expiresAt === null || now() > sent.expiresAt) {
      if (sent) await store.deleteLoginCode(email);
      return { ok: false, error: "expired" };
    }
    if (sent.attempts >= config.maxAttempts) return { ok: false, error: "locked" };
    // The try is counted BEFORE the code is looked at, and only one request can take each try.
    // Otherwise many guesses sent at the same moment would all be compared against the code
    // while the count still said zero.
    const left = config.maxAttempts - sent.attempts - 1;
    const wrong = left > 0 ? { ok: false, error: "code", left } : { ok: false, error: "locked" };
    const mine = await store.takeLoginAttempt(email, sent.codeHash, sent.attempts);
    if (!mine) return wrong; // another request took this try: this one is not compared at all
    if (code.length !== 6 || !sameHash(sent.codeHash, codeHash(email, code))) return wrong;
    await store.deleteLoginCode(email); // a code works once

    let account = await store.getAccountByEmail(email);
    const created = !account;
    if (created) account = await store.createAccount({ email, lang: lang === "es" ? "es" : "en", marketingOk: marketingOk === true });
    // someone who ticks the box on a later sign-in is in; leaving it unticked changes nothing
    else if (marketingOk === true && !account.marketingOk) account = await store.updateAccount(account.id, { marketingOk: true });

    const token = randomToken();
    await store.createSession({ tokenHash: sha256(token), accountId: account.id });
    if (created && typeof onNewAccount === "function") {
      Promise.resolve()
        .then(() => onNewAccount(account))
        .catch((error) => console.error("[ACCOUNTS] The owner could not be told about a new account:", error && error.message));
    }
    return { ok: true, token, account, created };
  }

  // The account of a session key, or null
  async function authenticate(token) {
    if (!enabled || typeof token !== "string" || !TOKEN.test(token)) return null;
    const tokenHash = sha256(token);
    const session = await store.getSession(tokenHash);
    if (!session) return null;
    if (session.createdAt !== null && now() - session.createdAt > config.sessionDays * DAY) {
      await store.deleteSession(tokenHash);
      return null;
    }
    return store.getAccountById(session.accountId);
  }

  async function signOut(token) {
    if (enabled && typeof token === "string" && TOKEN.test(token)) await store.deleteSession(sha256(token));
  }

  // A file was analyzed. Without a plan only freeUploads of them are allowed.
  // { ok, account, analysis } or { ok: false, error: "limit" }
  async function recordAnalysis(account, { fileName, figures } = {}, { paid = false } = {}) {
    // The upload is counted first, and only if the count is still the one just read, so two
    // uploads sent at the same moment cannot share one free upload.
    let current = account;
    let counted = null;
    for (let turn = 0; turn < 4 && !counted; turn += 1) {
      if (!paid && current.uploadsUsed >= config.freeUploads) return { ok: false, error: "limit" };
      counted = await store.claimUpload(current.id, current.uploadsUsed);
      if (!counted) {
        current = await store.getAccountById(current.id);
        if (!current) throw new Error("The account is no longer there");
      }
    }
    if (!counted) throw new Error("The upload could not be counted");
    try {
      const analysis = await store.addAnalysis({
        accountId: counted.id,
        fileName: String(fileName || "").slice(0, 120),
        figures: cleanFigures(figures),
      });
      return { ok: true, account: counted, analysis };
    } catch (error) {
      // nothing was recorded: the upload is given back
      await store.updateAccount(counted.id, { uploadsUsed: Math.max(0, counted.uploadsUsed - 1) }).catch(() => {});
      throw error;
    }
  }

  return {
    enabled,
    freeUploads: config.freeUploads,
    start,
    verify,
    authenticate,
    signOut,
    recordAnalysis,
    history: (account) => store.listAnalyses(account.id, config.historyRows),
    clearHistory: (account) => store.deleteAnalyses(account.id),
    setPlanCode: (account, code) => store.updateAccount(account.id, { planCode: String(code || "") }),
    setMarketing: (account, value) => store.updateAccount(account.id, { marketingOk: value === true }),
    remove: (account) => store.deleteAccount(account.id),
    ping: () => store.ping(),
  };
}

module.exports = { createAccounts, cleanEmail, cleanFigures };
