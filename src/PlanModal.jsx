import { ExternalLink, Loader2 } from "lucide-react";
import Modal from "./Modal";
import { COLORS, FONT_MONO, monoLabel, primaryButton, textInput } from "./theme";
import { CONTACT_EMAIL, PAYPAL_MANAGE_LINK } from "./config";
import { isPaypalCode } from "./plan";

// The customer's own plan. It opens by itself when they have just subscribed with PayPal, and
// afterwards from the "Plan active" chip.
// status: "checking" (asking the server), "active", "failed" (the payment could not be confirmed)
// or "error" (the server could not be reached; they can try again).
export default function PlanModal({ t, status, code, onRetry, onClose }) {
  const notice = { borderRadius: 8, padding: "12px 14px", fontSize: 14, lineHeight: 1.5 };

  return (
    <Modal title={t("planYours")} onClose={onClose} closeLabel={t("close")} width={500}>
      {status === "checking" && (
        <div role="status" style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14.5, lineHeight: 1.55 }}>
          <Loader2 size={18} className="ia-spin" style={{ flexShrink: 0, marginTop: 2 }} />
          {t("payChecking")}
        </div>
      )}

      {status === "failed" && (
        <div role="alert" style={{ ...notice, background: COLORS.criticalBg, border: `1px solid ${COLORS.critical}`, color: COLORS.critical }}>
          {t("payFailed", { contact: CONTACT_EMAIL })}
        </div>
      )}

      {status === "error" && (
        <>
          <div role="alert" style={{ ...notice, background: COLORS.lowBg, border: `1px solid ${COLORS.low}`, color: COLORS.ink, marginBottom: 14 }}>
            {t("payError")}
          </div>
          <button onClick={onRetry} style={primaryButton}>
            {t("payRetry")}
          </button>
        </>
      )}

      {status === "active" && (
        <>
          <div
            role="status"
            style={{ ...notice, background: COLORS.okBg, border: `1px solid ${COLORS.ok}`, color: COLORS.ok, fontWeight: 600, marginBottom: 18 }}
          >
            {t("planActivated")}
          </div>

          {code && (
            <>
              <div style={{ ...monoLabel, color: COLORS.ink, marginBottom: 8 }}>{t("planCodeLabel")}</div>
              <input
                type="text"
                readOnly
                value={code}
                aria-label={t("planCodeLabel")}
                data-testid="plan-code"
                onFocus={(e) => e.target.select()}
                style={{ ...textInput, fontFamily: FONT_MONO, fontSize: 13 }}
              />
              <p style={{ fontSize: 13.5, color: COLORS.inkMuted, lineHeight: 1.55, margin: "8px 0 0" }}>{t("planCodeHint")}</p>
            </>
          )}

          {PAYPAL_MANAGE_LINK && isPaypalCode(code) && (
            <>
              <a
                href={PAYPAL_MANAGE_LINK}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 16,
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: COLORS.ink,
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                }}
              >
                <ExternalLink size={14} /> {t("planManage")}
              </a>
              <p style={{ fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.5, margin: "6px 0 0" }}>{t("planManageNote", { contact: CONTACT_EMAIL })}</p>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
