// The paid plan, on the browser side: access codes and the trip to Stripe and back.

import { STRIPE_PAYMENT_LINK } from "./config";

// Whoever pays on Stripe gets their subscription id (sub_...) as their access code.
// These ids are case-sensitive; the codes handed out by hand are not.
export function isStripeCode(code) {
  return /^sub_[A-Za-z0-9]{8,200}$/.test(String(code || ""));
}

export function cleanCode(code) {
  const clean = String(code || "").trim();
  return isStripeCode(clean) ? clean : clean.toUpperCase();
}

// Where the "Subscribe" button goes: the Stripe link, opened in the visitor's language.
// Empty when no link is set in config.js.
export function paymentLink(lang) {
  const link = String(STRIPE_PAYMENT_LINK || "").trim();
  if (!link) return "";
  return `${link}${link.includes("?") ? "&" : "?"}locale=${lang === "es" ? "es" : "en"}`;
}

// After paying, Stripe sends the visitor back to the site with ?session_id=cs_... in the address.
export function returnedSessionId() {
  try {
    const id = new URLSearchParams(window.location.search).get("session_id") || "";
    return /^cs_(test|live)_[A-Za-z0-9]{8,200}$/.test(id) ? id : "";
  } catch (err) {
    return "";
  }
}

// Takes the session id out of the address, so a reload or a shared link does not carry it.
export function clearReturnedSession() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("session_id");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch (err) {
    // nothing to do
  }
}
