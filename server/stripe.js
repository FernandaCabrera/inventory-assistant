// Paid plan through Stripe.
//
// How it works, with nothing stored on this server:
//   1. The visitor pays on a Stripe Payment Link (a monthly subscription).
//   2. Stripe sends them back to the site with ?session_id=cs_... in the address.
//   3. The page calls POST /api/stripe/activate with that id. We ask Stripe whether it was paid
//      and answer with the subscription id (sub_...). That id is the customer's access code.
//   4. From then on the code is checked against Stripe: while the subscription is active the plan
//      is on, and when it is cancelled or unpaid the plan switches off by itself.
//
// Stripe is the only record of who has paid, so a server restart loses nothing. If a customer
// loses their code, it is the subscription id shown in the Stripe dashboard.
//
// Stripe is called over plain HTTPS with the fetch built into Node 18+, so no package is needed.

// Subscription states that keep the plan on. "past_due" is included on purpose: Stripe is
// still retrying the card, and it moves the subscription to "canceled" or "unpaid" by itself
// if the retries fail.
const ACTIVE_STATES = new Set(["active", "trialing", "past_due"]);

const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{8,200}$/;
const SUBSCRIPTION_ID = /^sub_[A-Za-z0-9]{8,200}$/;

const MINUTE = 60 * 1000;
const DEFAULTS = {
  apiBase: "https://api.stripe.com",
  activeTtlMs: 10 * MINUTE, // an active subscription is asked about again after this long
  inactiveTtlMs: 2 * MINUTE, // so is one that was not active (they may have just paid)
  staleOkMs: 24 * 60 * MINUTE, // if Stripe cannot be reached, a known customer keeps the plan this long
  timeoutMs: 8000,
  maxCached: 5000,
};

function isSessionId(value) {
  return typeof value === "string" && SESSION_ID.test(value);
}

function isSubscriptionId(value) {
  return typeof value === "string" && SUBSCRIPTION_ID.test(value);
}

function createStripePlan(options = {}) {
  const config = { ...DEFAULTS, ...options };
  const secretKey = String(config.secretKey || "").trim();
  const priceId = String(config.priceId || "").trim();
  const doFetch = config.fetch || globalThis.fetch;
  const now = config.now || Date.now;
  const enabled = secretKey !== "" && typeof doFetch === "function";

  // subscription id -> { active, checkedAt }
  const cache = new Map();

  function remember(id, active) {
    if (cache.size >= config.maxCached && !cache.has(id)) {
      cache.delete(cache.keys().next().value); // drop the oldest entry
    }
    cache.set(id, { active, checkedAt: now() });
  }

  // GET on the Stripe API. Answers { status, body }, or null when Stripe could not be reached.
  async function get(path) {
    try {
      const res = await doFetch(`${config.apiBase}${path}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${secretKey}` },
        signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(config.timeoutMs) : undefined,
      });
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    } catch (err) {
      return null;
    }
  }

  function subscriptionIsActive(subscription) {
    if (!subscription || typeof subscription !== "object") return false;
    if (!ACTIVE_STATES.has(subscription.status)) return false;
    if (!priceId) return true;
    // With STRIPE_PRICE_ID set, only a subscription to that price unlocks the plan
    const lines = subscription.items && Array.isArray(subscription.items.data) ? subscription.items.data : [];
    return lines.some((line) => line && line.price && line.price.id === priceId);
  }

  // "active" | "inactive" | "unknown" (Stripe could not be reached and we have nothing recent).
  // cacheOnly: answer from what is already known, without calling Stripe.
  async function check(code, { cacheOnly = false } = {}) {
    if (!isSubscriptionId(code)) return "inactive";
    // Stripe switched off (for example the key went missing on the host): we cannot tell, and
    // must not answer "inactive", or paying customers would have their codes thrown away.
    if (!enabled) return "unknown";

    const cached = cache.get(code);
    const age = cached ? now() - cached.checkedAt : Infinity;
    if (cached && age < (cached.active ? config.activeTtlMs : config.inactiveTtlMs)) {
      return cached.active ? "active" : "inactive";
    }
    if (cacheOnly) return cached && cached.active && age < config.staleOkMs ? "active" : "inactive";

    const answer = await get(`/v1/subscriptions/${encodeURIComponent(code)}`);
    if (answer && answer.status === 200) {
      const active = subscriptionIsActive(answer.body);
      remember(code, active);
      return active ? "active" : "inactive";
    }
    if (answer && answer.status === 404) {
      remember(code, false);
      return "inactive";
    }

    // Stripe is down, slow, or the key is wrong: a customer we saw active recently keeps the plan
    if (answer && (answer.status === 401 || answer.status === 403)) {
      console.error(`[STRIPE] Stripe rejected the key (${answer.status}). Check STRIPE_SECRET_KEY and its permissions.`);
    }
    if (cached && cached.active && age < config.staleOkMs) return "active";
    return "unknown";
  }

  // The visitor is back from paying. Answers { ok: true, code } or { ok: false, error }, where
  // error is "disabled", "invalid" (bad id), "unpaid" (not paid, or not this plan) or "unavailable".
  async function activate(sessionId) {
    if (!enabled) return { ok: false, error: "disabled" };
    if (!isSessionId(sessionId)) return { ok: false, error: "invalid" };

    const answer = await get(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`);
    if (!answer) return { ok: false, error: "unavailable" };
    if (answer.status === 404) return { ok: false, error: "invalid" };
    if (answer.status !== 200 || !answer.body) {
      if (answer.status === 401 || answer.status === 403) {
        console.error(`[STRIPE] Stripe rejected the key (${answer.status}). Check STRIPE_SECRET_KEY and its permissions.`);
      }
      return { ok: false, error: "unavailable" };
    }

    const session = answer.body;
    const subscription = session.subscription;
    const paid = session.status === "complete" && session.mode === "subscription";
    if (!paid || !subscription || typeof subscription !== "object" || !isSubscriptionId(subscription.id)) {
      return { ok: false, error: "unpaid" };
    }
    if (!subscriptionIsActive(subscription)) return { ok: false, error: "unpaid" };

    remember(subscription.id, true);
    return { ok: true, code: subscription.id };
  }

  return { enabled, check, activate };
}

module.exports = { createStripePlan, isSessionId, isSubscriptionId };
