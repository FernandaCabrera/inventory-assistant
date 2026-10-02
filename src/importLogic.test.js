import {
  guessMapping,
  parseNumber,
  parseCsv,
  extractTable,
  validateMapping,
  buildInventory,
} from "./importLogic";
import { statusFor, daysOfCover, tiedUpValue, summarize } from "./inventoryLogic";

describe("guessMapping", () => {
  test("Spanish template headers", () => {
    const m = guessMapping([
      "Código", "Producto", "Bodega", "Stock", "Ventas últimos 30 días", "Costo unitario", "Días de reposición",
    ]);
    expect(m).toMatchObject({
      sku: 0, name: 1, warehouse: 2, stock: 3, sales: 4, unit_cost: 5, lead_time_days: 6,
      avg_daily_usage: null, reorder_point: null,
    });
  });

  test("English template headers", () => {
    const m = guessMapping([
      "SKU", "Product", "Warehouse", "Stock", "Units sold last 30 days", "Unit cost", "Lead time (days)",
    ]);
    expect(m).toMatchObject({ sku: 0, name: 1, warehouse: 2, stock: 3, sales: 4, unit_cost: 5, lead_time_days: 6 });
  });

  test("original dataset keys", () => {
    const m = guessMapping(["sku", "name", "warehouse", "stock", "reorder_point", "lead_time_days", "avg_daily_usage"]);
    expect(m).toMatchObject({
      sku: 0, name: 1, warehouse: 2, stock: 3, reorder_point: 4, lead_time_days: 5, avg_daily_usage: 6, sales: null,
    });
  });

  test("messy real-world headers", () => {
    const m = guessMapping([
      "Cód. Producto", "Descripción", "Sucursal", "Stock Mínimo", "Stock Actual", "Cantidad Vendida",
      "Precio Venta", "Costo Neto", "Costo Total",
    ]);
    expect(m.sku).toBe(0);
    expect(m.name).toBe(1);
    expect(m.warehouse).toBe(2);
    expect(m.reorder_point).toBe(3);
    expect(m.stock).toBe(4);
    expect(m.sales).toBe(5);
    expect(m.unit_cost).toBe(7); // not the sale price, not the total
  });

  test("sale price is never taken as units sold", () => {
    const m = guessMapping(["Producto", "Stock", "Precio de venta"]);
    expect(m.sales).toBeNull();
  });
});

describe("parseNumber", () => {
  test.each([
    [12, 12],
    ["12", 12],
    ["1.234", 1234],
    ["1.234,5", 1234.5],
    ["1,234.5", 1234.5],
    ["1,234", 1234],
    ["3,5", 3.5],
    ["3.5", 3.5],
    ["$ 1.500", 1500],
    ["-4", -4],
    ["(7)", -7],
    ["3-", -3],
    ["1.500,00-", -1500],
    ["−4", -4],
    ["–5", -5],
    ["12 un", 12],
    ["", null],
    ["abc", null],
    [null, null],
  ])("%p -> %p", (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });
});

describe("parseCsv", () => {
  test("semicolon separated with quotes", () => {
    const grid = parseCsv('Código;Producto;Stock\r\nA1;"Café; molido";1.200\r\nA2;Té;3\r\n');
    expect(grid).toEqual([
      ["Código", "Producto", "Stock"],
      ["A1", "Café; molido", "1.200"],
      ["A2", "Té", "3"],
    ]);
  });

  test("comma separated with BOM and blank lines", () => {
    const grid = parseCsv('﻿sku,name,stock\n\nA1,"Tea, green",4\n');
    expect(grid).toEqual([
      ["sku", "name", "stock"],
      ["A1", "Tea, green", "4"],
    ]);
  });
});

describe("extractTable", () => {
  test("skips title rows above the header", () => {
    const table = extractTable([
      ["Reporte de stock", "", ""],
      ["Generado el 01-10-2026", "", ""],
      ["", "", ""],
      ["Código", "Producto", "Stock", "Ventas"],
      ["A1", "Café", 5, 30],
    ]);
    expect(table.headers).toEqual(["Código", "Producto", "Stock", "Ventas"]);
    expect(table.rows).toEqual([["A1", "Café", 5, 30]]);
  });

  test("names empty and duplicate headers", () => {
    const table = extractTable([
      ["SKU", "Stock", "", "Stock"],
      ["A1", 1, "x", 2],
    ]);
    expect(table.headers).toEqual(["SKU", "Stock", "#3", "Stock (2)"]);
  });
});

describe("validateMapping", () => {
  test("reports what is missing", () => {
    const empty = guessMapping(["foo", "bar"]);
    expect(validateMapping(empty)).toEqual(["needProduct", "needStock", "needDemand"]);
    const ok = guessMapping(["Producto", "Stock", "Ventas"]);
    expect(validateMapping(ok)).toEqual([]);
  });
});

describe("buildInventory", () => {
  const headers = ["Código", "Producto", "Bodega", "Stock", "Ventas", "Costo unitario"];
  const mapping = guessMapping(headers);
  const settings = { salesPeriodDays: 30, defaultLeadTime: 7, defaultWarehouse: "Principal" };

  test("computes usage, reorder point and status", () => {
    const { items, report } = buildInventory(
      {
        headers,
        rows: [
          ["A1", "Café", "Central", 12, 90, 4200], // 3/day, reorder ceil(3*7*1.5)=32 -> critical
          ["A2", "Té", "", 140, 30, 1800], // 1/day, reorder 11 -> excess
          ["A3", "Azúcar", "Central", 60, 0, 950], // no sales -> idle
          ["A4", "Sal", "Central", "", 10, 100], // no stock value -> skipped
          ["", "", "", "", "", ""], // empty -> skipped
          ["Total", "", "", 212, 120, ""], // totals row -> skipped
          ["A5", "Arroz", "Central", -3, 15, 800], // negative stock -> 0
        ],
      },
      mapping,
      settings
    );

    expect(items.map((i) => i.sku)).toEqual(["A1", "A2", "A3", "A5"]);
    expect(report).toMatchObject({ read: 4, skippedEmpty: 2, skippedNoStock: 1, negatives: 1 });

    const [cafe, te, azucar, arroz] = items;
    expect(cafe).toMatchObject({ avg_daily_usage: 3, reorder_point: 32, lead_time_days: 7, unit_cost: 4200 });
    expect(statusFor(cafe)).toBe("critical");
    expect(daysOfCover(cafe)).toBe(4);

    expect(te.warehouse).toBe("Principal");
    expect(te.reorder_point).toBe(11);
    expect(statusFor(te)).toBe("excess");
    expect(tiedUpValue(te)).toBe((140 - 33) * 1800);

    expect(azucar).toMatchObject({ avg_daily_usage: 0, reorder_point: 0 });
    expect(statusFor(azucar)).toBe("idle");
    expect(daysOfCover(azucar)).toBeNull();
    expect(tiedUpValue(azucar)).toBe(60 * 950);

    expect(arroz.stock).toBe(0);
    expect(statusFor(arroz)).toBe("critical");

    const s = summarize(items);
    expect(s.counts).toEqual({ critical: 2, low: 0, ok: 0, idle: 1, excess: 1 });
    expect(s.hasCost).toBe(true);
    expect(s.tiedUp).toBe(60 * 950 + (140 - 33) * 1800);
    expect(s.inventoryValue).toBe(12 * 4200 + 140 * 1800 + 60 * 950);
    expect(s.warehouseCount).toBe(2);
  });

  test("notes under the table are left out quietly; products without stock are reported", () => {
    const { items, report } = buildInventory(
      {
        headers,
        rows: [
          ["A1", "Café", "Central", 12, 90, 4200],
          ["New product? Add it to Products, then type its SKU in a new row", "", "", "", "", ""],
          ["", "Priority: 1 = out of stock, 2 = reorder now", "", "", "", ""],
          ["A2", "Té", "Central", "n/d", 30, 1800], // text where the stock should be
          ["A3", "Sal", "Central", "", 10, ""], // sells, but stock is blank
        ],
      },
      mapping,
      settings
    );
    expect(items.map((i) => i.sku)).toEqual(["A1"]);
    expect(report).toMatchObject({ read: 1, skippedEmpty: 2, skippedNoStock: 2 });
  });

  test("minimum stock without sales still gives a status", () => {
    const h = ["Producto", "Stock", "Stock mínimo"];
    const { items } = buildInventory({ headers: h, rows: [["Leche", 4, 10]] }, guessMapping(h), settings);
    expect(items[0]).toMatchObject({ sku: "P-0001", name: "Leche", reorder_point: 10, avg_daily_usage: null });
    expect(statusFor(items[0])).toBe("critical");
    expect(daysOfCover(items[0])).toBeNull();
  });

  test("sample dataset shape keeps its statuses", () => {
    expect(statusFor({ stock: 4, reorder_point: 22, avg_daily_usage: 6 })).toBe("critical");
    expect(statusFor({ stock: 14, reorder_point: 21, avg_daily_usage: 2 })).toBe("low");
    expect(statusFor({ stock: 72, reorder_point: 36, avg_daily_usage: 10 })).toBe("ok");
    expect(statusFor({ stock: 200, reorder_point: 36, avg_daily_usage: 10 })).toBe("excess");
  });
});
