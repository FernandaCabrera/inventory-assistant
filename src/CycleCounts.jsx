import { useMemo, useState } from "react";
import { Home, FileSpreadsheet, CalendarDays, ShieldCheck, Upload, Download, Loader2, Lock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer, ReferenceLine } from "recharts";
import { COLORS, FONT_MONO, FONT_HEAD, monoLabel, primaryButton, textInput } from "./theme";
import { LOCALES, formatNumber, formatMoney } from "./i18n";
import { useIsMobile, KPICard, ChartCard, chipStyle, chipButtonStyle } from "./ui";
import { analyzeCounts, conclusions, CYCLE_OPTIONS } from "./countLogic";
import { finding, percent, shortDate, dayMonth, monthYear, pace, signed } from "./countFormat";
import { exportCountReport } from "./countExport";
import { COUNT_TABLE_ROWS, COUNT_MAX_LINES, COUNT_EXPORT_NEEDS_PLAN, DEFAULT_CYCLE_DAYS } from "./config";

// Chart colors. Surplus and shortage are a pair checked for color-blind readers on a white card.
const SURPLUS = "#2F6DB5";
const SHORTAGE = "#C1431F";
const NEUTRAL = "#3D4744";

const card = { background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "18px 18px 16px", minWidth: 0 };
const cardTitle = { ...monoLabel, color: COLORS.ink, marginBottom: 6 };
const hintText = { fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.5, margin: "0 0 10px" };
const th = { ...monoLabel, fontSize: 10, color: COLORS.inkMuted, padding: "8px 10px", borderBottom: `1px solid ${COLORS.line}`, whiteSpace: "nowrap" };
const td = { fontSize: 13, color: COLORS.ink, padding: "8px 10px", borderBottom: `1px solid ${COLORS.line}` };
const axisTick = { fontSize: 11, fill: COLORS.inkMuted };

// columns: [{ label, right, mono, cell: (row) => text }]
function DataTable({ title, hint, columns, rows, more, testid }) {
  if (rows.length === 0) return null;
  const shown = rows.slice(0, COUNT_TABLE_ROWS);
  return (
    <div style={card} data-testid={testid}>
      <div style={cardTitle}>{title}</div>
      {hint && <p style={hintText}>{hint}</p>}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {columns.map((column, i) => (
                <th key={i} style={{ ...th, textAlign: column.right ? "right" : "left" }}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, r) => (
              <tr key={r}>
                {columns.map((column, i) => (
                  <td
                    key={i}
                    style={{
                      ...td,
                      textAlign: column.right ? "right" : "left",
                      fontFamily: column.mono || column.right ? FONT_MONO : "inherit",
                      fontSize: column.mono || column.right ? 12.5 : 13,
                      whiteSpace: column.wrap ? "normal" : "nowrap",
                    }}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > shown.length && <p style={{ ...hintText, margin: "10px 0 0" }}>{more}</p>}
    </div>
  );
}

function ChartLegend({ items }) {
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: COLORS.ink, margin: "-4px 0 10px" }}>
      {items.map((item) => (
        <span key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

// What shows when the pointer is over a bar. Text stays in ink; the swatch carries the color.
function ChartTip({ active, payload, label, format }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload || {};
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "8px 11px", fontSize: 12, color: COLORS.ink, boxShadow: "0 4px 14px rgba(21, 24, 26, 0.10)" }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{point.full || label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ display: "flex", alignItems: "center", gap: 7, lineHeight: 1.7 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: point.color || entry.color, flexShrink: 0 }} />
          <span style={{ color: COLORS.inkMuted }}>{entry.name}</span>
          <span style={{ fontFamily: FONT_MONO, marginLeft: "auto", paddingLeft: 14 }}>{format(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

// inputs: what the analyst typed ({ total, counted, cycle }). It lives in the parent so it is still
// there after a visit to the home page or a change of language.
export default function CycleCounts({ data, inputs, onInputs, lang, t, paid, onHome, onReplace, onUpgrade }) {
  const isMobile = useIsMobile();
  const isSample = data.source === "sample";
  const totalLocations = inputs.total;
  const countedLocations = inputs.counted;
  const cycleDays = inputs.cycle || DEFAULT_CYCLE_DAYS;
  const setTotalLocations = (total) => onInputs({ ...inputs, total });
  const setCountedLocations = (counted) => onInputs({ ...inputs, counted });
  const setCycleDays = (cycle) => onInputs({ ...inputs, cycle });
  const [exporting, setExporting] = useState(false);

  const a = useMemo(() => {
    const now = new Date();
    return analyzeCounts(data.lines, {
      undated: data.undated,
      totalLocations,
      countedLocations,
      cycleDays,
      asOf: isSample ? undefined : Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
    });
  }, [data, totalLocations, countedLocations, cycleDays, isSample]);
  const findings = useMemo(() => conclusions(a).map((parts) => finding(t, lang, parts)), [a, t, lang]);

  const num = (value, decimals = 0) => formatNumber(lang, value, decimals);
  const money = (value) => formatMoney(lang, value);
  const compact = (value) => new Intl.NumberFormat(LOCALES[lang], { notation: "compact", maximumFractionDigits: 1 }).format(value);
  const amount = (value) => (a.hasValue ? money(value) : num(value, 2));
  const more = t("ccMore", { n: COUNT_TABLE_ROWS });
  const coverageMode = a.mode === "coverage";
  // a file counted by product, with no locations, gets the same sentences about products
  const tn = (key, vars) => t(a.hasLocations ? key : `${key}P`, vars);

  async function download() {
    if (COUNT_EXPORT_NEEDS_PLAN && !paid && !isSample) {
      onUpgrade("counts");
      return;
    }
    setExporting(true);
    try {
      await exportCountReport({ analysis: a, findings, lang, t, fileName: data.fileName });
    } finally {
      setExporting(false);
    }
  }

  const notes = [];
  const report = data.report || {};
  if (report.skippedHeaders > 0) notes.push(t("ccNoteHeaders", { n: num(report.skippedHeaders) }));
  if (report.skippedBadDate > 0) notes.push(t("ccNoteBadDate", { n: num(report.skippedBadDate) }));
  if (report.truncated) notes.push(t("ccNoteTruncated", { max: num(COUNT_MAX_LINES) }));

  // Differences over time: by month when the report spans several, else by week
  const byMonth = a.months.length >= 3;
  const diffData = (byMonth ? a.months : a.weeks).map((bucket) => ({
    label: byMonth ? monthYear(lang, bucket.month) : dayMonth(lang, bucket.week),
    full: byMonth ? monthYear(lang, bucket.month) : t("ccWeekOf", { date: dayMonth(lang, bucket.week) }),
    surplus: a.hasValue ? Math.round(bucket.surplus) : bucket.surplusUnits,
    shortage: a.hasValue ? Math.round(bucket.shortage) : bucket.shortageUnits,
  }));
  const weekData = a.weeks.map((week) => ({ label: dayMonth(lang, week.week), full: t("ccWeekOf", { date: dayMonth(lang, week.week) }), locations: week.locations }));
  const reasonData = a.reasons.slice(0, 8).map((reason) => ({
    name: reason.reason || t("ccNoReasonLabel"),
    value: a.hasValue ? Math.round(reason.absValue) : reason.lines,
  }));
  const agingData = coverageMode
    ? [
        ...a.aging.bands.map((band) => ({ name: t(`ccBand_${band.key}`), locations: band.locations, color: band.overdue ? SHORTAGE : SURPLUS })),
        { name: t("ccBand_never"), locations: a.aging.never, color: SHORTAGE },
      ]
    : [];
  const showZones = a.zones.length > 1 && a.zones.length <= Math.max(2, a.locationsCounted * 0.6);
  const axisAmount = (value) => {
    if (!a.hasValue) return compact(value);
    return value < 0 ? `−$${compact(-value)}` : `$${compact(value)}`;
  };
  const hover = { fill: COLORS.surfaceAlt };

  const field = { ...textInput, width: 110, padding: "7px 9px", fontFamily: FONT_MONO, fontSize: 13 };
  const fieldLabel = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13.5, color: COLORS.ink };
  const numberInput = (value, setValue, label, hint, testid, problem) => (
    <label style={fieldLabel}>
      <span>
        {label} <span style={{ color: COLORS.inkMuted }}>({hint})</span>
      </span>
      <input
        type="number"
        min="1"
        step="1"
        inputMode="numeric"
        value={value}
        placeholder={t("ccOptional")}
        data-testid={testid}
        onChange={(e) => setValue(e.target.value)}
        style={{ ...field, borderColor: problem ? COLORS.critical : COLORS.line }}
      />
      {problem && (
        <span role="alert" style={{ fontSize: 12.5, color: COLORS.critical }}>
          {problem}
        </span>
      )}
    </label>
  );
  const totalProblem = a.totalTooSmall ? t("ccTotalTooSmall", { n: num(a.totalFloor) }) : null;
  const countedProblem = a.countedTooSmall ? t("ccCountedTooSmall", { n: num(a.eventsOff) }) : null;

  return (
    <div data-testid="cycle-counts">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        <button onClick={onHome} style={chipButtonStyle} data-testid="home">
          <Home size={11} /> {t("home")}
        </button>
        <span style={chipStyle}>
          <FileSpreadsheet size={11} style={{ flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{data.fileName}</span>
        </span>
        {a.period.from !== null && (
          <span style={chipStyle}>
            <CalendarDays size={11} />{" "}
            {coverageMode ? t("ccAsOf", { date: shortDate(lang, a.aging.asOf) }) : t("ccPeriod", { from: shortDate(lang, a.period.from), to: shortDate(lang, a.period.to) })}
          </span>
        )}
        <span style={{ ...chipStyle, color: COLORS.ok, borderColor: COLORS.ok, background: COLORS.okBg }}>
          <ShieldCheck size={11} /> {t("ccLocal")}
        </span>
        <button onClick={onReplace} style={chipButtonStyle} data-testid="count-replace">
          <Upload size={11} /> {isSample ? t("ccSampleUpload") : t("ccReplace")}
        </button>
        <button onClick={download} disabled={exporting} style={{ ...chipButtonStyle, background: COLORS.ink, color: "#F4F1EA" }} data-testid="count-export">
          {exporting ? <Loader2 size={11} className="ia-spin" /> : COUNT_EXPORT_NEEDS_PLAN && !paid && !isSample ? <Lock size={11} /> : <Download size={11} />}
          {exporting ? t("ccExporting") : t("ccExport")}
        </button>
      </div>

      <h2 style={{ fontFamily: FONT_HEAD, fontSize: isMobile ? 22 : 28, fontWeight: 600, textTransform: "uppercase", color: COLORS.ink, margin: "0 0 14px", letterSpacing: "0.01em" }}>
        {t("ccTitle")}
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {isSample && (
          <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "12px 16px", fontSize: 13.5 }}>
            {t("ccSampleBanner")}
            <button onClick={onReplace} style={{ ...primaryButton, padding: "8px 14px", fontSize: 11.5 }}>
              <Upload size={13} /> {t("ccSampleUpload")}
            </button>
          </div>
        )}
        {notes.length > 0 && <div style={{ fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.6 }}>{notes.join(" ")}</div>}

        {/* What the file cannot say on its own. A file with no locations has nothing to ask outside the cycle. */}
        {(coverageMode || a.hasLocations) && (
        <div style={{ ...card, display: "flex", gap: "12px 28px", flexWrap: "wrap", padding: "14px 18px" }}>
          {coverageMode ? (
            <label style={fieldLabel}>
              {tn("ccCycleBefore")}
              <select value={String(cycleDays)} data-testid="count-cycle" onChange={(e) => setCycleDays(Number(e.target.value))} style={{ ...field, width: 84 }}>
                {CYCLE_OPTIONS.map((days) => (
                  <option key={days} value={String(days)}>
                    {days}
                  </option>
                ))}
              </select>
              {t("ccCycleAfter")}
            </label>
          ) : null}
          {coverageMode ? (
            numberInput(totalLocations, setTotalLocations, tn("ccTotalLabel"), t("ccTotalHintList"), "count-total", totalProblem)
          ) : (
            <>
              {a.mode === "adjustments" &&
                numberInput(countedLocations, setCountedLocations, t("ccCountedLabel"), t("ccCountedHint"), "count-counted", countedProblem)}
              {numberInput(totalLocations, setTotalLocations, t("ccTotalLabel"), t("ccTotalHint"), "count-total", totalProblem)}
            </>
          )}
        </div>
        )}

        <div style={{ ...card, padding: "20px 22px" }} data-testid="count-conclusions">
          <div style={{ ...cardTitle, marginBottom: 12 }}>{t("ccConclusionsTitle")}</div>
          <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 11 }}>
            {findings.map((text, i) => (
              <li key={i} style={{ display: "flex", gap: 12, fontSize: 14.5, lineHeight: 1.55, color: COLORS.ink }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600, color: COLORS.critical, letterSpacing: "0.06em", flexShrink: 0, marginTop: 3 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ol>
        </div>

        {coverageMode ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <KPICard label={tn("ccKpiTotalLocs")} value={num(a.totalLocations)} />
            <KPICard label={t("ccKpiOnTime")} value={percent(lang, a.aging.compliance ?? 0)} hint={tn("ccLocationsHint", { n: num(a.aging.onTime) })} />
            <KPICard label={t("ccKpiOverdue")} value={num(a.aging.overdue)} color={a.aging.overdue > 0 ? COLORS.critical : undefined} />
            <KPICard label={t("ccKpiNever")} value={num(a.aging.never)} />
            <KPICard label={t("ccKpiPace")} value={pace(lang, a.aging.perWeek)} hint={tn("ccPerWeekHint")} />
            <KPICard label={t("ccKpiNeeded")} value={pace(lang, a.aging.needed)} hint={tn("ccPerWeekHint")} />
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {a.lineAccuracy !== null && <KPICard label={t("ccKpiLineAcc")} value={percent(lang, a.lineAccuracy)} />}
              {a.hasLocations && a.locationAccuracy !== null && <KPICard label={t("ccKpiLocAcc")} value={percent(lang, a.locationAccuracy)} />}
              {a.mode === "detail" && <KPICard label={t("ccKpiLines")} value={num(a.lines)} />}
              <KPICard label={t("ccKpiOff")} value={num(a.off)} />
              {a.hasLocations && <KPICard label={a.mode === "detail" ? t("ccKpiLocations") : t("ccKpiAdjLocs")} value={num(a.locationsCounted)} />}
              {a.coverage !== null && <KPICard label={t("ccKpiCoverage")} value={percent(lang, a.coverage)} />}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {a.hasValue ? (
                <>
                  <KPICard label={t("ccKpiAbs")} value={money(a.absValue)} />
                  <KPICard
                    label={t("ccKpiNet")}
                    value={signed(lang, a.netValue, true)}
                    hint={a.netValue < 0 ? t("ccShortage") : a.netValue > 0 ? t("ccSurplus") : undefined}
                  />
                </>
              ) : (
                <>
                  <KPICard label={t("ccKpiAbsUnits")} value={num(a.absUnits, 2)} />
                  <KPICard label={t("ccKpiNetUnits")} value={signed(lang, a.netUnits)} hint={a.netUnits < 0 ? t("ccShortage") : a.netUnits > 0 ? t("ccSurplus") : undefined} />
                </>
              )}
            </div>
          </>
        )}

        {coverageMode ? (
          <ChartCard title={t("ccChartAging")} height={300}>
            <ChartLegend items={[{ label: t("ccWithin"), color: SURPLUS }, { label: t("ccOutside"), color: SHORTAGE }]} />
            <div style={{ height: 262 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agingData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} vertical={false} />
                  <XAxis dataKey="name" tick={axisTick} axisLine={{ stroke: COLORS.line }} tickLine={false} interval={0} />
                  <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={44} tickFormatter={compact} />
                  <Tooltip content={<ChartTip format={num} />} cursor={hover} />
                  <Bar isAnimationActive={false} dataKey="locations" name={tn("ccTipLocations")} radius={[4, 4, 0, 0]} maxBarSize={64}>
                    {agingData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        ) : (
          <>
            {/* with a single period there is no trend to draw */}
            {diffData.length > 1 && (
            <div style={{ display: "grid", gridTemplateColumns: isMobile || !a.hasLocations ? "1fr" : "1fr 1fr", gap: 16 }}>
              <ChartCard title={`${byMonth ? t("ccChartDiffMonth") : t("ccChartDiffWeek")} · ${a.hasValue ? t("ccInValue") : t("ccInUnits")}`}>
                <ChartLegend items={[{ label: t("ccSurplus"), color: SURPLUS }, { label: t("ccShortage"), color: SHORTAGE }]} />
                <div style={{ height: 252 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={diffData} stackOffset="sign" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} vertical={false} />
                    <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis tick={axisTick} axisLine={false} tickLine={false} width={58} tickFormatter={axisAmount} />
                    <Tooltip content={<ChartTip format={(value) => signed(lang, value, a.hasValue)} />} cursor={hover} />
                    <ReferenceLine y={0} stroke={COLORS.inkMuted} />
                    <Bar isAnimationActive={false} dataKey="surplus" name={t("ccSurplus")} stackId="diff" fill={SURPLUS} radius={[4, 4, 0, 0]} maxBarSize={44} />
                    <Bar isAnimationActive={false} dataKey="shortage" name={t("ccShortage")} stackId="diff" fill={SHORTAGE} radius={[4, 4, 0, 0]} maxBarSize={44} />
                  </BarChart>
                </ResponsiveContainer>
                </div>
              </ChartCard>

              {a.hasLocations && (
                <ChartCard title={a.mode === "detail" ? t("ccChartWeeks") : t("ccChartWeeksAdj")}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weekData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} vertical={false} />
                      <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: COLORS.line }} tickLine={false} interval={Math.max(0, Math.ceil(weekData.length / 7) - 1)} />
                      <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={44} />
                      <Tooltip content={<ChartTip format={num} />} cursor={hover} />
                      <Bar isAnimationActive={false} dataKey="locations" name={t("ccTipLocations")} fill={NEUTRAL} radius={[4, 4, 0, 0]} maxBarSize={34} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </div>
            )}

            {reasonData.length > 1 && (
              <ChartCard title={a.hasValue ? t("ccChartReasonsValue") : t("ccChartReasonsLines")} height={Math.max(160, reasonData.length * 40)}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={reasonData} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} horizontal={false} />
                    <XAxis type="number" tick={axisTick} axisLine={{ stroke: COLORS.line }} tickLine={false} allowDecimals={false} tickFormatter={axisAmount} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: COLORS.ink }} axisLine={false} tickLine={false} width={isMobile ? 112 : 168} />
                    <Tooltip content={<ChartTip format={a.hasValue ? money : num} />} cursor={hover} />
                    <Bar isAnimationActive={false} dataKey="value" name={a.hasValue ? t("ccColAbs") : t("ccTipLines")} fill={NEUTRAL} radius={[0, 4, 4, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </>
        )}

        {coverageMode ? (
          <>
            {a.aging.zones.length > 1 && (
              <DataTable
                testid="count-aging-zones"
                title={t("ccAgingZonesTitle")}
                hint={t("ccZonesHint")}
                more={more}
                rows={a.aging.zones}
                columns={[
                  { label: t("ccColZone"), mono: true, cell: (z) => z.zone },
                  { label: t("ccColLocations"), right: true, cell: (z) => num(z.locations) },
                  { label: t("ccColOutside"), right: true, cell: (z) => num(z.overdue) },
                  { label: t("ccColNever"), right: true, cell: (z) => num(z.never) },
                  { label: t("ccColOnTime"), right: true, cell: (z) => percent(lang, z.compliance) },
                ]}
              />
            )}
            <DataTable
              testid="count-oldest"
              title={tn("ccOldestTitle")}
              more={more}
              rows={a.aging.oldest}
              columns={[
                { label: tn("ccColLocation"), mono: true, cell: (o) => (o.warehouse ? `${o.warehouse} · ${o.location}` : o.location) },
                { label: t("ccColLast"), cell: (o) => shortDate(lang, o.last) },
                { label: t("ccColSince"), right: true, cell: (o) => num(o.daysSince) },
              ]}
            />
            {a.aging.neverList.length > 0 && (
              <div style={card} data-testid="count-never">
                <div style={cardTitle}>
                  {tn("ccNeverTitle")} · {num(a.aging.neverList.length)}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {a.aging.neverList.slice(0, 40).map((location, i) => (
                    <span key={i} style={{ ...chipStyle, textTransform: "none" }}>
                      {location.location}
                    </span>
                  ))}
                  {a.aging.neverList.length > 40 && (
                    <span style={{ fontSize: 12.5, color: COLORS.inkMuted, alignSelf: "center" }}>{t("ccAndMore", { n: num(a.aging.neverList.length - 40) })}</span>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {showZones && (
              <DataTable
                testid="count-zones"
                title={t("ccZonesTitle")}
                hint={t("ccZonesHint")}
                more={more}
                rows={a.zones}
                columns={[
                  { label: t("ccColZone"), mono: true, cell: (z) => z.zone },
                  { label: t("ccColLines"), right: true, cell: (z) => num(z.lines) },
                  { label: t("ccColOff"), right: true, cell: (z) => num(z.off) },
                  ...(a.mode === "detail" ? [{ label: t("ccColAccuracy"), right: true, cell: (z) => (z.accuracy === null ? "—" : percent(lang, z.accuracy)) }] : []),
                  { label: a.hasValue ? t("ccColAbs") : t("ccColAbsUnits"), right: true, cell: (z) => amount(a.hasValue ? z.absValue : z.absUnits) },
                ]}
              />
            )}
            <DataTable
              testid="count-top"
              title={t("ccTopTitle")}
              more={more}
              rows={a.topSkus}
              columns={[
                { label: t("ccColSku"), mono: true, cell: (s) => s.sku },
                { label: t("ccColProduct"), wrap: true, cell: (s) => s.name || "—" },
                { label: t("ccColOff"), right: true, cell: (s) => num(s.lines) },
                { label: t("ccColNetUnits"), right: true, cell: (s) => signed(lang, s.netUnits) },
                ...(a.hasValue
                  ? [
                      { label: t("ccColNet"), right: true, cell: (s) => signed(lang, s.netValue, true) },
                      { label: t("ccColAbs"), right: true, cell: (s) => money(s.absValue) },
                    ]
                  : [{ label: t("ccColAbsUnits"), right: true, cell: (s) => num(s.absUnits, 2) }]),
              ]}
            />
              <DataTable
                testid="count-repeat"
                title={t("ccRepeatTitle")}
                hint={t("ccRepeatHint")}
                more={more}
                rows={a.repeatLocations}
                columns={[
                  { label: t("ccColLocation"), mono: true, cell: (r) => r.location },
                  { label: t("ccColTimes"), right: true, cell: (r) => num(r.times) },
                  { label: a.hasValue ? t("ccColAbs") : t("ccColAbsUnits"), right: true, cell: (r) => amount(a.hasValue ? r.absValue : r.absUnits) },
                ]}
              />
              <DataTable
                testid="count-lots"
                title={t("ccLotsTitle")}
                hint={t("ccLotsHint")}
                more={more}
                rows={a.lotSwaps}
                columns={[
                  { label: t("ccColDate"), cell: (g) => shortDate(lang, g.date) },
                  { label: t("ccColLocation"), mono: true, cell: (g) => g.location || "—" },
                  { label: t("ccColProduct"), wrap: true, cell: (g) => g.name || g.sku },
                  { label: t("ccColUp"), right: true, cell: (g) => signed(lang, g.plusUnits) },
                  { label: t("ccColDown"), right: true, cell: (g) => signed(lang, g.minusUnits) },
                  { label: t("ccColNetUnits"), right: true, cell: (g) => signed(lang, g.netUnits) },
                  ...(a.hasValue ? [{ label: t("ccColNet"), right: true, cell: (g) => signed(lang, g.netValue, true) }] : []),
                ]}
              />
            {a.hasCounters && (
              <DataTable
                testid="count-people"
                title={t("ccCountersTitle")}
                hint={t("ccCountersHint")}
                more={more}
                rows={a.counters}
                columns={[
                  { label: t("ccColPerson"), cell: (c) => c.counter },
                  { label: t("ccColDays"), right: true, cell: (c) => num(c.days) },
                  { label: t("ccColLocations"), right: true, cell: (c) => num(c.locations) },
                  { label: t("ccColLines"), right: true, cell: (c) => num(c.lines) },
                  { label: t("ccColOff"), right: true, cell: (c) => num(c.off) },
                ]}
              />
            )}
          </>
        )}

        <p style={{ display: "flex", gap: 8, fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.5, margin: 0 }}>
          <ShieldCheck size={14} color={COLORS.ok} style={{ flexShrink: 0, marginTop: 2 }} />
          {t("countsPrivacy")}
        </p>
      </div>
    </div>
  );
}
