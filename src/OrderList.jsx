import { useState } from "react";
import { Download, Lock, AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { COLORS, FONT_MONO, FONT_HEAD, monoLabel, primaryButton, secondaryButton, textInput } from "./theme";
import { formatNumber, formatMoney } from "./i18n";
import { ORDER_FREE_ROWS, COVER_DAYS_MIN, COVER_DAYS_MAX } from "./config";
import { exportOrderList } from "./orderExport";

const th = {
  ...monoLabel,
  fontSize: 10,
  color: COLORS.inkMuted,
  textAlign: "right",
  padding: "10px 12px",
  borderBottom: `1px solid ${COLORS.line}`,
  whiteSpace: "nowrap",
};
const td = {
  padding: "11px 12px",
  borderBottom: `1px dashed ${COLORS.line}`,
  fontSize: 13.5,
  color: COLORS.ink,
  textAlign: "right",
  fontFamily: FONT_MONO,
  verticalAlign: "top",
  whiteSpace: "nowrap",
};

// list: result of buildOrderList. locked: free plan with the visitor's own file.
export default function OrderList({ list, lang, t, locked, coverDays, onCoverDays, onUnlock }) {
  const [exporting, setExporting] = useState(false);
  const rows = locked ? list.rows.slice(0, ORDER_FREE_ROWS) : list.rows;
  const hidden = list.rows.length - rows.length;
  const hasOnOrder = list.rows.some((row) => row.onOrder > 0);

  async function download() {
    if (locked) {
      onUnlock();
      return;
    }
    setExporting(true);
    try {
      await exportOrderList({ list, lang, t });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: "20px 20px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h2 style={{ fontFamily: FONT_HEAD, fontSize: 24, fontWeight: 600, textTransform: "uppercase", margin: "0 0 8px", color: COLORS.ink }}>
            {t("ordersTitle")}
          </h2>
          <label style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13.5, color: COLORS.ink }}>
            {t("ordersCoverBefore")}
            <input
              type="number"
              min={COVER_DAYS_MIN}
              max={COVER_DAYS_MAX}
              value={coverDays}
              data-testid="cover-days"
              onChange={(e) => onCoverDays(e.target.value)}
              style={{ ...textInput, width: 72, padding: "6px 8px", fontFamily: FONT_MONO }}
            />
            {t("ordersCoverAfter")}
          </label>
        </div>
        {list.rows.length > 0 && (
          <button onClick={download} disabled={exporting} style={{ ...secondaryButton, padding: "10px 14px", fontSize: 11.5, opacity: exporting ? 0.6 : 1 }}>
            {exporting ? <Loader2 size={13} className="ia-spin" /> : locked ? <Lock size={13} /> : <Download size={13} />} {t("ordersExport")}
          </button>
        )}
      </div>

      {list.rows.length === 0 ? (
        <p style={{ fontSize: 14.5, color: COLORS.ink, margin: "18px 0 6px" }}>{t("ordersEmpty")}</p>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left" }}>{t("colProduct")}</th>
                  <th style={th}>{t("colStock")}</th>
                  <th style={th}>{t("colCover")}</th>
                  <th style={th}>{t("colLead")}</th>
                  {hasOnOrder && <th style={th}>{t("colOnOrder")}</th>}
                  <th style={{ ...th, color: COLORS.ink }}>{t("colQty")}</th>
                  {list.hasCost && <th style={th}>{t("colCost")}</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td style={{ ...td, textAlign: "left", fontFamily: "inherit", whiteSpace: "normal" }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5, overflowWrap: "anywhere" }}>{row.item.name}</div>
                      <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: COLORS.inkMuted, marginTop: 2 }}>
                        {row.item.sku} · {row.item.warehouse}
                      </div>
                      {row.lateRisk && (
                        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: COLORS.critical, marginTop: 4, fontWeight: 600 }}>
                          <AlertTriangle size={12} style={{ flexShrink: 0 }} /> {t("ordersLate")}
                        </div>
                      )}
                    </td>
                    <td style={td}>{formatNumber(lang, row.item.stock, 2)}</td>
                    <td style={{ ...td, color: row.lateRisk ? COLORS.critical : COLORS.ink }}>
                      {row.cover === null ? "—" : formatNumber(lang, row.cover, 1)}
                    </td>
                    <td style={td}>{row.lead === null ? "—" : formatNumber(lang, row.lead, 1)}</td>
                    {hasOnOrder && <td style={td}>{row.onOrder > 0 ? formatNumber(lang, row.onOrder, 2) : "—"}</td>}
                    <td style={{ ...td, fontWeight: 700, fontSize: 15 }}>{formatNumber(lang, row.qty)}</td>
                    {list.hasCost && <td style={td}>{row.cost === null ? "—" : formatMoney(lang, row.cost)}</td>}
                  </tr>
                ))}
              </tbody>
              {!locked && (
                <tfoot>
                  <tr>
                    <td style={{ ...td, textAlign: "left", fontFamily: FONT_MONO, fontWeight: 600, borderBottom: "none" }}>
                      {t("ordersTotal")} · {t("ordersTotalProducts", { n: formatNumber(lang, list.rows.length) })}
                    </td>
                    <td style={{ ...td, borderBottom: "none" }} />
                    <td style={{ ...td, borderBottom: "none" }} />
                    <td style={{ ...td, borderBottom: "none" }} />
                    {hasOnOrder && <td style={{ ...td, borderBottom: "none" }} />}
                    <td style={{ ...td, fontWeight: 700, fontSize: 15, borderBottom: "none" }}>{formatNumber(lang, list.totalUnits)}</td>
                    {list.hasCost && <td style={{ ...td, fontWeight: 700, borderBottom: "none" }}>{formatMoney(lang, list.totalCost)}</td>}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {locked && hidden > 0 && (
            <div
              style={{
                marginTop: 14,
                padding: "14px 16px",
                border: `1px solid ${COLORS.ink}`,
                borderRadius: 10,
                background: COLORS.surfaceAlt,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                fontSize: 14,
                color: COLORS.ink,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 280px" }}>
                <Lock size={15} style={{ flexShrink: 0 }} /> {t("ordersLockedMore", { n: formatNumber(lang, hidden) })}
              </span>
              <button onClick={onUnlock} style={{ ...primaryButton, padding: "10px 14px", fontSize: 11.5 }}>
                {t("ordersUnlock")} <ArrowRight size={13} />
              </button>
            </div>
          )}
        </>
      )}

      <p style={{ fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.55, margin: "16px 0 0" }}>
        {t("ordersRule", { days: list.coverDays })} {list.usesMinimum ? `${t("ordersRuleMinimum")} ` : ""}
        {t("ordersDisclaimer")}
      </p>
    </div>
  );
}
