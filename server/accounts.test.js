// Run with: npm test   (inside the server folder)
// Accounts are kept in memory and the email is caught instead of sent, so these tests never
// touch the network.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAccounts, cleanEmail, cleanFigures } = require("./accounts");
const { memoryStore } = require("./store");

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

// A set of accounts with a clock that can be moved and an outbox that can be read
function setup(extra = {}) {
  const state = { time: Date.parse("2026-10-07T12:00:00Z"), outbox: [], told: [], codes: ["111111", "222222", "333333", "444444"], tokens: 0 };
  const now = () => state.time;
  const store = memoryStore({ now });
  const accounts = createAccounts({
    store,
    now,
    sendCode: async (mail) => {
      if (state.mailDown) throw new Error("mail is down");
      state.outbox.push(mail);
    },
    onNewAccount: (account) => state.told.push(account.email),
    randomCode: () => state.codes.shift(),
    randomToken: () => `token-${String(++state.tokens).padStart(40, "0")}`,
    ...extra,
  });
  const signIn = async (email, options) => {
    await accounts.start(email, options);
    return accounts.verify(email, state.outbox[state.outbox.length - 1].code, options);
  };
  return { accounts, store, state, signIn, wait: (ms) => (state.time += ms) };
}

test("emails are tidied up, and what is not an email is refused", () => {
  assert.equal(cleanEmail("  Ana.Perez+Tienda@Correo.CL "), "ana.perez+tienda@correo.cl");
  for (const bad of ["", "ana", "ana@", "ana@correo", "a b@correo.cl", "ana@correo.cl,otro@correo.cl", 'ana"@correo.cl', "ana@(correo).cl", undefined, null, 42]) {
    assert.equal(cleanEmail(bad), "", String(bad));
  }
});

test("signing in: a code is emailed, and typing it opens the account", async () => {
  const { accounts, state, store } = setup();
  assert.deepEqual(await accounts.start(" Ana@Correo.cl ", { lang: "es" }), { ok: true });
  assert.deepEqual(state.outbox, [{ email: "ana@correo.cl", code: "111111", lang: "es" }]);
  // the code itself is not stored
  assert.notEqual((await store.getLoginCode("ana@correo.cl")).codeHash, "111111");

  const result = await accounts.verify("ana@correo.cl", "111111", { lang: "es", marketingOk: true });
  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.deepEqual([result.account.email, result.account.lang, result.account.marketingOk, result.account.uploadsUsed], ["ana@correo.cl", "es", true, 0]);

  // the browser's key finds the account; the stored session holds a hash, not the key
  assert.equal((await accounts.authenticate(result.token)).email, "ana@correo.cl");
  assert.equal(await store.getSession(result.token), null);
  // the owner is told once, about the new account
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(state.told, ["ana@correo.cl"]);
});

test("signing in again finds the same account and does not announce it twice", async () => {
  const { accounts, state, signIn, wait } = setup();
  const first = await signIn("ana@correo.cl", { lang: "es" });
  wait(2 * MINUTE);
  const second = await signIn("ana@correo.cl", { lang: "en", marketingOk: true });
  assert.equal(second.created, false);
  assert.equal(second.account.id, first.account.id);
  assert.equal(second.account.lang, "es"); // the language of the account is the one it was opened in
  assert.equal(second.account.marketingOk, true); // ticking the box later counts
  assert.notEqual(second.token, first.token);
  // both browsers stay signed in
  assert.ok(await accounts.authenticate(first.token));
  assert.ok(await accounts.authenticate(second.token));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(state.told, ["ana@correo.cl"]);

  // signing in without the box does not take the consent back
  wait(2 * MINUTE);
  assert.equal((await signIn("ana@correo.cl", {})).account.marketingOk, true);
});

test("a code works once, for ten minutes, and only for the email it was sent to", async () => {
  const { accounts, wait } = setup();
  await accounts.start("ana@correo.cl");
  assert.deepEqual(await accounts.verify("beto@correo.cl", "111111"), { ok: false, error: "expired" }); // nothing was sent to this one
  assert.equal((await accounts.verify("ana@correo.cl", "111111")).ok, true);
  assert.deepEqual(await accounts.verify("ana@correo.cl", "111111"), { ok: false, error: "expired" });

  wait(2 * MINUTE);
  await accounts.start("ana@correo.cl");
  wait(10 * MINUTE + 1000);
  assert.deepEqual(await accounts.verify("ana@correo.cl", "222222"), { ok: false, error: "expired" });
});

test("wrong codes are counted, and after five the code is dropped", async () => {
  const { accounts } = setup();
  await accounts.start("ana@correo.cl");
  assert.deepEqual(await accounts.verify("ana@correo.cl", "000000"), { ok: false, error: "code", left: 4 });
  assert.deepEqual(await accounts.verify("ana@correo.cl", "12345"), { ok: false, error: "code", left: 3 }); // too short
  assert.deepEqual(await accounts.verify("ana@correo.cl", ""), { ok: false, error: "code", left: 2 });
  assert.deepEqual(await accounts.verify("ana@correo.cl", "999999"), { ok: false, error: "code", left: 1 });
  assert.deepEqual(await accounts.verify("ana@correo.cl", "888888"), { ok: false, error: "locked" });
  // even the right code no longer works: a new one has to be asked for
  assert.deepEqual(await accounts.verify("ana@correo.cl", "111111"), { ok: false, error: "locked" });
});

test("the code can be typed with spaces or a dash", async () => {
  const { accounts } = setup();
  await accounts.start("ana@correo.cl");
  assert.equal((await accounts.verify("ana@correo.cl", " 111 111 ")).ok, true);
});

test("a new code can be asked for once a minute", async () => {
  const { accounts, state, wait } = setup();
  await accounts.start("ana@correo.cl");
  wait(20 * 1000);
  assert.deepEqual(await accounts.start("ana@correo.cl"), { ok: false, error: "wait", seconds: 40 });
  assert.equal(state.outbox.length, 1);
  wait(41 * 1000);
  assert.deepEqual(await accounts.start("ana@correo.cl"), { ok: true });
  // the new code replaces the old one
  assert.deepEqual(await accounts.verify("ana@correo.cl", "111111"), { ok: false, error: "code", left: 4 });
  assert.equal((await accounts.verify("ana@correo.cl", "222222")).ok, true);
});

test("when the email cannot be sent, the visitor is told and can try again at once", async () => {
  const { accounts, state, store } = setup();
  const quiet = console.error;
  console.error = () => {};
  state.mailDown = true;
  assert.deepEqual(await accounts.start("ana@correo.cl"), { ok: false, error: "unavailable" });
  console.error = quiet;
  assert.equal(await store.getLoginCode("ana@correo.cl"), null);
  state.mailDown = false;
  assert.deepEqual(await accounts.start("ana@correo.cl"), { ok: true });
});

test("a bad email or a made-up key gets nowhere", async () => {
  const { accounts, state } = setup();
  assert.deepEqual(await accounts.start("not an email"), { ok: false, error: "email" });
  assert.deepEqual(await accounts.verify("not an email", "111111"), { ok: false, error: "email" });
  assert.equal(state.outbox.length, 0);
  for (const key of [undefined, "", "short", "x".repeat(43), { toString: () => "x" }]) assert.equal(await accounts.authenticate(key), null);
});

test("signing out closes that browser only; a session ends by itself after six months", async () => {
  const { accounts, signIn, wait } = setup();
  const laptop = await signIn("ana@correo.cl");
  wait(2 * MINUTE);
  const phone = await signIn("ana@correo.cl");
  await accounts.signOut(laptop.token);
  assert.equal(await accounts.authenticate(laptop.token), null);
  assert.ok(await accounts.authenticate(phone.token));
  wait(181 * DAY);
  assert.equal(await accounts.authenticate(phone.token), null);
});

test("each file analyzed is kept as figures, and without a plan three are allowed", async () => {
  const { accounts, signIn, wait } = setup();
  let { account } = await signIn("ana@correo.cl");
  for (const [day, critical] of [["lunes", 9], ["martes", 6], ["miercoles", 4]]) {
    wait(DAY);
    const result = await accounts.recordAnalysis(account, { fileName: `stock-${day}.xlsx`, figures: { skus: 46, critical, inventoryValue: 332205900.129, hasCost: true, products: [{ name: "secret" }], note: "x" } });
    assert.equal(result.ok, true);
    account = result.account;
  }
  assert.equal(account.uploadsUsed, 3);
  assert.deepEqual(await accounts.recordAnalysis(account, { fileName: "stock-jueves.xlsx", figures: { skus: 46 } }), { ok: false, error: "limit" });

  const history = await accounts.history(account);
  assert.deepEqual(history.map((a) => [a.fileName, a.figures.critical]), [["stock-miercoles.xlsx", 4], ["stock-martes.xlsx", 6], ["stock-lunes.xlsx", 9]]);
  // only the known figures are kept: nothing about the products can slip in
  assert.deepEqual(history[0].figures, { hasCost: true, skus: 46, critical: 4, inventoryValue: 332205900.13 });

  // with a plan there is no limit
  const paid = await accounts.recordAnalysis(account, { fileName: "stock-jueves.xlsx", figures: { skus: 46 } }, { paid: true });
  assert.equal(paid.ok, true);
  assert.equal(paid.account.uploadsUsed, 4);
});

test("figures that are not plain numbers are dropped", () => {
  assert.deepEqual(cleanFigures({ skus: "46", critical: NaN, low: Infinity, units: 1e20, idle: 3, hasCost: "yes" }), { hasCost: false, idle: 3 });
  assert.deepEqual(cleanFigures(null), { hasCost: false });
});

test("clearing the history keeps the count of uploads; deleting the account removes everything", async () => {
  const { accounts, store, signIn } = setup();
  const signed = await signIn("ana@correo.cl");
  let account = (await accounts.recordAnalysis(signed.account, { fileName: "a.xlsx", figures: { skus: 1 } })).account;
  await accounts.clearHistory(account);
  assert.deepEqual(await accounts.history(account), []);
  assert.equal((await store.getAccountById(account.id)).uploadsUsed, 1);

  account = await accounts.setPlanCode(account, "I-BW452GLLEP1G");
  assert.equal(account.planCode, "I-BW452GLLEP1G");
  await accounts.remove(account);
  assert.equal(await store.getAccountByEmail("ana@correo.cl"), null);
  assert.equal(await accounts.authenticate(signed.token), null);
});

test("without a store or a way to send email, accounts are off", async () => {
  const off = createAccounts({ store: memoryStore() });
  assert.equal(off.enabled, false);
  assert.deepEqual(await off.start("ana@correo.cl"), { ok: false, error: "disabled" });
  assert.deepEqual(await off.verify("ana@correo.cl", "111111"), { ok: false, error: "disabled" });
  assert.equal(await off.authenticate("x".repeat(43)), null);
  assert.equal(createAccounts({ sendCode: async () => {} }).enabled, false);
});

// ---- several requests at the same moment ----

// Every call to the store takes a moment, as a database does, so requests sent together overlap:
// they all read before any of them writes.
function slow(store) {
  const wrapped = {};
  for (const [name, value] of Object.entries(store)) {
    wrapped[name] = typeof value !== "function" ? value : async (...args) => {
      await new Promise((resolve) => setImmediate(resolve));
      return value(...args);
    };
  }
  return wrapped;
}

test("guesses sent at the same moment use up one try, not none", async () => {
  const state = { outbox: [] };
  const store = slow(memoryStore());
  const accounts = createAccounts({ store, sendCode: async (mail) => state.outbox.push(mail), randomCode: () => "424242" });
  await accounts.start("ana@correo.cl");

  // 300 guesses at once, the right code among them: only the one that got the try is compared
  const guesses = Array.from({ length: 300 }, (_, i) => (i === 299 ? "424242" : String(100000 + i)));
  const results = await Promise.all(guesses.map((guess) => accounts.verify("ana@correo.cl", guess)));
  assert.equal(results.filter((result) => result.ok).length, 0);
  assert.equal((await store.getLoginCode("ana@correo.cl")).attempts, 1);
  assert.deepEqual(results[0], { ok: false, error: "code", left: 4 });

  // four more bursts and the code is locked, exactly as with guesses typed one by one
  for (let burst = 0; burst < 4; burst += 1) await Promise.all(guesses.slice(0, 50).map((guess) => accounts.verify("ana@correo.cl", guess)));
  assert.equal((await store.getLoginCode("ana@correo.cl")).attempts, 5);
  assert.deepEqual(await accounts.verify("ana@correo.cl", "424242"), { ok: false, error: "locked" });
});

test("the right code typed twice at the same moment opens one session", async () => {
  const state = { outbox: [] };
  const store = slow(memoryStore());
  const accounts = createAccounts({ store, sendCode: async (mail) => state.outbox.push(mail), randomCode: () => "424242" });
  await accounts.start("ana@correo.cl");
  const results = await Promise.all([accounts.verify("ana@correo.cl", "424242"), accounts.verify("ana@correo.cl", "424242")]);
  assert.deepEqual(results.map((result) => result.ok), [true, false]);
});

test("asking for a code several times at the same moment sends one email", async () => {
  const state = { outbox: [] };
  const accounts = createAccounts({ store: slow(memoryStore()), sendCode: async (mail) => state.outbox.push(mail) });
  const results = await Promise.all(Array.from({ length: 8 }, () => accounts.start("ana@correo.cl")));
  assert.equal(state.outbox.length, 1);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => result.error === "wait" && result.seconds > 0).length, 7);
  // other emails are not held up by it
  assert.deepEqual(await accounts.start("beto@correo.cl"), { ok: true });
});

test("uploads sent at the same moment cannot share the last free upload", async () => {
  const state = { outbox: [] };
  const store = slow(memoryStore());
  const accounts = createAccounts({ store, sendCode: async (mail) => state.outbox.push(mail), randomCode: () => "424242" });
  await accounts.start("ana@correo.cl");
  let { account } = await accounts.verify("ana@correo.cl", "424242");
  account = (await accounts.recordAnalysis(account, { fileName: "1.xlsx", figures: { skus: 1 } })).account;
  account = (await accounts.recordAnalysis(account, { fileName: "2.xlsx", figures: { skus: 1 } })).account;
  assert.equal(account.uploadsUsed, 2);

  // ten at once, all holding the same picture of the account (2 of 3 used)
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => accounts.recordAnalysis(account, { fileName: `3-${i}.xlsx`, figures: { skus: 1 } })));
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => result.error === "limit").length, 9);
  assert.equal((await store.getAccountById(account.id)).uploadsUsed, 3);
  assert.equal((await accounts.history(account)).length, 3);

  // with the plan they all go through, and each one is counted
  const paid = await Promise.all(Array.from({ length: 3 }, (_, i) => accounts.recordAnalysis(account, { fileName: `4-${i}.xlsx`, figures: { skus: 1 } }, { paid: true })));
  assert.deepEqual(paid.map((result) => result.ok), [true, true, true]);
  assert.equal((await store.getAccountById(account.id)).uploadsUsed, 6);
});

test("an upload that could not be recorded is not counted", async () => {
  const state = { outbox: [] };
  const store = memoryStore();
  const accounts = createAccounts({ store: { ...store, addAnalysis: async () => { throw new Error("the database is down"); } }, sendCode: async (mail) => state.outbox.push(mail), randomCode: () => "424242" });
  await accounts.start("ana@correo.cl");
  const { account } = await accounts.verify("ana@correo.cl", "424242");
  await assert.rejects(() => accounts.recordAnalysis(account, { fileName: "1.xlsx", figures: { skus: 1 } }), /database is down/);
  assert.equal((await store.getAccountById(account.id)).uploadsUsed, 0);
});
