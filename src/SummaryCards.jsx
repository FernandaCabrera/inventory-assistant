import { ArrowRight, Lock } from "lucide-react";
import { COLORS, FONT_MONO, FONT_HEAD, monoLabel } from "./theme";
import { formatNumber, formatMoney } from "./i18n";

const card = {
  background: COLORS.surface,
  border: `1px solid ${COLORS.line}`,
  borderRadius: 10,
  padding: "16px 18px",
  flex: "1 1 240px",
  minWidth: 0,
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
};
const title = { ...monoLabel, fontSize: 10.5, color: COLORS.ink, marginBottom: 2 };
const hint = { fontSize: 12, color: COLORS.inkMuted, marginBottom: 10, lineHeight: 1.4 };
const big = { fontFamily: FONT_HEAD, fontSize: 34, fontWeight: 600, lineHeight: 1.1 };
const linkButton = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  marginTop: "auto",
  paddingTop: 12,
  background: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: FONT_MONO,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: COLORS.ink,
  textAlign: "left",
};

// The three things worth knowing right after a file loads. All computed in the browser.
export default function SummaryCards({ runOut, orders, summary, moneyVisible, lang, t, onOpenOrders, onOpenDashboard }) {
  const notMoving = summary.notMovingCount;
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }} data-testid="summary-cards">
      <div style={card}>
        <div style={title}>{t("summaryRunOut")}</div>
        <div style={hint}>{t("summaryRunOutHint")}</div>
        {runOut.length === 0 ? (
          <div style={{ fontSize: 14, color: COLORS.ink }}>{t("summaryRunOutNone")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {runOut.map(({ item, cover }, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13.5, color: COLORS.ink }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{item.name}</span>
                <span style={{ fontFamily: FONT_MONO, color: COLORS.critical, fontWeight: 600, flexShrink: 0 }}>
                  {t("daysShort", { n: formatNumber(lang, cover, 1) })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={card}>
        <div style={title}>{t("summaryToOrder")}</div>
        <div style={hint}>{t("summaryToOrderHint")}</div>
        {orders.rows.length === 0 ? (
          <div style={{ fontSize: 14, color: COLORS.ink }}>{t("summaryToOrderNone")}</div>
        ) : (
          <>
            <div style={{ ...big, color: COLORS.critical }}>{formatNumber(lang, orders.rows.length)}</div>
            {orders.hasCost && moneyVisible && (
              <div style={{ fontSize: 13, color: COLORS.ink, marginTop: 4 }}>
                {t("summaryToOrderCost", { amount: formatMoney(lang, orders.totalCost) })}
              </div>
            )}
            <button onClick={onOpenOrders} style={linkButton}>
              {t("summaryOpenOrders")} <ArrowRight size={13} />
            </button>
          </>
        )}
      </div>

      <div style={card}>
        <div style={title}>{t("summaryNotMoving")}</div>
        <div style={hint}>{t("summaryNotMovingHint")}</div>
        <div style={{ ...big, color: COLORS.idle }}>{formatNumber(lang, notMoving)}</div>
        {notMoving > 0 && summary.hasCost && (
          <div style={{ fontSize: 13, color: COLORS.ink, marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
            {moneyVisible ? (
              t("summaryTiedUp", { amount: formatMoney(lang, summary.tiedUp) })
            ) : (
              <>
                <Lock size={12} style={{ flexShrink: 0 }} /> {t("summaryTiedUpLocked")}
              </>
            )}
          </div>
        )}
        {notMoving > 0 && (
          <button onClick={onOpenDashboard} style={linkButton}>
            {t("summaryOpenDashboard")} <ArrowRight size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
