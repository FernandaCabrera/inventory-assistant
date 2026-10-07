// Where accounts are kept.
//
// Two stores with the same functions:
//   - supabaseStore: a Postgres database at Supabase, reached over plain HTTPS (its REST API)
//     with the fetch built into Node 18+, so no package is needed. The tables are created once
//     with accounts.sql.
//   - memoryStore: kept in memory, gone when the server restarts. For tests and for trying the
//     accounts on your own computer.
//
// What is stored: the email of each account, the state of its plan, the sign-in codes and
// sessions (only as hashes), and the summary of each analysis. Never the products of an inventory.

const iso = (ms) => new Date(ms).toISOString();
const ms = (value) => (value === null || value === undefined ? null : Date.parse(value));

// ---- rows as the database has them <-> objects as the server uses them ----
const toAccount = (row) =>
  row && {
    id: row.id,
    email: row.email,
    createdAt: ms(row.created_at),
    lang: row.lang || null,
    marketingOk: row.marketing_ok === true,
    uploadsUsed: Number(row.uploads_used) || 0,
    planCode: row.plan_code || "",
  };
const toLoginCode = (row) =>
  row && { email: row.email, codeHash: row.code_hash, expiresAt: ms(row.expires_at), attempts: Number(row.attempts) || 0, sentAt: ms(row.sent_at) };
const toSession = (row) => row && { tokenHash: row.token_hash, accountId: row.account_id, createdAt: ms(row.created_at) };
const toAnalysis = (row) => row && { id: String(row.id), createdAt: ms(row.created_at), fileName: row.file_name || "", figures: row.figures || {} };

// What may be changed on an account, and the name of each column
const ACCOUNT_COLUMNS = { lang: "lang", marketingOk: "marketing_ok", uploadsUsed: "uploads_used", planCode: "plan_code" };
function accountPatch(changes) {
  const patch = {};
  Object.keys(changes).forEach((name) => {
    if (ACCOUNT_COLUMNS[name]) patch[ACCOUNT_COLUMNS[name]] = name === "planCode" ? changes[name] || null : changes[name];
  });
  return patch;
}

function memoryStore({ now = Date.now } = {}) {
  const accounts = new Map(); // id -> row
  const codes = new Map(); // email -> row
  const sessions = new Map(); // token hash -> row
  const analyses = []; // rows, oldest first
  let nextAccount = 1;
  let nextAnalysis = 1;

  return {
    kind: "memory",
    async ping() {
      return true;
    },
    async getAccountByEmail(email) {
      return toAccount([...accounts.values()].find((row) => row.email === email) || null);
    },
    async getAccountById(id) {
      return toAccount(accounts.get(id) || null);
    },
    async createAccount({ email, lang, marketingOk }) {
      const existing = [...accounts.values()].find((row) => row.email === email);
      if (existing) return toAccount(existing);
      const row = { id: `00000000-0000-4000-8000-${String(nextAccount++).padStart(12, "0")}`, email, created_at: iso(now()), lang: lang || null, marketing_ok: marketingOk === true, uploads_used: 0, plan_code: null };
      accounts.set(row.id, row);
      return toAccount(row);
    },
    async updateAccount(id, changes) {
      const row = accounts.get(id);
      if (!row) return null;
      Object.assign(row, accountPatch(changes));
      return toAccount(row);
    },
    // One more upload is counted, only if the count is still the one that was read. null otherwise.
    async claimUpload(id, used) {
      const row = accounts.get(id);
      if (!row || row.uploads_used !== used) return null;
      row.uploads_used = used + 1;
      return toAccount(row);
    },
    async deleteAccount(id) {
      accounts.delete(id);
      [...sessions.entries()].forEach(([hash, row]) => row.account_id === id && sessions.delete(hash));
      for (let i = analyses.length - 1; i >= 0; i -= 1) if (analyses[i].account_id === id) analyses.splice(i, 1);
    },
    async saveLoginCode({ email, codeHash, expiresAt }) {
      codes.set(email, { email, code_hash: codeHash, expires_at: iso(expiresAt), attempts: 0, sent_at: iso(now()) });
    },
    async getLoginCode(email) {
      return toLoginCode(codes.get(email) || null);
    },
    // One try at a code is used up: true for the one request that got it. Of several requests
    // that read the same count at once, only one gets true.
    async takeLoginAttempt(email, codeHash, attempts) {
      const row = codes.get(email);
      if (!row || row.code_hash !== codeHash || row.attempts !== attempts) return false;
      row.attempts = attempts + 1;
      return true;
    },
    async deleteLoginCode(email) {
      codes.delete(email);
    },
    async createSession({ tokenHash, accountId }) {
      sessions.set(tokenHash, { token_hash: tokenHash, account_id: accountId, created_at: iso(now()) });
    },
    async getSession(tokenHash) {
      return toSession(sessions.get(tokenHash) || null);
    },
    async deleteSession(tokenHash) {
      sessions.delete(tokenHash);
    },
    async addAnalysis({ accountId, fileName, figures }) {
      const row = { id: nextAnalysis++, account_id: accountId, created_at: iso(now()), file_name: fileName, figures };
      analyses.push(row);
      return toAnalysis(row);
    },
    // newest first
    async listAnalyses(accountId, limit = 60) {
      return analyses
        .filter((row) => row.account_id === accountId)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)
        .slice(0, limit)
        .map(toAnalysis);
    },
    async deleteAnalyses(accountId) {
      for (let i = analyses.length - 1; i >= 0; i -= 1) if (analyses[i].account_id === accountId) analyses.splice(i, 1);
    },
  };
}

// url: the project address (https://xxxx.supabase.co). key: its secret key (sb_secret_...) or,
// in an older project, its service_role key. Both skip row level security, so they stay on the server.
function supabaseStore({ url, key, fetch: doFetch = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const base = `${String(url || "").trim().replace(/\/+$/, "")}/rest/v1`;
  const secret = String(key || "").trim();
  const headers = { apikey: secret, "Content-Type": "application/json" };
  // The older keys are tokens and also go in Authorization; the new ones only in apikey.
  if (secret.startsWith("eyJ")) headers.Authorization = `Bearer ${secret}`;
  const eq = (column, value) => `${column}=eq.${encodeURIComponent(value)}`;

  // Returns the rows of the answer (an empty list when there is no body)
  async function call(method, path, { body, prefer } = {}) {
    const init = { method, headers: prefer ? { ...headers, Prefer: prefer } : headers };
    if (body !== undefined) init.body = JSON.stringify(body);
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") init.signal = AbortSignal.timeout(timeoutMs);
    const res = await doFetch(base + path, init);
    const text = await res.text().catch(() => "");
    if (res.status < 200 || res.status >= 300) {
      const error = new Error(`Database answered ${res.status} to ${method} ${path.split("?")[0]}: ${text.slice(0, 200)}`);
      error.status = res.status;
      throw error;
    }
    if (!text) return [];
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [data];
  }
  const one = async (path) => (await call("GET", `${path}&limit=1`))[0] || null;
  const returning = "return=representation";

  return {
    kind: "supabase",
    async ping() {
      await call("GET", "/accounts?select=id&limit=1");
      return true;
    },
    async getAccountByEmail(email) {
      return toAccount(await one(`/accounts?${eq("email", email)}`));
    },
    async getAccountById(id) {
      return toAccount(await one(`/accounts?${eq("id", id)}`));
    },
    async createAccount({ email, lang, marketingOk }) {
      try {
        const rows = await call("POST", "/accounts", { body: { email, lang: lang || null, marketing_ok: marketingOk === true }, prefer: returning });
        return toAccount(rows[0]);
      } catch (error) {
        // two sign-ins of the same new email at once: the account is already there
        if (error.status === 409) return toAccount(await one(`/accounts?${eq("email", email)}`));
        throw error;
      }
    },
    async updateAccount(id, changes) {
      const rows = await call("PATCH", `/accounts?${eq("id", id)}`, { body: accountPatch(changes), prefer: returning });
      return toAccount(rows[0] || null);
    },
    async claimUpload(id, used) {
      const rows = await call("PATCH", `/accounts?${eq("id", id)}&${eq("uploads_used", used)}`, { body: { uploads_used: used + 1 }, prefer: returning });
      return toAccount(rows[0] || null);
    },
    // sessions and analyses go with it (on delete cascade)
    async deleteAccount(id) {
      await call("DELETE", `/accounts?${eq("id", id)}`);
    },
    async saveLoginCode({ email, codeHash, expiresAt }) {
      await call("POST", "/login_codes?on_conflict=email", {
        body: { email, code_hash: codeHash, expires_at: iso(expiresAt), attempts: 0, sent_at: iso(Date.now()) },
        prefer: "resolution=merge-duplicates",
      });
    },
    async getLoginCode(email) {
      return toLoginCode(await one(`/login_codes?${eq("email", email)}`));
    },
    // The count goes up only where it still is the one that was read (and the code is still the
    // same one), so the database lets a single request through when several arrive at once.
    async takeLoginAttempt(email, codeHash, attempts) {
      const rows = await call("PATCH", `/login_codes?${eq("email", email)}&${eq("code_hash", codeHash)}&${eq("attempts", attempts)}`, {
        body: { attempts: attempts + 1 },
        prefer: returning,
      });
      return rows.length > 0;
    },
    async deleteLoginCode(email) {
      await call("DELETE", `/login_codes?${eq("email", email)}`);
    },
    async createSession({ tokenHash, accountId }) {
      await call("POST", "/sessions", { body: { token_hash: tokenHash, account_id: accountId } });
    },
    async getSession(tokenHash) {
      return toSession(await one(`/sessions?${eq("token_hash", tokenHash)}`));
    },
    async deleteSession(tokenHash) {
      await call("DELETE", `/sessions?${eq("token_hash", tokenHash)}`);
    },
    async addAnalysis({ accountId, fileName, figures }) {
      const rows = await call("POST", "/analyses", { body: { account_id: accountId, file_name: fileName, figures }, prefer: returning });
      return toAnalysis(rows[0]);
    },
    async listAnalyses(accountId, limit = 60) {
      const rows = await call("GET", `/analyses?${eq("account_id", accountId)}&order=created_at.desc,id.desc&limit=${Number(limit) || 60}`);
      return rows.map(toAnalysis);
    },
    async deleteAnalyses(accountId) {
      await call("DELETE", `/analyses?${eq("account_id", accountId)}`);
    },
  };
}

module.exports = { memoryStore, supabaseStore };
