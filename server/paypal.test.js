// Run with: npm test   (inside the server folder)
// PayPal is replaced by a small stand-in, so these tests never touch the network.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPaypalPlan, isSubscriptionId } = require("./paypal");

const SUB = "I-BW452GLLEP1G";
const PLAN = "P-5LR918731A854994WNLCDVUY";
const DAY = 24 * 60 * 60 * 1000;

function subscription(overrides = {}) {
  return { id: SUB, status: "ACTIVE", plan_id: PLAN, billing_info: { last_payment: { time: "2026-10-01T12:00:00Z" } }, ...overrides };
}

// answer: (path) => { status, body } | "down". The token request is answered here too.
function fakePaypal(answer, { tokenStatus = 200, expiresIn = 32400 } = {}) {
  const calls = [];
  const tokens = [];
  const fetch = async (url, init) => {
    const path = url.replace("https://paypal.test", "");
    if (path === "/v1/oauth2/token") {
      tokens.push({ auth: init.headers.Authorization, body: init.body });
      if (tokenStatus === "down") throw new Error("network");
      return { status: tokenStatus, json: async () => (tokenStatus === 200 ? { access_token: `token-${tokens.length}`, expires_in: expiresIn } : { error: "invalid_client" }) };
    }
    calls.push({ path, auth: init.headers.Authorization });
    const route = answer(path, calls.length);
    if (route === "down") throw new Error("network");
    return { status: route.status, json: async () => route.body };
  };
  return { fetch, calls, tokens };
}

function plan(paypal, extra = {}) {
  return createPaypalPlan({
    clientId: "client", secret: "secret", planId: PLAN, apiBase: "https://paypal.test", fetch: paypal.fetch, sleep: async () => {}, ...extra,
  });
}

const found = (overrides) => () => ({ status: 200, body: subscription(overrides) });
const missing = () => ({ status: 404, body: { name: "RESOURCE_NOT_FOUND" } });

test("ids are recognized by their shape", () => {
  assert.equal(isSubscriptionId(SUB), true);
  assert.equal(isSubscriptionId("CAFE-2291"), false);
  assert.equal(isSubscriptionId("I-../../v1/payments"), false);
  assert.equal(isSubscriptionId("i-bw452gllep1g"), false); // the server puts codes in capitals first
  assert.equal(isSubscriptionId(undefined), false);
});

test("without the client id and secret PayPal is off and nothing is called", async () => {
  const paypal = fakePaypal(found());
  const off = createPaypalPlan({ clientId: "client", secret: "", fetch: paypal.fetch });
  assert.equal(off.enabled, false);
  // a subscription code cannot be checked, which is not the same as being wrong
  assert.equal(await off.check(SUB), "unknown");
  assert.equal(await off.check("CAFE-2291"), "inactive");
  assert.deepEqual(await off.activate(SUB), { ok: false, error: "disabled" });
  assert.equal(paypal.calls.length + paypal.tokens.length, 0);
});

test("an active subscription gives its id as the access code", async () => {
  const paypal = fakePaypal(found());
  const paypalPlan = plan(paypal);
  assert.deepEqual(await paypalPlan.activate(SUB), { ok: true, code: SUB });

  // the token is bought with the client id and secret, and used for the question
  assert.equal(paypal.tokens[0].auth, `Basic ${Buffer.from("client:secret").toString("base64")}`);
  assert.equal(paypal.tokens[0].body, "grant_type=client_credentials");
  assert.deepEqual(paypal.calls[0], { path: `/v1/billing/subscriptions/${SUB}`, auth: "Bearer token-1" });

  // the code is good straight away, without asking PayPal again
  assert.equal(await paypalPlan.check(SUB), "active");
  assert.equal(paypal.calls.length, 1);
});

test("a subscription that was just approved is waited for until it is active", async () => {
  const paypal = fakePaypal((path, n) => ({ status: 200, body: subscription({ status: n < 3 ? "APPROVED" : "ACTIVE" }) }));
  assert.deepEqual(await plan(paypal).activate(SUB), { ok: true, code: SUB });
  assert.equal(paypal.calls.length, 3);

  // still not active after every try: the page is told to try again, not that the payment failed
  const slow = fakePaypal(found({ status: "APPROVAL_PENDING" }));
  assert.deepEqual(await plan(slow).activate(SUB), { ok: false, error: "pending" });
  assert.equal(slow.calls.length, 4);
});

test("a subscription that is not paid, or is to another plan, does not unlock", async () => {
  assert.deepEqual(await plan(fakePaypal(found({ status: "SUSPENDED" }))).activate(SUB), { ok: false, error: "unpaid" });
  assert.deepEqual(await plan(fakePaypal(found({ status: "EXPIRED" }))).activate(SUB), { ok: false, error: "unpaid" });
  assert.deepEqual(await plan(fakePaypal(found({ plan_id: "P-ANOTHERPLAN" }))).activate(SUB), { ok: false, error: "unpaid" });
  // with no plan set on the server, any active subscription of the account unlocks
  assert.deepEqual(await plan(fakePaypal(found({ plan_id: "P-ANOTHERPLAN" })), { planId: "" }).activate(SUB), { ok: true, code: SUB });
});

test("a made-up or unknown subscription id is rejected", async () => {
  const paypal = fakePaypal(missing);
  const paypalPlan = plan(paypal);
  assert.deepEqual(await paypalPlan.activate("not-a-subscription"), { ok: false, error: "invalid" });
  assert.equal(paypal.calls.length + paypal.tokens.length, 0); // never sent to PayPal
  assert.deepEqual(await paypalPlan.activate(SUB), { ok: false, error: "invalid" }); // PayPal says 404
});

test("when PayPal cannot be reached, activation says so instead of rejecting the payment", async () => {
  assert.deepEqual(await plan(fakePaypal(() => "down")).activate(SUB), { ok: false, error: "unavailable" });
  assert.deepEqual(await plan(fakePaypal(found(), { tokenStatus: "down" })).activate(SUB), { ok: false, error: "unavailable" });
  assert.deepEqual(await plan(fakePaypal(found(), { tokenStatus: 401 })).activate(SUB), { ok: false, error: "unavailable" });
  assert.deepEqual(await plan(fakePaypal(() => ({ status: 500, body: null }))).activate(SUB), { ok: false, error: "unavailable" });
});

test("the plan follows the subscription: on while active, off once a payment fails", async () => {
  let status = "ACTIVE";
  let clock = Date.parse("2026-10-05T00:00:00Z");
  const paypal = fakePaypal(() => ({ status: 200, body: subscription({ status }) }));
  const paypalPlan = plan(paypal, { now: () => clock });

  assert.equal(await paypalPlan.check(SUB), "active");
  assert.equal(await paypalPlan.check(SUB), "active");
  assert.equal(paypal.calls.length, 1); // remembered for a while

  status = "SUSPENDED";
  clock += 11 * 60 * 1000; // past the 10 minutes an active answer is remembered
  assert.equal(await paypalPlan.check(SUB), "inactive");
  assert.equal(paypal.calls.length, 2);
});

test("a customer who cancels keeps the plan for the month already paid", async () => {
  const paidOn = Date.parse("2026-10-01T12:00:00Z");
  const cancelled = found({ status: "CANCELLED" });
  assert.equal(await plan(fakePaypal(cancelled), { now: () => paidOn + 10 * DAY }).check(SUB), "active");
  assert.equal(await plan(fakePaypal(cancelled), { now: () => paidOn + 32 * DAY }).check(SUB), "inactive");
  // cancelled before any payment went through
  const neverPaid = found({ status: "CANCELLED", billing_info: {} });
  assert.equal(await plan(fakePaypal(neverPaid), { now: () => paidOn }).check(SUB), "inactive");
});

test("unknown ids, other codes and unpaid states do not unlock", async () => {
  for (const status of ["SUSPENDED", "EXPIRED", "APPROVAL_PENDING", "APPROVED"]) {
    assert.equal(await plan(fakePaypal(found({ status }))).check(SUB), "inactive", status);
  }
  assert.equal(await plan(fakePaypal(missing)).check(SUB), "inactive");
  const paypal = fakePaypal(found());
  assert.equal(await plan(paypal).check("CAFE-2291"), "inactive");
  assert.equal(paypal.calls.length, 0);
});

test("the token is reused until it expires, and renewed if PayPal stops accepting it", async () => {
  let clock = 0;
  let rejectOnce = false;
  const paypal = fakePaypal(() => {
    if (rejectOnce) { rejectOnce = false; return { status: 401, body: { error: "invalid_token" } }; }
    return { status: 200, body: subscription() };
  }, { expiresIn: 3600 });
  const paypalPlan = plan(paypal, { now: () => clock, activeTtlMs: 0 }); // ask PayPal every time

  await paypalPlan.check(SUB);
  await paypalPlan.check(SUB);
  assert.equal(paypal.tokens.length, 1);

  clock += 3600 * 1000; // the token's hour is over
  await paypalPlan.check(SUB);
  assert.equal(paypal.tokens.length, 2);

  rejectOnce = true; // PayPal refuses the token early: one new token, one more try
  assert.equal(await paypalPlan.check(SUB), "active");
  assert.equal(paypal.tokens.length, 3);
});

test("if PayPal goes down, a known customer keeps the plan and a stranger is not let in", async () => {
  let up = true;
  let clock = Date.parse("2026-10-05T00:00:00Z");
  const paypal = fakePaypal(() => (up ? { status: 200, body: subscription() } : "down"));
  const paypalPlan = plan(paypal, { now: () => clock });

  assert.equal(await paypalPlan.check(SUB), "active");
  up = false;
  clock += 60 * 60 * 1000; // an hour later, PayPal is unreachable
  assert.equal(await paypalPlan.check(SUB), "active");
  assert.equal(await paypalPlan.check("I-NEVERSEEN1234"), "unknown");

  clock += DAY; // more than a day without hearing from PayPal
  assert.equal(await paypalPlan.check(SUB), "unknown");
});

test("cacheOnly never calls PayPal", async () => {
  const paypal = fakePaypal(found());
  const paypalPlan = plan(paypal);
  assert.equal(await paypalPlan.check(SUB, { cacheOnly: true }), "inactive");
  assert.equal(paypal.calls.length + paypal.tokens.length, 0);
  assert.equal(await paypalPlan.check(SUB), "active");
  assert.equal(await paypalPlan.check(SUB, { cacheOnly: true }), "active");
  assert.equal(paypal.calls.length, 1);
});
