// Writes the order list to an Excel file the business can send to its suppliers.

import ExcelJS from "exceljs/dist/exceljs.min.js";
import { LOCALES } from "./i18n";

export async function exportOrderList({ list, lang, t }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MiKardex";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(t("xlsOrders"));
  const hasOnOrder = list.rows.some((row) => row.onOrder > 0);

  const columns = [
    { header: "SKU", key: "sku", width: 14 },
    { header: t("colProduct"), key: "name", width: 34 },
    { header: t("xlsWarehouse"), key: "warehouse", width: 16 },
    { header: t("colStock"), key: "stock", width: 10 },
    { header: t("colCover"), key: "cover", width: 17 },
    { header: t("colLead"), key: "lead", width: 18 },
  ];
  if (hasOnOrder) columns.push({ header: t("colOnOrder"), key: "onOrder", width: 12 });
  columns.push({ header: t("colQty"), key: "qty", width: 12 });
  if (list.hasCost) {
    columns.push({ header: t("xlsCost"), key: "unitCost", width: 14 }, { header: t("colCost"), key: "cost", width: 17 });
  }
  columns.push({ header: t("xlsNote"), key: "note", width: 44 });

  // title and date above the table
  sheet.addRow([t("xlsOrdersTitle")]).font = { bold: true, size: 16, color: { argb: "FF15181A" } };
  sheet.addRow([new Date().toLocaleString(LOCALES[lang])]).font = { italic: true, color: { argb: "FF6B7268" } };
  sheet.addRow([]);

  const header = sheet.addRow(columns.map((c) => c.header));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF15181A" } };
  });
  columns.forEach((c, i) => {
    sheet.getColumn(i + 1).width = c.width;
  });
  sheet.views = [{ state: "frozen", ySplit: 4 }];

  const qtyIndex = columns.findIndex((c) => c.key === "qty") + 1;
  list.rows.forEach((row) => {
    const values = {
      sku: row.item.sku,
      name: row.item.name,
      warehouse: row.item.warehouse,
      stock: row.item.stock,
      cover: row.cover === null ? "" : Number(row.cover.toFixed(1)),
      lead: row.lead ?? "",
      onOrder: row.onOrder || "",
      qty: row.qty,
      unitCost: row.item.unit_cost ?? "",
      cost: row.cost === null ? "" : Math.round(row.cost * 100) / 100,
      note: row.lateRisk ? t("ordersLate") : "",
    };
    const added = sheet.addRow(columns.map((c) => values[c.key]));
    added.getCell(qtyIndex).font = { bold: true };
    if (row.lateRisk) added.getCell(columns.length).font = { color: { argb: "FFC1431F" } };
    added.eachCell((cell) => {
      cell.border = { bottom: { style: "hair", color: { argb: "FFDADFD7" } } };
    });
  });

  const totals = { sku: t("ordersTotal"), qty: list.totalUnits, cost: list.hasCost ? Math.round(list.totalCost * 100) / 100 : "" };
  const totalRow = sheet.addRow(columns.map((c) => (totals[c.key] !== undefined ? totals[c.key] : "")));
  totalRow.font = { bold: true };

  sheet.addRow([]);
  sheet.addRow([t("ordersRule", { days: list.coverDays })]).font = { italic: true, size: 10, color: { argb: "FF6B7268" } };
  sheet.addRow([t("ordersDisclaimer")]).font = { italic: true, size: 10, color: { argb: "FF6B7268" } };
  sheet.addRow([t("xlsFooter")]).font = { italic: true, size: 10, color: { argb: "FF6B7268" } };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${t("xlsOrdersFile")}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
