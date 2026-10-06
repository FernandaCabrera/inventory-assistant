// A page written for one Google search: what the tool does for that need, which file works,
// how the figures are calculated and what it costs, with the buttons to try it right there.
//
// The texts are in src/landingText.js and the addresses in src/pages.js. The buttons, the
// language switch and the footer are handed in by src/InventoryAssistant.jsx, so they behave
// exactly as on the home page.

import { ArrowUp } from "lucide-react";
import { COLORS, FONT_MONO, FONT_HEAD, FONT_BODY, monoLabel } from "./theme";
import { LANG_PATHS, fill, countText, formatNumber } from "./i18n";
import { landingText } from "./landingText";
import { ABC_A_SHARE, ABC_B_SHARE } from "./reportLogic";
import {
  PLAN_PRICE,
  FREE_UPLOADS,
  FREE_QUESTIONS,
  ORDER_FREE_ROWS,
  ORDER_COVER_DAYS,
  SAFETY_FACTOR,
  EXCESS_RATIO,
  DEFAULT_LEAD_TIME_DAYS,
  MAX_ROWS,
  COUNT_MAX_LINES,
  CONTACT_EMAIL,
  OWNER_NAME,
} from "./config";

// The values behind the {name} marks of src/landingText.js. They come from the same settings the
// tool uses, so a page can never state a price, a limit or a formula the tool does not follow.
export function landingVars(lang, t) {
  return {
    price: PLAN_PRICE[lang] || "",
    uploads: countText(t, "uploads", FREE_UPLOADS),
    questions: FREE_QUESTIONS,
    rows: ORDER_FREE_ROWS,
    coverDays: ORDER_COVER_DAYS,
    lead: DEFAULT_LEAD_TIME_DAYS,
    factor: formatNumber(lang, SAFETY_FACTOR, 2),
    pct: formatNumber(lang, (SAFETY_FACTOR - 1) * 100),
    excess: formatNumber(lang, EXCESS_RATIO, 1),
    abcA: formatNumber(lang, ABC_A_SHARE * 100),
    abcB: formatNumber(lang, ABC_B_SHARE * 100),
    maxRows: formatNumber(lang, MAX_ROWS),
    maxLines: formatNumber(lang, COUNT_MAX_LINES),
    email: CONTACT_EMAIL,
    name: OWNER_NAME,
  };
}

const wrap = { width: "100%", maxWidth: 960, margin: "0 auto", boxSizing: "border-box" };
const box = {
  ...wrap,
  background: COLORS.surface,
  border: `1px solid ${COLORS.line}`,
  borderRadius: 12,
  padding: "24px 24px 12px",
  marginBottom: 14,
  textAlign: "left",
};
const h2 = { fontFamily: FONT_HEAD, fontSize: 24, fontWeight: 600, textTransform: "uppercase", color: COLORS.ink, margin: "0 0 14px", letterSpacing: "0.01em", lineHeight: 1.2 };
const text = { fontSize: 15.5, color: COLORS.ink, lineHeight: 1.65, margin: "0 0 12px", maxWidth: 760 };
const list = { ...text, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 7 };

// "Coverage: how much of the warehouse..." shows its first words in bold, as the name of the point
function Point({ children }) {
  const cut = children.indexOf(": ");
  if (cut < 1 || cut > 44) return children;
  return (
    <>
      <strong style={{ fontWeight: 600 }}>{children.slice(0, cut + 1)}</strong>
      {children.slice(cut + 1)}
    </>
  );
}

// One piece of a section: a paragraph, a list of points or a numbered list
function Block({ item, vars }) {
  if (typeof item === "string") return <p style={text}>{fill(item, vars)}</p>;
  if (Array.isArray(item)) {
    return (
      <ul style={list}>
        {item.map((point, i) => (
          <li key={i}>
            <Point>{fill(point, vars)}</Point>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ol style={list}>
      {item.steps.map((step, i) => (
        <li key={i}>{fill(step, vars)}</li>
      ))}
    </ol>
  );
}

// The link of the closing block
export const bottomLink = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontFamily: FONT_MONO,
  fontSize: 12.5,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: COLORS.ink,
  textUnderlineOffset: 4,
};

// id, lang: which page (src/pages.js). toggle: the language switch. actions: the buttons that
// start the tool. note: the small print under them. footer: the links at the bottom.
// closing: what the last block offers; when not given, a link back up to the buttons.
export default function LandingPage({ id, lang, t, toggle, actions, note, closing, footer }) {
  const page = landingText(id, lang);
  const vars = landingVars(lang, t);
  return (
    <div style={{ fontFamily: FONT_BODY, background: COLORS.bg, minHeight: "100vh", padding: "18px 16px 28px", boxSizing: "border-box" }}>
      <div style={{ ...wrap, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 34 }}>
        <a href={LANG_PATHS[lang]} style={{ ...monoLabel, fontSize: 12, letterSpacing: "0.16em", color: COLORS.ink, textDecoration: "none" }}>
          MiKardex
        </a>
        {toggle}
      </div>

      <header id="top" style={{ ...wrap, textAlign: "left", marginBottom: 30 }}>
        <div style={{ ...monoLabel, color: COLORS.inkMuted, letterSpacing: "0.14em", marginBottom: 12 }}>{page.eyebrow}</div>
        <h1
          style={{
            fontFamily: FONT_HEAD,
            fontSize: "clamp(30px, 5.6vw, 50px)",
            fontWeight: 600,
            color: COLORS.ink,
            margin: "0 0 18px",
            letterSpacing: "0.01em",
            textTransform: "uppercase",
            lineHeight: 1.12,
            maxWidth: 860,
          }}
        >
          {page.h1}
        </h1>
        <p style={{ ...text, fontSize: 17, color: COLORS.ink, margin: "0 0 24px" }}>{fill(page.lead, vars)}</p>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 0 }}>{actions}</div>
        {note}
      </header>

      <main>
        {page.sections.map((section) => (
          <section key={section.h} style={box}>
            <h2 style={h2}>{section.h}</h2>
            {section.body.map((item, i) => (
              <Block key={i} item={item} vars={vars} />
            ))}
          </section>
        ))}

        <section style={box} data-testid="landing-faq">
          <h2 style={h2}>{page.faqTitle}</h2>
          {page.faq.map((entry) => (
            <div key={entry.q} style={{ marginBottom: 14 }}>
              <h3 style={{ fontFamily: FONT_BODY, fontSize: 16, fontWeight: 600, color: COLORS.ink, margin: "0 0 5px" }}>{entry.q}</h3>
              <p style={{ ...text, color: COLORS.inkMuted, margin: 0 }}>{fill(entry.a, vars)}</p>
            </div>
          ))}
        </section>

        <section style={{ ...box, border: `1px solid ${COLORS.ink}`, paddingBottom: 24 }}>
          <h2 style={h2}>{page.bottom.h}</h2>
          <p style={text}>{fill(page.bottom.p, vars)}</p>
          {closing || (
            <a href="#top" style={bottomLink}>
              <ArrowUp size={15} /> {page.bottom.link}
            </a>
          )}
        </section>
      </main>

      {footer}
    </div>
  );
}
