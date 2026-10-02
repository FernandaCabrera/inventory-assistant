// Reads an .xlsx or .csv file in the browser and returns its sheets as grids of cells.
// The file never leaves the browser at this step.

import ExcelJS from "exceljs/dist/exceljs.min.js"; // only used to write the template
import { parseCsv } from "./importLogic";
import { readXlsxSheets } from "./xlsxReader";

function decodeText(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch (err) {
    // CSV saved from Excel on Windows (ñ and accents) is usually Windows-1252
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

// Returns { sheets: [{ name, grid }] } or throws an Error whose message is an i18n key.
export async function readFileSheets(file) {
  const name = (file.name || "").toLowerCase();
  const buffer = await file.arrayBuffer();

  if (name.endsWith(".xls")) throw new Error("errOldXls");
  if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".tsv")) {
    return { sheets: [{ name: file.name, grid: parseCsv(decodeText(buffer)) }] };
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
    try {
      return { sheets: await readXlsxSheets(buffer) };
    } catch (err) {
      throw new Error("errUnreadable");
    }
  }
  throw new Error("errFileType");
}

export async function downloadTemplate(lang) {
  const workbook = new ExcelJS.Workbook();
  const es = lang === "es";
  const sheet = workbook.addWorksheet(es ? "Inventario" : "Inventory");
  sheet.columns = es
    ? [
        { header: "Código", width: 14 },
        { header: "Producto", width: 34 },
        { header: "Bodega", width: 16 },
        { header: "Stock", width: 10 },
        { header: "Ventas últimos 30 días", width: 24 },
        { header: "Costo unitario", width: 16 },
        { header: "Días de reposición", width: 20 },
      ]
    : [
        { header: "SKU", width: 14 },
        { header: "Product", width: 34 },
        { header: "Warehouse", width: 16 },
        { header: "Stock", width: 10 },
        { header: "Units sold last 30 days", width: 24 },
        { header: "Unit cost", width: 16 },
        { header: "Lead time (days)", width: 20 },
      ];
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF15181A" } };

  const examples = es
    ? [
        ["A-001", "Café molido 500 g", "Principal", 12, 90, 4200, 7],
        ["A-002", "Té verde 20 bolsitas", "Principal", 140, 30, 1800, 10],
        ["A-003", "Azúcar rubia 1 kg", "Sucursal 2", 60, 0, 950, 5],
      ]
    : [
        ["A-001", "Ground coffee 500 g", "Main", 12, 90, 7.5, 7],
        ["A-002", "Green tea 20 bags", "Main", 140, 30, 3.2, 10],
        ["A-003", "Raw sugar 1 kg", "Store 2", 60, 0, 1.9, 5],
      ];
  examples.forEach((row) => sheet.addRow(row));

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = es ? "plantilla-mikardex.xlsx" : "mikardex-template.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}
