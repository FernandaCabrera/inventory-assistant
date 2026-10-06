import { useRef, useState } from "react";
import { Upload, Loader2, ShieldCheck } from "lucide-react";
import Modal from "./Modal";
import { COLORS, monoLabel, primaryButton, secondaryButton, textInput } from "./theme";
import { ExampleTable, FileGuide } from "./ui";
import { pickSheet } from "./importLogic";
import { COUNT_FIELDS, DAY, guessCountMapping, validateCountMapping, buildCountLines, dateOrderInfo } from "./countLogic";
import { readFileSheets } from "./fileReaders";
import { COUNT_MAX_LINES } from "./config";

const KIND = { guess: guessCountMapping, validate: validateCountMapping, scanRows: 40 };
const NEEDED = ["count_date", "location", "sku"];
const EXTRA = COUNT_FIELDS.filter((field) => !NEEDED.includes(field));

// Reads a cycle count report. Everything happens in the browser: the file is not sent anywhere.
export default function CountImportModal({ lang, t, onClose, onImported }) {
  const [phase, setPhase] = useState("pick"); // pick | reading | map
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [table, setTable] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [dateOrder, setDateOrder] = useState(lang === "es" ? "dmy" : "mdy");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    setError("");
    setPhase("reading");
    try {
      const { sheets } = await readFileSheets(file);
      const picked = pickSheet(sheets, KIND);
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
    const now = new Date();
    const tomorrow = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) + DAY;
    const { lines, undated, report } = buildCountLines(table, mapping, { dateOrder, maxRows: COUNT_MAX_LINES, maxDate: tomorrow });
    if (lines.length === 0) {
      setError(t("countErrNoLines"));
      return;
    }
    onImported({ lines, undated, fileName, report });
  }

  const problems = mapping ? validateCountMapping(mapping) : [];
  // Dates like 03/04/2026 can be read two ways; ask only when the file does not settle it
  const dates = mapping && table && mapping.count_date !== null ? dateOrderInfo(table.rows.map((row) => row[mapping.count_date])) : null;
  const askOrder = dates !== null && dates.written && dates.order === null;

  const row = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "space-between" };
  const select = { ...textInput, flex: "1 1 220px", width: "auto", padding: "8px 10px", fontSize: 13.5 };

  function fieldRow(field) {
    return (
      <label key={field} style={row}>
        <span style={{ fontSize: 13.5, flex: "1 1 190px" }}>{t(`cfield_${field}`)}</span>
        <select
          value={mapping[field] === null ? "" : String(mapping[field])}
          data-testid={`cmap-${field}`}
          onChange={(e) => {
            const value = e.target.value === "" ? null : Number(e.target.value);
            setError("");
            setMapping((m) => ({ ...m, [field]: value }));
          }}
          style={select}
        >
          <option value="">{t("importNone")}</option>
          {table.headers.map((h, i) => (
            <option key={i} value={String(i)}>
              {h}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <Modal title={phase === "map" ? t("importCheck") : t("countImportTitle")} onClose={onClose} closeLabel={t("close")} width={600}>
      {phase !== "map" && (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm,.csv,.tsv,.txt"
            style={{ display: "none" }}
            data-testid="count-file-input"
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
            <span style={{ fontSize: 15, fontWeight: 600 }}>{phase === "reading" ? t("importReading") : t("importPick")}</span>
            {phase !== "reading" && <span style={{ fontSize: 13, color: COLORS.inkMuted }}>{t("importDrop")}</span>}
          </button>

          {error && (
            <p role="alert" style={{ color: COLORS.critical, fontSize: 13.5, margin: "12px 0 0" }}>
              {error}
            </p>
          )}

          <FileGuide title={t("countGuideTitle")} testId="count-guide">
            <div>{t("countGuideA")}</div>
            <ExampleTable cols={t("countGuideACols")} rows={t("countGuideARows")} />
            <div>{t("countGuideB")}</div>
            <ExampleTable cols={t("countGuideBCols")} rows={t("countGuideBRows")} />
            <div style={{ color: COLORS.inkMuted, fontSize: 13 }}>{t("countGuideMore")}</div>
            <div style={{ color: COLORS.inkMuted, fontSize: 13, marginTop: 4 }}>{t("countGuideNo")}</div>
          </FileGuide>
          <div style={{ height: 12 }} />
          <p style={{ display: "flex", gap: 8, fontSize: 13, color: COLORS.ink, lineHeight: 1.5, margin: 0 }}>
            <ShieldCheck size={15} color={COLORS.ok} style={{ flexShrink: 0, marginTop: 2 }} />
            {t("countsPrivacy")}
          </p>
        </div>
      )}

      {phase === "map" && table && mapping && (
        <div>
          <p style={{ fontSize: 13.5, color: COLORS.inkMuted, margin: "0 0 14px" }}>{t("importFound", { rows: table.rows.length, file: fileName })}</p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {candidates.length > 1 && (
              <label style={{ ...row, paddingBottom: 10, marginBottom: 2, borderBottom: `1px solid ${COLORS.line}` }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, flex: "1 1 190px" }}>{t("countImportSheet")}</span>
                <select value={String(sheetIndex)} data-testid="count-sheet-select" onChange={(e) => chooseSheet(Number(e.target.value))} style={select}>
                  {candidates.map((candidate, i) => (
                    <option key={i} value={String(i)}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div style={{ ...monoLabel, fontSize: 10, color: COLORS.inkMuted }}>{t("countGroupNeeded")}</div>
            {NEEDED.map(fieldRow)}
            {askOrder && (
              <label style={row}>
                <span style={{ fontSize: 13.5, flex: "1 1 190px" }}>{t("countDateOrder")}</span>
                <select value={dateOrder} data-testid="count-date-order" onChange={(e) => setDateOrder(e.target.value)} style={select}>
                  <option value="dmy">{t("countDmy")}</option>
                  <option value="mdy">{t("countMdy")}</option>
                </select>
              </label>
            )}
            <div style={{ ...monoLabel, fontSize: 10, color: COLORS.inkMuted, marginTop: 10 }}>{t("countGroupExtra")}</div>
            {EXTRA.map(fieldRow)}
          </div>

          {(problems.length > 0 || error) && (
            <div role="alert" style={{ color: COLORS.critical, fontSize: 13.5, marginTop: 12, lineHeight: 1.5 }}>
              {problems.map((p) => (
                <div key={p}>{t(p)}</div>
              ))}
              {error && <div>{error}</div>}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <button
              onClick={analyze}
              disabled={problems.length > 0}
              style={{ ...primaryButton, opacity: problems.length > 0 ? 0.45 : 1, cursor: problems.length > 0 ? "default" : "pointer" }}
            >
              {t("countAnalyze")}
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
