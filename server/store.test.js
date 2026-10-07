// Run with: npm test   (inside the server folder)
// The two stores have to behave the same. The database is replaced by a small stand-in that
// answers the way Supabase's REST API does, so these tests never touch the network.

const test = require("node:test");
const assert = require("node:assert/strict");
const { memoryStore, supabaseStore } = require("./store");

// A stand-in for Supabase's REST API over four tables
function fakeDatabase() {
  const tables = { accounts: [], login_codes: [], sessions: [], analyses: [] };
  const calls = [];
  let clock = Date.parse("2026-10-07T12:00:00Z");
  let nextId = 1;
  const fresh = {
    accounts: () => ({ id: `0000-${nextId++}`, created_at: new Date(clock).toISOString(), lang: null, marketing_ok: false, uploads_used: 0, plan_code: null }),
    login_codes: () => ({ attempts: 0, sent_at: new Date(clock).toISOString() }),
    sessions: () => ({ created_at: new Date(clock).toISOString() }),
    analyses: () => ({ id: nextId++, created_at: new Date((clock += 1000)).toISOString() }),
  };
  const answer = (status, body) => ({ status, text: async () => (body === undefined ? "" : JSON.stringify(body)) });

  const fetch = async (url, init) => {
    calls.push({ method: init.method, url, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    const { pathname, searchParams } = new URL(url);
    const table = pathname.replace("/rest/v1/", "");
    const rows = tables[table];
    if (!rows) return answer(404, { message: "no such table" });
    const filters = [...searchParams.entries()].filter(([, value]) => value.startsWith("eq."));
    const matches = (row) => filters.every(([column, value]) => String(row[column]) === value.slice(3));
    const wantsRows = String(init.headers.Prefer || "").includes("return=representation");

    if (init.method === "GET") {
      let found = rows.filter(matches);
      if (searchParams.get("order")) found = [...found].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
      if (searchParams.get("limit")) found = found.slice(0, Number(searchParams.get("limit")));
      return answer(200, found);
    }
    if (init.method === "POST") {
      const body = JSON.parse(init.body);
      const key = searchParams.get("on_conflict");
      const existing = key ? rows.find((row) => row[key] === body[key]) : null;
      if (existing && String(init.headers.Prefer || "").includes("resolution=merge-duplicates")) {
        Object.assign(existing, body);
        return answer(200, wantsRows ? [existing] : undefined);
      }
      if (table === "accounts" && rows.some((row) => row.email === body.email)) return answer(409, { code: "23505", message: "duplicate key value" });
      const row = { ...fresh[table](), ...body };
      rows.push(row);
      return answer(201, wantsRows ? [row] : undefined);
    }
    if (init.method === "PATCH") {
      const changed = rows.filter(matches);
      changed.forEach((row) => Object.assign(row, JSON.parse(init.body)));
      return wantsRows ? answer(200, changed) : answer(204);
    }
    if (init.method === "DELETE") {
      const gone = rows.filter(matches);
      tables[table] = rows.filter((row) => !matches(row));
      if (table === "accounts") {
        // on delete cascade
        const ids = gone.map((row) => row.id);
        tables.sessions = tables.sessions.filter((row) => !ids.includes(row.account_id));
        tables.analyses = tables.analyses.filter((row) => !ids.includes(row.account_id));
      }
      return answer(204);
    }
    return answer(405, { message: "method" });
  };
  return { fetch, calls, tables: () => tables };
}

const STORES = {
  memory: () => {
    let clock = Date.parse("2026-10-07T12:00:00Z");
    return { store: memoryStore({ now: () => (clock += 1000) }) };
  },
  supabase: () => {
    const database = fakeDatabase();
    return { store: supabaseStore({ url: "https://project.supabase.co/", key: "sb_secret_abc", fetch: database.fetch }), database };
  },
};

for (const [name, make] of Object.entries(STORES)) {
  test(`${name}: an account is created once, found by email and by id, and changed`, async () => {
    const { store } = make();
    assert.equal(await store.getAccountByEmail("ana+tienda@correo.cl"), null);
    const account = await store.createAccount({ email: "ana+tienda@correo.cl", lang: "es", marketingOk: true });
    assert.equal(account.email, "ana+tienda@correo.cl");
    assert.deepEqual([account.lang, account.marketingOk, account.uploadsUsed, account.planCode], ["es", true, 0, ""]);
    assert.equal(typeof account.createdAt, "number");

    // the "+" of the address survives the trip to the database and back
    assert.deepEqual(await store.getAccountByEmail("ana+tienda@correo.cl"), account);
    assert.deepEqual(await store.getAccountById(account.id), account);
    // creating it again gives the same account, not a second one
    assert.equal((await store.createAccount({ email: "ana+tienda@correo.cl", lang: "en" })).id, account.id);

    const changed = await store.updateAccount(account.id, { uploadsUsed: 2, planCode: "I-BW452GLLEP1G", email: "otra@correo.cl" });
    assert.deepEqual([changed.uploadsUsed, changed.planCode, changed.email], [2, "I-BW452GLLEP1G", "ana+tienda@correo.cl"]); // the email cannot be changed
    assert.equal((await store.updateAccount(account.id, { planCode: "" })).planCode, "");

    // an upload is counted only by the request that read the current count
    assert.equal((await store.claimUpload(account.id, 2)).uploadsUsed, 3);
    assert.equal(await store.claimUpload(account.id, 2), null);
    assert.equal(await store.claimUpload("0000-nobody", 0), null);
    assert.equal((await store.getAccountById(account.id)).uploadsUsed, 3);
    assert.equal(await store.ping(), true);
  });

  test(`${name}: a sign-in code is replaced by the next one and counts its wrong tries`, async () => {
    const { store } = make();
    const later = Date.parse("2026-10-07T12:10:00Z");
    await store.saveLoginCode({ email: "ana@correo.cl", codeHash: "hash-1", expiresAt: later });
    // a try is taken only by the request that read the current count, for the current code
    assert.equal(await store.takeLoginAttempt("ana@correo.cl", "hash-1", 0), true);
    assert.equal(await store.takeLoginAttempt("ana@correo.cl", "hash-1", 0), false); // someone else already took it
    assert.equal(await store.takeLoginAttempt("ana@correo.cl", "another-hash", 1), false);
    assert.equal(await store.takeLoginAttempt("otra@correo.cl", "hash-1", 0), false);
    assert.equal(await store.takeLoginAttempt("ana@correo.cl", "hash-1", 1), true);
    assert.equal(await store.takeLoginAttempt("ana@correo.cl", "hash-1", 2), true);
    let code = await store.getLoginCode("ana@correo.cl");
    assert.deepEqual([code.codeHash, code.expiresAt, code.attempts], ["hash-1", later, 3]);
    assert.equal(typeof code.sentAt, "number");

    await store.saveLoginCode({ email: "ana@correo.cl", codeHash: "hash-2", expiresAt: later + 60000 });
    code = await store.getLoginCode("ana@correo.cl");
    assert.deepEqual([code.codeHash, code.expiresAt, code.attempts], ["hash-2", later + 60000, 0]);

    await store.deleteLoginCode("ana@correo.cl");
    assert.equal(await store.getLoginCode("ana@correo.cl"), null);
  });

  test(`${name}: sessions and analyses belong to an account and go with it`, async () => {
    const { store } = make();
    const ana = await store.createAccount({ email: "ana@correo.cl" });
    const beto = await store.createAccount({ email: "beto@correo.cl" });
    await store.createSession({ tokenHash: "aaa", accountId: ana.id });
    await store.createSession({ tokenHash: "bbb", accountId: beto.id });
    assert.equal((await store.getSession("aaa")).accountId, ana.id);
    assert.equal(await store.getSession("zzz"), null);

    const first = await store.addAnalysis({ accountId: ana.id, fileName: "stock-lunes.xlsx", figures: { skus: 40, critical: 9 } });
    await store.addAnalysis({ accountId: beto.id, fileName: "otro.xlsx", figures: { skus: 5 } });
    const second = await store.addAnalysis({ accountId: ana.id, fileName: "stock-martes.xlsx", figures: { skus: 41, critical: 6 } });
    assert.equal(typeof first.id, "string");
    assert.deepEqual(first.figures, { skus: 40, critical: 9 });

    // newest first, only this account's, and no more than asked for
    assert.deepEqual((await store.listAnalyses(ana.id)).map((a) => a.fileName), ["stock-martes.xlsx", "stock-lunes.xlsx"]);
    assert.deepEqual((await store.listAnalyses(ana.id, 1)).map((a) => a.id), [second.id]);

    await store.deleteAnalyses(ana.id);
    assert.deepEqual(await store.listAnalyses(ana.id), []);
    assert.equal((await store.listAnalyses(beto.id)).length, 1);

    await store.deleteSession("aaa");
    assert.equal(await store.getSession("aaa"), null);
    await store.deleteAccount(beto.id);
    assert.equal(await store.getAccountById(beto.id), null);
    assert.equal(await store.getSession("bbb"), null);
    assert.deepEqual(await store.listAnalyses(beto.id), []);
  });
}

test("supabase: every request carries the secret key, and a new-style key is not sent as a token", async () => {
  const { store, database } = STORES.supabase();
  await store.createAccount({ email: "ana@correo.cl" });
  await store.getAccountByEmail("ana@correo.cl");
  assert.equal(database.calls.length, 2);
  for (const call of database.calls) {
    assert.equal(call.headers.apikey, "sb_secret_abc");
    assert.equal(call.headers.Authorization, undefined);
    assert.ok(call.url.startsWith("https://project.supabase.co/rest/v1/accounts"));
  }
  assert.equal(database.calls[1].url, "https://project.supabase.co/rest/v1/accounts?email=eq.ana%40correo.cl&limit=1");

  // an older project's service_role key is a token and goes in both headers
  const legacy = fakeDatabase();
  await supabaseStore({ url: "https://project.supabase.co", key: "eyJhbGciOi.old.key", fetch: legacy.fetch }).ping();
  assert.equal(legacy.calls[0].headers.Authorization, "Bearer eyJhbGciOi.old.key");
  assert.equal(legacy.calls[0].headers.apikey, "eyJhbGciOi.old.key");
});

test("supabase: a database that fails is an error, not an empty answer", async () => {
  const down = supabaseStore({ url: "https://project.supabase.co", key: "sb_secret_abc", fetch: async () => ({ status: 503, text: async () => "paused" }) });
  await assert.rejects(() => down.getAccountByEmail("ana@correo.cl"), /Database answered 503/);
  const missing = supabaseStore({ url: "https://project.supabase.co", key: "sb_secret_abc", fetch: async () => ({ status: 404, text: async () => '{"code":"PGRST205","message":"Could not find the table"}' }) });
  await assert.rejects(() => missing.ping(), /404/);
});

test("supabase: a try and an upload are counted with the count that was read, in one request", async () => {
  const { store, database } = STORES.supabase();
  const account = await store.createAccount({ email: "ana@correo.cl" });
  await store.saveLoginCode({ email: "ana@correo.cl", codeHash: "hash-1", expiresAt: Date.parse("2026-10-07T12:10:00Z") });
  database.calls.length = 0;
  await store.takeLoginAttempt("ana@correo.cl", "hash-1", 0);
  await store.claimUpload(account.id, 0);
  assert.deepEqual(
    database.calls.map((call) => [call.method, call.url.split("/rest/v1")[1], call.body]),
    [
      ["PATCH", "/login_codes?email=eq.ana%40correo.cl&code_hash=eq.hash-1&attempts=eq.0", { attempts: 1 }],
      ["PATCH", `/accounts?id=eq.${account.id}&uploads_used=eq.0`, { uploads_used: 1 }],
    ]
  );
});
