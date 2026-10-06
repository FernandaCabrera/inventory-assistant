// The figures behind the executive report and the dashboard download. Plain arithmetic on the
// loaded inventory: no AI involved, so the same file always gives the same report.

import { EXCESS_RATIO } from "./config";
import { statusFor, daysOfCover, tiedUpValue, summarize, toNumber } from "./inventoryLogic";
import { buildOrderList } from "./orderLogic";

// ABC: products that add up to the first 80% of consumption are A, up to 95% are B, the rest C
export const ABC_A_SHARE = 0.8;
export const ABC_B_SHARE = 0.95;
export const ABC_CLASSES = ["A", "B", "C"];

const stockOf = (item) => Math.max(0, toNumber(item.stock) ?? 0);
const usageOf = (item) => toNumber(item.avg_daily_usage);
const costOf = (item) => {
  const cost = toNumber(item.unit_cost);
  return cost !== null && cost > 0 ? cost : null;
};

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Which products carry the business. Ranked by what they consume in a day:
//   "value" = daily usage x unit cost, when the file has costs
//   "units" = daily usage, when it has no costs
//   null    = the file has no sales at all, so nothing can be ranked
// Returns the class of every product, in the order of items.
export function classifyABC(items) {
  const hasValue = items.some((item) => (usageOf(item) ?? 0) > 0 && costOf(item) !== null);
  const hasUnits = items.some((item) => (usageOf(item) ?? 0) > 0);
  const basis = hasValue ? "value" : hasUnits ? "units" : null;
  if (basis === null) return { basis, classes: items.map(() => null), shares: items.map(() => null), total: 0 };

  const weights = items.map((item) => {
    const usage = Math.max(0, usageOf(item) ?? 0);
    return basis === "value" ? usage * (costOf(item) ?? 0) : usage;
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  const order = weights.map((w, i) => i).sort((a, b) => weights[b] - weights[a] || a - b);

  const classes = items.map(() => "C");
  let before = 0; // share of consumption of the products ranked above this one
  order.forEach((i) => {
    if (weights[i] <= 0) return; // nothing consumed: always C
    const share = before / total;
    classes[i] = share < ABC_A_SHARE - 1e-9 ? "A" : share < ABC_B_SHARE - 1e-9 ? "B" : "C";
    before += weights[i];
  });
  return { basis, classes, shares: weights.map((w) => (total > 0 ? w / total : 0)), total };
}

// Stock that sits in one warehouse while another one is about to buy the same product.
//   who gives:    a warehouse where the product has no sales (all of its stock), or has excess
//                 (what is above its own reorder point + coverDays of sales)
//   who receives: a warehouse where the product is on the order list
// Only products with the same code in two or more warehouses can be matched.
export function findTransfers(items, orders) {
  const need = new Map(); // item -> row of the order list
  orders.rows.forEach((row) => need.set(row.item, row));

  const bySku = new Map();
  items.forEach((item) => {
    const key = String(item.sku ?? "").trim().toLowerCase();
    if (!key) return;
    if (!bySku.has(key)) bySku.set(key, []);
    bySku.get(key).push(item);
  });

  const transfers = [];
  const covered = new Map(); // item -> units another warehouse can send
  bySku.forEach((group) => {
    if (group.length < 2) return;
    const donors = group
      .map((item) => {
        const status = statusFor(item);
        const stock = stockOf(item);
        let spare = 0;
        if (status === "idle") spare = stock;
        else if (status === "excess") {
          const keep = (toNumber(item.reorder_point) ?? 0) + Math.max(0, usageOf(item) ?? 0) * orders.coverDays;
          spare = stock - keep;
        }
        return { item, spare: Math.floor(spare) };
      })
      .filter((d) => d.spare > 0)
      .sort((a, b) => b.spare - a.spare);
    if (donors.length === 0) return;

    group
      .filter((item) => need.has(item))
      .map((item) => need.get(item))
      .sort((a, b) => (a.cover ?? Infinity) - (b.cover ?? Infinity)) // most urgent first
      .forEach((row) => {
        let missing = row.qty;
        donors.forEach((donor) => {
          if (missing <= 0 || donor.spare <= 0 || donor.item.warehouse === row.item.warehouse) return;
          const qty = Math.min(missing, donor.spare);
          donor.spare -= qty;
          missing -= qty;
          const cost = costOf(row.item) ?? costOf(donor.item);
          transfers.push({ item: row.item, from: donor.item.warehouse, to: row.item.warehouse, qty, value: cost === null ? null : qty * cost, cover: row.cover });
          covered.set(row.item, (covered.get(row.item) || 0) + qty);
        });
      });
  });

  let units = 0;
  let value = 0;
  let hasValue = false;
  transfers.forEach((tr) => {
    units += tr.qty;
    if (tr.value !== null) {
      value += tr.value;
      hasValue = true;
    }
  });
  return { rows: transfers, covered, units, value, hasValue };
}

// "urgent" = out of stock, or it runs out before a new order can arrive
// "high"   = below half of the reorder point
// "normal" = below the reorder point
function orderPriority(row) {
  if (stockOf(row.item) <= 0 || row.lateRisk) return "urgent";
  return statusFor(row.item) === "critical" ? "high" : "normal";
}
const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2 };

// items: the loaded inventory. coverDays: the days of sales every order should cover (the same
// number as on the order list). importInfo: what the upload window noted about the file.
export function buildReport(items, { coverDays, importInfo = null } = {}) {
  const summary = summarize(items);
  const orders = buildOrderList(items, coverDays);
  const abc = classifyABC(items);
  const transfers = findTransfers(items, orders);

  // ---- key figures ----
  const active = items.filter((item) => (usageOf(item) ?? 0) > 0);
  const stockouts = active.filter((item) => stockOf(item) <= 0).length;
  let dailyValue = 0; // what a day of sales costs
  let noCost = 0;
  items.forEach((item) => {
    const cost = costOf(item);
    if (cost === null) noCost += 1;
    else dailyValue += Math.max(0, usageOf(item) ?? 0) * cost;
  });
  const daysOfInventory = summary.hasCost && dailyValue > 0 ? summary.inventoryValue / dailyValue : null;

  let idleValue = 0;
  let idleUnits = 0;
  let excessValue = 0;
  let excessUnits = 0;
  const notMoving = [];
  items.forEach((item) => {
    const status = statusFor(item);
    if (status !== "idle" && status !== "excess") return;
    const stock = stockOf(item);
    const over = status === "idle" ? stock : Math.max(0, stock - EXCESS_RATIO * (toNumber(item.reorder_point) ?? 0));
    const value = tiedUpValue(item);
    if (status === "idle") {
      idleValue += value;
      idleUnits += over;
    } else {
      excessValue += value;
      excessUnits += over;
    }
    notMoving.push({ item, status, stock, over, value, cover: daysOfCover(item), hasCost: costOf(item) !== null });
  });
  notMoving.sort((a, b) => b.value - a.value || b.over - a.over);

  const orderRows = orders.rows
    .map((row) => ({ ...row, priority: orderPriority(row), transferable: transfers.covered.get(row.item) || 0 }))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]); // the order by cover is kept inside each priority
  const urgentRows = orderRows.filter((row) => row.priority === "urgent");
  const urgentCost = urgentRows.reduce((sum, row) => sum + (row.cost ?? 0), 0);

  const kpis = {
    skus: summary.total,
    warehouses: summary.warehouseCount,
    units: summary.totalUnits,
    hasCost: summary.hasCost,
    inventoryValue: summary.inventoryValue,
    activeSkus: active.length,
    stockouts,
    availability: active.length > 0 ? (active.length - stockouts) / active.length : null,
    belowReorder: summary.counts.critical + summary.counts.low,
    belowShare: summary.total > 0 ? (summary.counts.critical + summary.counts.low) / summary.total : 0,
    medianCover: median(active.map((item) => daysOfCover(item)).filter((d) => d !== null)),
    daysOfInventory,
    turnover: daysOfInventory !== null && daysOfInventory > 0 ? 365 / daysOfInventory : null,
    tiedUp: summary.tiedUp,
    tiedUpShare: summary.hasCost && summary.inventoryValue > 0 ? summary.tiedUp / summary.inventoryValue : null,
    idleCount: summary.counts.idle,
    idleUnits,
    idleValue,
    excessCount: summary.counts.excess,
    excessUnits,
    excessValue,
    orderLines: orders.rows.length,
    orderUnits: orders.totalUnits,
    orderCost: orders.hasCost ? orders.totalCost : null,
    lateLines: orders.lateCount,
    urgentLines: urgentRows.length,
    urgentCost: orders.hasCost ? urgentCost : null,
    noCost: summary.hasCost ? noCost : 0, // products without a cost in a file that has costs
  };

  // ---- ABC, class by class ----
  const abcClasses = ABC_CLASSES.map((key) => ({ key, skus: 0, share: 0, units: 0, stockValue: 0, belowReorder: 0, stockouts: 0 }));
  if (abc.basis !== null) {
    items.forEach((item, i) => {
      const row = abcClasses[ABC_CLASSES.indexOf(abc.classes[i])];
      const status = statusFor(item);
      row.skus += 1;
      row.share += abc.shares[i];
      row.units += stockOf(item);
      row.stockValue += stockOf(item) * (costOf(item) ?? 0);
      if (status === "critical" || status === "low") row.belowReorder += 1;
      if ((usageOf(item) ?? 0) > 0 && stockOf(item) <= 0) row.stockouts += 1;
    });
    abcClasses.forEach((row) => {
      row.skuShare = summary.total > 0 ? row.skus / summary.total : 0;
    });
  }

  // ---- warehouse by warehouse ----
  const byWarehouse = new Map();
  const warehouseRow = (name) => {
    if (!byWarehouse.has(name)) {
      byWarehouse.set(name, { name, skus: 0, units: 0, value: 0, critical: 0, low: 0, ok: 0, idle: 0, excess: 0, tiedUp: 0, orderLines: 0, orderCost: 0 });
    }
    return byWarehouse.get(name);
  };
  items.forEach((item) => {
    const row = warehouseRow(item.warehouse);
    row.skus += 1;
    row.units += stockOf(item);
    row.value += stockOf(item) * (costOf(item) ?? 0);
    row[statusFor(item)] += 1;
    row.tiedUp += tiedUpValue(item);
  });
  orders.rows.forEach((order) => {
    const row = warehouseRow(order.item.warehouse);
    row.orderLines += 1;
    row.orderCost += order.cost ?? 0;
  });
  const warehouses = [...byWarehouse.values()].sort((a, b) => (summary.hasCost ? b.value - a.value : 0) || b.units - a.units);
  warehouses.forEach((row) => {
    // share of the inventory: by value when the file has costs, by units when it does not
    const [part, whole] = summary.hasCost ? [row.value, summary.inventoryValue] : [row.units, summary.totalUnits];
    row.share = whole > 0 ? part / whole : 0;
  });

  return {
    summary,
    orders: { ...orders, rows: orderRows },
    abc: { basis: abc.basis, classes: abc.classes, shares: abc.shares, rows: abcClasses },
    transfers,
    kpis,
    notMoving,
    warehouses,
    importInfo: importInfo || {},
  };
}

// ---- chart data, the same series the dashboard draws ----
export const COVER_CHART_LIMIT = 10;
export const TIED_UP_CHART_LIMIT = 8;

export function chartData(items, summary) {
  const cover = items
    .map((item) => ({ item, days: daysOfCover(item), status: statusFor(item) }))
    .filter((d) => d.days !== null)
    .map((d) => ({ ...d, days: Number(d.days.toFixed(1)) }))
    .sort((a, b) => a.days - b.days);
  const tiedUp = items
    .map((item) => ({ item, value: Math.round(tiedUpValue(item)), status: statusFor(item) }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  return {
    cover: cover.slice(0, COVER_CHART_LIMIT),
    coverTotal: cover.length,
    tiedUp: tiedUp.slice(0, TIED_UP_CHART_LIMIT),
    tiedUpTotal: tiedUp.length,
    warehouses: Object.entries(summary.warehouses).map(([name, units]) => ({ name, units })),
  };
}
