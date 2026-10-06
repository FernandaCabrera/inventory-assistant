// The words of the executive report and of the dashboard download: what the figures mean and
// what to do about them. Written by fixed rules from the figures of reportLogic, so the text
// always matches the numbers next to it.

import { EXCESS_RATIO, SAFETY_FACTOR } from "./config";
import { formatNumber, formatMoney } from "./i18n";
import { toNumber } from "./inventoryLogic";
import { ABC_A_SHARE, ABC_B_SHARE, chartData } from "./reportLogic";
import { shorten } from "./reportFiles";

// Whole percent, with one decimal while it is small enough to matter
export function pct(lang, share) {
  const value = (share || 0) * 100;
  return `${formatNumber(lang, value, value > 0 && value < 10 ? 1 : 0)}%`;
}

// report: result of buildReport. Returns everything the files print, already in the language of the page.
export function reportText(report, { t, lang, items }) {
  const { summary, kpis: k, orders, abc, transfers, warehouses, importInfo } = report;
  const n = (value, decimals = 0) => formatNumber(lang, value, decimals);
  const money = (value) => formatMoney(lang, value);
  const p = (share) => pct(lang, share);
  const { counts } = summary;
  const classA = abc.rows[0];
  const charts = chartData(items, summary);
  // How a product is named in a sentence. With several warehouses the same product is there more
  // than once, so the warehouse is part of its name.
  const several = k.warehouses > 1;
  const productName = (item) => `${shorten(item.name, 48)} (${item.sku}${several ? `, ${item.warehouse}` : ""})`;
  charts.label = (item) => (several ? `${shorten(item.name, 24)} · ${shorten(item.warehouse, 16)}` : shorten(item.name, 36));

  // ---- executive summary: one line per finding, most pressing first ----
  const findings = [];
  if (k.belowReorder > 0) {
    findings.push(t("rpFBelow", { below: n(k.belowReorder), total: n(k.skus), pct: p(k.belowShare), critical: n(counts.critical) }));
  } else {
    findings.push(t("rpFHealthy"));
  }
  if (k.availability !== null) {
    findings.push(
      k.stockouts > 0
        ? t("rpFStockout", { n: n(k.stockouts), active: n(k.activeSkus), pct: p(k.availability) })
        : t("rpFAvailable", { pct: p(k.availability) })
    );
  }
  if (k.lateLines > 0) findings.push(t("rpFLate", { n: n(k.lateLines) }));
  if (k.orderLines > 0) {
    // a file with only a minimum stock is refilled to twice that minimum, not by days of sales
    const byMinimum = orders.rows.every((row) => row.byMinimum) ? "Min" : "";
    findings.push(
      k.orderCost !== null
        ? t(`rpFOrderCost${byMinimum}`, { cost: money(k.orderCost), lines: n(k.orderLines), days: n(orders.coverDays) })
        : t(`rpFOrderUnits${byMinimum}`, { units: n(k.orderUnits), lines: n(k.orderLines), days: n(orders.coverDays) })
    );
  }
  if (k.idleCount + k.excessCount > 0) {
    findings.push(
      k.hasCost && k.tiedUp > 0
        ? t("rpFTiedUp", { amount: money(k.tiedUp), pct: p(k.tiedUpShare), idle: n(k.idleCount), excess: n(k.excessCount) })
        : t("rpFNotMoving", { idle: n(k.idleCount), excess: n(k.excessCount) })
    );
  }
  if (abc.basis !== null && classA.skus > 0) {
    findings.push(t("rpFAbc", { n: n(classA.skus), skuPct: p(classA.skuShare), pct: p(classA.share), below: n(classA.belowReorder) }));
  }
  if (k.daysOfInventory !== null) {
    findings.push(t("rpFTurnover", { days: n(k.daysOfInventory), turns: n(k.turnover, 1) }));
  }
  if (warehouses.length > 1) {
    const top = warehouses[0];
    findings.push(
      t(k.hasCost ? "rpFWarehouseValue" : "rpFWarehouseUnits", { name: top.name, pct: p(top.share), critical: n(top.critical), total: n(counts.critical) })
    );
  }
  if (transfers.rows.length > 0) findings.push(t("rpFTransfers", { n: n(transfers.rows.length), units: n(transfers.units) }));

  // ---- what to do, in order ----
  const actions = [];
  // key: the action, e.g. "rpAExcess". variant: which of its detail texts fits the file ("", "Value", ...)
  const act = (priority, when, key, variant = "", vars) => actions.push({ priority, when, title: t(`${key}Title`), detail: t(`${key}Detail${variant}`, vars) });
  if (k.orderLines > 0) {
    const detail =
      t(k.orderCost !== null ? "rpAOrderDetailCost" : "rpAOrderDetailUnits", { lines: n(k.orderLines), cost: money(k.orderCost ?? 0), units: n(k.orderUnits) }) +
      (k.urgentLines > 0 ? ` ${t("rpAOrderUrgent", { n: n(k.urgentLines) })}` : "");
    actions.push({ priority: k.urgentLines > 0 ? "high" : "medium", when: "today", title: t("rpAOrderTitle"), detail });
  }
  if (transfers.rows.length > 0) {
    act("high", "today", "rpATransfer", transfers.hasValue ? "Value" : "", { n: n(transfers.rows.length), units: n(transfers.units), amount: money(transfers.value) });
  }
  if (k.excessCount > 0) {
    act("medium", "week", "rpAExcess", k.hasCost && k.excessValue > 0 ? "Value" : "", { n: n(k.excessCount), amount: money(k.excessValue), ratio: EXCESS_RATIO });
  }
  if (k.idleCount > 0) {
    act("medium", "month", "rpAIdle", k.hasCost && k.idleValue > 0 ? "Value" : "", { n: n(k.idleCount), amount: money(k.idleValue), units: n(k.idleUnits) });
  }
  if (abc.basis !== null && classA.skus > 0) {
    act(classA.belowReorder > 0 ? "medium" : "low", "month", "rpAClassA", "", { n: n(classA.skus), pct: p(classA.share) });
  }
  if (!k.hasCost) act("low", "month", "rpANoCost");
  if (importInfo.defaultLeadUsed) act("low", "month", "rpALead", "", { days: n(importInfo.defaultLead) });
  act("low", "week", "rpAFollow");

  // ---- the key figures, as tiles ----
  // value is how it reads; raw and kind are the number behind it, for the Excel files
  const tile = (label, raw, kind, hint, tone) => {
    const value = kind === "money" ? money(raw) : kind === "pct" ? p(raw) : n(raw, kind === "dec1" ? 1 : 0);
    return { label, value, raw, kind, hint, tone };
  };
  const tiles = [
    tile(t("kpiTotal"), k.skus, "int", t("rpKWarehouses", { n: n(k.warehouses) })),
    k.hasCost ? tile(t("kpiValue"), k.inventoryValue, "money", t("rpKUnits", { n: n(k.units) })) : tile(t("kpiUnits"), k.units, "int", ""),
    k.availability !== null && tile(t("rpKAvailability"), k.availability, "pct", t("rpKStockouts", { n: n(k.stockouts) }), k.stockouts > 0 ? "critical" : "ok"),
    tile(t("rpKBelow"), k.belowReorder, "int", t("rpKCritical", { n: n(counts.critical) }), k.belowReorder > 0 ? "critical" : "ok"),
    k.daysOfInventory !== null
      ? tile(t("rpKDays"), k.daysOfInventory, "int", t("rpKTurnover", { n: n(k.turnover, 1) }))
      : k.medianCover !== null && tile(t("rpKMedianCover"), k.medianCover, "dec1", t("rpKMedianCoverHint")),
    k.hasCost
      ? tile(t("kpiTiedUp"), k.tiedUp, "money", t("rpKTiedUpShare", { pct: p(k.tiedUpShare) }), k.tiedUp > 0 ? "idle" : "ok")
      : tile(t("rpKNotMoving"), k.idleCount + k.excessCount, "int", t("rpKNotMovingHint", { idle: n(k.idleCount), excess: n(k.excessCount) }), "idle"),
    k.orderCost !== null
      ? tile(t("rpKOrder"), k.orderCost, "money", t("rpKOrderLines", { n: n(k.orderLines) }))
      : tile(t("rpKOrderUnits"), k.orderUnits, "int", t("rpKOrderLines", { n: n(k.orderLines) })),
    tile(t("rpKLate"), k.lateLines, "int", t("rpKLateHint"), k.lateLines > 0 ? "critical" : "ok"),
  ].filter(Boolean);

  // ---- how to read each chart of the dashboard ----
  const reading = {};

  reading.status = {
    title: k.belowReorder > 0 ? t("rpCStatusTitle", { below: n(k.belowReorder), total: n(k.skus) }) : t("rpCStatusTitleOk"),
    points: [
      t("rpCStatusOk", { ok: n(counts.ok), pct: p(k.skus > 0 ? counts.ok / k.skus : 0) }),
      k.belowReorder > 0 && t("rpCStatusBelow", { below: n(k.belowReorder), pct: p(k.belowShare), critical: n(counts.critical), low: n(counts.low) }),
      t("rpCStatusNotMoving", { idle: n(counts.idle), excess: n(counts.excess), ratio: EXCESS_RATIO }),
    ].filter(Boolean),
    action: t(counts.critical > 0 ? "rpCStatusActCritical" : k.belowReorder > 0 ? "rpCStatusActLow" : "rpCStatusActOk"),
  };

  const byUnits = [...warehouses].sort((a, b) => b.units - a.units);
  const mostBelow = [...warehouses].sort((a, b) => b.critical + b.low - (a.critical + a.low))[0];
  if (warehouses.length > 0) {
    const top = byUnits[0];
    const unitShare = (row) => (k.units > 0 ? row.units / k.units : 0);
    reading.warehouse =
      warehouses.length === 1
        ? { title: t("rpCWhTitleOne", { name: top.name }), points: [t("rpCWhOne", { units: n(top.units), skus: n(top.skus) })], action: t("rpCWhActOne") }
        : {
            title: t("rpCWhTitle", { name: top.name, pct: p(unitShare(top)) }),
            points: [
              t("rpCWhList", { list: byUnits.slice(0, 4).map((row) => `${row.name} ${n(row.units)} (${p(unitShare(row))})`).join("; ") }),
              k.belowReorder > 0 && t("rpCWhBelow", { name: mostBelow.name, n: n(mostBelow.critical + mostBelow.low), total: n(k.belowReorder) }),
              k.hasCost && t("rpCWhValue", { name: warehouses[0].name, amount: money(warehouses[0].value), pct: p(warehouses[0].share) }),
            ].filter(Boolean),
            action:
              transfers.rows.length > 0
                ? t("rpCWhActTransfer", { n: n(transfers.rows.length) })
                : k.belowReorder > 0
                  ? t("rpCWhActBelow", { name: mostBelow.name })
                  : t("rpCWhActOk"),
          };
  }

  if (charts.cover.length > 0) {
    const first = charts.cover[0];
    const last = charts.cover[charts.cover.length - 1];
    const late = charts.cover.filter((d) => {
      const lead = toNumber(d.item.lead_time_days);
      return lead !== null && d.days < lead;
    }).length;
    const zero = charts.cover.filter((d) => d.days <= 0).length;
    reading.cover = {
      // "the lowest" only when the chart leaves products out
      title:
        first.days === last.days
          ? t("rpCCoverTitleOne", { days: n(first.days, 1) })
          : t(charts.coverTotal > charts.cover.length ? "rpCCoverTitle" : "rpCCoverTitleAll", { min: n(first.days, 1), max: n(last.days, 1) }),
      points: [
        t("rpCCoverLowest", { product: productName(first.item), days: n(first.days, 1) }),
        late > 0 && t("rpCCoverLate", { late: n(late), n: n(charts.cover.length) }),
        zero > 0 && t("rpCCoverZero", { n: n(zero) }),
        k.medianCover !== null && t("rpCCoverMedian", { days: n(k.medianCover, 1) }),
      ].filter(Boolean),
      action: t(late > 0 ? "rpCCoverActLate" : "rpCCoverAct"),
    };
  }

  if (k.hasCost && charts.tiedUp.length > 0) {
    const first = charts.tiedUp[0];
    const shown = charts.tiedUp.reduce((sum, d) => sum + d.value, 0);
    reading.tiedUp = {
      title: t("rpCTiedTitle", { amount: money(k.tiedUp), pct: p(k.tiedUpShare) }),
      points: [
        t("rpCTiedShown", { n: n(charts.tiedUp.length), amount: money(shown), pct: p(k.tiedUp > 0 ? Math.min(1, shown / k.tiedUp) : 0) }),
        t("rpCTiedTop", { product: productName(first.item), amount: money(first.value) }),
        [k.idleValue > 0 && t("rpCTiedIdle", { n: n(k.idleCount), amount: money(k.idleValue) }), k.excessValue > 0 && t("rpCTiedExcess", { n: n(k.excessCount), amount: money(k.excessValue) })]
          .filter(Boolean)
          .join(" "),
      ],
      action: t(k.idleValue > 0 && k.excessValue > 0 ? "rpCTiedActBoth" : k.idleValue > 0 ? "rpCTiedActIdle" : "rpCTiedActExcess"),
    };
  }

  // ---- ABC: how it was done, and what class C is costing ----
  const classC = abc.rows[2];
  const abcMethod = abc.basis === null ? null : t(abc.basis === "value" ? "rpMAbcValue" : "rpMAbcUnits", { a: p(ABC_A_SHARE), b: p(ABC_B_SHARE) });
  const abcClassC =
    abc.basis !== null && k.hasCost && classC.stockValue > 0
      ? t("rpAbcC", { amount: money(classC.stockValue), pct: p(classC.stockValue / k.inventoryValue), share: p(classC.share) })
      : null;

  // ---- how it was worked out ----
  const method = [
    t("rpMStatus", { ratio: EXCESS_RATIO }),
    importInfo.demandFrom === "sales" && t("rpMUsage", { days: n(importInfo.periodDays) }),
    importInfo.reorderComputed && t("rpMReorder", { factor: n(SAFETY_FACTOR, 2), pct: n((SAFETY_FACTOR - 1) * 100) }),
    importInfo.defaultLeadUsed && t("rpMLead", { days: n(importInfo.defaultLead) }),
    t("ordersRule", { days: n(orders.coverDays) }),
    orders.usesMinimum && t("ordersRuleMinimum"),
    t("rpMPriority"),
    abcMethod,
    k.availability !== null && t("rpMAvailability"),
    k.daysOfInventory !== null && t("rpMTurnover"),
    k.hasCost && t("tiedUpNote", { ratio: EXCESS_RATIO }),
    transfers.rows.length > 0 && t("rpMTransfers", { days: n(orders.coverDays) }),
  ].filter(Boolean);

  // ---- what the file left out ----
  const dataNotes = [
    importInfo.skippedNoStock > 0 && t("reportSkippedNoStock", { n: n(importInfo.skippedNoStock) }),
    importInfo.negatives > 0 && t("reportNegatives", { n: n(importInfo.negatives) }),
    importInfo.truncated && t("reportTruncated", { max: n(importInfo.maxRows) }),
    k.noCost > 0 && t("rpDNoCost", { n: n(k.noCost) }),
    !k.hasCost && t("rpDNoCostAtAll"),
  ].filter(Boolean);

  return { findings, actions, tiles, reading, charts, abcMethod, abcClassC, method, dataNotes };
}
