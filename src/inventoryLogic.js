import { EXCESS_RATIO } from "./config";

export const STATUS_ORDER = ["critical", "low", "ok", "idle", "excess"];

export function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// critical / low / ok / excess come from stock vs. reorder point.
// "idle" = stock on hand with no sales in the period (money sitting on the shelf).
export function statusFor(item) {
  const stock = Math.max(0, toNumber(item.stock) ?? 0);
  const usage = toNumber(item.avg_daily_usage);
  const reorder = toNumber(item.reorder_point);

  if (usage !== null && usage <= 0) return stock > 0 ? "idle" : "ok";
  if (reorder !== null && reorder > 0) {
    const ratio = stock / reorder;
    if (ratio < 0.5) return "critical";
    if (ratio < 1) return "low";
    if (ratio > EXCESS_RATIO) return "excess";
  }
  return "ok";
}

export function daysOfCover(item) {
  const usage = toNumber(item.avg_daily_usage);
  const stock = toNumber(item.stock);
  if (usage === null || usage <= 0 || stock === null) return null;
  return Math.max(0, stock) / usage;
}

// Money held in stock that is not working:
//   idle items   -> all of their stock
//   excess items -> only the units above EXCESS_RATIO x reorder point
export function tiedUpValue(item) {
  const cost = toNumber(item.unit_cost);
  if (cost === null || cost <= 0) return 0;
  const stock = Math.max(0, toNumber(item.stock) ?? 0);
  const status = statusFor(item);
  if (status === "idle") return stock * cost;
  if (status === "excess") {
    const healthy = EXCESS_RATIO * (toNumber(item.reorder_point) ?? 0);
    return Math.max(0, stock - healthy) * cost;
  }
  return 0;
}

export function summarize(items) {
  const counts = { critical: 0, low: 0, ok: 0, idle: 0, excess: 0 };
  const warehouses = {};
  let totalUnits = 0;
  let inventoryValue = 0;
  let tiedUp = 0;
  let tiedUpCount = 0;
  let hasCost = false;

  items.forEach((item) => {
    const status = statusFor(item);
    counts[status] += 1;
    const stock = Math.max(0, toNumber(item.stock) ?? 0);
    totalUnits += stock;
    warehouses[item.warehouse] = (warehouses[item.warehouse] || 0) + stock;
    const cost = toNumber(item.unit_cost);
    if (cost !== null && cost > 0) {
      hasCost = true;
      inventoryValue += stock * cost;
    }
    const held = tiedUpValue(item);
    if (held > 0) {
      tiedUp += held;
      tiedUpCount += 1;
    }
  });

  return {
    total: items.length,
    counts,
    warehouses,
    warehouseCount: Object.keys(warehouses).length,
    totalUnits,
    hasCost,
    inventoryValue,
    tiedUp,
    tiedUpCount,
    notMovingCount: counts.idle + counts.excess,
  };
}
