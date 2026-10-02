import { useRef, useState } from "react";
import { Upload, Download, Loader2 } from "lucide-react";
import Modal from "./Modal";
import { COLORS, FONT_MONO, monoLabel, primaryButton, secondaryButton, textInput } from "./theme";
import { FIELDS, pickSheet, validateMapping, buildInventory } from "./importLogic";
import { readFileSheets, downloadTemplate } from "./fileReaders";
import { DEFAULT_SALES_PERIOD_DAYS, DEFAULT_LEAD_TIME_DAYS, MAX_ROWS } from "./config";

export default function ImportModal({ lang, t, onClose, onImported }) {
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

  function analyze() {
    const { items, report } = buildInventory(table, mapping, {
      salesPeriodDays: period,
      defaultLeadTime: lead,
      defaultWarehouse: t("defaultWarehouse"),
    });
    if (items.length === 0) {
      setError(t("errNoItems"));
      return;
    }
    onImported({ items, fileName, report });
  }

  const problems = mapping ? validateMapping(mapping) : [];

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

          <p style={{ fontSize: 13.5, color: COLORS.inkMuted, lineHeight: 1.55, margin: "14px 0 12px" }}>
            {t("importNeeds")}
          </p>
          <button onClick={() => downloadTemplate(lang)} style={{ ...secondaryButton, padding: "9px 14px", fontSize: 11.5 }}>
            <Download size={13} /> {t("importTemplate")}
          </button>
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
            <label style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {t("importLead")}
              <input
                type="number"
                min="1"
                max="365"
                value={lead}
                onChange={(e) => setLead(e.target.value)}
                style={{ ...textInput, width: 76, padding: "6px 8px", fontFamily: FONT_MONO }}
              />
              {t("importDays")}
            </label>
          </div>

          {(problems.length > 0 || error) && (
            <div role="alert" style={{ color: COLORS.critical, fontSize: 13.5, marginTop: 12, lineHeight: 1.5 }}>
              {problems.map((p) => (
                <div key={p}>{t(p)}</div>
              ))}
              {error && <div>{error}</div>}
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
              disabled={problems.length > 0}
              style={{ ...primaryButton, opacity: problems.length > 0 ? 0.45 : 1, cursor: problems.length > 0 ? "default" : "pointer" }}
            >
              {t("importAnalyze")}
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
