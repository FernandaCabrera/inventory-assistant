// The two Excel files of the executive report, built in the browser:
//   1. the action plan: what to order and in which order, what to move between warehouses,
//      and what to stop buying or clear out
//   2. the analyzed inventory: every product with its status, cover, value and ABC class
// Numbers are written as numbers (not text), so both files can be sorted, filtered and added up.

import ExcelJS from "exceljs/dist/exceljs.min.js";
import { COLORS } from "./theme";
import { EXCESS_RATIO } from "./config";
import { statusFor, daysOfCover, tiedUpValue, toNumber, STATUS_ORDER } from "./inventoryLogic";
import { argb, documentInfo, saveFile, STATUS_COLOR, PRIORITY_COLOR, ORDER_COLOR } from "./reportFiles";

const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const INK = argb(COLORS.ink);
const MUTED = argb(COLORS.inkMuted);
const HAIR = argb(COLORS.line);
const TINT = argb(COLORS.surfaceAlt);
const WHITE = "FFFFFFFF";
const INT = "#,##0";
const ONE = "#,##0.0";
const PCT = "0.0%";
const cap = (word) => word.charAt(0).toUpperCase() + word.slice(1);
const colName = (index) => {
  let name = "";
  for (let i = index; i > 0; i = Math.floor((i - 1) / 26)) name = String.fromCharCode(65 + ((i - 1) % 26)) + name;
  return name;
};

function workbook() {
  const book = new ExcelJS.Workbook();
  book.creator = "MiKardex";
  book.created = new Date();
  return book;
}

// A colored cell with white text: a status or a priority
function badge(cell, color) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(color) } };
  cell.font = { bold: true, color: { argb: WHITE } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

const bold = (cell) => {
  cell.font = { bold: true };
};
const centered = (cell) => {
  cell.alignment = { horizontal: "center" };
};
const colored = (cell, color) => {
  cell.font = { color: { argb: argb(color) } };
};

function darkHeader(row, count) {
  for (let i = 1; i <= count; i += 1) {
    const cell = row.getCell(i);
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
    cell.alignment = { vertical: "middle", wrapText: true };
  }
  row.height = 30;
}

// A table that starts on the first row, so it can be sorted and filtered as it is.
// columns: [{ header, width, value: (row) => cell, format, paint: (cell, row) => void, total: true }]
// Returns the sheet, or null when there are no rows.
function tableSheet(book, name, columns, rows, { notes = [], totalLabel = "" } = {}) {
  if (rows.length === 0) return null;
  const cols = columns.filter(Boolean);
  const sheet = book.addWorksheet(name.slice(0, 31));
  darkHeader(sheet.addRow(cols.map((c) => c.header)), cols.length);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  cols.forEach((c, i) => {
    sheet.getColumn(i + 1).width = c.width || 16;
  });
  rows.forEach((row) => {
    const added = sheet.addRow(cols.map((c) => c.value(row)));
    cols.forEach((c, i) => {
      const cell = added.getCell(i + 1);
      cell.border = { bottom: { style: "hair", color: { argb: HAIR } } };
      if (c.format) cell.numFmt = c.format;
      if (c.wrap) cell.alignment = { wrapText: true, vertical: "top" };
      if (c.paint) c.paint(cell, row);
    });
  });
  const last = rows.length + 1;
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: last, column: cols.length } };

  // totals under the table, as formulas: they follow the numbers if someone edits them
  if (cols.some((c) => c.total)) {
    sheet.addRow([]);
    const totals = sheet.addRow([]);
    totals.getCell(1).value = totalLabel;
    cols.forEach((c, i) => {
      if (!c.total) return;
      const letter = colName(i + 1);
      const cell = totals.getCell(i + 1);
      cell.value = { formula: `SUM(${letter}2:${letter}${last})`, result: rows.reduce((sum, row) => sum + (Number(c.value(row)) || 0), 0) };
      if (c.format) cell.numFmt = c.format;
    });
    totals.font = { bold: true };
    totals.eachCell((cell) => {
      cell.border = { top: { style: "thin", color: { argb: INK } } };
    });
  }
  if (notes.length > 0) {
    sheet.addRow([]);
    notes.forEach((note) => {
      sheet.addRow([note]).font = { italic: true, size: 10, color: { argb: MUTED } };
    });
  }
  return sheet;
}

// The first rows of a summary sheet: what the file is and which inventory it describes
function titleRows(sheet, title, info) {
  sheet.addRow([title.toUpperCase()]).font = { bold: true, size: 16, color: { argb: INK } };
  sheet.addRow([`${info.source} · ${info.date} · ${info.scope}`]).font = { italic: true, color: { argb: MUTED } };
  sheet.addRow([]);
}

const sectionRow = (sheet, title) => {
  const row = sheet.addRow([title]);
  row.font = { bold: true, size: 12, color: { argb: INK } };
  return row;
};

// A sentence across the whole sheet, tall enough to show all of it
function textRow(sheet, value, columns, charsPerLine, font) {
  const row = sheet.addRow([value]);
  sheet.mergeCells(row.number, 1, row.number, columns);
  row.getCell(1).alignment = { wrapText: true, vertical: "top" };
  row.height = Math.max(16, Math.ceil(value.length / charsPerLine) * 15);
  if (font) row.font = font;
  return row;
}

function keyFigures(sheet, tiles, hintColumns) {
  const formats = { int: INT, money: '"$"#,##0', pct: "0%", dec1: ONE };
  tiles.forEach((tile) => {
    const row = sheet.addRow([tile.label, tile.raw, tile.hint]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).numFmt = formats[tile.kind];
    row.getCell(2).alignment = { horizontal: "right" };
    row.getCell(2).font = { bold: true };
    row.getCell(3).font = { color: { argb: MUTED } };
    if (hintColumns > 1) sheet.mergeCells(row.number, 3, row.number, 2 + hintColumns);
    row.eachCell((cell) => {
      cell.border = { bottom: { style: "hair", color: { argb: HAIR } } };
    });
  });
}

// Whole numbers show without decimals; a file with cents or fractions of a unit keeps two
const moneyFormat = (items) => (items.some((item) => (toNumber(item.unit_cost) ?? 0) % 1 !== 0) ? '"$"#,##0.00' : '"$"#,##0');
const unitFormat = (items) => (items.some((item) => (toNumber(item.stock) ?? 0) % 1 !== 0) ? "#,##0.00" : INT);
const round2 = (value) => Math.round(value * 100) / 100;

// ---------- 1. Action plan ----------
export async function buildActionPlan({ items, report, text, lang, t, sourceName, now = new Date() }) {
  const book = workbook();
  const info = documentInfo({ t, lang, sourceName, report, now });
  const { orders, transfers, notMoving, kpis } = report;
  const MONEY = '"$"#,##0';
  const UNIT_COST = moneyFormat(items);
  const UNITS = unitFormat(items);

  // Summary: the conclusions first, then what to do, then the figures
  const summary = book.addWorksheet(t("rpXlsSummary"));
  summary.columns = [{ width: 28 }, { width: 18 }, { width: 44 }, { width: 80 }];
  titleRows(summary, t("rpPlanTitle"), info);
  sectionRow(summary, t("rpSecSummary"));
  text.findings.forEach((finding, i) => textRow(summary, `${i + 1}. ${finding}`, 4, 150));
  summary.addRow([]);

  sectionRow(summary, t("rpSecRecommendations"));
  darkHeader(summary.addRow([t("xlsPriority"), t("rpColWhen"), t("rpColWhat"), t("rpColDetail")]), 4);
  text.actions.forEach((action) => {
    const row = summary.addRow([t(`priority_${cap(action.priority)}`), t(`rpWhen_${action.when}`), action.title, action.detail]);
    badge(row.getCell(1), PRIORITY_COLOR[action.priority]);
    row.getCell(2).alignment = { vertical: "top" };
    row.getCell(3).font = { bold: true };
    row.getCell(3).alignment = { wrapText: true, vertical: "top" };
    row.getCell(4).alignment = { wrapText: true, vertical: "top" };
    row.height = Math.max(18, Math.ceil(Math.max(action.detail.length / 76, action.title.length / 40)) * 15);
    row.eachCell((cell) => {
      cell.border = { bottom: { style: "hair", color: { argb: HAIR } } };
    });
  });
  summary.addRow([]);

  sectionRow(summary, t("rpSecKpis"));
  keyFigures(summary, text.tiles, 2);
  summary.addRow([]);
  summary.addRow([t("ordersDisclaimer")]).font = { italic: true, size: 10, color: { argb: MUTED } };
  summary.addRow([t("xlsFooter")]).font = { italic: true, size: 10, color: { argb: MUTED } };

  // What to order: the urgent ones first
  const hasOnOrder = orders.rows.some((row) => row.onOrder > 0);
  const note = (row) =>
    [
      toNumber(row.item.stock) <= 0 && t("rpNoteOut"),
      row.lateRisk && t("ordersLate"),
      row.transferable > 0 && t("rpNoteTransfer", { n: row.transferable }),
    ]
      .filter(Boolean)
      .join(". ");
  tableSheet(
    book,
    t("rpXlsOrders"),
    [
      { header: t("xlsPriority"), width: 12, value: (row) => t(`rpOrd_${row.priority}`), paint: (cell, row) => badge(cell, ORDER_COLOR[row.priority]) },
      { header: "SKU", width: 14, value: (row) => row.item.sku },
      { header: t("colProduct"), width: 38, value: (row) => row.item.name },
      { header: t("xlsWarehouse"), width: 22, value: (row) => row.item.warehouse },
      { header: t("colStock"), width: 10, value: (row) => row.item.stock, format: UNITS },
      { header: t("colCover"), width: 12, value: (row) => (row.cover === null ? null : round2(row.cover)), format: ONE },
      { header: t("colLead"), width: 13, value: (row) => row.lead ?? null, format: INT },
      hasOnOrder && { header: t("colOnOrder"), width: 11, value: (row) => row.onOrder || null, format: UNITS },
      { header: t("colQty"), width: 11, value: (row) => row.qty, format: INT, total: true, paint: bold },
      orders.hasCost && { header: t("xlsCost"), width: 14, value: (row) => row.item.unit_cost ?? null, format: UNIT_COST },
      orders.hasCost && { header: t("colCost"), width: 17, value: (row) => (row.cost === null ? null : round2(row.cost)), format: MONEY, total: true },
      transfers.rows.length > 0 && { header: t("rpColOtherWh"), width: 16, value: (row) => row.transferable || null, format: INT, total: true },
      { header: t("xlsNote"), width: 56, value: note, paint: (cell, row) => colored(cell, row.priority === "urgent" ? COLORS.critical : COLORS.ink) },
    ],
    orders.rows,
    {
      totalLabel: t("ordersTotal"),
      notes: [t("ordersRule", { days: orders.coverDays }), orders.usesMinimum && t("ordersRuleMinimum"), t("rpMPriority"), t("ordersDisclaimer")].filter(Boolean),
    }
  );

  // Stock that another warehouse can send before anything is bought
  tableSheet(
    book,
    t("rpXlsTransfers"),
    [
      { header: "SKU", width: 14, value: (row) => row.item.sku },
      { header: t("colProduct"), width: 38, value: (row) => row.item.name },
      { header: t("rpColFrom"), width: 22, value: (row) => row.from },
      { header: t("rpColTo"), width: 22, value: (row) => row.to },
      { header: t("rpColUnits"), width: 12, value: (row) => row.qty, format: INT, total: true, paint: bold },
      transfers.hasValue && { header: t("xlsValue"), width: 16, value: (row) => (row.value === null ? null : round2(row.value)), format: MONEY, total: true },
      { header: t("rpColCoverTo"), width: 18, value: (row) => (row.cover === null ? null : round2(row.cover)), format: ONE },
    ],
    transfers.rows,
    { totalLabel: t("ordersTotal"), notes: [t("rpMTransfers", { days: orders.coverDays })] }
  );

  // What is not moving: the largest amount first
  tableSheet(
    book,
    t("rpXlsNotMoving"),
    [
      { header: t("xlsStatus"), width: 13, value: (row) => t(`status_${row.status}`), paint: (cell, row) => badge(cell, STATUS_COLOR[row.status]) },
      { header: "SKU", width: 14, value: (row) => row.item.sku },
      { header: t("colProduct"), width: 38, value: (row) => row.item.name },
      { header: t("xlsWarehouse"), width: 22, value: (row) => row.item.warehouse },
      { header: t("colStock"), width: 10, value: (row) => row.stock, format: UNITS },
      { header: t("colCover"), width: 12, value: (row) => (row.cover === null ? null : round2(row.cover)), format: ONE },
      { header: t("rpColOver"), width: 16, value: (row) => round2(row.over), format: UNITS, total: true },
      kpis.hasCost && { header: t("kpiTiedUp"), width: 17, value: (row) => (row.hasCost ? round2(row.value) : null), format: MONEY, total: true, paint: bold },
      { header: t("xlsAction"), width: 58, value: (row) => t(row.status === "idle" ? "rpNmIdle" : "rpNmExcess") },
    ],
    notMoving,
    { totalLabel: t("ordersTotal"), notes: [kpis.hasCost && t("tiedUpNote", { ratio: EXCESS_RATIO })].filter(Boolean) }
  );

  const data = await book.xlsx.writeBuffer();
  return { data, fileName: `${t("rpFilePlan")}-${info.stamp}.xlsx` };
}

// ---------- 2. Analyzed inventory ----------
export async function buildAnalyzedInventory({ items, report, text, lang, t, sourceName, now = new Date() }) {
  const book = workbook();
  const info = documentInfo({ t, lang, sourceName, report, now });
  const { orders, abc, warehouses, kpis } = report;
  const MONEY = '"$"#,##0';
  const UNIT_COST = moneyFormat(items);
  const UNITS = unitFormat(items);
  const orderOf = new Map(orders.rows.map((row) => [row.item, row]));
  const hasOnOrder = items.some((item) => (toNumber(item.on_order) ?? 0) > 0);
  const analyzed = items.map((item, i) => ({ item, status: statusFor(item), cover: daysOfCover(item), order: orderOf.get(item) || null, abc: abc.classes[i], share: abc.shares[i] }));

  // Every product, in the order of the file
  tableSheet(
    book,
    t("xlsSnapshot"),
    [
      { header: "SKU", width: 14, value: (row) => row.item.sku },
      { header: t("colProduct"), width: 38, value: (row) => row.item.name },
      { header: t("xlsWarehouse"), width: 22, value: (row) => row.item.warehouse },
      { header: t("xlsStatus"), width: 13, value: (row) => t(`status_${row.status}`), paint: (cell, row) => badge(cell, STATUS_COLOR[row.status]) },
      abc.basis !== null && { header: t("rpColAbc"), width: 10, value: (row) => row.abc, paint: centered },
      { header: t("colStock"), width: 10, value: (row) => row.item.stock, format: UNITS },
      { header: t("xlsUsage"), width: 12, value: (row) => row.item.avg_daily_usage ?? null, format: "#,##0.00" },
      { header: t("xlsCover"), width: 12, value: (row) => (row.cover === null ? null : round2(row.cover)), format: ONE },
      { header: t("xlsReorder"), width: 12, value: (row) => row.item.reorder_point ?? null, format: UNITS },
      { header: t("xlsLead"), width: 13, value: (row) => row.item.lead_time_days ?? null, format: INT },
      hasOnOrder && { header: t("colOnOrder"), width: 11, value: (row) => row.item.on_order ?? null, format: UNITS },
      kpis.hasCost && { header: t("xlsCost"), width: 14, value: (row) => row.item.unit_cost ?? null, format: UNIT_COST },
      kpis.hasCost && { header: t("xlsValue"), width: 16, value: (row) => (toNumber(row.item.unit_cost) > 0 ? round2(Math.max(0, row.item.stock) * row.item.unit_cost) : null), format: MONEY, total: true },
      abc.basis !== null && { header: t("rpColUseShare"), width: 13, value: (row) => row.share, format: PCT },
      { header: t("colQty"), width: 11, value: (row) => (row.order ? row.order.qty : null), format: INT, total: true },
      { header: t("xlsPriority"), width: 12, value: (row) => (row.order ? t(`rpOrd_${row.order.priority}`) : null) },
      kpis.hasCost && { header: t("kpiTiedUp"), width: 16, value: (row) => round2(tiedUpValue(row.item)) || null, format: MONEY, total: true },
    ],
    analyzed,
    { totalLabel: t("ordersTotal") }
  );

  // ABC, class by class
  if (abc.basis !== null) {
    const sheet = tableSheet(
      book,
      t("rpXlsAbc"),
      [
        { header: t("rpColClass"), width: 10, value: (row) => row.key, paint: bold },
        { header: t("kpiTotal"), width: 12, value: (row) => row.skus, format: INT, total: true },
        { header: t("rpColSkuShare"), width: 14, value: (row) => row.skuShare, format: PCT, total: true },
        { header: t("rpColUseShare"), width: 14, value: (row) => row.share, format: PCT, total: true },
        { header: t("rpColUnits"), width: 12, value: (row) => round2(row.units), format: UNITS, total: true },
        kpis.hasCost && { header: t("xlsValue"), width: 16, value: (row) => round2(row.stockValue), format: MONEY, total: true },
        { header: t("rpColBelow"), width: 14, value: (row) => row.belowReorder, format: INT, total: true },
        { header: t("rpColStockouts"), width: 12, value: (row) => row.stockouts, format: INT, total: true },
      ],
      abc.rows,
      { totalLabel: t("ordersTotal"), notes: [text.abcMethod, t("rpAbcRead"), text.abcClassC].filter(Boolean) }
    );
    sheet.autoFilter = null; // three rows: nothing to filter
  }

  // Warehouse by warehouse
  tableSheet(
    book,
    t("rpXlsWarehouses"),
    [
      { header: t("xlsWarehouse"), width: 26, value: (row) => row.name, paint: bold },
      { header: t("kpiTotal"), width: 11, value: (row) => row.skus, format: INT, total: true },
      { header: t("rpColUnits"), width: 12, value: (row) => round2(row.units), format: UNITS, total: true },
      kpis.hasCost && { header: t("xlsValue"), width: 16, value: (row) => round2(row.value), format: MONEY, total: true },
      { header: t("rpColShare"), width: 13, value: (row) => row.share, format: PCT, total: true },
      ...STATUS_ORDER.map((status) => ({ header: t(`statusName_${status}`), width: 10, value: (row) => row[status], format: INT, total: true })),
      kpis.hasCost && { header: t("kpiTiedUp"), width: 16, value: (row) => round2(row.tiedUp), format: MONEY, total: true },
      { header: t("rpColToOrder"), width: 11, value: (row) => row.orderLines, format: INT, total: true },
      orders.hasCost && { header: t("colCost"), width: 17, value: (row) => round2(row.orderCost), format: MONEY, total: true },
    ],
    warehouses,
    { totalLabel: t("ordersTotal") }
  );

  // The key figures and how everything was worked out
  const figures = book.addWorksheet(t("rpXlsKpis"));
  figures.columns = [{ width: 30 }, { width: 18 }, { width: 110 }];
  titleRows(figures, t("rpInvTitle"), info);
  sectionRow(figures, t("rpSecKpis"));
  keyFigures(figures, text.tiles, 1);
  figures.addRow([]);
  sectionRow(figures, t("rpSecMethod"));
  text.method.forEach((line) => textRow(figures, line, 3, 150));
  if (text.dataNotes.length > 0) {
    figures.addRow([]);
    sectionRow(figures, t("rpSecData"));
    text.dataNotes.forEach((line) => textRow(figures, line, 3, 150));
  }
  figures.addRow([]);
  figures.addRow([t("ordersDisclaimer")]).font = { italic: true, size: 10, color: { argb: MUTED } };
  figures.addRow([t("xlsFooter")]).font = { italic: true, size: 10, color: { argb: MUTED } };

  // the product list opens first; the tinted tab marks the sheet that explains the rest
  figures.properties.tabColor = { argb: TINT };

  const data = await book.xlsx.writeBuffer();
  return { data, fileName: `${t("rpFileInventory")}-${info.stamp}.xlsx` };
}

export async function downloadActionPlan(args) {
  const { data, fileName } = await buildActionPlan(args);
  saveFile(data, fileName, MIME);
}

export async function downloadAnalyzedInventory(args) {
  const { data, fileName } = await buildAnalyzedInventory(args);
  saveFile(data, fileName, MIME);
}
