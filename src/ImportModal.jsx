import { useMemo, useRef, useState } from "react";
import { Upload, Download, Loader2, AlertTriangle } from "lucide-react";
import Modal from "./Modal";
import { COLORS, FONT_MONO, monoLabel, primaryButton, secondaryButton, textInput } from "./theme";
import { FIELDS, pickSheet, validateMapping, buildInventory, reviewImport } from "./importLogic";
import { formatNumber } from "./i18n";
import { ExampleTable, FileGuide } from "./ui";
import { readFileSheets, downloadTemplate } from "./fileReaders";
import { DEFAULT_SALES_PERIOD_DAYS, DEFAULT_LEAD_TIME_DAYS, MAX_ROWS } from "./config";

// uploadsLeft: free uploads still available, or null for a paid plan (no limit to show)
export default function ImportModal({ lang, t, uploadsLeft = null, uploadsMax = 0, onClose, onImported }) {
  const [phase, setPhase] = useState("pick"); // pick | reading | map
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [table, setTable] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [period, setPeriod] = useState(DEFAULT_SALES_PERIOD_DAYS);
  const [lead, setLead] = useState(DEFAULT_LEAD_TIME_DAYS);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    setError("");
    setPhase("reading");
    try {
      const { sheets } = await readFileSheets(file);
      const picked = pickSheet(sheets);
      if (picked.bestIndex < 0) {
        setError(t("errEmpty"));
        setPhase("pick");
        return;
      }
      setFileName(file.name);
      setCandidates(picked.candidates);
      setSheetIndex(picked.bestIndex);
      setTable(picked.candidates[picked.bestIndex].table);
      setMapping(picked.candidates[picked.bestIndex].mapping);
      setPhase("map");
    } catch (err) {
      const key = err && typeof err.message === "string" && err.message.startsWith("err") ? err.message : "errUnreadable";
      setError(t(key));
      setPhase("pick");
    }
  }

  function chooseSheet(index) {
    setSheetIndex(index);
    setTable(candidates[index].table);
    setMapping(candidates[index].mapping);
    setError("");
  }

  const problems = mapping ? validateMapping(mapping) : [];

  // What the file gives with the columns chosen so far. It is worked out again on every change,
  // so the preview and the warnings always match what "Analyze" would load.
  const built = useMemo(() => {
    if (!table || !mapping || validateMapping(mapping).length > 0) return null;
    return buildInventory(table, mapping, { salesPeriodDays: period, defaultLeadTime: lead, defaultWarehouse: t("defaultWarehouse") });
  }, [table, mapping, period, lead, t]);
  const review = useMemo(() => (built && built.items.length > 0 ? reviewImport(table, mapping, built) : null), [built, table, mapping]);
  const warnings = review ? review.warnings : [];
  // The columns are there but no row gives a product with a stock number: said at once, not after a click
  const nothingRead = built !== null && built.items.length === 0;

  function analyze() {
    if (!built) return;
    const { items, report } = built;
    if (items.length === 0) {
      setError(t("errNoItems"));
      return;
    }
    onImported({ items, fileName, report });
  }

  return (
    <Modal title={phase === "map" ? t("importCheck") : t("importTitle")} onClose={onClose} closeLabel={t("close")} width={600}>
      {phase !== "map" && (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm,.csv,.tsv,.txt"
            style={{ display: "none" }}
            data-testid="file-input"
            onChange={(e) => {
              handleFile(e.target.files && e.target.files[0]);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => inputRef.current && inputRef.current.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFile(e.dataTransfer.files && e.dataTransfer.files[0]);
            }}
            disabled={phase === "reading"}
            style={{
              width: "100%",
              border: `2px dashed ${dragging ? COLORS.ink : COLORS.line}`,
              background: dragging ? COLORS.bg : COLORS.surfaceAlt,
              borderRadius: 10,
              padding: "34px 16px",
              cursor: phase === "reading" ? "default" : "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              color: COLORS.ink,
            }}
          >
            {phase === "reading" ? <Loader2 size={24} className="ia-spin" /> : <Upload size={24} />}
            <span style={{ fontSize: 15, fontWeight: 600 }}>
              {phase === "reading" ? t("importReading") : t("importPick")}
            </span>
            {phase !== "reading" && <span style={{ fontSize: 13, color: COLORS.inkMuted }}>{t("importDrop")}</span>}
          </button>

          {error && (
            <p role="alert" style={{ color: COLORS.critical, fontSize: 13.5, margin: "12px 0 0" }}>
              {error}
            </p>
          )}

          {uploadsLeft !== null && (
            <p data-testid="uploads-left" style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: COLORS.ink, letterSpacing: "0.03em", margin: "12px 0 0" }}>
              {t("uploadsLeft", { left: uploadsLeft, max: uploadsMax })}
            </p>
          )}

          <FileGuide title={t("importGuideTitle")} testId="import-guide">
            <div>{t("importGuideBody")}</div>
            <ExampleTable cols={t("importGuideCols")} rows={t("importGuideRows")} />
            <div style={{ color: COLORS.inkMuted, fontSize: 13 }}>{t("importGuideOptional")}</div>
            <div style={{ color: COLORS.inkMuted, fontSize: 13, marginTop: 4 }}>{t("importGuideNo")}</div>
            <button onClick={() => downloadTemplate(lang)} style={{ ...secondaryButton, padding: "8px 13px", fontSize: 11.5, margin: "10px 0 4px" }}>
              <Download size={13} /> {t("importTemplate")}
            </button>
          </FileGuide>
          <p style={{ fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.55, margin: "16px 0 0" }}>{t("privacy")}</p>
        </div>
      )}

      {phase === "map" && table && mapping && (
        <div>
          <p style={{ fontSize: 13.5, color: COLORS.inkMuted, margin: "0 0 14px" }}>
            {t("importFound", { rows: table.rows.length, file: fileName })}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {candidates.length > 1 && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  paddingBottom: 10,
                  marginBottom: 2,
                  borderBottom: `1px solid ${COLORS.line}`,
                }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 600, flex: "1 1 190px" }}>{t("importSheet")}</span>
                <select
                  value={String(sheetIndex)}
                  data-testid="sheet-select"
                  onChange={(e) => chooseSheet(Number(e.target.value))}
                  style={{ ...textInput, flex: "1 1 220px", width: "auto", padding: "8px 10px", fontSize: 13.5 }}
                >
                  {candidates.map((candidate, i) => (
                    <option key={i} value={String(i)}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {FIELDS.map((field) => (
              <label
                key={field}
                style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "space-between" }}
              >
                <span style={{ fontSize: 13.5, flex: "1 1 190px" }}>
                  {t(`field_${field}`)}
                  {field === "stock" && (
                    <span style={{ ...monoLabel, fontSize: 9.5, color: COLORS.critical, marginLeft: 6 }}>{t("required")}</span>
                  )}
                </span>
                <select
                  value={mapping[field] === null ? "" : String(mapping[field])}
                  data-testid={`map-${field}`}
                  onChange={(e) => {
                    const value = e.target.value === "" ? null : Number(e.target.value);
                    setError("");
                    setMapping((m) => ({ ...m, [field]: value }));
                  }}
                  style={{ ...textInput, flex: "1 1 220px", width: "auto", padding: "8px 10px", fontSize: 13.5 }}
                >
                  <option value="">{t("importNone")}</option>
                  {table.headers.map((h, i) => (
                    <option key={i} value={String(i)}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {/* Only ask for what the file does not already say */}
          {(mapping.sales !== null || mapping.lead_time_days === null) && (
          <div
            style={{
              marginTop: 16,
              padding: "12px 14px",
              background: COLORS.surfaceAlt,
              border: `1px solid ${COLORS.line}`,
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              fontSize: 13.5,
            }}
          >
            {mapping.sales !== null && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {t("importPeriod")}
                <input
                  type="number"
                  min="1"
                  max="730"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  style={{ ...textInput, width: 76, padding: "6px 8px", fontFamily: FONT_MONO }}
                />
                {t("importDays")}
              </label>
            )}
            {mapping.lead_time_days === null && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {t("importLead")}
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={lead}
                  data-testid="default-lead"
                  onChange={(e) => setLead(e.target.value)}
                  style={{ ...textInput, width: 76, padding: "6px 8px", fontFamily: FONT_MONO }}
                />
                {t("importDays")}
              </label>
            )}
          </div>
          )}

          {(problems.length > 0 || nothingRead || error) && (
            <div role="alert" style={{ color: COLORS.critical, fontSize: 13.5, marginTop: 12, lineHeight: 1.5 }}>
              {problems.length > 0 && <div style={{ fontWeight: 600 }}>{t("importMissingLead")}</div>}
              {problems.map((p) => (
                <div key={p}>{t(p)}</div>
              ))}
              {problems.length > 0 && <div style={{ color: COLORS.inkMuted, marginTop: 4 }}>{t("importMissingHelp")}</div>}
              {nothingRead && <div>{t("errNoItems")}</div>}
              {error && !nothingRead && <div>{error}</div>}
            </div>
          )}

          {/* What was understood from the file, so a wrong column is seen before the analysis */}
          {review && (
            <div data-testid="import-preview" style={{ marginTop: 16 }}>
              <div style={{ ...monoLabel, color: COLORS.ink, marginBottom: 2 }}>{t("importPreviewTitle")}</div>
              <ExampleTable
                cols={[t("importColProduct"), t("importColStock"), t("importColUsage"), t("importColReorder")]}
                rows={review.preview.map((item) => [
                  item.name,
                  formatNumber(lang, item.stock, 2),
                  item.avg_daily_usage === null || item.avg_daily_usage === undefined ? "—" : formatNumber(lang, item.avg_daily_usage, 2),
                  item.reorder_point === null || item.reorder_point === undefined ? "—" : formatNumber(lang, item.reorder_point, 2),
                ])}
              />
              {review.total > review.preview.length && (
                <div style={{ fontSize: 12.5, color: COLORS.inkMuted }}>{t("importPreviewMore", { n: formatNumber(lang, review.total - review.preview.length) })}</div>
              )}
            </div>
          )}

          {warnings.length > 0 && (
            <div
              role="alert"
              data-testid="import-warnings"
              style={{ marginTop: 14, padding: "11px 13px", background: COLORS.lowBg, border: `1px solid ${COLORS.low}`, borderRadius: 8, fontSize: 13.5, lineHeight: 1.5, color: COLORS.ink }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 600, marginBottom: 4 }}>
                <AlertTriangle size={15} color={COLORS.low} /> {t("warnTitle")}
              </div>
              {warnings.map((w) => (
                <div key={w.code} style={{ marginTop: 3 }}>
                  {t(w.code, w)}
                </div>
              ))}
            </div>
          )}
          {table.rows.length > MAX_ROWS && (
            <p style={{ color: COLORS.inkMuted, fontSize: 12.5, margin: "10px 0 0" }}>
              {t("reportTruncated", { max: MAX_ROWS })}
            </p>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <button
              onClick={analyze}
              disabled={problems.length > 0 || nothingRead}
              style={{ ...(warnings.length > 0 ? secondaryButton : primaryButton), opacity: problems.length > 0 || nothingRead ? 0.45 : 1, cursor: problems.length > 0 || nothingRead ? "default" : "pointer" }}
            >
              {warnings.length > 0 ? t("importAnalyzeAnyway") : t("importAnalyze")}
            </button>
            <button
              onClick={() => {
                setPhase("pick");
                setError("");
              }}
              style={secondaryButton}
            >
              {t("importAnother")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
