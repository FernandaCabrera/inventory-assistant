// The dashboard as a PowerPoint file: one slide per chart, each with what it shows and what to
// do about it. The charts are PowerPoint's own (their data can be opened and changed), and all
// the text is ordinary text, so the file can be edited before it is presented.
//
// The library is loaded only when the button is pressed.

import { COLORS } from "./theme";
import { EXCESS_RATIO } from "./config";
import { STATUS_ORDER } from "./inventoryLogic";
import { hex, documentInfo, saveFile, STATUS_COLOR, TONE_COLOR, PRIORITY_COLOR, WAREHOUSE_COLORS } from "./reportFiles";

const MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const FONT = "Arial";
const INK = hex(COLORS.ink);
const MUTED = hex(COLORS.inkMuted);
const LINE = hex(COLORS.line);
const TINT = hex(COLORS.surfaceAlt);
const WHITE = "FFFFFF";

// Widescreen slide, in inches
const W = 13.33;
const LEFT = 0.6;
const WIDE = W - LEFT * 2;
const MAX_ACTIONS = 4;
const cap = (word) => word.charAt(0).toUpperCase() + word.slice(1);

// A big number has to fit its tile: the longer the figure, the smaller the type
const valueSize = (value) => (value.length <= 8 ? 32 : value.length <= 11 ? 27 : value.length <= 14 ? 22 : 18);

export async function buildDashboardPptx({ report, text, lang, t, sourceName, now = new Date() }) {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pres = new PptxGenJS();
  const info = documentInfo({ t, lang, sourceName, report, now });
  pres.layout = "LAYOUT_WIDE";
  pres.title = t("rpPptTitle");
  pres.author = "MiKardex";
  pres.company = "MiKardex";
  pres.theme = { headFontFace: FONT, bodyFontFace: FONT };

  pres.defineSlideMaster({ title: "COVER", background: { color: INK } });
  pres.defineSlideMaster({
    title: "CONTENT",
    background: { color: WHITE },
    objects: [
      { text: { text: t("xlsFooter"), options: { x: LEFT, y: 6.95, w: 7, h: 0.3, margin: 0, fontFace: FONT, fontSize: 10, color: MUTED } } },
      {
        placeholder: {
          options: { name: "title", type: "title", x: LEFT, y: 0.42, w: WIDE, h: 1.0, margin: 0, fontFace: FONT, fontSize: 26, bold: true, color: INK, align: "left", valign: "top" },
          text: "",
        },
      },
    ],
    slideNumber: { x: W - LEFT - 0.8, y: 6.95, w: 0.8, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTED, align: "right" },
  });

  const box = (slide, value, options) => slide.addText(value, { isTextBox: true, margin: 0, fontFace: FONT, color: INK, valign: "top", ...options });
  const content = (title) => {
    const slide = pres.addSlide({ masterName: "CONTENT" });
    slide.addText(title, { placeholder: "title" });
    return slide;
  };

  // ---- 1. cover ----
  {
    const slide = pres.addSlide({ masterName: "COVER" });
    box(slide, "MIKARDEX", { x: LEFT, y: 2.0, w: WIDE, h: 0.35, fontSize: 13, bold: true, color: "D9DED4", charSpacing: 4 });
    box(slide, t("rpPptTitle"), { x: LEFT, y: 2.45, w: WIDE, h: 1.0, fontSize: 44, bold: true, color: WHITE });
    // the strip of bars of the site, with one bar in red
    let x = LEFT;
    for (let i = 0; i < 46; i += 1) {
      const wide = (i * 7 + 3) % 5 < 2;
      const width = wide ? 0.05 : 0.025;
      slide.addShape(pres.ShapeType.rect, { x, y: 3.62, w: width, h: 0.22, fill: { color: i === 31 ? hex(COLORS.critical) : "8A9088" }, line: { type: "none" } });
      x += width + 0.035;
    }
    box(slide, sourceName, { x: LEFT, y: 4.2, w: WIDE, h: 0.45, fontSize: 20, color: WHITE });
    box(slide, `${info.date}  ·  ${info.scope}`, { x: LEFT, y: 4.75, w: WIDE, h: 0.35, fontSize: 14, color: "D9DED4" });
    box(slide, t("xlsFooter"), { x: LEFT, y: 6.95, w: WIDE, h: 0.3, fontSize: 10, color: "8A9088" });
  }

  // ---- 2. key figures ----
  {
    const slide = content(t("rpPptKpis"));
    const gap = 0.3;
    const tileW = (WIDE - gap * 3) / 4;
    const tileH = 2.2;
    text.tiles.slice(0, 8).forEach((tile, i) => {
      const x = LEFT + (i % 4) * (tileW + gap);
      const y = 1.7 + Math.floor(i / 4) * (tileH + gap);
      slide.addShape(pres.ShapeType.roundRect, { x, y, w: tileW, h: tileH, rectRadius: 0.08, fill: { color: TINT }, line: { color: LINE, width: 0.75 } });
      box(slide, tile.label.toUpperCase(), { x: x + 0.25, y: y + 0.25, w: tileW - 0.5, h: 0.35, fontSize: 11, bold: true, color: MUTED, charSpacing: 1 });
      box(slide, tile.value, { x: x + 0.25, y: y + 0.72, w: tileW - 0.5, h: 0.8, fontSize: valueSize(tile.value), bold: true, color: hex(TONE_COLOR[tile.tone] || COLORS.ink), valign: "middle" });
      if (tile.hint) box(slide, tile.hint, { x: x + 0.25, y: y + 1.6, w: tileW - 0.5, h: 0.4, fontSize: 11, color: MUTED });
    });
  }

  // ---- 3 to 6. one slide per chart ----
  const chartBase = {
    x: LEFT,
    y: 1.6,
    w: 7.4,
    h: 5.05,
    showLegend: false,
    showTitle: true,
    titleFontFace: FONT,
    titleFontSize: 13,
    titleColor: INK,
    catAxisLabelFontFace: FONT,
    catAxisLabelFontSize: 11,
    catAxisLabelColor: INK,
    valAxisLabelFontFace: FONT,
    valAxisLabelFontSize: 10,
    valAxisLabelColor: MUTED,
    valGridLine: { color: LINE, size: 0.5 },
    catGridLine: { style: "none" },
    showValue: true,
    dataLabelFontFace: FONT,
    dataLabelFontSize: 11,
    dataLabelColor: INK,
    dataLabelPosition: "outEnd",
  };
  // To the right of the chart: what it shows, then what to do
  const explain = (slide, reading, note) => {
    const x = 8.4;
    const w = W - LEFT - x;
    // The card sits right under the points. How tall the points are is an estimate (about 40
    // characters fit on a line), on the generous side so the two never touch.
    const lines = reading.points.reduce((sum, point) => sum + Math.ceil(point.length / 40), 0);
    const pointsH = Math.min(3.2, lines * 0.24 + reading.points.length * 0.13 + 0.1);
    const cardY = 1.6 + pointsH + 0.25;
    box(
      slide,
      reading.points.map((point, i) => ({ text: point, options: { bullet: true, breakLine: i < reading.points.length - 1, paraSpaceAfter: 9 } })),
      { x, y: 1.6, w, h: pointsH, fontSize: 14, fit: "shrink" }
    );
    slide.addShape(pres.ShapeType.roundRect, { x, y: cardY, w, h: 1.6, rectRadius: 0.08, fill: { color: TINT }, line: { color: LINE, width: 0.75 } });
    box(slide, t("rpWhatToDo").toUpperCase(), { x: x + 0.25, y: cardY + 0.2, w: w - 0.5, h: 0.3, fontSize: 11, bold: true, color: MUTED, charSpacing: 1 });
    box(slide, reading.action, { x: x + 0.25, y: cardY + 0.55, w: w - 0.5, h: 0.9, fontSize: 14, bold: true, fit: "shrink" });
    if (note) slide.addNotes(note);
  };

  {
    const slide = content(text.reading.status.title);
    slide.addChart(
      pres.ChartType.bar,
      [{ name: t("tooltipSkus"), labels: STATUS_ORDER.map((status) => t(`statusName_${status}`)), values: STATUS_ORDER.map((status) => report.summary.counts[status]) }],
      { ...chartBase, barDir: "col", title: t("chartStatus"), chartColors: STATUS_ORDER.map((status) => hex(STATUS_COLOR[status])), valAxisLabelFormatCode: "#,##0", dataLabelFormatCode: "#,##0", barGapWidthPct: 60 }
    );
    explain(slide, text.reading.status, t("rpMStatus", { ratio: EXCESS_RATIO }));
  }

  if (text.reading.warehouse) {
    const slide = content(text.reading.warehouse.title);
    const rows = text.charts.warehouses;
    slide.addChart(pres.ChartType.doughnut, [{ name: t("tooltipUnits"), labels: rows.map((row) => row.name), values: rows.map((row) => row.units) }], {
      ...chartBase,
      title: t("chartWarehouse"),
      holeSize: 55,
      chartColors: rows.map((row, i) => hex(WAREHOUSE_COLORS[i % WAREHOUSE_COLORS.length])),
      dataBorder: { pt: 1.5, color: WHITE },
      showLegend: true,
      legendPos: "b",
      legendFontFace: FONT,
      legendFontSize: 11,
      legendColor: INK,
      showValue: false,
      showPercent: true,
      dataLabelColor: WHITE,
      dataLabelPosition: "bestFit",
      dataLabelFormatCode: "0%",
    });
    explain(slide, text.reading.warehouse);
  }

  if (text.reading.cover) {
    const slide = content(text.reading.cover.title);
    // a bar chart lists its bars from the bottom up: the most urgent goes last so it ends at the top
    const rows = [...text.charts.cover].reverse();
    const title =
      text.charts.coverTotal > rows.length ? t("chartCoverTop", { n: rows.length, total: text.charts.coverTotal }) : t("chartCoverAll");
    slide.addChart(pres.ChartType.bar, [{ name: t("tooltipDays"), labels: rows.map((row) => text.charts.label(row.item)), values: rows.map((row) => row.days) }], {
      ...chartBase,
      barDir: "bar",
      title,
      chartColors: rows.map((row) => hex(STATUS_COLOR[row.status])),
      valAxisLabelFormatCode: "#,##0",
      dataLabelFormatCode: "#,##0.0",
      barGapWidthPct: 45,
    });
    explain(slide, text.reading.cover, t("ordersRule", { days: report.orders.coverDays }));
  }

  if (text.reading.tiedUp) {
    const slide = content(text.reading.tiedUp.title);
    const rows = [...text.charts.tiedUp].reverse();
    slide.addChart(pres.ChartType.bar, [{ name: t("tooltipValue"), labels: rows.map((row) => text.charts.label(row.item)), values: rows.map((row) => row.value) }], {
      ...chartBase,
      barDir: "bar",
      title: t("chartTiedUp", { n: rows.length }),
      chartColors: rows.map((row) => hex(STATUS_COLOR[row.status])),
      valAxisLabelFormatCode: '"$"#,##0',
      dataLabelFormatCode: '"$"#,##0',
      barGapWidthPct: 45,
    });
    explain(slide, text.reading.tiedUp, t("tiedUpNote", { ratio: EXCESS_RATIO }));
  }

  // ---- last. what to do now ----
  {
    const slide = content(t("rpPptNext"));
    text.actions.slice(0, MAX_ACTIONS).forEach((action, i) => {
      const y = 1.7 + i * 1.28;
      slide.addShape(pres.ShapeType.ellipse, { x: LEFT, y: y + 0.02, w: 0.56, h: 0.56, fill: { color: INK }, line: { type: "none" } });
      box(slide, String(i + 1), { x: LEFT, y: y + 0.02, w: 0.56, h: 0.56, fontSize: 16, bold: true, color: WHITE, align: "center", valign: "middle" });
      box(slide, action.title, { x: 1.45, y, w: 8.8, h: 0.4, fontSize: 18, bold: true });
      box(slide, action.detail, { x: 1.45, y: y + 0.45, w: 8.8, h: 0.72, fontSize: 14, color: MUTED, fit: "shrink" });
      box(slide, t(`rpWhen_${action.when}`), { x: 10.6, y, w: W - LEFT - 10.6, h: 0.4, fontSize: 16, bold: true, align: "right" });
      box(slide, `${t("xlsPriority")}: ${t(`priority_${cap(action.priority)}`).toLowerCase()}`, {
        x: 10.6,
        y: y + 0.45,
        w: W - LEFT - 10.6,
        h: 0.35,
        fontSize: 12,
        bold: true,
        color: hex(PRIORITY_COLOR[action.priority]),
        align: "right",
      });
    });
    slide.addNotes(t("ordersDisclaimer"));
  }

  const data = await pres.write({ outputType: "arraybuffer" });
  return { data, fileName: `${t("rpFilePptx")}-${info.stamp}.pptx` };
}

export async function downloadDashboardPptx(args) {
  const { data, fileName } = await buildDashboardPptx(args);
  saveFile(data, fileName, MIME);
}
