// The four downloads are really built here, the way the browser builds them, and opened again
// to check what is inside. Set REPORT_OUT to a folder to keep the files and look at them:
//   REPORT_OUT=/tmp/reports npm test -- reportFiles

import fs from "fs";
import path from "path";
import { TextEncoder, TextDecoder } from "util";
import JSZip from "jszip";
import ExcelJS from "exceljs/dist/exceljs.min.js";
import { buildReport } from "./reportLogic";
import { reportText } from "./reportText";
import { translator } from "./i18n";
import { sampleInventory } from "./data/sample";
import { buildDashboardPptx } from "./dashboardPptx";
import { buildActionPlan, buildAnalyzedInventory } from "./reportExcel";
import { buildExecutivePdf, pdfSafe } from "./reportPdf";

global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;
jest.setTimeout(60000);

const NOW = new Date(2026, 9, 6, 12);
const keep = (name, data) => {
  if (!process.env.REPORT_OUT) return;
  fs.mkdirSync(process.env.REPORT_OUT, { recursive: true });
  fs.writeFileSync(path.join(process.env.REPORT_OUT, name), Buffer.from(data));
};

function prepare(items, lang, sourceName, importInfo) {
  const t = translator(lang);
  const report = buildReport(items, { coverDays: 30, importInfo });
  const text = reportText(report, { t, lang, items });
  return { items, report, text, lang, t, sourceName, now: NOW };
}

// Two branches of a shop. The same products are in both; one has too much of what the other lacks.
const BRANCHES = [
  { sku: "T-1", name: "Polera blanca M — edición “Andes”", warehouse: "Centro", stock: 0, avg_daily_usage: 2, reorder_point: 20, lead_time_days: 7, unit_cost: 5000 },
  { sku: "T-1", name: "Polera blanca M — edición “Andes”", warehouse: "Norte", stock: 300, avg_daily_usage: 1, reorder_point: 10, lead_time_days: 7, unit_cost: 5000 },
  { sku: "T-2", name: "Bufanda tejida 🧣", warehouse: "Centro", stock: 40, avg_daily_usage: 0, reorder_point: 0, lead_time_days: 7, unit_cost: 12000 },
  { sku: "T-3", name: "Jeans azul 44", warehouse: "Norte", stock: 15, avg_daily_usage: 1, reorder_point: 18, lead_time_days: 20, unit_cost: 19990, on_order: 2 },
  { sku: "T-4", name: "Calcetines pack 3", warehouse: "Centro", stock: 60, avg_daily_usage: 3, reorder_point: 40, lead_time_days: 5, unit_cost: 2990 },
];

const sheetRows = (sheet) => {
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row) => rows.push(row.values.slice(1)));
  return rows;
};

describe("the dashboard in PowerPoint", () => {
  test("one slide per chart of the dashboard, with charts that can be edited", async () => {
    const { data, fileName } = await buildDashboardPptx(prepare(sampleInventory("es"), "es", "Datos de ejemplo"));
    keep(fileName, data);
    expect(fileName).toBe("dashboard-inventario-2026-10-06.pptx");
    const zip = await JSZip.loadAsync(data);
    const files = Object.keys(zip.files);
    // cover, key figures, four charts, what to do
    expect(files.filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))).toHaveLength(7);
    // the charts are PowerPoint's own, each with the workbook that holds its data
    expect(files.filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f))).toHaveLength(4);
    expect(files.filter((f) => /^ppt\/embeddings\/.+\.xlsx$/.test(f))).toHaveLength(4);

    const slide = async (n) => (await zip.file(`ppt/slides/slide${n}.xml`).async("string")).replace(/<[^>]+>/g, " ");
    expect(await slide(1)).toMatch(/Dashboard de inventario[\s\S]*Datos de ejemplo[\s\S]*Productos: 46 · Bodegas: 5/);
    expect(await slide(2)).toMatch(/El inventario en cifras[\s\S]*VALOR DEL INVENTARIO[\s\S]*\$332\.205\.900/);
    expect(await slide(3)).toMatch(/18 de 46 productos necesitan reposición[\s\S]*QUÉ HACER[\s\S]*Comprar primero los críticos/);
    expect(await slide(4)).toMatch(/Planta Quilicura concentra 34% de las unidades/);
    expect(await slide(5)).toMatch(/La cobertura más baja va de 0,7 a 4,6 días de stock/);
    expect(await slide(6)).toMatch(/Capital detenido: \$47\.760\.800, 14% del valor del inventario/);
    expect(await slide(7)).toMatch(/Qué hacer ahora[\s\S]*Emitir las órdenes de compra de la lista[\s\S]*Hoy/);

    // the status chart has the five statuses, each bar in its own color
    const chart = await zip.file("ppt/charts/chart1.xml").async("string");
    ["Crítico", "Bajo", "OK", "Sin ventas", "Exceso"].forEach((label) => expect(chart).toContain(`<c:v>${label}</c:v>`));
    expect(chart.match(/<c:dPt>/g)).toHaveLength(5);
  });

  test("a file without sales or costs gets only the slides it has data for", async () => {
    const minimumOnly = [
      { sku: "A", name: "Tornillo", warehouse: "Principal", stock: 5, avg_daily_usage: null, reorder_point: 20, lead_time_days: 7 },
      { sku: "B", name: "Tuerca", warehouse: "Principal", stock: 50, avg_daily_usage: null, reorder_point: 20, lead_time_days: 7 },
    ];
    const { data } = await buildDashboardPptx(prepare(minimumOnly, "en", "hardware.xlsx"));
    const zip = await JSZip.loadAsync(data);
    // cover, key figures, status, warehouse, what to do: no days of cover and no capital
    expect(Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))).toHaveLength(5);
    expect(Object.keys(zip.files).filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f))).toHaveLength(2);
  });
});

describe("the action plan in Excel", () => {
  test("what to order with its priority, what to move, and what is not moving", async () => {
    const { data, fileName } = await buildActionPlan(prepare(BRANCHES, "es", "sucursales.xlsx"));
    keep(fileName, data);
    expect(fileName).toBe("plan-de-accion-2026-10-06.xlsx");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(data);
    expect(book.worksheets.map((s) => s.name)).toEqual(["Resumen", "Qué pedir", "Traspasos", "Exceso y sin ventas"]);

    const summary = sheetRows(book.getWorksheet("Resumen")).map((row) => row[0]);
    expect(summary[0]).toBe("PLAN DE ACCIÓN DE INVENTARIO");
    expect(summary[1]).toBe("Fuente: sucursales.xlsx · Fecha: 6 de octubre de 2026 · Productos: 5 · Bodegas: 2");
    expect(summary).toContain("1. Bajo el punto de reorden: 2 de 5 productos (40%). En nivel crítico: 1.");
    expect(summary).toContain("Recomendaciones");

    const orders = sheetRows(book.getWorksheet("Qué pedir"));
    expect(orders[0]).toEqual(["Prioridad", "SKU", "Producto", "Bodega", "Stock", "Días de cobertura", "Días de reposición", "Ya pedido", "Pedir", "Costo unitario", "Costo del pedido", "Disponible en otra bodega", "Nota"]);
    // T-1 in Centro: out of stock, needs 20 + 60, and Norte can send all of it
    expect(orders[1]).toEqual(["Urgente", "T-1", "Polera blanca M — edición “Andes”", "Centro", 0, 0, 7, undefined, 80, 5000, 400000, 80, "Sin stock. Se agota antes de que llegue un pedido nuevo. Otra bodega puede enviar 80 unidades"]);
    // T-3: 15 on hand + 2 on order is under 18; 15 days of cover against 20 of lead time
    expect(orders[2].slice(0, 9)).toEqual(["Urgente", "T-3", "Jeans azul 44", "Norte", 15, 15, 20, 2, 31]);
    // the totals are formulas, so they follow the numbers if someone edits a quantity
    const totals = orders.find((row) => row[0] === "Total");
    expect(totals[8]).toEqual({ formula: "SUM(I2:I3)", result: 111 });
    expect(totals[10]).toEqual({ formula: "SUM(K2:K3)", result: 400000 + 31 * 19990 });

    const transfers = sheetRows(book.getWorksheet("Traspasos"));
    expect(transfers[1].slice(0, 6)).toEqual(["T-1", "Polera blanca M — edición “Andes”", "Norte", "Centro", 80, 400000]);

    const notMoving = sheetRows(book.getWorksheet("Exceso y sin ventas"));
    // Norte keeps 3 x 10 units of T-1: 270 above that. The scarf did not sell at all.
    expect(notMoving.slice(1, 3).map((row) => [row[0], row[1], row[6], row[7]])).toEqual([
      ["EXCESO", "T-1", 270, 1350000],
      ["SIN VENTAS", "T-2", 40, 480000],
    ]);
  });

  test("with nothing to order or to move, those sheets are left out", async () => {
    const calm = [{ sku: "A", name: "Tornillo", warehouse: "Principal", stock: 50, avg_daily_usage: 1, reorder_point: 20, lead_time_days: 7 }];
    const { data } = await buildActionPlan(prepare(calm, "en", "calm.csv"));
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(data);
    expect(book.worksheets.map((s) => s.name)).toEqual(["Summary"]);
  });
});

describe("the analyzed inventory in Excel", () => {
  test("every product with its status, cover, value and ABC class", async () => {
    const info = { demandFrom: "sales", periodDays: 30, reorderComputed: true, defaultLeadUsed: false, skippedNoStock: 2 };
    const { data, fileName } = await buildAnalyzedInventory(prepare(BRANCHES, "es", "sucursales.xlsx", info));
    keep(fileName, data);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(data);
    expect(book.worksheets.map((s) => s.name)).toEqual(["Inventario", "ABC", "Bodegas", "Indicadores"]);

    const rows = sheetRows(book.getWorksheet("Inventario"));
    expect(rows[0]).toEqual(["SKU", "Producto", "Bodega", "Estado", "Clase ABC", "Stock", "Consumo diario", "Días de cobertura", "Punto de reorden", "Días de reposición", "Ya pedido", "Costo unitario", "Valor del stock", "% del consumo", "Pedir", "Prioridad", "Capital detenido"]);
    expect(rows).toHaveLength(1 + 5 + 1); // header, products, totals
    // the products come in the order of the file
    expect(rows.slice(1, 6).map((row) => [row[0], row[2], row[3], row[4]])).toEqual([
      ["T-1", "Centro", "CRÍTICO", "A"],
      ["T-1", "Norte", "EXCESO", "B"],
      ["T-2", "Centro", "SIN VENTAS", "C"],
      ["T-3", "Norte", "BAJO", "A"],
      ["T-4", "Centro", "OK", "A"],
    ]);
    // a day of sales at cost: T-3 19.990, T-1 Centro 10.000, T-4 8.970 (89% together), T-1 Norte 5.000, T-2 nothing
    expect(rows[2].slice(5, 9)).toEqual([300, 1, 300, 10]); // stock, usage, days of cover, reorder point
    expect(rows[2][16]).toBe(1350000); // capital tied up
    expect(book.getWorksheet("Inventario").autoFilter).toBe("A1:Q6");

    const abc = sheetRows(book.getWorksheet("ABC"));
    expect(abc.slice(1, 4).map((row) => [row[0], row[1]])).toEqual([["A", 3], ["B", 1], ["C", 1]]);

    const warehouses = sheetRows(book.getWorksheet("Bodegas"));
    expect(warehouses.slice(1, 3).map((row) => [row[0], row[1], row[2]])).toEqual([["Norte", 2, 315], ["Centro", 3, 100]]);

    const figures = sheetRows(book.getWorksheet("Indicadores"));
    const label = figures.map((row) => row[0]);
    expect(figures.find((row) => row[0] === "Valor del inventario")[1]).toBe(300 * 5000 + 40 * 12000 + 15 * 19990 + 60 * 2990);
    expect(label).toContain("Consumo diario: unidades vendidas en el período del archivo, divididas por 30 días.");
    expect(label).toContain("Productos que quedaron fuera porque su celda de stock no tiene un número: 2.");
  });
});

describe("the executive report in PDF", () => {
  const pages = (data) => (Buffer.from(data).toString("latin1").match(/\/Type \/Page\b/g) || []).length;

  test("a letter-size file of a few pages, in both languages and for every kind of file", async () => {
    const sets = [
      ["es", sampleInventory("es"), "Datos de ejemplo"],
      ["en", sampleInventory("en"), "Sample data"],
      ["es", BRANCHES, "sucursales.xlsx"],
      ["en", BRANCHES.map(({ unit_cost, ...rest }) => rest), "no-cost.csv"],
      ["es", [], "vacio.xlsx"],
    ];
    for (const [lang, items, source] of sets) {
      const { data, fileName } = await buildExecutivePdf(prepare(items, lang, source));
      keep(`${source}-${fileName}`, data);
      const bytes = Buffer.from(data);
      expect(bytes.slice(0, 5).toString()).toBe("%PDF-");
      expect(bytes.toString("latin1")).toContain("/MediaBox [0 0 612. 792.]"); // letter
      expect(pages(data)).toBeGreaterThanOrEqual(2);
      expect(pages(data)).toBeLessThanOrEqual(5);
    }
    expect((await buildExecutivePdf(prepare(sampleInventory("es"), "es", "x"))).fileName).toBe("informe-ejecutivo-inventario-2026-10-06.pdf");
  });

  test("text the PDF fonts cannot write is replaced, never garbled", () => {
    expect(pdfSafe("Añejo 12 años · café")).toBe("Añejo 12 años · café"); // Spanish is written as it is
    expect(pdfSafe("Polera — edición “Andes”…")).toBe('Polera - edición "Andes"...');
    expect(pdfSafe("stock − unidades")).toBe("stock - unidades");
    expect(pdfSafe("Bufanda tejida 🧣")).toBe("Bufanda tejida");
    expect(pdfSafe("Łódź 茶")).toBe("Lódz ?"); // the closest letter, or a mark where there is none
    expect(pdfSafe("Čaj œuf")).toBe("Caj oeuf");
    expect(pdfSafe(null)).toBe("");
  });
});
