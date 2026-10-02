// Writes the cycle count report to an Excel file. Built in the browser, like the report itself.

import ExcelJS from "exceljs/dist/exceljs.min.js";
import { LOCALES } from "./i18n";
import { percent, shortDate, monthName, pace } from "./countFormat";

const INK = "FF15181A";
const MUTED = "FF6B7268";
const HAIR = "FFDADFD7";
const round2 = (value) => Math.round(value * 100) / 100;
const share = (value) => (value === null || value === undefined ? "" : Math.round(value * 1000) / 1000);

// columns: [{ header, width, value: (row) => cell, format }]
function addTable(workbook, name, columns, rows) {
  if (rows.length === 0) return;
  const sheet = workbook.addWorksheet(name.slice(0, 31));
  const header = sheet.addRow(columns.map((c) => c.header));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  columns.forEach((c, i) => {
    sheet.getColumn(i + 1).width = c.width || 16;
    if (c.format) sheet.getColumn(i + 1).numFmt = c.format;
  });
  rows.forEach((row) => {
    sheet.addRow(columns.map((c) => c.value(row))).eachCell((cell) => {
      cell.border = { bottom: { style: "hair", color: { argb: HAIR } } };
    });
  });
}

async function save(workbook, name) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

// The list of last counts exactly as it is on screen: the rows left after the filter, the area and the search.
// The header is on the first row so the sheet can be sorted, filtered or printed as a count list.
// details: { filter, zone, query } as the analyst sees them
export async function exportLastCounted({ rows, details, analysis: a, lang, t, fileName }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MiKardex";
  workbook.created = new Date();
  const tn = (key) => t(a.hasLocations ? key : `${key}P`);
  const hasWarehouse = rows.some((row) => row.warehouse);
  const hasZone = a.hasLocations && rows.some((row) => row.zone);

  addTable(
    workbook,
    t("xlsCcLastSheet"),
    [
      hasWarehouse && { header: t("xlsWarehouse"), width: 14, value: (o) => o.warehouse },
      { header: tn("ccColLocation"), width: 22, value: (o) => o.location },
      hasZone && { header: t("ccColZone"), width: 12, value: (o) => o.zone },
      { header: t("ccColLast"), width: 16, value: (o) => (o.last === null ? "" : new Date(o.last)), format: "yyyy-mm-dd" },
      { header: `${t("ccColSince")} (${shortDate(lang, a.asOf)})`, width: 30, value: (o) => (o.last === null ? "" : o.daysSince) },
      { header: t("ccColStatus"), width: 22, value: (o) => (o.last === null ? t("ccLastNever") : o.overdue ? t("ccOutside") : t("ccWithin")) },
    ].filter(Boolean),
    rows
  );

  const info = workbook.addWorksheet(t("xlsCcLastInfo"));
  info.columns = [{ width: 26 }, { width: 64 }];
  [
    [t("xlsCcSource"), fileName],
    [t("ccCycleTitle"), t(`ccCycleOpt_${a.cycle.days}`)],
    [t("ccFilterLabel"), details.filter],
    details.zone !== null && [t("ccColZone"), details.zone || "—"],
    details.query && [t("xlsCcSearch"), details.query],
    [t("xlsCcRows"), rows.length],
    [t("xlsCcGenerated"), new Date().toLocaleString(LOCALES[lang])],
  ]
    .filter(Boolean)
    .forEach(([label, value]) => {
      const row = info.addRow([label, value]);
      row.getCell(1).font = { bold: true };
      row.getCell(2).alignment = { horizontal: "left" };
    });
  info.addRow([]);
  info.addRow([t("xlsFooter")]).font = { italic: true, size: 10, color: { argb: MUTED } };

  await save(workbook, tn("xlsCcLastFile"));
}

export async function exportCountReport({ analysis: a, findings, lang, t, fileName }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MiKardex";
  workbook.created = new Date();
  const coverage = a.mode === "coverage";
  const tn = (key, vars) => t(a.hasLocations ? key : `${key}P`, vars); // by product when the file has no locations
  const MONEY = "#,##0";
  const PCT = "0.0%";

  // Summary: the conclusions, then the key figures
  const summary = workbook.addWorksheet(t("xlsCcSummary"));
  summary.columns = [{ width: 46 }, { width: 70 }];
  summary.addRow([t("xlsCcTitle")]).font = { bold: true, size: 16, color: { argb: INK } };
  const period = coverage
    ? t("ccAsOf", { date: shortDate(lang, a.aging.asOf) })
    : t("ccPeriod", { from: shortDate(lang, a.period.from), to: shortDate(lang, a.period.to) });
  summary.addRow([`${fileName} · ${period}`]).font = { italic: true, color: { argb: MUTED } };
  summary.addRow([new Date().toLocaleString(LOCALES[lang])]).font = { italic: true, color: { argb: MUTED } };
  summary.addRow([]);
  summary.addRow([t("ccConclusionsTitle")]).font = { bold: true, size: 12 };
  findings.forEach((text, i) => {
    const row = summary.addRow([`${i + 1}. ${text}`]);
    summary.mergeCells(row.number, 1, row.number, 2);
    row.alignment = { wrapText: true, vertical: "top" };
    row.height = Math.max(18, Math.ceil(text.length / 105) * 16);
  });
  summary.addRow([]);
  summary.addRow([t("xlsCcFigures")]).font = { bold: true, size: 12 };

  const figures = coverage
    ? [
        [tn("ccKpiTotalLocs"), a.totalLocations],
        [t("ccKpiOnTime"), `${a.aging.onTime} (${percent(lang, a.aging.compliance ?? 0)})`],
        [t("ccKpiOverdue"), a.aging.overdue],
        [t("ccKpiNever"), a.aging.never],
        [t("ccKpiPace"), t("ccPerWeek", { n: pace(lang, a.aging.perWeek) })],
        [t("ccKpiNeeded"), t("ccPerWeek", { n: pace(lang, a.aging.needed) })],
      ]
    : [
        a.lineAccuracy !== null && [t("ccKpiLineAcc"), percent(lang, a.lineAccuracy)],
        a.locationAccuracy !== null && [t("ccKpiLocAcc"), percent(lang, a.locationAccuracy)],
        a.mode === "detail" && [t("ccKpiLines"), a.lines],
        [t("ccKpiOff"), a.off],
        a.hasLocations && [a.mode === "detail" ? t("ccKpiLocations") : t("ccKpiAdjLocs"), a.locationsCounted],
        a.coverage !== null && [t("ccKpiCoverage"), percent(lang, a.coverage)],
        a.hasValue && [t("ccKpiAbs"), round2(a.absValue)],
        a.hasValue && [t("ccKpiNet"), round2(a.netValue)],
        [t("ccKpiAbsUnits"), round2(a.absUnits)],
        [t("ccKpiNetUnits"), round2(a.netUnits)],
      ].filter(Boolean);
  figures.forEach(([label, value]) => {
    const row = summary.addRow([label, value]);
    row.getCell(2).alignment = { horizontal: "left" };
    if (typeof value === "number") row.getCell(2).numFmt = "#,##0.##";
  });
  summary.addRow([]);
  summary.addRow([t("xlsFooter")]).font = { italic: true, size: 10, color: { argb: MUTED } };

  // How long since each location was counted: every one in the file, oldest first
  addTable(
    workbook,
    t("xlsCcAging"),
    [
      { header: t("xlsWarehouse"), width: 14, value: (o) => o.warehouse },
      { header: tn("ccColLocation"), width: 20, value: (o) => o.location },
      { header: t("ccColZone"), width: 12, value: (o) => o.zone },
      { header: t("ccColLast"), width: 16, value: (o) => new Date(o.last), format: "yyyy-mm-dd" },
      { header: `${t("ccColSince")} (${shortDate(lang, a.asOf)})`, width: 30, value: (o) => o.daysSince },
      { header: `${t("ccColStatus")} (${t(`ccCycleOpt_${a.cycle ? a.cycle.days : 90}`)})`, width: 34, value: (o) => (o.overdue ? t("ccOutside") : t("ccWithin")) },
    ],
    a.lastCounted
  );
  // Where to count: per area, what is outside the cycle. A list of locations has its own sheet for this below.
  if (!coverage && a.cycle) {
    addTable(
      workbook,
      t("xlsCcWhere"),
      [
        { header: t("ccColZone"), width: 14, value: (z) => z.zone },
        { header: t("ccColLocations"), width: 14, value: (z) => z.locations },
        { header: t("ccColOutside"), width: 16, value: (z) => z.overdue },
        { header: t("ccColOnTime"), width: 12, value: (z) => share(z.compliance), format: PCT },
      ],
      a.cycle.zones.length > 1 ? a.cycle.zones : []
    );
  }

  if (coverage) {
    addTable(
      workbook,
      t("xlsCcNever"),
      [
        { header: t("xlsWarehouse"), width: 14, value: (o) => o.warehouse },
        { header: tn("ccColLocation"), width: 20, value: (o) => o.location },
        { header: t("ccColZone"), width: 12, value: (o) => o.zone },
      ],
      a.aging.neverList
    );
    addTable(
      workbook,
      t("xlsCcZones"),
      [
        { header: t("ccColZone"), width: 14, value: (z) => z.zone },
        { header: t("ccColLocations"), width: 14, value: (z) => z.locations },
        { header: t("ccColOutside"), width: 16, value: (z) => z.overdue },
        { header: t("ccColNever"), width: 12, value: (z) => z.never },
        { header: t("ccColOnTime"), width: 12, value: (z) => share(z.compliance), format: PCT },
      ],
      a.aging.zones
    );
  } else {
    addTable(
      workbook,
      t("xlsCcPeriods"),
      [
        { header: t("xlsCcMonth"), width: 20, value: (m) => monthName(lang, m.month) },
        { header: t("ccColLines"), width: 12, value: (m) => m.lines },
        ...(a.mode === "detail" ? [{ header: t("ccColAccuracy"), width: 12, value: (m) => share(m.accuracy), format: PCT }] : []),
        { header: `${t("ccSurplus")} (${t("ccInUnits")})`, width: 20, value: (m) => round2(m.surplusUnits) },
        { header: `${t("ccShortage")} (${t("ccInUnits")})`, width: 20, value: (m) => round2(m.shortageUnits) },
        ...(a.hasValue
          ? [
              { header: `${t("ccSurplus")} (${t("ccInValue")})`, width: 18, value: (m) => round2(m.surplus), format: MONEY },
              { header: `${t("ccShortage")} (${t("ccInValue")})`, width: 18, value: (m) => round2(m.shortage), format: MONEY },
            ]
          : []),
      ],
      a.months
    );
    addTable(
      workbook,
      t("xlsCcReasons"),
      [
        { header: t("xlsCcReason"), width: 30, value: (r) => r.reason || t("ccNoReasonLabel") },
        { header: t("ccColOff"), width: 16, value: (r) => r.lines },
        ...(a.hasValue
          ? [
              { header: t("ccColAbs"), width: 20, value: (r) => round2(r.absValue), format: MONEY },
              { header: t("ccColNet"), width: 16, value: (r) => round2(r.netValue), format: MONEY },
            ]
          : [{ header: t("ccColAbsUnits"), width: 20, value: (r) => round2(r.absUnits) }]),
        { header: t("xlsCcShare"), width: 14, value: (r) => share(r.share), format: PCT },
      ],
      a.reasons
    );
    addTable(
      workbook,
      t("xlsCcZones"),
      [
        { header: t("ccColZone"), width: 14, value: (z) => z.zone },
        { header: t("ccColLines"), width: 12, value: (z) => z.lines },
        { header: t("ccColOff"), width: 16, value: (z) => z.off },
        ...(a.mode === "detail" ? [{ header: t("ccColAccuracy"), width: 12, value: (z) => share(z.accuracy), format: PCT }] : []),
        a.hasValue
          ? { header: t("ccColAbs"), width: 20, value: (z) => round2(z.absValue), format: MONEY }
          : { header: t("ccColAbsUnits"), width: 20, value: (z) => round2(z.absUnits) },
      ],
      a.zones
    );
    addTable(
      workbook,
      t("xlsCcProducts"),
      [
        { header: t("ccColSku"), width: 16, value: (s) => s.sku },
        { header: t("ccColProduct"), width: 38, value: (s) => s.name },
        { header: t("ccColOff"), width: 16, value: (s) => s.lines },
        { header: t("ccColNetUnits"), width: 16, value: (s) => round2(s.netUnits) },
        { header: t("ccColAbsUnits"), width: 18, value: (s) => round2(s.absUnits) },
        ...(a.hasValue
          ? [
              { header: t("ccColNet"), width: 16, value: (s) => round2(s.netValue), format: MONEY },
              { header: t("ccColAbs"), width: 20, value: (s) => round2(s.absValue), format: MONEY },
            ]
          : []),
      ],
      a.topSkus
    );
    addTable(
      workbook,
      t("xlsCcRepeat"),
      [
        { header: t("xlsWarehouse"), width: 14, value: (r) => r.warehouse },
        { header: t("ccColLocation"), width: 20, value: (r) => r.location },
        { header: t("ccColTimes"), width: 22, value: (r) => r.times },
        a.hasValue
          ? { header: t("ccColAbs"), width: 20, value: (r) => round2(r.absValue), format: MONEY }
          : { header: t("ccColAbsUnits"), width: 20, value: (r) => round2(r.absUnits) },
      ],
      a.repeatLocations
    );
    addTable(
      workbook,
      t("xlsCcLots"),
      [
        { header: t("ccColDate"), width: 14, value: (g) => new Date(g.date), format: "yyyy-mm-dd" },
        { header: t("ccColLocation"), width: 18, value: (g) => g.location },
        { header: t("ccColSku"), width: 16, value: (g) => g.sku },
        { header: t("ccColProduct"), width: 38, value: (g) => g.name },
        { header: t("ccColUp"), width: 10, value: (g) => round2(g.plusUnits) },
        { header: t("ccColDown"), width: 10, value: (g) => round2(g.minusUnits) },
        { header: t("ccColNetUnits"), width: 16, value: (g) => round2(g.netUnits) },
        ...(a.hasValue ? [{ header: t("ccColNet"), width: 16, value: (g) => round2(g.netValue), format: MONEY }] : []),
      ],
      a.lotSwaps
    );
    addTable(
      workbook,
      t("xlsCcPeople"),
      [
        { header: t("ccColPerson"), width: 26, value: (c) => c.counter },
        { header: t("ccColDays"), width: 10, value: (c) => c.days },
        { header: t("ccColLocations"), width: 14, value: (c) => c.locations },
        { header: t("ccColLines"), width: 12, value: (c) => c.lines },
        { header: t("ccColOff"), width: 16, value: (c) => c.off },
      ],
      a.counters
    );
  }

  await save(workbook, t("xlsCcFile"));
}
