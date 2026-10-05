// Run with: npm test   (inside the server folder)
// Stripe is replaced by a small stand-in, so these tests never touch the network.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createStripePlan, isSessionId, isSubscriptionId } = require("./stripe");

const SUB = "sub_1QabcDEF2345ghiJKL";
const SESSION = "cs_test_a1B2c3D4e5F6g7H8";

function subscription(overrides = {}) {
  return { id: SUB, status: "active", items: { data: [{ price: { id: "price_plan" } }] }, ...overrides };
}

// routes: { "/v1/subscriptions/sub_...": { status, body } | "down" }
function fakeStripe(routes) {
  const calls = [];
  const fetch = async (url, init) => {
    const path = url.replace("https://stripe.test", "");
    calls.push({ path, auth: init.headers.Authorization });
    const route = typeof routes === "function" ? routes(path) : routes[path];
    if (route === "down") throw new Error("network");
    const answer = route || { status: 404, body: { error: { message: "No such object" } } };
    return { status: answer.status, json: async () => answer.body };
  };
  return { fetch, calls };
}

function plan(stripe, extra = {}) {
  return createStripePlan({ secretKey: "sk_test_x", apiBase: "https://stripe.test", fetch: stripe.fetch, ...extra });
}

test("ids are recognized by their shape", () => {
  assert.equal(isSubscriptionId(SUB), true);
  assert.equal(isSubscriptionId("CAFE-2291"), false);
  assert.equal(isSubscriptionId("sub_../../v1/customers"), false);
  assert.equal(isSessionId(SESSION), true);
  assert.equal(isSessionId("cs_live_a1B2c3D4e5F6g7H8"), true);
  assert.equal(isSessionId("cs_test_abc?expand=x"), false);
  assert.equal(isSessionId(undefined), false);
});

test("without a key Stripe is off and nothing is called", async () => {
  const stripe = fakeStripe({});
  const off = createStripePlan({ secretKey: "", fetch: stripe.fetch });
  assert.equal(off.enabled, false);
  // a subscription code cannot be checked, which is not the same as being wrong
  assert.equal(await off.check(SUB), "unknown");
  assert.equal(await off.check("CAFE-2291"), "inactive");
  assert.deepEqual(await off.activate(SESSION), { ok: false, error: "disabled" });
  assert.equal(stripe.calls.length, 0);
});

test("a paid session gives the subscription id as the access code", async () => {
  const stripe = fakeStripe({
    [`/v1/checkout/sessions/${SESSION}?expand[]=subscription`]: {
      status: 200,
      body: { id: SESSION, status: "complete", mode: "subscription", subscription: subscription() },
    },
  });
  const stripePlan = plan(stripe);
  assert.deepEqual(await stripePlan.activate(SESSION), { ok: true, code: SUB });
  assert.equal(stripe.calls[0].auth, "Bearer sk_test_x");

  // the code is good straight away, without asking Stripe again
  assert.equal(await stripePlan.check(SUB), "active");
  assert.equal(stripe.calls.length, 1);
});

test("a session that was not paid, or is not a subscription, does not unlock", async () => {
  const path = `/v1/checkout/sessions/${SESSION}?expand[]=subscription`;
  const open = plan(fakeStripe({ [path]: { status: 200, body: { status: "open", mode: "subscription", subscription: null } } }));
  assert.deepEqual(await open.activate(SESSION), { ok: false, error: "unpaid" });

  const oneOff = plan(fakeStripe({ [path]: { status: 200, body: { status: "complete", mode: "payment", subscription: null } } }));
  assert.deepEqual(await oneOff.activate(SESSION), { ok: false, error: "unpaid" });

  const cancelled = plan(
    fakeStripe({ [path]: { status: 200, body: { status: "complete", mode: "subscription", subscription: subscription({ status: "canceled" }) } } })
  );
  assert.deepEqual(await cancelled.activate(SESSION), { ok: false, error: "unpaid" });
});

test("a made-up or unknown session id is rejected", async () => {
  const stripe = fakeStripe({});
  const stripePlan = plan(stripe);
  assert.deepEqual(await stripePlan.activate("not-a-session"), { ok: false, error: "invalid" });
  assert.equal(stripe.calls.length, 0); // never sent to Stripe
  assert.deepEqual(await stripePlan.activate(SESSION), { ok: false, error: "invalid" }); // Stripe says 404
});

test("when Stripe cannot be reached, activation says so instead of rejecting the payment", async () => {
  const down = plan(fakeStripe(() => "down"));
  assert.deepEqual(await down.activate(SESSION), { ok: false, error: "unavailable" });
  const badKey = plan(fakeStripe(() => ({ status: 401, body: {} })));
  assert.deepEqual(await badKey.activate(SESSION), { ok: false, error: "unavailable" });
});

test("the plan follows the subscription: on while active, off once cancelled", async () => {
  let status = "active";
  let clock = 0;
  const stripe = fakeStripe(() => ({ status: 200, body: subscription({ status }) }));
  const stripePlan = plan(stripe, { now: () => clock });

  assert.equal(await stripePlan.check(SUB), "active");
  assert.equal(await stripePlan.check(SUB), "active");
  assert.equal(stripe.calls.length, 1); // remembered for a while

  status = "canceled";
  clock += 11 * 60 * 1000; // past the 10 minutes an active answer is remembered
  assert.equal(await stripePlan.check(SUB), "inactive");
  assert.equal(stripe.calls.length, 2);
});

test("a late payment keeps the plan on while Stripe retries the card", async () => {
  const stripePlan = plan(fakeStripe(() => ({ status: 200, body: subscription({ status: "past_due" }) })));
  assert.equal(await stripePlan.check(SUB), "active");
});

test("unpaid, paused and unknown subscriptions do not unlock", async () => {
  for (const status of ["unpaid", "paused", "incomplete", "incomplete_expired", "canceled"]) {
    const stripePlan = plan(fakeStripe(() => ({ status: 200, body: subscription({ status }) })));
    assert.equal(await stripePlan.check(SUB), "inactive", status);
  }
  const missing = plan(fakeStripe({}));
  assert.equal(await missing.check(SUB), "inactive");
  const notAnId = plan(fakeStripe({}));
  assert.equal(await notAnId.check("CAFE-2291"), "inactive");
});

test("with a price set, only a subscription to that price unlocks", async () => {
  const stripe = fakeStripe(() => ({ status: 200, body: subscription() }));
  assert.equal(await plan(stripe, { priceId: "price_plan" }).check(SUB), "active");
  assert.equal(await plan(stripe, { priceId: "price_other" }).check(SUB), "inactive");
});

test("if Stripe goes down, a known customer keeps the plan and a stranger is not let in", async () => {
  let up = true;
  let clock = 0;
  const stripe = fakeStripe(() => (up ? { status: 200, body: subscription() } : "down"));
  const stripePlan = plan(stripe, { now: () => clock });

  assert.equal(await stripePlan.check(SUB), "active");
  up = false;
  clock += 60 * 60 * 1000; // an hour later, Stripe is unreachable
  assert.equal(await stripePlan.check(SUB), "active");
  assert.equal(await stripePlan.check("sub_neverSeenBefore123"), "unknown");

  clock += 24 * 60 * 60 * 1000; // more than a day without hearing from Stripe
  assert.equal(await stripePlan.check(SUB), "unknown");
});

test("cacheOnly never calls Stripe", async () => {
  const stripe = fakeStripe(() => ({ status: 200, body: subscription() }));
  const stripePlan = plan(stripe);
  assert.equal(await stripePlan.check(SUB, { cacheOnly: true }), "inactive");
  assert.equal(stripe.calls.length, 0);
  assert.equal(await stripePlan.check(SUB), "active");
  assert.equal(await stripePlan.check(SUB, { cacheOnly: true }), "active");
  assert.equal(stripe.calls.length, 1);
});
