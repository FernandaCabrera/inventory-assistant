// Paid plan through PayPal.
//
// How it works, with nothing stored on this server:
//   1. The visitor subscribes with the PayPal button in the plan window (a monthly subscription).
//   2. PayPal gives the page the id of the new subscription (I-...).
//   3. The page calls POST /api/paypal/activate with that id. We ask PayPal whether the
//      subscription is active and answer with the same id. That id is the customer's access code.
//   4. From then on the code is checked against PayPal: while the subscription is active the plan
//      is on, and when it is cancelled or a payment fails the plan switches off by itself.
//
// PayPal is the only record of who has paid, so a server restart loses nothing. If a customer
// loses their code, it is the subscription id shown in the PayPal account (and in the email
// PayPal sends them).
//
// PayPal is called over plain HTTPS with the fetch built into Node 18+, so no package is needed.

const SUBSCRIPTION_ID = /^I-[A-Z0-9]{8,40}$/;

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const API = { live: "https://api-m.paypal.com", sandbox: "https://api-m.sandbox.paypal.com" };
const DEFAULTS = {
  activeTtlMs: 10 * MINUTE, // an active subscription is asked about again after this long
  inactiveTtlMs: 2 * MINUTE, // so is one that was not active (they may have just paid)
  staleOkMs: DAY, // if PayPal cannot be reached, a known customer keeps the plan this long
  // A customer who cancels has already paid for the month: the plan stays on this many days
  // after their last payment. Matches a monthly plan.
  paidDays: 31,
  // Right after approving, a subscription can take a moment to become active
  activateTries: 4,
  activateWaitMs: 2000,
  timeoutMs: 8000,
  maxCached: 5000,
};

function isSubscriptionId(value) {
  return typeof value === "string" && SUBSCRIPTION_ID.test(value);
}

function createPaypalPlan(options = {}) {
  const config = { ...DEFAULTS, ...options };
  const clientId = String(config.clientId || "").trim();
  const secret = String(config.secret || "").trim();
  const planId = String(config.planId || "").trim();
  const apiBase = config.apiBase || (config.env === "sandbox" ? API.sandbox : API.live);
  const doFetch = config.fetch || globalThis.fetch;
  const now = config.now || Date.now;
  const sleep = config.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const enabled = clientId !== "" && secret !== "" && typeof doFetch === "function";

  // subscription id -> { active, checkedAt }
  const cache = new Map();
  let token = null; // { value, expiresAt }

  function remember(id, active) {
    if (cache.size >= config.maxCached && !cache.has(id)) {
      cache.delete(cache.keys().next().value); // drop the oldest entry
    }
    cache.set(id, { active, checkedAt: now() });
  }

  function timeout() {
    return typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(config.timeoutMs) : undefined;
  }

  // PayPal's API wants a short-lived token, bought with the client id and secret.
  // Answers the token, or null when PayPal could not be reached or rejected the credentials.
  async function accessToken() {
    if (token && now() < token.expiresAt) return token.value;
    try {
      const res = await doFetch(`${apiBase}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
        signal: timeout(),
      });
      const body = await res.json().catch(() => null);
      if (res.status !== 200 || !body || typeof body.access_token !== "string") {
        if (res.status === 401 || res.status === 403) {
          console.error(`[PAYPAL] PayPal rejected the credentials (${res.status}). Check PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_ENV.`);
        }
        return null;
      }
      const seconds = Number(body.expires_in) > 120 ? Number(body.expires_in) : 120;
      token = { value: body.access_token, expiresAt: now() + (seconds - 60) * 1000 };
      return token.value;
    } catch (err) {
      return null;
    }
  }

  // Answers { status, body } from PayPal, or null when PayPal could not be reached.
  async function getSubscription(id, retried = false) {
    const bearer = await accessToken();
    if (!bearer) return null;
    try {
      const res = await doFetch(`${apiBase}/v1/billing/subscriptions/${encodeURIComponent(id)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
        signal: timeout(),
      });
      if (res.status === 401 && !retried) {
        token = null; // the token expired early: get a new one and ask once more
        return getSubscription(id, true);
      }
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    } catch (err) {
      return null;
    }
  }

  // "active" | "pending" (approved, first payment still going through) | "inactive"
  function stateOf(subscription) {
    if (!subscription || typeof subscription !== "object") return "inactive";
    // With PAYPAL_PLAN_ID set, only a subscription to that plan unlocks
    if (planId && subscription.plan_id !== planId) return "inactive";
    if (subscription.status === "ACTIVE") return "active";
    if (subscription.status === "APPROVED" || subscription.status === "APPROVAL_PENDING") return "pending";
    if (subscription.status === "CANCELLED") {
      // cancelled, but the month they paid for is not over yet
      const last = subscription.billing_info && subscription.billing_info.last_payment;
      const paidAt = last && last.time ? Date.parse(last.time) : NaN;
      if (Number.isFinite(paidAt) && now() < paidAt + config.paidDays * DAY) return "active";
    }
    return "inactive"; // SUSPENDED (a payment failed), EXPIRED, or cancelled and past the paid month
  }

  // "active" | "inactive" | "unknown" (PayPal could not be reached and we have nothing recent).
  // cacheOnly: answer from what is already known, without calling PayPal.
  async function check(code, { cacheOnly = false } = {}) {
    if (!isSubscriptionId(code)) return "inactive";
    // PayPal switched off (for example the secret went missing on the host): we cannot tell, and
    // must not answer "inactive", or paying customers would have their codes thrown away.
    if (!enabled) return "unknown";

    const cached = cache.get(code);
    const age = cached ? now() - cached.checkedAt : Infinity;
    if (cached && age < (cached.active ? config.activeTtlMs : config.inactiveTtlMs)) {
      return cached.active ? "active" : "inactive";
    }
    if (cacheOnly) return cached && cached.active && age < config.staleOkMs ? "active" : "inactive";

    const answer = await getSubscription(code);
    if (answer && answer.status === 200) {
      const active = stateOf(answer.body) === "active";
      remember(code, active);
      return active ? "active" : "inactive";
    }
    if (answer && answer.status === 404) {
      remember(code, false);
      return "inactive";
    }

    // PayPal is down, slow, or the credentials are wrong: a customer we saw active recently keeps the plan
    if (cached && cached.active && age < config.staleOkMs) return "active";
    return "unknown";
  }

  // The visitor has just subscribed. Answers { ok: true, code } or { ok: false, error }, where
  // error is "disabled", "invalid" (bad id), "unpaid" (not active, or not this plan),
  // "pending" (approved but not active yet: try again) or "unavailable".
  async function activate(subscriptionId) {
    if (!enabled) return { ok: false, error: "disabled" };
    if (!isSubscriptionId(subscriptionId)) return { ok: false, error: "invalid" };

    for (let attempt = 1; attempt <= config.activateTries; attempt += 1) {
      const answer = await getSubscription(subscriptionId);
      if (!answer) return { ok: false, error: "unavailable" };
      if (answer.status === 404) return { ok: false, error: "invalid" };
      if (answer.status !== 200 || !answer.body) return { ok: false, error: "unavailable" };

      const state = stateOf(answer.body);
      if (state === "active") {
        remember(subscriptionId, true);
        return { ok: true, code: subscriptionId };
      }
      if (state === "inactive") return { ok: false, error: "unpaid" };
      if (attempt < config.activateTries) await sleep(config.activateWaitMs);
    }
    return { ok: false, error: "pending" };
  }

  return { enabled, check, activate };
}

module.exports = { createPaypalPlan, isSubscriptionId };
