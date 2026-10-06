import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { COLORS } from "./theme";
import { CONTACT_EMAIL, PAYPAL_PLAN_ID } from "./config";
import { loadPayPal } from "./plan";

// PayPal's own subscribe button for the monthly plan. PayPal draws it (a PayPal button and a
// card button) and handles the payment in its own window. When the customer has approved the
// subscription, onSubscribed receives its id (I-...).
export default function PayPalButton({ t, onSubscribed }) {
  const holder = useRef(null);
  const subscribed = useRef(onSubscribed);
  subscribed.current = onSubscribed;
  const [state, setState] = useState("loading"); // loading | ready | error

  useEffect(() => {
    let cancelled = false;
    let buttons = null;
    loadPayPal()
      .then((paypal) => {
        if (cancelled || !holder.current) return null;
        buttons = paypal.Buttons({
          style: { shape: "rect", color: "gold", layout: "vertical", label: "subscribe" },
          createSubscription: (data, actions) => actions.subscription.create({ plan_id: PAYPAL_PLAN_ID }),
          onApprove: (data) => {
            if (data && data.subscriptionID) subscribed.current(data.subscriptionID);
          },
          onError: () => {
            if (!cancelled) setState("error");
          },
        });
        return buttons.render(holder.current).then(() => {
          if (!cancelled) setState("ready");
        });
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
      try {
        if (buttons && typeof buttons.close === "function") Promise.resolve(buttons.close()).catch(() => {});
      } catch (err) {
        // already gone
      }
    };
  }, []);

  return (
    <div>
      {state === "loading" && (
        <div role="status" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, color: COLORS.inkMuted, marginBottom: 8 }}>
          <Loader2 size={15} className="ia-spin" /> {t("payLoading")}
        </div>
      )}
      <div ref={holder} data-testid="paypal-button" style={{ maxWidth: 360, minHeight: state === "ready" ? 45 : 0 }} />
      {state === "error" && (
        <div role="alert" style={{ color: COLORS.critical, fontSize: 13.5, lineHeight: 1.5, marginTop: 6 }}>
          {t("payButtonError", { contact: CONTACT_EMAIL })}
        </div>
      )}
    </div>
  );
}
