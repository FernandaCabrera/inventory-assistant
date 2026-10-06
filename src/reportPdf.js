// The executive report as a PDF, ready to send: conclusions and recommendations first, then the
// detail that supports them, then how everything was worked out. Letter size, built in the browser.
//
// The libraries are loaded only when the button is pressed.

import { COLORS } from "./theme";
import { formatNumber, formatMoney } from "./i18n";
import { STATUS_ORDER } from "./inventoryLogic";
import { pct } from "./reportText";
import { rgb, documentInfo, saveFile, STATUS_COLOR, TONE_COLOR, PRIORITY_COLOR, ORDER_COLOR } from "./reportFiles";

const INK = rgb(COLORS.ink);
const MUTED = rgb(COLORS.inkMuted);
const LINE = rgb(COLORS.line);
const TINT = rgb(COLORS.surfaceAlt);
const WHITE = [255, 255, 255];
const ABC_COLOR = { A: INK, B: MUTED, C: [201, 206, 198] };

// Letter page, in millimetres
const PAGE_W = 215.9;
const PAGE_H = 279.4;
const LEFT = 16;
const TOP = 20;
const BOTTOM = 18;
const WIDE = PAGE_W - LEFT * 2;
const TABLE_ROWS = 10; // rows of each detail table; the Excel files have them all
const cap = (word) => word.charAt(0).toUpperCase() + word.slice(1);

// The built-in fonts of a PDF only know Western European letters. Anything else is written
// with its closest plain character, so a stray symbol never garbles a whole line.
const PLAIN = {
  "\u2212": "-", // minus sign
  "\u2013": "-", // en dash
  "\u2014": "-", // em dash
  "\u2018": "'",
  "\u2019": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u2026": "...",
  "\u2022": "\u00B7", // bullet -> middle dot
  "\u20AC": "EUR",
  "\u00A0": " ", // spaces that do not break
  "\u202F": " ",
  // letters that have no accent to take off
  "\u0141": "L",
  "\u0142": "l",
  "\u0110": "D",
  "\u0111": "d",
  "\u0131": "i",
  "\u0152": "OE",
  "\u0153": "oe",
};
export function pdfSafe(value) {
  return Array.from(String(value ?? ""))
    .map((char) => {
      if (char.length === 1 && char.charCodeAt(0) <= 0xff) return char;
      if (PLAIN[char] !== undefined) return PLAIN[char];
      const base = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (base.length === 1 && base.charCodeAt(0) <= 0xff) return base;
      // a letter of another alphabet leaves a mark; a symbol or an emoji is dropped
      return /[\p{L}\p{N}]/u.test(char) ? "?" : "";
    })
    .join("")
    .replace(/ {2,}/g, " ")
    .replace(/ +$/gm, "");
}

export async function buildExecutivePdf({ report, text, lang, t, sourceName, now = new Date() }) {
  const [{ jsPDF }, tablePlugin] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = tablePlugin.default || tablePlugin.autoTable;
  const doc = new jsPDF({ unit: "mm", format: "letter", compress: true });
  const info = documentInfo({ t, lang, sourceName, report, now });
  const { summary, kpis, orders, abc, warehouses, notMoving, transfers } = report;
  const n = (value, decimals = 0) => formatNumber(lang, value, decimals);
  const money = (value) => formatMoney(lang, value);
  const p = (share) => pct(lang, share);
  doc.setProperties({ title: pdfSafe(t("rpDocTitle")), author: "MiKardex", creator: "MiKardex" });

  let y = TOP;
  const font = (style, size, color = INK) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const lineHeight = (size) => size * 0.3528 * 1.38;
  // a little narrower than asked: the measure of accented letters runs slightly short
  const wrap = (value, width) => doc.splitTextToSize(pdfSafe(value), width - 1.5);
  // moves to a new page when what comes next does not fit
  const need = (height) => {
    if (y + height > PAGE_H - BOTTOM) {
      doc.addPage();
      y = TOP;
    }
  };
  const write = (value, x, width, { style = "normal", size = 9.5, color = INK, gap = 1.2 } = {}) => {
    font(style, size, color);
    const rows = wrap(value, width);
    rows.forEach((row) => {
      need(lineHeight(size));
      doc.text(row, x, y + size * 0.3528 * 0.82);
      y += lineHeight(size);
    });
    y += gap;
  };
  const bullets = (list, { size = 9.5, color = INK, gap = 1.6 } = {}) => {
    list.forEach((value) => {
      need(lineHeight(size) * Math.min(2, wrap(value, WIDE - 5).length));
      doc.setFillColor(...INK);
      doc.rect(LEFT + 0.6, y + size * 0.3528 * 0.36, 1.3, 1.3, "F");
      write(value, LEFT + 5, WIDE - 5, { size, color, gap });
    });
  };
  // a section title; room is how much must fit under it on the same page
  const section = (title, room = 30) => {
    need(12 + room);
    if (y > TOP) y += 5;
    font("bold", 11.5);
    doc.setCharSpace(0.25);
    doc.text(pdfSafe(title.toUpperCase()), LEFT, y + 3.6);
    doc.setCharSpace(0);
    y += 5.6;
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.35);
    doc.line(LEFT, y, LEFT + WIDE, y);
    y += 4;
  };
  const table = (options) => {
    autoTable(doc, {
      startY: y,
      theme: "plain",
      margin: { left: LEFT, right: LEFT, top: TOP, bottom: BOTTOM },
      styles: { font: "helvetica", fontSize: 8, textColor: INK, cellPadding: { top: 1.7, bottom: 1.7, left: 1.6, right: 1.6 }, valign: "top", overflow: "linebreak", lineColor: LINE, lineWidth: 0 },
      headStyles: { fillColor: INK, textColor: WHITE, fontStyle: "bold", fontSize: 7.3, valign: "middle" },
      bodyStyles: { lineWidth: { bottom: 0.15 }, lineColor: LINE },
      footStyles: { fontStyle: "bold", lineWidth: { top: 0.35 }, lineColor: INK, textColor: INK },
      rowPageBreak: "avoid",
      ...options,
      willDrawCell: (data) => {
        // a status or a priority: a small colored label behind its text
        const color = data.cell.raw && data.cell.raw.pill;
        if (!color) return;
        doc.setFillColor(...rgb(color));
        doc.roundedRect(data.cell.x + 0.9, data.cell.y + 0.95, data.cell.width - 1.8, 4.5, 0.9, 0.9, "F");
      },
      head: options.head.map((row) => row.map(pdfSafe)),
      body: options.body.map((row) => row.map((cell) => (typeof cell === "object" && cell !== null ? { ...cell, content: pdfSafe(cell.content) } : pdfSafe(cell)))),
      foot: options.foot ? options.foot.map((row) => row.map(pdfSafe)) : undefined,
    });
    y = doc.lastAutoTable.finalY + 3;
  };
  // a status or a priority, in white on its color
  const badge = (content, color) => ({ content, pill: color, styles: { textColor: WHITE, fontStyle: "bold", halign: "center", fontSize: 7.3 } });
  const right = { halign: "right" };
  const product = (item) => `${item.name}\n${item.sku}`;

  // ---------- title ----------
  font("bold", 8.5, MUTED);
  doc.setCharSpace(1.1);
  doc.text("MIKARDEX", LEFT, y);
  doc.setCharSpace(0);
  y += 9;
  font("bold", 21);
  doc.text(pdfSafe(t("rpDocTitle").toUpperCase()), LEFT, y);
  y += 4;
  // the strip of bars of the site, with one bar in red
  let barX = LEFT;
  for (let i = 0; i < 58; i += 1) {
    const width = (i * 7 + 3) % 5 < 2 ? 0.9 : 0.45;
    doc.setFillColor(...(i === 39 ? rgb(COLORS.critical) : [120, 126, 118]));
    doc.rect(barX, y, width, 3.4, "F");
    barX += width + 0.65;
  }
  y += 8.5;
  write(`${info.source}  \u00B7  ${info.date}  \u00B7  ${info.scope}`, LEFT, WIDE, { size: 9.5, color: MUTED, gap: 2 });

  // ---------- executive summary ----------
  section(t("rpSecSummary"));
  bullets(text.findings);

  // ---------- key figures ----------
  section(t("rpSecKpis"), 50);
  {
    const gap = 3.5;
    const tileW = (WIDE - gap * 3) / 4;
    const tileH = 22;
    const rows = Math.ceil(text.tiles.length / 4);
    need(rows * (tileH + gap));
    text.tiles.forEach((tile, i) => {
      const x = LEFT + (i % 4) * (tileW + gap);
      const top = y + Math.floor(i / 4) * (tileH + gap);
      doc.setFillColor(...TINT);
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.2);
      doc.roundedRect(x, top, tileW, tileH, 1.2, 1.2, "FD");
      font("bold", 6.6, MUTED);
      doc.setCharSpace(0.15);
      doc.text(wrap(tile.label.toUpperCase(), tileW - 6).slice(0, 2), x + 3, top + 5);
      doc.setCharSpace(0);
      // the figure shrinks until it fits its tile
      let size = 15;
      font("bold", size, tile.tone ? rgb(TONE_COLOR[tile.tone]) : INK);
      while (size > 8 && doc.getTextWidth(pdfSafe(tile.value)) > tileW - 6) {
        size -= 0.5;
        doc.setFontSize(size);
      }
      doc.text(pdfSafe(tile.value), x + 3, top + 14.6);
      font("normal", 6.8, MUTED);
      if (tile.hint) doc.text(wrap(tile.hint, tileW - 6).slice(0, 1), x + 3, top + 19);
    });
    y += rows * (tileH + gap);
  }

  // ---------- recommendations ----------
  section(t("rpSecRecommendations"), 46);
  table({
    head: [[t("xlsPriority"), t("rpColWhen"), t("rpColWhat"), t("rpColDetail")]],
    body: text.actions.map((action) => [
      badge(t(`priority_${cap(action.priority)}`), PRIORITY_COLOR[action.priority]),
      t(`rpWhen_${action.when}`),
      { content: action.title, styles: { fontStyle: "bold" } },
      action.detail,
    ]),
    columnStyles: { 0: { cellWidth: 19 }, 1: { cellWidth: 22 }, 2: { cellWidth: 48 } },
  });

  // ---------- stock status: the chart and how to read it ----------
  section(t("rpSecStatus"), 48);
  {
    const top = y;
    const rowH = 7.2;
    const labelW = 24;
    const barMax = 46;
    const most = Math.max(1, ...STATUS_ORDER.map((status) => summary.counts[status]));
    STATUS_ORDER.forEach((status, i) => {
      const count = summary.counts[status];
      const rowY = top + i * rowH;
      font("normal", 8.5);
      doc.text(pdfSafe(t(`statusName_${status}`)), LEFT, rowY + 4.4);
      doc.setFillColor(...rgb(STATUS_COLOR[status]));
      const width = (count / most) * barMax;
      if (width > 0) doc.rect(LEFT + labelW, rowY + 1, Math.max(0.6, width), rowH - 2.4, "F");
      font("bold", 8.5);
      doc.text(n(count), LEFT + labelW + width + 2, rowY + 4.4);
    });
    const chartBottom = top + STATUS_ORDER.length * rowH;
    // the reading, to the right of the chart
    const x = LEFT + 86;
    const reading = text.reading.status;
    reading.points.forEach((point) => {
      doc.setFillColor(...INK);
      doc.rect(x + 0.6, y + 1.2, 1.3, 1.3, "F");
      write(point, x + 5, WIDE - 91, { size: 9, gap: 1.4 });
    });
    write(`${t("rpWhatToDo")}: ${reading.action}`, x, WIDE - 86, { style: "bold", size: 9, gap: 0 });
    y = Math.max(y, chartBottom) + 2;
  }

  // ---------- ABC ----------
  if (abc.basis !== null) {
    section(t("rpSecAbc"), 55);
    // two bars: how the products split, and how consumption splits
    const labelW = 30;
    const barW = WIDE - labelW;
    [
      [t("rpColSkuShare"), (row) => row.skuShare],
      [t("rpColUseShare"), (row) => row.share],
    ].forEach(([label, share]) => {
      font("normal", 8.5);
      doc.text(pdfSafe(label), LEFT, y + 4.6);
      let x = LEFT + labelW;
      abc.rows.forEach((row) => {
        const width = share(row) * barW;
        if (width <= 0) return;
        doc.setFillColor(...ABC_COLOR[row.key]);
        doc.rect(x, y, width, 7, "F");
        if (width > 13) {
          font("bold", 8, row.key === "C" ? INK : WHITE);
          doc.text(pdfSafe(`${row.key}  ${p(share(row))}`), x + 2, y + 4.7);
        }
        x += width;
      });
      y += 8.6;
    });
    y += 2;
    table({
      head: [[t("rpColClass"), t("kpiTotal"), t("rpColSkuShare"), t("rpColUseShare"), kpis.hasCost && t("xlsValue"), t("rpColBelow"), t("rpColStockouts")].filter(Boolean)],
      body: abc.rows.map((row) =>
        [{ content: row.key, styles: { fontStyle: "bold" } }, n(row.skus), p(row.skuShare), p(row.share), kpis.hasCost && money(row.stockValue), n(row.belowReorder), n(row.stockouts)].filter((cell) => cell !== false)
      ),
      columnStyles: Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [i, right])),
      headStyles: { fillColor: INK, textColor: WHITE, fontStyle: "bold", fontSize: 7.3, halign: "right" },
      didParseCell: (data) => {
        if (data.section === "head" && data.column.index === 0) data.cell.styles.halign = "left";
      },
    });
    bullets([t("rpAbcRead"), text.abcClassC].filter(Boolean), { size: 8.5, gap: 1 });
  }

  // ---------- warehouse by warehouse ----------
  if (warehouses.length > 1) {
    section(t("rpSecWarehouses"), 46);
    const numeric = (row) => [n(row.skus), n(row.units), kpis.hasCost && money(row.value), p(row.share), n(row.critical), n(row.low), n(row.idle), n(row.excess), kpis.hasCost && money(row.tiedUp), n(row.orderLines)].filter((cell) => cell !== false);
    const head = [t("xlsWarehouse"), t("kpiTotal"), t("rpColUnits"), kpis.hasCost && t("xlsValue"), t("rpColShare"), t("statusName_critical"), t("statusName_low"), t("statusName_idle"), t("statusName_excess"), kpis.hasCost && t("kpiTiedUp"), t("rpColToOrder")].filter(Boolean);
    const sum = (key) => warehouses.reduce((total, row) => total + row[key], 0);
    table({
      head: [head],
      body: warehouses.map((row) => [{ content: row.name, styles: { fontStyle: "bold" } }, ...numeric(row)]),
      foot: [[t("ordersTotal"), ...numeric({ skus: kpis.skus, units: kpis.units, value: kpis.inventoryValue, share: 1, critical: summary.counts.critical, low: summary.counts.low, idle: summary.counts.idle, excess: summary.counts.excess, tiedUp: kpis.tiedUp, orderLines: sum("orderLines") })]],
      columnStyles: Object.fromEntries(head.map((label, i) => [i, i === 0 ? { cellWidth: 40 } : right])),
      didParseCell: (data) => {
        if (data.section !== "body" && data.column.index > 0) data.cell.styles.halign = "right";
      },
    });
    if (text.reading.warehouse) write(`${t("rpWhatToDo")}: ${text.reading.warehouse.action}`, LEFT, WIDE, { style: "bold", size: 8.5 });
  }

  // ---------- urgent replenishment ----------
  section(t("rpSecUrgent"), 46);
  if (orders.rows.length === 0) {
    write(t("ordersEmpty"), LEFT, WIDE);
  } else {
    const shown = orders.rows.slice(0, TABLE_ROWS);
    const head = [t("xlsPriority"), t("colProduct"), t("xlsWarehouse"), t("colStock"), t("colCover"), t("colLead"), t("colQty"), orders.hasCost && t("colCost")].filter(Boolean);
    table({
      head: [head],
      body: shown.map((row) =>
        [
          badge(t(`rpOrd_${row.priority}`), ORDER_COLOR[row.priority]),
          product(row.item),
          row.item.warehouse,
          n(row.item.stock, 2),
          row.cover === null ? "" : n(row.cover, 1),
          row.lead === null ? "" : n(row.lead),
          { content: n(row.qty), styles: { fontStyle: "bold" } },
          orders.hasCost && (row.cost === null ? "" : money(row.cost)),
        ].filter((cell) => cell !== false)
      ),
      columnStyles: { 0: { cellWidth: 17 }, 2: { cellWidth: 31 }, 3: { cellWidth: 13, ...right }, 4: { cellWidth: 17, ...right }, 5: { cellWidth: 18, ...right }, 6: { cellWidth: 13, ...right }, 7: { cellWidth: 24, ...right } },
      didParseCell: (data) => {
        if (data.section === "head" && data.column.index >= 3) data.cell.styles.halign = "right";
      },
    });
    if (orders.rows.length > shown.length) write(t("rpShown", { n: n(shown.length), total: n(orders.rows.length) }), LEFT, WIDE, { size: 8, color: MUTED });
    if (text.reading.cover) write(`${t("rpWhatToDo")}: ${text.reading.cover.action}`, LEFT, WIDE, { style: "bold", size: 8.5 });
  }

  // ---------- transfers ----------
  if (transfers.rows.length > 0) {
    section(t("rpSecTransfers"), 46);
    const shown = transfers.rows.slice(0, TABLE_ROWS);
    table({
      head: [[t("colProduct"), t("rpColFrom"), t("rpColTo"), t("rpColUnits"), transfers.hasValue && t("xlsValue")].filter(Boolean)],
      body: shown.map((row) => [product(row.item), row.from, row.to, { content: n(row.qty), styles: { fontStyle: "bold" } }, transfers.hasValue && (row.value === null ? "" : money(row.value))].filter((cell) => cell !== false)),
      columnStyles: { 1: { cellWidth: 40 }, 2: { cellWidth: 40 }, 3: { cellWidth: 20, ...right }, 4: { cellWidth: 28, ...right } },
      didParseCell: (data) => {
        if (data.section === "head" && data.column.index >= 3) data.cell.styles.halign = "right";
      },
    });
    if (transfers.rows.length > shown.length) write(t("rpShown", { n: n(shown.length), total: n(transfers.rows.length) }), LEFT, WIDE, { size: 8, color: MUTED });
  }

  // ---------- excess and no sales ----------
  section(t("rpSecNotMoving"), 46);
  if (notMoving.length === 0) {
    write(t("rpNoneNotMoving"), LEFT, WIDE);
  } else {
    const shown = notMoving.slice(0, TABLE_ROWS);
    table({
      head: [[t("xlsStatus"), t("colProduct"), t("xlsWarehouse"), t("colStock"), t("rpColOver"), kpis.hasCost && t("kpiTiedUp"), t("xlsAction")].filter(Boolean)],
      body: shown.map((row) =>
        [
          badge(t(`status_${row.status}`), STATUS_COLOR[row.status]),
          product(row.item),
          row.item.warehouse,
          n(row.stock, 2),
          n(row.over, 2),
          kpis.hasCost && { content: row.hasCost ? money(row.value) : "", styles: { fontStyle: "bold" } },
          t(row.status === "idle" ? "rpNmIdle" : "rpNmExcess"),
        ].filter((cell) => cell !== false)
      ),
      columnStyles: kpis.hasCost
        ? { 0: { cellWidth: 19 }, 2: { cellWidth: 28 }, 3: { cellWidth: 13, ...right }, 4: { cellWidth: 20, ...right }, 5: { cellWidth: 24, ...right }, 6: { cellWidth: 38 } }
        : { 0: { cellWidth: 19 }, 2: { cellWidth: 34 }, 3: { cellWidth: 16, ...right }, 4: { cellWidth: 22, ...right }, 5: { cellWidth: 44 } },
      didParseCell: (data) => {
        if (data.section === "head" && data.column.index >= 3 && data.column.index <= (kpis.hasCost ? 5 : 4)) data.cell.styles.halign = "right";
      },
    });
    if (notMoving.length > shown.length) write(t("rpShown", { n: n(shown.length), total: n(notMoving.length) }), LEFT, WIDE, { size: 8, color: MUTED });
    if (text.reading.tiedUp) write(`${t("rpWhatToDo")}: ${text.reading.tiedUp.action}`, LEFT, WIDE, { style: "bold", size: 8.5 });
  }

  // ---------- what the file left out, and how everything was worked out ----------
  if (text.dataNotes.length > 0) {
    section(t("rpSecData"), 12);
    bullets(text.dataNotes, { size: 8.5, gap: 1.1 });
  }
  section(t("rpSecMethod"));
  bullets(text.method, { size: 8.2, color: MUTED, gap: 1.1 });
  y += 2;
  write(t("ordersDisclaimer"), LEFT, WIDE, { style: "italic", size: 8.2, color: MUTED });

  // ---------- every page: what the document is, and its number ----------
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    font("normal", 7.5, MUTED);
    if (page > 1) {
      doc.text(pdfSafe(`${t("rpDocTitle")}  \u00B7  ${sourceName}`).slice(0, 110), LEFT, 11);
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.2);
      doc.line(LEFT, 13.5, LEFT + WIDE, 13.5);
    }
    doc.text(pdfSafe(t("xlsFooter")), LEFT, PAGE_H - 9);
    doc.text(pdfSafe(t("rpDocPage", { n: page, total: pages })), LEFT + WIDE, PAGE_H - 9, { align: "right" });
  }

  return { data: doc.output("arraybuffer"), fileName: `${t("rpFilePdf")}-${info.stamp}.pdf` };
}

export async function downloadExecutivePdf(args) {
  const { data, fileName } = await buildExecutivePdf(args);
  saveFile(data, fileName, "application/pdf");
}
