import { buildReport, classifyABC, findTransfers, chartData } from "./reportLogic";
import { reportText, pct } from "./reportText";
import { buildOrderList } from "./orderLogic";
import { summarize } from "./inventoryLogic";
import { translator } from "./i18n";
import { sampleInventory } from "./data/sample";

// A small shop: what each product is there for is in its name
const item = (sku, warehouse, stock, usage, reorder, extra = {}) => ({
  sku,
  name: `Product ${sku}`,
  warehouse,
  stock,
  avg_daily_usage: usage,
  reorder_point: reorder,
  lead_time_days: 7,
  ...extra,
});

const SHOP = [
  item("OUT", "Central", 0, 4, 40, { unit_cost: 10 }), // sells, nothing left
  item("LATE", "Central", 6, 3, 30, { unit_cost: 20 }), // 2 days of cover, 7 days of lead time
  item("LOW", "Central", 80, 2, 100, { unit_cost: 5, lead_time_days: 3 }), // below the reorder point, 40 days of cover
  item("FINE", "North", 60, 2, 30, { unit_cost: 8 }),
  item("DEAD", "North", 50, 0, 0, { unit_cost: 30 }), // stock and no sales
  item("PILE", "North", 400, 1, 10, { unit_cost: 2 }), // 40 times the reorder point
];

describe("classifyABC", () => {
  test("ranks by what is consumed in a day, at cost", () => {
    // daily consumption value: 80, 15, 4, 1, 0  (total 100)
    const items = [
      item("a", "W", 10, 8, 5, { unit_cost: 10 }),
      item("b", "W", 10, 3, 5, { unit_cost: 5 }),
      item("c", "W", 10, 4, 5, { unit_cost: 1 }),
      item("d", "W", 10, 1, 5, { unit_cost: 1 }),
      item("e", "W", 10, 0, 0, { unit_cost: 99 }),
    ];
    const abc = classifyABC(items);
    expect(abc.basis).toBe("value");
    // a reaches 80% on its own; b takes it to 95%; what is left, and what does not sell, is C
    expect(abc.classes).toEqual(["A", "B", "C", "C", "C"]);
    expect(abc.shares[0]).toBeCloseTo(0.8);
    expect(abc.shares[4]).toBe(0);
  });

  test("the product that crosses 80% is still class A", () => {
    // 50, 40, 10: after the first, half is covered, so the second is A too
    const items = [item("a", "W", 1, 50, 1, { unit_cost: 1 }), item("b", "W", 1, 40, 1, { unit_cost: 1 }), item("c", "W", 1, 10, 1, { unit_cost: 1 })];
    expect(classifyABC(items).classes).toEqual(["A", "A", "B"]);
  });

  test("without costs it ranks by units sold; without sales there is no ranking", () => {
    const noCost = [item("a", "W", 1, 9, 1), item("b", "W", 1, 1, 1)];
    expect(classifyABC(noCost)).toMatchObject({ basis: "units", classes: ["A", "B"] });

    const minimumOnly = [item("a", "W", 1, null, 5), item("b", "W", 1, null, 5)];
    expect(classifyABC(minimumOnly)).toMatchObject({ basis: null, classes: [null, null] });
  });
});

describe("findTransfers", () => {
  const twoWarehouses = [
    item("X1", "Central", 2, 2, 20, { unit_cost: 10 }), // needs 20 + 60 - 2 = 78
    item("X1", "North", 300, 1, 10, { unit_cost: 10 }), // keeps 10 + 30, can send 260
    item("X2", "Central", 0, 1, 10, { unit_cost: 4 }), // needs 40
    item("X2", "North", 25, 0, 0, { unit_cost: 4 }), // no sales there: can send all 25
    item("X3", "Central", 1, 1, 10), // needs stock, but nobody else has it
    item("X4", "Central", 5, 1, 10), // same warehouse twice: nothing to move
    item("X4", "Central", 500, 1, 10),
  ];

  test("matches a warehouse with spare stock to one that is about to buy", () => {
    const orders = buildOrderList(twoWarehouses, 30);
    const result = findTransfers(twoWarehouses, orders);
    expect(result.rows.map((r) => [r.item.sku, r.from, r.to, r.qty])).toEqual([
      ["X1", "North", "Central", 78],
      ["X2", "North", "Central", 25],
    ]);
    expect(result.units).toBe(103);
    expect(result.value).toBe(78 * 10 + 25 * 4);
    expect(result.covered.get(twoWarehouses[2])).toBe(25); // 15 of the 40 still have to be bought
  });

  test("a single warehouse never has transfers", () => {
    const orders = buildOrderList(SHOP, 30);
    expect(findTransfers(SHOP, orders).rows).toEqual([]);
  });
});

describe("buildReport", () => {
  const report = buildReport(SHOP, { coverDays: 30 });
  const k = report.kpis;

  test("key figures", () => {
    expect(k.skus).toBe(6);
    expect(k.warehouses).toBe(2);
    expect(k.activeSkus).toBe(5); // DEAD does not sell
    expect(k.stockouts).toBe(1);
    expect(k.availability).toBeCloseTo(0.8);
    expect(k.belowReorder).toBe(3); // OUT, LATE, LOW
    expect(k.lateLines).toBe(2); // OUT and LATE
    // value: 0 + 120 + 400 + 480 + 1500 + 800
    expect(k.inventoryValue).toBe(3300);
    // a day of sales at cost: 40 + 60 + 10 + 16 + 0 + 2
    expect(k.daysOfInventory).toBeCloseTo(3300 / 128);
    expect(k.turnover).toBeCloseTo(365 / (3300 / 128));
    // tied up: all of DEAD (1500) + PILE above 3 x 10 units (370 x 2)
    expect(k.idleValue).toBe(1500);
    expect(k.excessValue).toBe(740);
    expect(k.tiedUp).toBe(2240);
    expect(k.tiedUpShare).toBeCloseTo(2240 / 3300);
  });

  test("the order list comes with a priority, most pressing first", () => {
    expect(report.orders.rows.map((row) => [row.item.sku, row.priority])).toEqual([
      ["OUT", "urgent"],
      ["LATE", "urgent"],
      ["LOW", "normal"],
    ]);
    expect(k.urgentLines).toBe(2);
    // OUT: 40 + 120 - 0 = 160 units x 10.  LATE: 30 + 90 - 6 = 114 x 20
    expect(k.urgentCost).toBe(1600 + 2280);
  });

  test("what does not move, largest amount first", () => {
    expect(report.notMoving.map((row) => [row.item.sku, row.status, row.over, row.value])).toEqual([
      ["DEAD", "idle", 50, 1500],
      ["PILE", "excess", 370, 740],
    ]);
  });

  test("warehouse by warehouse, the one with most value first", () => {
    expect(report.warehouses.map((w) => w.name)).toEqual(["North", "Central"]);
    expect(report.warehouses[0]).toMatchObject({ skus: 3, units: 510, value: 2780, ok: 1, idle: 1, excess: 1, orderLines: 0 });
    expect(report.warehouses[1]).toMatchObject({ skus: 3, units: 86, value: 520, critical: 2, low: 1, orderLines: 3 });
    expect(report.warehouses[0].share + report.warehouses[1].share).toBeCloseTo(1);
  });

  test("ABC class by class adds up to the whole inventory", () => {
    const rows = report.abc.rows;
    expect(rows.map((r) => r.key)).toEqual(["A", "B", "C"]);
    expect(rows.reduce((sum, r) => sum + r.skus, 0)).toBe(6);
    expect(rows.reduce((sum, r) => sum + r.share, 0)).toBeCloseTo(1);
    expect(rows.reduce((sum, r) => sum + r.stockValue, 0)).toBe(3300);
    // by daily value: LATE 60, OUT 40 (78% together), FINE 16 -> the three are A; LOW 10 -> B; PILE, DEAD -> C
    expect(report.abc.classes).toEqual(["A", "A", "B", "A", "C", "C"]);
    expect(rows[0]).toMatchObject({ skus: 3, belowReorder: 2, stockouts: 1 });
  });

  test("a file without costs has no money figures, and says so", () => {
    const plain = SHOP.map(({ unit_cost, ...rest }) => rest);
    const r = buildReport(plain, { coverDays: 30 });
    expect(r.kpis).toMatchObject({ hasCost: false, daysOfInventory: null, turnover: null, tiedUpShare: null, orderCost: null, urgentCost: null });
    expect(r.kpis.medianCover).toBe(30); // covers: 0, 2, 30, 40, 400
    expect(r.abc.basis).toBe("units");
    const text = reportText(r, { t: translator("en"), lang: "en", items: plain });
    expect(text.dataNotes).toContain("The file has no unit cost: the report has no money figures.");
    expect(text.actions.map((a) => a.title)).toContain("Add the unit cost to the file");
    expect(text.reading.tiedUp).toBeUndefined();
  });

  test("a file with only a minimum stock is refilled to twice the minimum", () => {
    const minimumOnly = [item("A", "Main", 5, null, 20), item("B", "Main", 50, null, 20)];
    const r = buildReport(minimumOnly, { coverDays: 30 });
    const text = reportText(r, { t: translator("en"), lang: "en", items: minimumOnly });
    expect(r.orders.rows.map((row) => [row.item.sku, row.qty, row.priority])).toEqual([["A", 35, "high"]]);
    expect(text.findings).toEqual([
      "Below the reorder point: 1 of 2 products (50%). At a critical level: 1.",
      "Recommended purchase: 35 units (products: 1), to bring each one back to twice its minimum stock.",
    ]);
    expect(r.abc.basis).toBeNull();
    expect(text.reading.cover).toBeUndefined(); // no sales, so no days of cover
    expect(text.charts.label(minimumOnly[0])).toBe("Product A"); // one warehouse: the name is enough
  });

  test("an empty inventory does not break anything", () => {
    const r = buildReport([], { coverDays: 30 });
    expect(r.kpis).toMatchObject({ skus: 0, availability: null, belowReorder: 0, belowShare: 0 });
    const text = reportText(r, { t: translator("es"), lang: "es", items: [] });
    expect(text.findings).toEqual(["Ningún producto está bajo su punto de reorden."]);
  });
});

describe("reportText", () => {
  const report = buildReport(SHOP, { coverDays: 30, importInfo: { demandFrom: "sales", periodDays: 30, reorderComputed: true, defaultLeadUsed: true, defaultLead: 7, skippedNoStock: 2 } });
  const en = reportText(report, { t: translator("en"), lang: "en", items: SHOP });
  const es = reportText(report, { t: translator("es"), lang: "es", items: SHOP });

  test("the executive summary states the figures of the report", () => {
    expect(en.findings).toEqual([
      "Below the reorder point: 3 of 6 products (50%). At a critical level: 2.",
      "Out of stock while still selling: 1 of 5 products with sales. Availability: 80%.",
      "Products that run out before a new order can arrive: 2. Their stock covers fewer days than their lead time.",
      "Recommended purchase: $4,280 (products: 3), sized to cover 30 days of sales.",
      "Capital tied up: $2,240, 68% of the inventory value. Products with no sales in the period: 1; with excess stock: 1.",
      "Class A products: 3 (50% of the range), with 91% of consumption. Of those, below the reorder point: 2.",
      "The inventory equals 26 days of sales at cost. Estimated annual turnover: 14.2 times.",
      "Warehouse with the most inventory: North, with 84% of the value. Critical products there: 0 of 2.",
    ]);
    expect(es.findings[0]).toBe("Bajo el punto de reorden: 3 de 6 productos (50%). En nivel crítico: 2.");
    expect(es.findings[3]).toBe("Compra recomendada: $4.280 (productos: 3), calculada para cubrir 30 días de venta.");
  });

  test("recommendations go from what cannot wait to what can", () => {
    expect(en.actions.map((a) => [a.priority, a.when, a.title])).toEqual([
      ["high", "today", "Place the purchase orders on the list"],
      ["medium", "week", "Stop buying the products with excess stock"],
      ["medium", "month", "Move out the products with no sales"],
      ["medium", "month", "Keep a close watch on class A"],
      ["low", "month", "Use each supplier's real lead time"],
      ["low", "week", "Repeat this analysis every week"],
    ]);
    expect(en.actions[0].detail).toBe(
      "Products to order: 3. Estimated cost: $4,280. Start with the urgent ones (2): they are out of stock or run out before the order arrives. For those, ask for express delivery or use another supplier."
    );
    expect(es.actions[2].detail).toBe("Productos con stock y sin ventas en el período: 1, por $1.500. Opciones: promoción, liquidación, devolución al proveedor o baja.");
  });

  test("every chart has a title that says what it shows, what to notice and what to do", () => {
    expect(en.reading.status.title).toBe("3 of 6 products need replenishment");
    expect(en.reading.status.action).toBe("Buy the critical ones first. The quantities are on the order list.");
    expect(en.reading.warehouse.title).toBe("North holds 86% of the units");
    expect(en.reading.warehouse.points).toEqual([
      "Units by warehouse: North 510 (86%); Central 86 (14%).",
      "Most products below the reorder point: Central, with 3 of 3.",
      "By value, the warehouse with the most inventory is North: $2,780 (84%).",
    ]);
    expect(en.reading.cover.title).toBe("Cover runs from 0 to 400 days of stock"); // every product is on the chart
    expect(en.reading.cover.points).toEqual([
      "Lowest cover: Product OUT (OUT, Central), 0 days.",
      "On the chart, they run out before a new order can arrive: 2 of 5.",
      "Out of stock today: 1.",
      "Median cover of the products with sales: 30 days.",
    ]);
    expect(en.reading.tiedUp.title).toBe("Capital tied up: $2,240, 68% of the inventory value");
    expect(en.reading.tiedUp.points[2]).toBe("No sales in the period: $1,500 (products: 1). Excess above the normal level: $740 (products: 1).");
    expect(en.reading.tiedUp.points[1]).toBe("The largest: Product DEAD (DEAD, North), with $1,500.");
    expect(en.reading.tiedUp.action).toBe("Clear out or promote what is not selling, and do not reorder what has excess.");
    // on the charts a product is named with its warehouse, because it can be in several
    expect(en.charts.label(SHOP[0])).toBe("Product OUT · Central");
    expect(es.reading.status.title).toBe("3 de 6 productos necesitan reposición");
  });

  test("the key figures come as tiles with a label, a value and a hint", () => {
    expect(en.tiles.map((tile) => [tile.label, tile.value, tile.hint])).toEqual([
      ["Total SKUs", "6", "Warehouses: 2"],
      ["Inventory value", "$3,300", "Units: 596"],
      ["Availability", "80%", "Out of stock while selling: 1"],
      ["Below reorder point", "3", "At a critical level: 2"],
      ["Days of inventory", "26", "Annual turnover: 14.2 times"],
      ["Capital tied up", "$2,240", "68% of the inventory value"],
      ["Recommended purchase", "$4,280", "Products: 3"],
      ["Run out before restock", "2", "Cover shorter than lead time"],
    ]);
  });

  test("the method says what was assumed about this file, and the notes what it left out", () => {
    expect(en.method).toContain("Daily usage: units sold in the period of the file, divided by 30 days.");
    expect(en.method).toContain("Reorder point, when the file has none: daily usage × lead time × 1.5 (a 50% safety margin).");
    expect(en.method).toContain("The file has no lead times: 7 days were used for every product.");
    expect(en.dataNotes).toEqual(["Products left out because their stock cell has no number: 2."]);
    // nothing is left untranslated or with a blank still in it
    [en, es].forEach((text) => {
      const all = [...text.findings, ...text.method, ...text.dataNotes, ...text.actions.flatMap((a) => [a.title, a.detail]), ...text.tiles.flatMap((tile) => [tile.label, tile.hint])];
      Object.values(text.reading).forEach((r) => all.push(r.title, r.action, ...r.points));
      all.forEach((line) => {
        expect(line).not.toMatch(/\{\w+\}|^rp[A-Z]|undefined|NaN/);
      });
    });
  });

  test("percentages keep one decimal only while they are small", () => {
    expect(pct("en", 0.5)).toBe("50%");
    expect(pct("en", 0.034)).toBe("3.4%");
    expect(pct("es", 0.034)).toBe("3,4%");
    expect(pct("en", 0)).toBe("0%");
  });
});

describe("the sample inventory", () => {
  test.each(["en", "es"])("has a full report in %s", (lang) => {
    const items = sampleInventory(lang);
    const report = buildReport(items, { coverDays: 30 });
    const text = reportText(report, { t: translator(lang), lang, items });
    expect(report.kpis.skus).toBe(46);
    expect(report.kpis.hasCost).toBe(true);
    expect(report.abc.basis).toBe("value");
    expect(text.findings.length).toBeGreaterThanOrEqual(6);
    expect(Object.keys(text.reading)).toEqual(["status", "warehouse", "cover", "tiedUp"]);
    // the charts are the ones of the dashboard
    const charts = chartData(items, summarize(items));
    expect(charts.cover).toHaveLength(10);
    expect(charts.warehouses).toHaveLength(5);
  });

  test("both languages describe the same inventory", () => {
    const figures = (lang) => {
      const k = buildReport(sampleInventory(lang), { coverDays: 30 }).kpis;
      return [k.skus, k.units, k.belowReorder, k.stockouts, k.idleCount, k.excessCount, k.orderLines, k.orderUnits, k.lateLines];
    };
    expect(figures("es")).toEqual(figures("en"));
  });
});
