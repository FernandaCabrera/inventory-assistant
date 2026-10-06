// The paid plan, on the browser side: access codes and PayPal's subscribe button.

import { PAYPAL_CLIENT_ID, PAYPAL_PLAN_ID } from "./config";

// Whoever subscribes with PayPal gets their subscription id (I-...) as their access code.
export function isPaypalCode(code) {
  return /^I-[A-Z0-9]{8,40}$/.test(String(code || ""));
}

// Codes are not case-sensitive: they are kept and sent in capitals.
export function cleanCode(code) {
  return String(code || "").trim().toUpperCase();
}

// true when config.js has what the PayPal button needs
export function paypalConfigured() {
  return Boolean(String(PAYPAL_CLIENT_ID || "").trim() && String(PAYPAL_PLAN_ID || "").trim());
}

// Loads PayPal's script once, the first time the plan window needs it. Nothing from PayPal is
// loaded for visitors who never open the plan window.
let loading = null;
export function loadPayPal() {
  if (window.paypal && typeof window.paypal.Buttons === "function") return Promise.resolve(window.paypal);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(PAYPAL_CLIENT_ID)}&vault=true&intent=subscription`;
      script.async = true;
      script.onload = () => {
        if (window.paypal && typeof window.paypal.Buttons === "function") resolve(window.paypal);
        else reject(new Error("PayPal did not load"));
      };
      script.onerror = () => reject(new Error("PayPal did not load"));
      document.head.appendChild(script);
    }).catch((err) => {
      loading = null; // a later try starts again
      throw err;
    });
  }
  return loading;
}
