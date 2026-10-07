import { ShieldCheck, ExternalLink, Mail, Check, ArrowRight } from "lucide-react";
import Modal from "./Modal";
import { COLORS, FONT_MONO, FONT_HEAD, monoLabel, secondaryButton } from "./theme";
import { fill, countText } from "./i18n";
import { CONTACT_EMAIL, OWNER_NAME, OWNER_LINKEDIN, FREE_UPLOADS, FREE_QUESTIONS, ORDER_FREE_ROWS, PLAN_PRICE } from "./config";

const sectionTitle = {
  fontFamily: FONT_HEAD,
  fontSize: 26,
  fontWeight: 600,
  textTransform: "uppercase",
  color: COLORS.ink,
  margin: "0 0 16px",
  letterSpacing: "0.01em",
};
const box = {
  background: COLORS.surface,
  border: `1px solid ${COLORS.line}`,
  borderRadius: 12,
  padding: "22px 22px 24px",
  boxSizing: "border-box",
  minWidth: 0,
};
const link = { color: COLORS.ink, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 };

const wrap = { width: "100%", maxWidth: 960, margin: "0 auto", textAlign: "left", boxSizing: "border-box" };

// The home page, under the upload buttons, in this order: how it works, the cycle count tool
// (placed by the page itself), free trial and plan, who made it and what happens to the data.

// more: the address of the page that explains the analysis in full, when it exists in this language
export function HowItWorks({ t, more }) {
  return (
    <section style={{ ...wrap, padding: "8px 0 0", marginBottom: 36 }}>
      <h2 style={sectionTitle}>{t("howTitle")}</h2>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {t("howSteps").map((step, i) => (
          <div key={i} style={{ ...box, flex: "1 1 240px" }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600, color: COLORS.critical, letterSpacing: "0.08em", marginBottom: 8 }}>
              {String(i + 1).padStart(2, "0")}
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.ink, marginBottom: 6 }}>{step.h}</div>
            <div style={{ fontSize: 14, color: COLORS.inkMuted, lineHeight: 1.55 }}>{step.p}</div>
          </div>
        ))}
      </div>
      {more && (
        <a href={more} style={{ ...link, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13.5, marginTop: 14 }}>
          {t("howMore")} <ArrowRight size={14} />
        </a>
      )}
    </section>
  );
}

// What is free and what the plan adds, with the price, before anyone has to hit a limit to find out
// accounts: the site asks for an account to upload a file, so the free trial comes with a history
export function Plans({ t, lang, onPlan, accounts = false }) {
  const price = PLAN_PRICE[lang] || "";
  const vars = { uploads: countText(t, "uploads", FREE_UPLOADS), questions: FREE_QUESTIONS, rows: ORDER_FREE_ROWS };
  const list = { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 };
  const item = { display: "flex", gap: 9, fontSize: 14, color: COLORS.ink, lineHeight: 1.5 };
  const name = { ...monoLabel, color: COLORS.inkMuted, marginBottom: 6 };
  const amount = { fontFamily: FONT_HEAD, fontSize: 28, fontWeight: 600, color: COLORS.ink, marginBottom: 14 };
  return (
    <section data-testid="plans" style={{ ...wrap, marginBottom: 36 }}>
      <h2 style={sectionTitle}>{t("plansTitle")}</h2>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div style={{ ...box, flex: "1 1 300px" }}>
          <div style={name}>{t("plansFree")}</div>
          <div style={amount}>{t("plansFreePrice")}</div>
          <ul style={list}>
            {[...t("freeItems"), ...(accounts ? [t("freeItemHistory")] : [])].map((text, i) => (
              <li key={i} style={item}>
                <Check size={16} color={COLORS.inkMuted} style={{ flexShrink: 0, marginTop: 3 }} />
                {fill(text, vars)}
              </li>
            ))}
          </ul>
        </div>
        <div style={{ ...box, flex: "1 1 300px", border: `1px solid ${COLORS.ink}` }}>
          <div style={name}>{t("plansPaid")}</div>
          <div style={amount} data-testid="home-price">{price || "—"}</div>
          <ul style={list}>
            {t("planItems").map((text, i) => (
              <li key={i} style={item}>
                <Check size={16} color={COLORS.ok} style={{ flexShrink: 0, marginTop: 3 }} />
                {text}
              </li>
            ))}
          </ul>
          <p style={{ fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.5, margin: "14px 0 12px" }}>{t("plansPaidNote")}</p>
          <button onClick={onPlan} style={{ ...secondaryButton, padding: "10px 16px", fontSize: 12 }}>
            {t("plansCta")} <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}

// service: the page about the Excel automation service, as { href, label }, when it exists in this language
// accounts: the site asks for an account to upload a file, so what an account keeps is said here too
export function AboutAndData({ t, onPrivacy, service, accounts = false }) {
  return (
    <section style={{ ...wrap, display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 36 }}>
      <div style={{ ...box, flex: "1 1 340px" }}>
        <h2 style={{ ...sectionTitle, fontSize: 22, marginBottom: 12 }}>{t("aboutTitle")}</h2>
        <p style={{ fontSize: 14.5, color: COLORS.ink, lineHeight: 1.65, margin: "0 0 14px" }}>{t("aboutBody", { name: OWNER_NAME })}</p>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13.5 }}>
          <a href={OWNER_LINKEDIN} target="_blank" rel="noopener noreferrer" style={{ ...link, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ExternalLink size={14} /> {t("aboutLinkedin")}
          </a>
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ ...link, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Mail size={14} /> {CONTACT_EMAIL}
          </a>
          {service && (
            <a href={service.href} data-testid="about-service" style={{ ...link, display: "inline-flex", alignItems: "center", gap: 6 }}>
              {service.label} <ArrowRight size={14} />
            </a>
          )}
        </div>
      </div>

      <div style={{ ...box, flex: "1 1 340px" }}>
        <h2 style={{ ...sectionTitle, fontSize: 22, marginBottom: 12 }}>{t("dataTitle")}</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 14px", display: "flex", flexDirection: "column", gap: 9 }}>
          {[...t("dataPoints"), ...(accounts ? [t("dataPointAccount")] : [])].map((point, i) => (
            <li key={i} style={{ display: "flex", gap: 9, fontSize: 14, color: COLORS.ink, lineHeight: 1.55 }}>
              <ShieldCheck size={16} color={COLORS.ok} style={{ flexShrink: 0, marginTop: 3 }} />
              {point}
            </li>
          ))}
        </ul>
        <button onClick={onPrivacy} style={{ ...link, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13.5, fontFamily: "inherit" }}>
          {t("privacyLink")}
        </button>
      </div>
    </section>
  );
}

// links: the other pages of the site, as { href, label }
export function Footer({ t, onPrivacy, links = [] }) {
  return (
    <footer
      style={{
        width: "100%",
        maxWidth: 960,
        margin: "28px auto 0",
        paddingTop: 16,
        borderTop: `1px solid ${COLORS.line}`,
        display: "flex",
        gap: 18,
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        ...monoLabel,
        fontSize: 10.5,
        color: COLORS.inkMuted,
        boxSizing: "border-box",
      }}
    >
      {links.length > 0 && (
        <nav data-testid="page-links" style={{ flexBasis: "100%", display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 6 }}>
          {links.map((entry) => (
            <a key={entry.href} href={entry.href} style={{ color: COLORS.ink, textUnderlineOffset: 3 }}>
              {entry.label}
            </a>
          ))}
        </nav>
      )}
      <span>MiKardex · {new Date().getFullYear()}</span>
      <span style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <button
          onClick={onPrivacy}
          style={{ ...monoLabel, fontSize: 10.5, color: COLORS.ink, background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
        >
          {t("privacyLink")}
        </button>
        <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: COLORS.ink, textUnderlineOffset: 3 }}>
          {t("footerContact")}: <span style={{ textTransform: "none", letterSpacing: 0 }}>{CONTACT_EMAIL}</span>
        </a>
      </span>
    </footer>
  );
}

export function PrivacyModal({ t, onClose }) {
  const vars = { name: OWNER_NAME, email: CONTACT_EMAIL };
  return (
    <Modal title={t("privacyTitle")} onClose={onClose} closeLabel={t("close")} width={680}>
      <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: COLORS.inkMuted, margin: "0 0 16px", letterSpacing: "0.03em" }}>{t("privacyUpdated")}</p>
      {t("privacySections").map((section, i) => (
        <div key={i} style={{ marginBottom: 16 }}>
          <div style={{ ...monoLabel, color: COLORS.ink, marginBottom: 6 }}>{section.h}</div>
          {section.p.map((paragraph, j) => (
            <p key={j} style={{ fontSize: 14, lineHeight: 1.6, color: COLORS.ink, margin: "0 0 8px" }}>
              {fill(paragraph, vars)}
            </p>
          ))}
        </div>
      ))}
    </Modal>
  );
}
