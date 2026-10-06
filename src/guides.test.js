// The guides teach how to do by hand what the tool does. Their examples carry numbers, and a
// number in a guide that the tool would not give is worse than no guide. These tests work the
// examples out with the tool's own code and with the template's own formulas, and check that
// the text says the same.

import fs from "fs";
import path from "path";
import { TextEncoder, TextDecoder } from "util";
import ExcelJS from "exceljs/dist/exceljs.min.js";
import { landingText } from "./landingText";
import { landingVars } from "./LandingPage";
import { translator, fill, formatNumber } from "./i18n";
import { orderSuggestion } from "./orderLogic";
import { daysOfCover } from "./inventoryLogic";
import { SAFETY_FACTOR, ORDER_COVER_DAYS } from "./config";

global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;
jest.setTimeout(60000);

// Everything a page says, with its {name} marks filled in, as one text
function pageText(id) {
  const page = landingText(id, "es");
  const vars = landingVars("es", translator("es"));
  const parts = [page.lead];
  const add = (item) => {
    if (typeof item === "string") parts.push(item);
    else if (Array.isArray(item)) item.forEach(add);
    else if (item.steps) item.steps.forEach(add);
    else if (item.table) [item.table.head, ...item.table.rows].forEach((row) => row.forEach(add));
    else if (item.formulas) item.formulas.forEach((f) => parts.push(f.formula));
  };
  page.sections.forEach((section) => section.body.forEach(add));
  page.faq.forEach((entry) => parts.push(entry.q, entry.a));
  return fill(parts.join("\n"), vars);
}

test("the reorder point guide gives the numbers the tool gives", () => {
  const text = pageText("reorder");
  expect(text).not.toMatch(/\{\w+\}/);

  // the example: 120 boxes sold in 30 days, the supplier takes 7 days, 35 boxes left
  const usage = 120 / 30;
  const lead = 7;
  // the tool's rule when the file has no reorder point (src/importLogic.js)
  const reorder = Math.ceil(usage * lead * SAFETY_FACTOR);
  const item = { stock: 35, avg_daily_usage: usage, reorder_point: reorder, lead_time_days: lead };
  const order = orderSuggestion(item, ORDER_COVER_DAYS);

  expect(text).toContain(`Punto de reorden: 28 + 14 = ${reorder} cajas.`);
  expect(usage * lead).toBe(28);
  expect(reorder - usage * lead).toBe(14); // the safety stock the text names
  expect(text).toContain(`el consumo diario da ${usage} y el punto de reorden, ${reorder}`);
  expect(text).toContain(`La cantidad sugerida es ${order.qty}`);
  expect(text).toContain(`más ${ORDER_COVER_DAYS} días de venta (${usage * ORDER_COVER_DAYS})`);
  expect(daysOfCover(item)).toBeGreaterThan(8);
  expect(daysOfCover(item)).toBeLessThan(9); // "alcanzan para menos de 9 días"
  // the other way to set the safety stock
  expect(6 * 10 - usage * lead).toBe(32);
  expect(text).toContain("el stock de seguridad es 6 × 10 − 4 × 7 = 32 cajas, y el punto de reorden sube a 60");

  // the formulas carry the tool's own factor and days, written the way Excel in Spanish reads them
  const factor = formatNumber("es", SAFETY_FACTOR, 2);
  expect(text).toContain(`=REDONDEAR.MAS(E2*D2*${factor};0)`);
  expect(text).toContain(`=SI(B2<F2;REDONDEAR.MAS(F2+E2*${ORDER_COVER_DAYS}-B2;0);0)`);
  expect(text).toContain(`=ROUNDUP(E2*D2*${SAFETY_FACTOR},0)`);
  expect(text).toContain('=SI(B2<F2;"Pedir";"OK")');
});

test("the kardex guide tells the example that is loaded in the template", async () => {
  const text = pageText("kardex");
  expect(text).not.toMatch(/\{\w+\}/);

  const file = path.join(__dirname, "..", "public", landingText("kardex", "es").download.href);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(fs.readFileSync(file)));
  expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Kardex", "Cómo usar"]);
  const sheet = workbook.getWorksheet("Kardex");
  // what a cell shows: for a formula, the result Excel saved with it ("" when it shows nothing)
  const value = (address) => {
    const cell = sheet.getCell(address).value;
    if (cell && typeof cell === "object" && "formula" in cell) return cell.result === undefined || cell.result === null ? "" : cell.result;
    return cell;
  };
  const money = (n) => `$${formatNumber("es", Math.round(n))}`;

  // opening stock, a purchase at another cost, a sale: the three rows of the example
  expect([value("D7"), value("E7"), value("D8"), value("E8"), value("G9")]).toEqual([100, 1000, 50, 1200, 80]);
  expect(value("J8")).toBe(150);
  expect(value("L8")).toBe(160000);
  expect(value("K8")).toBeCloseTo(1066.67, 2);
  expect(value("H9")).toBeCloseTo(1066.67, 2); // the sale leaves at the average cost before it
  expect(value("I9")).toBeCloseTo(85333.33, 2);
  expect(value("J9")).toBe(70);
  expect(value("L9")).toBeCloseTo(74666.67, 2);
  expect(value("L2")).toBe(70); // the balance shown at the top
  expect(value("L3")).toBeCloseTo(74666.67, 2);

  // and the guide tells those same figures
  expect(text).toContain(`Ahora tienes ${value("J8")} unidades que valen ${money(value("L8"))}`);
  expect(text).toContain("cada una vale en promedio $1.066,67");
  expect(text).toContain(`o sea ${money(value("I9"))}. Quedan ${value("J9")} unidades que valen ${money(value("L9"))}.`);
  expect(money(value("I9"))).toBe("$85.333");
  expect(money(value("L9"))).toBe("$74.667");

  // the rows after the example are ready to fill in: formulas in place, nothing showing, no errors
  for (const address of ["F10", "H10", "I10", "J10", "K10", "L10", "M10", "J306", "L306"]) {
    expect(sheet.getCell(address).value).toHaveProperty("formula");
    expect(value(address)).toBe("");
  }
  // no cell of the file shows an error
  sheet.eachRow((row) => row.eachCell((cell) => expect(JSON.stringify(value(cell.address)) || "").not.toMatch(/#(REF|DIV|VALUE|NAME|N\/A|NUM)/)));
  expect(text).toContain("con fórmulas para 300 movimientos");
});

test("the formulas the kardex guide gives for building one by hand give the same example", () => {
  // row 7 is the opening stock; rows 8 and 9 follow the formulas of the guide, one cell at a time
  const rows = { 7: { D: 100, E: 1000, G: 0, J: 100, K: 1000, L: 100000 }, 8: { D: 50, E: 1200, G: 0 }, 9: { D: 0, E: 0, G: 80 } };
  for (const r of [8, 9]) {
    const row = rows[r];
    const above = rows[r - 1];
    row.F = row.D * row.E; // =D8*E8
    row.H = above.K; // =K7
    row.I = row.G * row.H; // =G8*H8
    row.J = above.J + row.D - row.G; // =J7+D8-G8
    row.L = above.L + row.F - row.I; // =L7+F8-I8
    row.K = row.J === 0 ? 0 : row.L / row.J; // =SI(J8=0;0;L8/J8)
  }
  expect(rows[8]).toMatchObject({ J: 150, L: 160000 });
  expect(rows[8].K).toBeCloseTo(1066.67, 2);
  expect(rows[9].J).toBe(70);
  expect(rows[9].L).toBeCloseTo(74666.67, 2);
  const formulas = landingText("kardex", "es").sections.find((s) => s.h === "Las fórmulas").body.find((item) => item.formulas).formulas;
  expect(formulas.map((f) => `${f.cell} ${f.formula}`)).toEqual(["F8 =D8*E8", "H8 =K7", "I8 =G8*H8", "J8 =J7+D8-G8", "L8 =L7+F8-I8", "K8 =SI(J8=0;0;L8/J8)"]);
});
