// The downloads of the analysis: the executive report (a PDF and two Excel files) in the
// assistant tab, and the dashboard as a PowerPoint file in the dashboard tab.
// Every file is built in the browser from the loaded inventory; nothing is sent anywhere.

import { useState } from "react";
import { Download, Lock, Loader2, FileText, FileSpreadsheet } from "lucide-react";
import { COLORS, FONT_HEAD, primaryButton, secondaryButton } from "./theme";
import { buildReport } from "./reportLogic";
import { reportText } from "./reportText";

// Each file has its own module, loaded when its button is pressed
const WRITERS = {
  pdf: () => import("./reportPdf").then((m) => m.downloadExecutivePdf),
  plan: () => import("./reportExcel").then((m) => m.downloadActionPlan),
  inventory: () => import("./reportExcel").then((m) => m.downloadAnalyzedInventory),
  pptx: () => import("./dashboardPptx").then((m) => m.downloadDashboardPptx),
};

// source: { items, coverDays, importInfo, sourceName }
export function useReportDownload({ source, lang, t, locked, onUnlock }) {
  const [busy, setBusy] = useState(null); // the file being built
  const [failed, setFailed] = useState(false);

  async function download(kind) {
    if (locked) {
      onUnlock();
      return;
    }
    if (busy) return;
    setBusy(kind);
    setFailed(false);
    try {
      const report = buildReport(source.items, { coverDays: source.coverDays, importInfo: source.importInfo });
      const text = reportText(report, { t, lang, items: source.items });
      const write = await WRITERS[kind]();
      await write({ items: source.items, report, text, lang, t, sourceName: source.sourceName });
    } catch (err) {
      console.error(err);
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }
  return { busy, failed, download };
}

function FileButton({ kind, icon: Icon, label, primary, state, locked, t }) {
  const working = state.busy === kind;
  return (
    <button
      onClick={() => state.download(kind)}
      disabled={state.busy !== null}
      data-testid={`report-${kind}`}
      style={{ ...(primary ? primaryButton : secondaryButton), padding: "10px 14px", fontSize: 11.5, opacity: state.busy !== null && !working ? 0.5 : 1 }}
    >
      {working ? <Loader2 size={13} className="ia-spin" /> : locked ? <Lock size={13} /> : <Icon size={13} />}
      {working ? t("rpPreparing") : label}
    </button>
  );
}

// In the assistant tab: the report, ready to send
export function ReportCard({ t, state, locked, isSample }) {
  return (
    <div
      data-testid="report-card"
      style={{ background: COLORS.surface, border: `1px solid ${COLORS.ink}`, borderRadius: 10, padding: "16px 18px", marginBottom: 20, display: "flex", gap: 16, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}
    >
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <h2 style={{ fontFamily: FONT_HEAD, fontSize: 20, fontWeight: 600, textTransform: "uppercase", margin: "0 0 4px", color: COLORS.ink }}>{t("rpCardTitle")}</h2>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: COLORS.ink }}>{t("rpCardText")}</div>
        {isSample && <div style={{ fontSize: 12.5, lineHeight: 1.5, color: COLORS.inkMuted, marginTop: 2 }}>{t("rpCardSample")}</div>}
        {locked && <div style={{ fontSize: 12.5, lineHeight: 1.5, color: COLORS.inkMuted, marginTop: 2 }}>{t("planReasonReport")}</div>}
        {state.failed && (
          <div role="alert" style={{ fontSize: 13, color: COLORS.critical, marginTop: 6 }}>
            {t("rpError")}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <FileButton kind="pdf" icon={FileText} label={t("rpBtnPdf")} primary state={state} locked={locked} t={t} />
        <FileButton kind="plan" icon={FileSpreadsheet} label={t("rpBtnPlan")} state={state} locked={locked} t={t} />
        <FileButton kind="inventory" icon={FileSpreadsheet} label={t("rpBtnInventory")} state={state} locked={locked} t={t} />
      </div>
    </div>
  );
}

// Above the dashboard: the same charts, with their reading, as slides
export function DashboardDownload({ t, state }) {
  const working = state.busy === "pptx";
  return (
    <div data-testid="dashboard-download" style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginBottom: 16 }}>
      <div style={{ fontSize: 13.5, color: COLORS.inkMuted, lineHeight: 1.5 }}>
        {t("rpPptxHint")}
        {state.failed && (
          <span role="alert" style={{ color: COLORS.critical, marginLeft: 8 }}>
            {t("rpError")}
          </span>
        )}
      </div>
      <button onClick={() => state.download("pptx")} disabled={state.busy !== null} data-testid="report-pptx" style={{ ...secondaryButton, padding: "10px 14px", fontSize: 11.5 }}>
        {working ? <Loader2 size={13} className="ia-spin" /> : <Download size={13} />}
        {working ? t("rpPreparing") : t("rpBtnPptx")}
      </button>
    </div>
  );
}
