// What to order today, and how much. Plain arithmetic on the loaded inventory: no AI involved,
// so the list is instant, free to compute and always the same for the same file.

import { daysOfCover, toNumber } from "./inventoryLogic";

// One product -> { qty, ... } or null when nothing needs ordering.
//
//   position = stock on hand + units already ordered
//   order when position is below the reorder point
//   quantity = reorder point + coverDays of sales - position
//
// When the file has no sales (only a minimum stock), it refills up to twice the minimum.
export function orderSuggestion(item, coverDays) {
  const stock = Math.max(0, toNumber(item.stock) ?? 0);
  const onOrder = Math.max(0, toNumber(item.on_order) ?? 0);
  const usage = toNumber(item.avg_daily_usage);
  const reorder = toNumber(item.reorder_point);
  const lead = toNumber(item.lead_time_days);

  if (usage !== null && usage <= 0) return null; // no sales in the period: do not reorder
  if (reorder === null || reorder <= 0) return null;

  const position = stock + onOrder;
  if (position >= reorder) return null;

  const byMinimum = usage === null;
  const target = byMinimum ? reorder * 2 : reorder + usage * coverDays;
  const qty = Math.ceil(target - position);
  if (!(qty > 0)) return null;

  const cover = daysOfCover(item);
  const cost = toNumber(item.unit_cost);
  return {
    item,
    qty,
    cover,
    lead,
    onOrder,
    byMinimum,
    // on-hand stock will not last until a new order arrives
    lateRisk: cover !== null && lead !== null && cover < lead,
    cost: cost !== null && cost > 0 ? qty * cost : null,
  };
}

// Most urgent first: fewest days of cover, unknown cover last.
export function buildOrderList(items, coverDays) {
  const days = Math.min(365, Math.max(1, toNumber(coverDays) ?? 30));
  const rows = [];
  items.forEach((item) => {
    const row = orderSuggestion(item, days);
    if (row) rows.push(row);
  });
  rows.sort((a, b) => {
    if (a.cover === null && b.cover === null) return 0;
    if (a.cover === null) return 1;
    if (b.cover === null) return -1;
    return a.cover - b.cover;
  });

  let totalUnits = 0;
  let totalCost = 0;
  let hasCost = false;
  rows.forEach((row) => {
    totalUnits += row.qty;
    if (row.cost !== null) {
      totalCost += row.cost;
      hasCost = true;
    }
  });
  return {
    rows,
    coverDays: days,
    totalUnits,
    totalCost,
    hasCost,
    lateCount: rows.filter((row) => row.lateRisk).length,
    usesMinimum: rows.some((row) => row.byMinimum),
  };
}

// The products that run out first, for the summary shown right after loading a file.
export function runningOutFirst(items, limit = 3) {
  return items
    .map((item) => ({ item, cover: daysOfCover(item), reorder: toNumber(item.reorder_point), stock: Math.max(0, toNumber(item.stock) ?? 0) }))
    .filter((x) => x.cover !== null && x.reorder !== null && x.reorder > 0 && x.stock < x.reorder)
    .sort((a, b) => a.cover - b.cover)
    .slice(0, limit)
    .map((x) => ({ item: x.item, cover: x.cover }));
}
