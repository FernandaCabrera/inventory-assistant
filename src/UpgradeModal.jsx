import { useState } from "react";
import { ArrowRight, Check, KeyRound } from "lucide-react";
import Modal from "./Modal";
import { COLORS, monoLabel, primaryButton, secondaryButton, textInput } from "./theme";
import { FREE_UPLOADS, FREE_QUESTIONS, CONTACT_EMAIL, PLAN_PRICE } from "./config";
import { countText } from "./i18n";
import { paymentLink } from "./plan";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function UpgradeModal({ t, lang, reason, apiUrl, skuCount, onClose, onActivated }) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [requestState, setRequestState] = useState("idle"); // idle | sending | sent | error | invalid
  const [code, setCode] = useState("");
  const [codeState, setCodeState] = useState("idle"); // idle | checking | invalid | error | active

  const reasonText =
    reason === "upload"
      ? t("planReasonUpload", { uploads: countText(t, "uploads", FREE_UPLOADS) })
      : reason === "questions"
      ? t("planReasonQuestions", { questions: FREE_QUESTIONS })
      : reason === "dashboard"
      ? t("planReasonDashboard")
      : reason === "orders"
      ? t("planReasonOrders")
      : reason === "counts"
      ? t("planReasonCounts")
      : "";
  const price = PLAN_PRICE[lang] || "";
  // With a Stripe link set, people pay straight away; without one, they ask for the plan by email.
  const payUrl = paymentLink(lang);

  async function sendRequest(e) {
    e.preventDefault();
    const clean = email.trim();
    if (!EMAIL_PATTERN.test(clean)) {
      setRequestState("invalid");
      return;
    }
    setRequestState("sending");
    try {
      const res = await fetch(`${apiUrl}/api/upgrade-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: clean, note: note.trim(), lang, skuCount, reason }),
      });
      const data = await res.json().catch(() => ({}));
      setRequestState(res.ok && data.ok ? "sent" : "error");
    } catch (err) {
      setRequestState("error");
    }
  }

  async function activate(e) {
    e.preventDefault();
    const clean = code.trim();
    if (!clean) return;
    setCodeState("checking");
    try {
      const res = await fetch(`${apiUrl}/api/validate-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: clean }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.valid) {
        setCodeState("active");
        onActivated(clean);
      } else if (res.ok) {
        setCodeState("invalid");
      } else {
        setCodeState("error");
      }
    } catch (err) {
      setCodeState("error");
    }
  }

  const sectionTitle = { ...monoLabel, color: COLORS.ink, margin: "0 0 10px" };

  return (
    <Modal title={t("planTitle")} onClose={onClose} closeLabel={t("close")}>
      {reasonText && <p style={{ fontSize: 14.5, lineHeight: 1.55, margin: "0 0 16px" }}>{reasonText}</p>}

      <div style={sectionTitle}>{t("planIncludes")}</div>
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px", display: "flex", flexDirection: "column", gap: 7 }}>
        {t("planItems").map((item) => (
          <li key={item} style={{ display: "flex", gap: 9, fontSize: 14, lineHeight: 1.45 }}>
            <Check size={16} color={COLORS.ok} style={{ flexShrink: 0, marginTop: 2 }} />
            {item}
          </li>
        ))}
      </ul>
      {price && (
        <p style={{ fontSize: 16, fontWeight: 600, margin: "-6px 0 20px", color: COLORS.ink }} data-testid="plan-price">
          {t("planPrice", { price })}
        </p>
      )}

      {codeState === "active" ? (
        <div
          role="status"
          style={{
            background: COLORS.okBg,
            border: `1px solid ${COLORS.ok}`,
            color: COLORS.ok,
            borderRadius: 8,
            padding: "12px 14px",
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 14,
          }}
        >
          {t("planActivated")}
        </div>
      ) : (
        <>
          {payUrl ? (
            <>
              <a href={payUrl} data-testid="plan-pay" style={{ ...primaryButton, textDecoration: "none" }}>
                {t("paySubscribe")} <ArrowRight size={15} />
              </a>
              <p style={{ fontSize: 13.5, color: COLORS.inkMuted, lineHeight: 1.55, margin: "10px 0 0" }}>
                {t("payNote")} {t("payQuestions", { contact: CONTACT_EMAIL })}
              </p>
            </>
          ) : (
            <>
          <div style={sectionTitle}>{t("planRequestTitle")}</div>
          {requestState === "sent" ? (
            <div
              role="status"
              style={{
                background: COLORS.okBg,
                border: `1px solid ${COLORS.ok}`,
                color: COLORS.ok,
                borderRadius: 8,
                padding: "12px 14px",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {t("planSent", { email: email.trim() })}
            </div>
          ) : (
            <form onSubmit={sendRequest} style={{ display: "flex", flexDirection: "column", gap: 8 }} noValidate>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (requestState !== "sending") setRequestState("idle");
                }}
                placeholder={t("planEmail")}
                aria-label={t("planEmail")}
                autoComplete="email"
                style={textInput}
              />
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("planNote")}
                aria-label={t("planNote")}
                maxLength={300}
                style={textInput}
              />
              <button
                type="submit"
                disabled={requestState === "sending"}
                style={{ ...primaryButton, alignSelf: "flex-start", opacity: requestState === "sending" ? 0.6 : 1 }}
              >
                {requestState === "sending" ? t("planSending") : t("planSend")}
              </button>
              {requestState === "invalid" && (
                <div role="alert" style={{ color: COLORS.critical, fontSize: 13.5 }}>
                  {t("planEmailInvalid")}
                </div>
              )}
              {requestState === "error" && (
                <div role="alert" style={{ color: COLORS.critical, fontSize: 13.5 }}>
                  {t("planSendError", { contact: CONTACT_EMAIL })}
                </div>
              )}
            </form>
          )}
            </>
          )}

          <div style={{ borderTop: `1px solid ${COLORS.line}`, margin: "20px 0 16px" }} />

          <div style={sectionTitle}>{t("planCodeTitle")}</div>
          <form onSubmit={activate} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (codeState !== "checking") setCodeState("idle");
              }}
              placeholder={t("planCodePlaceholder")}
              aria-label={t("planCodePlaceholder")}
              autoComplete="off"
              style={{ ...textInput, flex: "1 1 180px", width: "auto", textTransform: code.trim().startsWith("sub_") ? "none" : "uppercase" }}
            />
            <button
              type="submit"
              disabled={codeState === "checking"}
              style={{ ...secondaryButton, opacity: codeState === "checking" ? 0.6 : 1 }}
            >
              <KeyRound size={14} /> {codeState === "checking" ? t("planChecking") : t("planActivate")}
            </button>
          </form>
          {codeState === "invalid" && (
            <div role="alert" style={{ color: COLORS.critical, fontSize: 13.5, marginTop: 8 }}>
              {t("planCodeInvalid")}
            </div>
          )}
          {codeState === "error" && (
            <div role="alert" style={{ color: COLORS.critical, fontSize: 13.5, marginTop: 8 }}>
              {t("planCodeError")}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
