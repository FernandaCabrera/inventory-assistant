import { orderSuggestion, buildOrderList, runningOutFirst } from "./orderLogic";
import { guessMapping, buildInventory } from "./importLogic";

const base = { sku: "A", name: "A", warehouse: "Main", lead_time_days: 5 };

describe("orderSuggestion", () => {
  test("orders up to reorder point plus the cover days", () => {
    // sells 16 a day, reorder at 160, 121 on hand -> 160 + 16*14 - 121 = 263
    const row = orderSuggestion({ ...base, stock: 121, avg_daily_usage: 16, reorder_point: 160, unit_cost: 14.5 }, 14);
    expect(row.qty).toBe(263);
    expect(row.cost).toBeCloseTo(263 * 14.5);
    expect(row.cover).toBeCloseTo(121 / 16);
    expect(row.lateRisk).toBe(false); // 7.6 days of stock, 5 days to deliver
  });

  test("flags a product that runs out before a new order can arrive", () => {
    const row = orderSuggestion({ ...base, stock: 10, avg_daily_usage: 5, reorder_point: 40 }, 30);
    expect(row.lateRisk).toBe(true); // 2 days of stock, 5 days to deliver
    expect(row.qty).toBe(40 + 150 - 10);
  });

  test("nothing to order above the reorder point, or with no sales", () => {
    expect(orderSuggestion({ ...base, stock: 200, avg_daily_usage: 16, reorder_point: 160 }, 30)).toBeNull();
    expect(orderSuggestion({ ...base, stock: 0, avg_daily_usage: 0, reorder_point: 10 }, 30)).toBeNull();
    expect(orderSuggestion({ ...base, stock: 5, avg_daily_usage: 2, reorder_point: null }, 30)).toBeNull();
  });

  test("units already on order count before ordering again", () => {
    const item = { ...base, stock: 20, avg_daily_usage: 4, reorder_point: 30 };
    expect(orderSuggestion(item, 10).qty).toBe(30 + 40 - 20);
    expect(orderSuggestion({ ...item, on_order: 15 }, 10)).toBeNull(); // 20 + 15 is above 30
    expect(orderSuggestion({ ...item, on_order: 5 }, 10).qty).toBe(30 + 40 - 25);
  });

  test("with only a minimum stock, refills up to twice the minimum", () => {
    const row = orderSuggestion({ ...base, stock: 4, avg_daily_usage: null, reorder_point: 10 }, 30);
    expect(row).toMatchObject({ qty: 16, byMinimum: true, cover: null, lateRisk: false });
  });
});

describe("buildOrderList", () => {
  const items = [
    { ...base, sku: "OK", stock: 500, avg_daily_usage: 10, reorder_point: 100, unit_cost: 2 },
    { ...base, sku: "SOON", stock: 90, avg_daily_usage: 10, reorder_point: 100, unit_cost: 2 }, // 9 days
    { ...base, sku: "NOW", stock: 0, avg_daily_usage: 10, reorder_point: 100, unit_cost: 2 }, // 0 days
    { ...base, sku: "MIN", stock: 1, avg_daily_usage: null, reorder_point: 5 }, // unknown cover
    { ...base, sku: "IDLE", stock: 40, avg_daily_usage: 0, reorder_point: 0, unit_cost: 9 },
  ];

  test("most urgent first, with totals", () => {
    const list = buildOrderList(items, 30);
    expect(list.rows.map((r) => r.item.sku)).toEqual(["NOW", "SOON", "MIN"]);
    expect(list.rows.map((r) => r.qty)).toEqual([400, 310, 9]);
    expect(list.totalUnits).toBe(719);
    expect(list.totalCost).toBe(710 * 2);
    expect(list).toMatchObject({ hasCost: true, lateCount: 1, usesMinimum: true, coverDays: 30 });
  });

  test("an empty or invalid cover period falls back to 30 days; extremes are clamped", () => {
    expect(buildOrderList(items, "").coverDays).toBe(30);
    expect(buildOrderList(items, "abc").coverDays).toBe(30);
    expect(buildOrderList(items, 0).coverDays).toBe(1);
    expect(buildOrderList(items, 9999).coverDays).toBe(365);
    expect(buildOrderList(items, "14").rows[0].qty).toBe(100 + 140);
  });

  test("runningOutFirst lists the products with the fewest days of stock", () => {
    const first = runningOutFirst(items, 2);
    expect(first.map((x) => x.item.sku)).toEqual(["NOW", "SOON"]);
    expect(first[0].cover).toBe(0);
  });
});

describe("units on order in the import", () => {
  test("the column is recognized and read", () => {
    const headers = ["SKU", "Product Name", "Current Stock", "Avg Daily Sales", "Reorder Point", "Open PO Qty", "Suggested Order Qty", "Next Delivery Date"];
    const mapping = guessMapping(headers);
    expect(mapping.on_order).toBe(5);
    expect(mapping.stock).toBe(2);
    const { items } = buildInventory(
      { headers, rows: [["A1", "Rice", 20, 4, 30, 15, 0, ""], ["A2", "Tea", 20, 4, 30, 0, 50, ""]] },
      mapping,
      { salesPeriodDays: 30, defaultLeadTime: 7, defaultWarehouse: "Main" }
    );
    expect(items[0].on_order).toBe(15);
    expect(items[1].on_order).toBeUndefined();
  });

  test("Spanish headers", () => {
    expect(guessMapping(["Código", "Producto", "Stock", "Ventas", "En tránsito"]).on_order).toBe(4);
    expect(guessMapping(["Código", "Producto", "Stock", "Ventas", "Pedidos pendientes"]).on_order).toBe(4);
    expect(guessMapping(["Código", "Producto", "Stock", "Ventas", "Fecha por recibir"]).on_order).toBeNull();
  });
});
