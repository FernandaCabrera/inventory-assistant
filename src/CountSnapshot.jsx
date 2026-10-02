import { useMemo } from "react";
import { ClipboardCheck, ArrowRight, Upload, FileSpreadsheet } from "lucide-react";
import { COLORS, monoLabel, primaryButton, secondaryButton } from "./theme";
import { formatNumber, formatMoney } from "./i18n";
import { KPICard, chipStyle } from "./ui";
import { CycleByZoneChart } from "./CountCharts";
import { analysisFor } from "./countView";
import { percent, signed } from "./countFormat";

const box = { background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "18px 18px 16px", minWidth: 0 };

// The cycle counts inside the dashboard: where to count, in one look, with the way to the full report.
// counts is the report loaded in this visit (it is never saved), or null.
export default function CountSnapshot({ counts, inputs, lang, t, onOpen, onUpload, onSample }) {
  const a = useMemo(() => (counts ? analysisFor(counts, inputs) : null), [counts, inputs]);
  const num = (value) => formatNumber(lang, value);
  const title = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
      <ClipboardCheck size={15} color={COLORS.ink} />
      <span style={{ ...monoLabel, color: COLORS.ink }}>{t("dashCountsTitle")}</span>
      {counts && (
        <span style={{ ...chipStyle, textTransform: "none" }}>
          <FileSpreadsheet size={11} style={{ flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{counts.fileName}</span>
        </span>
      )}
    </div>
  );

  if (!a) {
    return (
      <div style={box} data-testid="dash-counts">
        {title}
        <p style={{ fontSize: 14, color: COLORS.ink, lineHeight: 1.55, margin: "0 0 14px" }}>{t("dashCountsEmpty")}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={onUpload} style={{ ...primaryButton, padding: "9px 14px", fontSize: 11.5 }}>
            <Upload size={13} /> {t("countsUpload")}
          </button>
          <button onClick={onSample} style={{ ...secondaryButton, padding: "9px 14px", fontSize: 11.5 }}>
            {t("countsSample")} <ArrowRight size={13} />
          </button>
        </div>
      </div>
    );
  }

  const cycle = a.cycle;
  return (
    <div style={box} data-testid="dash-counts">
      {title}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        {a.lineAccuracy !== null && <KPICard label={t("ccKpiLineAcc")} value={percent(lang, a.lineAccuracy)} />}
        {cycle !== null && (
          <>
            <KPICard
              label={t("ccKpiOnTime")}
              value={percent(lang, cycle.compliance ?? 0)}
              hint={a.mode === "detail" ? t("dashCountsInFile") : t(`ccCycleOpt_${cycle.days}`)}
            />
            <KPICard label={t("ccKpiOverdue")} value={num(cycle.overdue)} color={cycle.overdue > 0 ? COLORS.critical : undefined} hint={t(`ccCycleOpt_${cycle.days}`)} />
          </>
        )}
        {cycle === null && (
          <>
            <KPICard label={t("ccKpiOff")} value={num(a.off)} />
            <KPICard
              label={a.hasValue ? t("ccKpiNet") : t("ccKpiNetUnits")}
              value={a.hasValue ? signed(lang, a.netValue, true) : signed(lang, a.netUnits)}
              hint={a.hasValue ? formatMoney(lang, a.absValue) : undefined}
            />
          </>
        )}
      </div>
      {cycle !== null && cycle.zones.length > 1 && (
        <>
          <div style={{ ...monoLabel, fontSize: 10.5, color: COLORS.ink, marginBottom: 10 }}>{t("ccChartWhere", { days: cycle.days })}</div>
          <CycleByZoneChart zones={cycle.zones} lang={lang} t={t} />
        </>
      )}
      {cycle === null && <p style={{ fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.5, margin: "0 0 4px" }}>{t("dashCountsNoDates")}</p>}
      <button onClick={onOpen} data-testid="dash-counts-open" style={{ ...secondaryButton, padding: "9px 14px", fontSize: 11.5, marginTop: 14 }}>
        {t("dashCountsOpen")} <ArrowRight size={13} />
      </button>
    </div>
  );
}
