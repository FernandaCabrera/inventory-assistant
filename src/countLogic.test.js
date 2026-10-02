import { extractTable, pickSheet } from "./importLogic";
import {
  guessCountMapping,
  validateCountMapping,
  parseDateValue,
  dateOrderInfo,
  buildCountLines,
  zoneOf,
  analyzeCounts,
  conclusions,
  isoDate,
} from "./countLogic";
import { sampleCountGrid, SAMPLE_COUNT_TOTAL_LOCATIONS } from "./data/sampleCounts";

const TEMPLATE = [
  "Create Date", "Posted Date", "Whse", "Location", "Item Code", "Description", "Current Stock", "Counted Stock", "Unit Difference",
  "Batch", "Exp Date", "Current Value", "Counted Value", "Cost Difference", "Reason", "Reason2", "Name", "Item Group", "Brand", "Type",
  "Category", "Month",
];

const day = (text) => Date.parse(`${text}T00:00:00Z`);
const keys = (list) => list.flat().map((part) => part.key);

function read(grid, options) {
  const table = extractTable(grid, guessCountMapping, 40);
  const mapping = guessCountMapping(table.headers);
  return { table, mapping, ...buildCountLines(table, mapping, options) };
}

describe("recognizing the columns", () => {
  test("the adjustment template", () => {
    const m = guessCountMapping(TEMPLATE);
    const name = (field) => (m[field] === null ? null : TEMPLATE[m[field]]);
    expect(name("count_date")).toBe("Create Date");
    expect(name("posted_date")).toBe("Posted Date");
    expect(name("warehouse")).toBe("Whse");
    expect(name("location")).toBe("Location");
    expect(name("sku")).toBe("Item Code");
    expect(name("name")).toBe("Description");
    expect(name("book_qty")).toBe("Current Stock");
    expect(name("counted_qty")).toBe("Counted Stock");
    expect(name("diff_units")).toBe("Unit Difference");
    expect(name("book_value")).toBe("Current Value");
    expect(name("counted_value")).toBe("Counted Value");
    expect(name("diff_value")).toBe("Cost Difference");
    expect(name("batch")).toBe("Batch");
    expect(name("reason")).toBe("Reason");
    expect(name("counter")).toBe("Name"); // the product is in Description, so Name is who counted
    expect(name("category")).toBe("Category");
    expect(validateCountMapping(m)).toEqual([]);
  });

  test("a plain export with locations and the last count date, in Spanish", () => {
    const headers = ["Ubicación", "Tipo de almacén", "Fecha de último inventario", "Material", "Texto breve de material"];
    const m = guessCountMapping(headers);
    expect(m.location).toBe(0);
    expect(m.count_date).toBe(2);
    expect(m.sku).toBe(3);
    expect(m.name).toBe(4);
    expect(m.diff_units).toBeNull();
    expect(validateCountMapping(m)).toEqual([]);
  });

  test("an expiry date is never taken for the count date", () => {
    const m = guessCountMapping(["Bin", "Fecha de vencimiento", "Stock"]);
    expect(m.count_date).toBeNull();
    expect(validateCountMapping(m)).toEqual(["needCountDate"]);
  });

  test("a lone Name column is the product", () => {
    const m = guessCountMapping(["Date", "Location", "Name", "Variance"]);
    expect(m.name).toBe(2);
    expect(m.counter).toBeNull();
  });
});

describe("dates", () => {
  test("every way a spreadsheet writes them", () => {
    expect(isoDate(parseDateValue(46115))).toBe("2026-04-03"); // Excel serial
    expect(isoDate(parseDateValue("2026-04-03 10:15:00"))).toBe("2026-04-03");
    expect(isoDate(parseDateValue("03/04/2026"))).toBe("2026-04-03");
    expect(isoDate(parseDateValue("03/04/2026", "mdy"))).toBe("2026-03-04");
    expect(isoDate(parseDateValue("25/04/26", "mdy"))).toBe("2026-04-25"); // 25 cannot be a month
    expect(isoDate(parseDateValue("03.04.2026"))).toBe("2026-04-03");
    expect(isoDate(parseDateValue("20260403"))).toBe("2026-04-03");
    expect(isoDate(parseDateValue(20260403))).toBe("2026-04-03");
    expect(isoDate(parseDateValue("Apr 3, 2026"))).toBe("2026-04-03");
    expect(parseDateValue("")).toBeNull();
    expect(parseDateValue("pending")).toBeNull();
    expect(parseDateValue(12)).toBeNull();
  });

  test("the file itself usually says which part is the day", () => {
    expect(dateOrderInfo(["03/04/2026", "13/04/2026"])).toEqual({ order: "dmy", written: true });
    expect(dateOrderInfo(["03/04/2026", "04/13/2026"])).toEqual({ order: "mdy", written: true });
    expect(dateOrderInfo(["03/04/2026", "05/06/2026"])).toEqual({ order: null, written: true });
    expect(dateOrderInfo([46115, "2026-04-03"])).toEqual({ order: null, written: false });
  });
});

test("zones come from the location code", () => {
  expect(zoneOf("10BR-A08A1")).toBe("10BR-A");
  expect(zoneOf("12-ADJ02")).toBe("12-ADJ");
  expect(zoneOf("A-03-2")).toBe("A");
  expect(zoneOf("B0412")).toBe("B");
  expect(zoneOf("010203")).toBe("01");
  expect(zoneOf("")).toBe("");
});

// Shaped like the template: notes and a small reference table above, the header repeated between blocks.
const GRID = [
  ["Cycle count report"],
  ["Total locations", 40],
  ["Name", "Code", "Reason"],
  ["Ana", "CC", "Cycle Count"],
  [],
  TEMPLATE,
  ["2026-03-02", "2026-03-03", "W1", "10-A01A1", "P1", "Widget", 10, 10, 0, "L1", "", 100, 100, 0, "", "", "Ana", "", "", "", "Parts", "Mar"],
  ["2026-03-02", "2026-03-03", "W1", "10-A01A2", "P2", "Gadget", 20, 18, -2, "L1", "", 400, 360, -40, "Damaged", "", "Ana", "", "", "", "Parts", "Mar"],
  ["2026-03-02", "2026-03-04", "W1", "10-B02A1", "P3", "Gizmo", 50, 62, 12, "L7", "", 250, 310, 60, "Lot Fix", "", "Ben", "", "", "", "Parts", "Mar"],
  ["2026-03-02", "2026-03-04", "W1", "10-B02A1", "P3", "Gizmo", 30, 18, -12, "L8", "", 150, 90, -60, "Lot Fix", "", "Ben", "", "", "", "Parts", "Mar"],
  TEMPLATE,
  ["2026-03-09", "", "W1", "10-A01A2", "P2", "Gadget", 18, 17, "", "L1", "", 360, 340, "", "Damaged", "", "Ana", "", "", "", "Parts", "Mar"],
  ["2026-03-09", "2026-03-10", "W1", "10-A01A3", "P1", "Widget", 5, 5, 0, "L2", "", 50, 50, 0, "", "", "Ana", "", "", "", "Parts", "Mar"],
  ["", "", "", "", "", "Total", 133, 130, -3],
];

describe("a detailed count report", () => {
  const { lines, report, mapping } = read(GRID);
  const a = analyzeCounts(lines);

  test("finds the table under the notes and skips the repeated header", () => {
    expect(mapping.count_date).toBe(0);
    expect(lines).toHaveLength(6);
    expect(report.skippedHeaders).toBe(1);
    expect(lines[4].diffUnits).toBe(-1); // worked out from system and counted quantities
    expect(lines[4].diffValue).toBe(-20);
    expect(lines[4].posted).toBeNull();
  });

  test("accuracy by line and by location", () => {
    expect(a.mode).toBe("detail");
    expect(a.measured).toBe(6);
    expect(a.exact).toBe(2);
    expect(a.lineAccuracy).toBeCloseTo(2 / 6);
    expect(a.events).toBe(5); // B02A1 was counted once, with two lots
    expect(a.locationAccuracy).toBeCloseTo(2 / 5);
    expect(a.locationsCounted).toBe(4);
  });

  test("value of the differences", () => {
    expect(a.surplusValue).toBe(60);
    expect(a.shortageValue).toBe(-120);
    expect(a.netValue).toBe(-60);
    expect(a.absValue).toBe(180);
    expect(a.absPct).toBeCloseTo(180 / 1310);
  });

  test("a lot going up and another going down in the same place is flagged as a lot mix-up", () => {
    expect(a.lotSwaps).toHaveLength(1);
    expect(a.lotSwaps[0]).toMatchObject({ sku: "P3", location: "10-B02A1", plusUnits: 12, minusUnits: -12, netUnits: 0, apparentValue: 120, netValue: 0 });
  });

  test("locations that are wrong on more than one date", () => {
    expect(a.repeatLocations).toEqual([{ warehouse: "W1", location: "10-A01A2", times: 2, absValue: 60, absUnits: 3 }]);
  });

  test("reasons, zones, people and posting delay", () => {
    expect(a.reasons.map((r) => [r.reason, r.lines])).toEqual([["Lot Fix", 2], ["Damaged", 2]]);
    expect(a.zones.map((z) => z.zone).sort()).toEqual(["10-A", "10-B"]);
    expect(a.counters).toEqual([
      { counter: "Ana", lines: 4, off: 2, locations: 3, days: 2 },
      { counter: "Ben", lines: 2, off: 2, locations: 1, days: 1 },
    ]);
    expect(a.postingLag).toBeCloseTo(7 / 5);
    expect(a.unposted).toBe(1);
  });

  test("coverage needs the number of locations in the warehouse", () => {
    expect(a.coverage).toBeNull();
    const withTotal = analyzeCounts(lines, { totalLocations: 40 });
    expect(withTotal.coverage).toBeCloseTo(0.1);
    expect(withTotal.weeksForFullRound).toBeCloseTo(40 / 2.5);
  });

  test("conclusions", () => {
    expect(keys(conclusions(a))).toEqual([
      "ccAccuracy", "ccAccuracyLoc", "ccValueAbs", "ccValuePct", "ccValueNetShort", "ccLots", "ccLotsValue", "ccReasonValue",
      "ccRepeat", "ccPace", "ccLag", "ccUnposted",
    ]);
  });
  test("how long since each location was counted, oldest first", () => {
    expect(a.lastCounted.map((l) => [l.location, l.daysSince])).toEqual([["10-A01A1", 7], ["10-B02A1", 7], ["10-A01A2", 0], ["10-A01A3", 0]]);
    expect(a.notInFile).toBeNull();

    const later = analyzeCounts(lines, { asOf: day("2026-04-08"), totalLocations: 40 });
    expect(later.lastCounted[0]).toEqual({ warehouse: "W1", location: "10-A01A1", zone: "10-A", last: day("2026-03-02"), daysSince: 37, overdue: false });
    expect(later.lastCounted[3].daysSince).toBe(30);
    expect(later.notInFile).toBe(36);
    const said = conclusions(later).flat().find((part) => part.key === "ccOldestInFile");
    expect(said.vars).toEqual({ location: "10-A01A1", days: 37, date: day("2026-04-08") });
    expect(keys(conclusions(a))).not.toContain("ccOldestInFile"); // a week is not worth a sentence
  });

  test("where to count: the locations in the file against the cycle, by area", () => {
    const monthly = analyzeCounts(lines, { asOf: day("2026-04-08"), cycleDays: 30 });
    expect(monthly.lastCounted.map((l) => l.overdue)).toEqual([true, true, false, false]); // 37 days, 37, 30, 30
    expect(monthly.cycle).toMatchObject({ days: 30, locations: 4, overdue: 2, compliance: 0.5 });
    expect(monthly.cycle.zones).toEqual([
      { zone: "10-B", locations: 1, overdue: 1, never: 0, oldest: 37, compliance: 0 },
      { zone: "10-A", locations: 3, overdue: 1, never: 0, oldest: 37, compliance: 2 / 3 },
    ]);
    expect(conclusions(monthly).flat().find((part) => part.key === "ccOverdueInFile").vars).toEqual({ n: 2, cycle: 30 });

    const quarterly = analyzeCounts(lines, { asOf: day("2026-04-08"), cycleDays: 90 });
    expect(quarterly.cycle.overdue).toBe(0);
    expect(keys(conclusions(quarterly))).not.toContain("ccOverdueInFile");
  });
});

describe("a report that lists only the adjustments", () => {
  const grid = [
    ["Fecha", "Ubicación", "Código", "Diferencia", "Motivo"],
    ["03/09/2026", "A-01-1", "X1", -4, "Merma"],
    ["03/09/2026", "A-02-1", "X2", 3, "Merma"],
    ["15/09/2026", "B-01-1", "X3", -1, ""],
    ["15/09/2026", "B-02-1", "X4", -6, "Robo"],
  ];
  const { lines } = read(grid);

  test("does not invent an accuracy of zero", () => {
    const a = analyzeCounts(lines);
    expect(a.mode).toBe("adjustments");
    expect(a.lineAccuracy).toBeNull();
    expect(a.locationAccuracy).toBeNull();
    expect(a.absUnits).toBe(14);
    expect(a.netUnits).toBe(-8);
    expect(keys(conclusions(a))).toEqual(["ccAdjustments", "ccUnits", "ccReasonLines", "ccNoReason", "ccZoneShare"]);
  });

  test("cannot say when a location was last counted", () => {
    const a = analyzeCounts(lines, { asOf: day("2026-12-01") });
    expect(a.lastCounted).toEqual([]);
    expect(a.cycle).toBeNull();
  });

  test("works out accuracy once the number of locations counted is typed in", () => {
    const a = analyzeCounts(lines, { countedLocations: 80 });
    expect(a.locationAccuracy).toBeCloseTo(0.95);
    expect(keys(conclusions(a))[0]).toBe("ccAccuracyTyped");
  });
});

describe("a list of locations with the date of their last count", () => {
  const grid = [
    ["Storage Bin", "Last inventory"],
    ["A-01-1", "2026-09-28"],
    ["A-01-2", "2026-09-10"],
    ["A-02-1", "2026-07-20"],
    ["B-01-1", "2026-03-01"],
    ["B-01-2", ""],
    ["B-02-1", ""],
    ["B-02-2", "2025-06-01"],
    ["B-03-1", "n/a"],
  ];
  const { lines, undated, report } = read(grid);
  const a = analyzeCounts(lines, { undated, cycleDays: 90, asOf: day("2026-10-01") });

  test("locations without a date count as never counted", () => {
    expect(lines).toHaveLength(5);
    expect(undated).toHaveLength(2);
    expect(report.skippedBadDate).toBe(1);
    expect(a.mode).toBe("coverage");
    expect(a.totalLocations).toBe(7);
    expect(a.aging.never).toBe(2);
  });

  test("how long since each location was counted", () => {
    expect(a.aging.bands.map((b) => [b.key, b.locations, b.overdue])).toEqual([
      ["d30", 2, false], ["d60", 0, false], ["d90", 1, false], ["d180", 0, true], ["d365", 1, true], ["older", 1, true],
    ]);
    expect(a.aging.onTime).toBe(3);
    expect(a.aging.overdue).toBe(4);
    expect(a.aging.compliance).toBeCloseTo(3 / 7);
    expect(a.aging.oldest[0]).toMatchObject({ location: "B-02-2", daysSince: 487, overdue: true });
    expect(a.lastCounted.map((l) => [l.location, l.daysSince, l.overdue])).toEqual([
      ["B-02-2", 487, true], ["B-01-1", 214, true], ["A-02-1", 73, false], ["A-01-2", 21, false], ["A-01-1", 3, false],
    ]);
  });

  test("the pace needed to keep the cycle", () => {
    expect(a.aging.perWeek).toBeCloseTo(0.5); // two locations in the last four weeks
    expect(a.aging.needed).toBeCloseTo(7 / (90 / 7));
    expect(a.aging.zones[0]).toMatchObject({ zone: "B", locations: 4, overdue: 4, never: 2 });
    expect(a.cycle).toMatchObject({ days: 90, locations: 7, overdue: 4 });
    expect(a.cycle.zones).toBe(a.aging.zones); // the same figures feed the chart, the table and the dashboard
  });

  test("locations the file does not list can be added by typing the total", () => {
    const wider = analyzeCounts(lines, { undated, cycleDays: 90, asOf: day("2026-10-01"), totalLocations: 10 });
    expect(wider.totalLocations).toBe(10);
    expect(wider.aging.never).toBe(5);
    expect(wider.aging.compliance).toBeCloseTo(0.3);
    const smaller = analyzeCounts(lines, { undated, cycleDays: 90, asOf: day("2026-10-01"), totalLocations: 3 });
    expect(smaller.totalLocations).toBe(7); // never fewer than the file shows
  });

  test("a shorter cycle moves the line", () => {
    const strict = analyzeCounts(lines, { undated, cycleDays: 30, asOf: day("2026-10-01") });
    expect(strict.aging.onTime).toBe(2);
    expect(strict.aging.bands.filter((b) => b.overdue).map((b) => b.key)).toEqual(["d60", "d90", "d180", "d365", "older"]);
  });

  test("conclusions", () => {
    expect(keys(conclusions(a))).toEqual(["ccaTotal", "ccaOverdue", "ccaNever", "ccaOldest", "ccaZone", "ccaPace", "ccaPaceOk"]);
    const strict = conclusions(analyzeCounts(lines, { undated, cycleDays: 30, asOf: day("2026-10-01") }));
    expect(strict.flat().find((part) => part.key === "ccaPaceShort").vars.gap).toBeCloseTo(1.1);
  });
});

describe("columns that only look like the right one", () => {
  const picked = (headers, field) => {
    const m = guessCountMapping(headers);
    return m[field] === null ? null : headers[m[field]];
  };

  test("the count date is preferred over any other date", () => {
    expect(picked(["Location", "Last Movement Date", "Last Cycle Count Date"], "count_date")).toBe("Last Cycle Count Date");
    expect(picked(["Ubicación", "Fecha últ. mov.", "Fecha últ. conteo"], "count_date")).toBe("Fecha últ. conteo");
    expect(picked(["Bin", "Create Date", "Count Date"], "count_date")).toBe("Count Date");
    expect(picked(["Bin", "Planned count date", "Receipt date"], "count_date")).toBeNull();
  });

  test("a count number, document or status is not the counted quantity", () => {
    const headers = ["Count No", "Count Date", "Bin", "Item", "System Qty", "Count Qty"];
    expect(picked(headers, "counted_qty")).toBe("Count Qty");
    expect(picked(["Documento conteo", "Fecha conteo", "Ubicación", "Cant. contada"], "counted_qty")).toBe("Cant. contada");
    expect(picked(["Bin", "Date", "G/L Account", "Count Status", "Usuario conteo"], "counted_qty")).toBeNull();
  });

  test("a percentage is not a quantity, and a column in money is a value", () => {
    expect(picked(["Fecha", "Ubicación", "% Dif", "Dif"], "diff_units")).toBe("Dif");
    expect(picked(["Date", "Bin", "Variance %", "Variance Qty"], "diff_units")).toBe("Variance Qty");
    const money = ["Fecha", "Ubicación", "Diferencia", "Diferencia $"];
    expect(picked(money, "diff_units")).toBe("Diferencia");
    expect(picked(money, "diff_value")).toBe("Diferencia $");
  });

  test("a row of report parameters above the header does not win over the header", () => {
    const table = extractTable([["Date", "02.10.2026", "User", "JPEREZ"], ["Storage Bin", "Last inventory"], ["A-01-1", "01.09.2026"]], guessCountMapping, 40, validateCountMapping);
    expect(table.headers.slice(0, 2)).toEqual(["Storage Bin", "Last inventory"]);
    expect(table.rows).toHaveLength(1);
  });
});

describe("how files really come", () => {
  test("negatives written the SAP way, and zero written as a dash", () => {
    const { lines } = read([
      ["Fecha", "Ubicación", "Código", "Diferencia", "Diferencia valor"],
      ["2026-08-03", "A-01-1", "X1", "3-", "1.500,00-"],
      ["2026-08-03", "A-01-2", "X2", "−4", "−2.000,00"],
      ["2026-08-03", "A-01-3", "X3", " - ", "-"],
      ["2026-08-03", "A-01-4", "X4", "", ""],
      ["2026-08-03", "A-01-5", "X5", 2, 800],
    ]);
    expect(lines.map((l) => l.diffUnits)).toEqual([-3, -4, 0, 0, 2]);
    expect(lines.map((l) => l.diffValue)).toEqual([-1500, -2000, 0, 0, 800]);
    const a = analyzeCounts(lines);
    expect(a.mode).toBe("detail"); // the dash and the empty cell are counted lines with no difference
    expect(a.lineAccuracy).toBeCloseTo(0.4);
    expect(a.netValue).toBe(-2700);
  });

  test("a difference column that is empty on every line is not read as a perfect count", () => {
    const { lines } = read([["Fecha conteo", "Ubicación", "Cantidad contada", "Diferencia"], ["2026-08-03", "A-01-1", "", ""], ["2026-08-04", "A-01-2", "", ""]]);
    expect(lines.map((l) => l.diffUnits)).toEqual([null, null]);
    expect(analyzeCounts(lines).mode).toBe("coverage");
  });

  test("the ways a system writes no date all mean never counted", () => {
    const { lines, undated, report } = read([
      ["Storage Bin", "Last inventory"],
      ["A-01-1", "01.09.2026"],
      ["A-01-2", "00.00.0000"],
      ["A-01-3", "00000000"],
      ["A-01-4", 0],
      ["A-01-5", "-"],
      ["Total ubicaciones: 5", ""],
      ["Generado por SAP el 02.10.2026", ""],
      ["Total", ""],
    ]);
    expect(lines).toHaveLength(1);
    expect(undated.map((u) => u.location)).toEqual(["A-01-2", "A-01-3", "A-01-4", "A-01-5"]);
    expect(report.skippedBadDate).toBe(0);
    const a = analyzeCounts(lines, { undated });
    expect(a.totalLocations).toBe(5);
    expect(a.aging.zones.map((z) => z.zone)).toEqual(["A"]);
  });

  test("dates in words, in Spanish and English, and text that is not a date", () => {
    const iso = (text) => { const ms = parseDateValue(text); return ms === null ? null : isoDate(ms); };
    expect(iso("03-abr-2026")).toBe("2026-04-03");
    expect(iso("15 ago 2026")).toBe("2026-08-15");
    expect(iso("3-ene-26")).toBe("2026-01-03");
    expect(iso("1 dic 2026")).toBe("2026-12-01");
    expect(iso("03-set-2026")).toBe("2026-09-03");
    expect(iso("3 de abril de 2026")).toBe("2026-04-03");
    expect(iso("April 3rd, 2026")).toBe("2026-04-03");
    expect(iso("A-1")).toBeNull();
    expect(iso("Rack 5")).toBeNull();
    expect(iso("ver nota 3")).toBeNull();
    expect(iso("abril 2026")).toBeNull();
  });

  test("a date in the future is a typing mistake, not a count", () => {
    const grid = [["Bin", "Last inventory"], ["A-01-1", "2026-09-28"], ["A-01-2", "2062-09-28"]];
    const table = extractTable(grid, guessCountMapping, 40, validateCountMapping);
    const { lines, report } = buildCountLines(table, guessCountMapping(table.headers), { maxDate: day("2026-10-03") });
    expect(lines).toHaveLength(1);
    expect(report.skippedBadDate).toBe(1);
  });
});

describe("figures that must not mislead", () => {
  const line = (over) => ({ date: day("2026-03-02"), posted: null, warehouse: "", location: "A-01-1", sku: "X", name: "", book: null, counted: null, diffUnits: 0, bookValue: null, diffValue: null, batch: "", reason: "", counter: "", category: "", ...over });

  test("weeks with no counts still count as weeks", () => {
    const lines = [];
    for (let i = 0; i < 10; i += 1) lines.push(line({ date: day("2026-01-05"), location: `A-01-${i}` }));
    for (let i = 0; i < 10; i += 1) lines.push(line({ date: day("2026-06-01"), location: `B-01-${i}` }));
    const a = analyzeCounts(lines, { totalLocations: 200 });
    expect(a.perWeek).toBeCloseTo(2.5); // ten locations over the last four weeks
    expect(a.weeks).toHaveLength(22);
    expect(a.weeks.filter((w) => w.locations === 0)).toHaveLength(20);
    expect(a.weeksForFullRound).toBeCloseTo(80);
  });

  test("a trend is only against the month right before", () => {
    const months = (second) => [
      line({ date: day("2026-01-05") }), line({ date: day("2026-01-06"), diffUnits: -1 }),
      line({ date: day(second), location: "A-02-1" }), line({ date: day(second), location: "A-02-2" }),
    ];
    expect(keys(conclusions(analyzeCounts(months("2026-06-01"))))).not.toContain("ccTrendUp");
    expect(keys(conclusions(analyzeCounts(months("2026-02-02"))))).toContain("ccTrendUp");
  });

  test("a lot mix-up needs two different lots", () => {
    const pair = (lotA, lotB) => analyzeCounts([line({ diffUnits: -5, batch: lotA }), line({ diffUnits: 5, batch: lotB }), line({ location: "A-02-1" }), line({ location: "A-03-1" })]);
    expect(pair("", "").lotSwaps).toHaveLength(0);
    expect(pair("L1", "L1").lotSwaps).toHaveLength(0);
    expect(pair("L1", "L2").lotSwaps).toHaveLength(1);
  });

  test("an adjustment report with a stray zero line is still an adjustment report", () => {
    const lines = [line({ diffUnits: -3, bookValue: 1000, diffValue: -300 }), line({ diffUnits: 1, bookValue: 500, diffValue: 100, location: "A-02-1" }), line({ diffUnits: -2, location: "A-03-1" }), line({ diffUnits: 4, location: "A-04-1" }), line({ location: "A-05-1" })];
    const a = analyzeCounts(lines);
    expect(a.mode).toBe("adjustments");
    expect(a.lineAccuracy).toBeNull();
    expect(a.absPct).toBeNull(); // the file does not hold the value of everything counted
    const found = conclusions(a);
    expect(found[0][0]).toEqual({ key: "ccAdjustments", vars: { off: 4, lines: 5 } });
    expect(keys(found)).not.toContain("ccValuePct");
  });

  test("value on a line whose units match is not a count difference", () => {
    const a = analyzeCounts([line({ diffUnits: 0, diffValue: 50 }), line({ diffUnits: 0, diffValue: -20, location: "A-02-1" }), line({ diffUnits: 1, diffValue: 10, location: "A-03-1" })]);
    expect(a.absValue).toBe(10);
    expect(a.topSkus.reduce((sum, s) => sum + s.absValue, 0)).toBe(10);
    expect(a.zones.reduce((sum, z) => sum + z.absValue, 0)).toBe(10);
  });

  test("no minus sign on a zero", () => {
    const a = analyzeCounts([line({ diffUnits: 3 }), line({ location: "A-02-1" }), line({ location: "A-03-1" })]);
    const units = conclusions(a).flat().find((part) => part.key === "ccUnits");
    expect(Object.is(units.vars.shortage, 0)).toBe(true);
  });

  test("the pace sentence agrees with the numbers it shows", () => {
    const lines = [line({ date: day("2026-09-20"), diffUnits: null }), line({ date: day("2026-09-25"), location: "A-02-1", diffUnits: null })];
    const a = analyzeCounts(lines, { cycleDays: 90, asOf: day("2026-10-01"), totalLocations: 7 });
    expect(a.aging.needed).toBeCloseTo(0.544, 2);
    expect(a.aging.perWeek).toBe(0.5);
    expect(keys(conclusions(a))).toContain("ccaPaceOk");
  });

  test("a file counted by product says products, not locations", () => {
    const { lines, undated } = read([["Material", "Last count date"], ["M1", "2026-09-01"], ["M2", "2026-01-01"], ["M3", ""], ["M4", ""]]);
    expect(undated.map((u) => u.location)).toEqual(["M3", "M4"]);
    const a = analyzeCounts(lines, { undated, cycleDays: 90, asOf: day("2026-10-01") });
    expect(a.hasLocations).toBe(false);
    expect(a.totalLocations).toBe(4);
    expect(a.aging.zones).toEqual([]);
    expect(keys(conclusions(a))).toEqual(["ccaTotalP", "ccaOverdueP", "ccaNeverP", "ccaOldest", "ccaPaceP", "ccaPaceShort"]);

    const byProduct = analyzeCounts([line({ location: "", diffUnits: -5 }), line({ location: "", diffUnits: 2, date: day("2026-03-09") }), line({ location: "", sku: "Y" }), line({ location: "", sku: "Z" })], { totalLocations: 480 });
    expect(byProduct.repeatLocations).toEqual([]);
    expect(byProduct.coverage).toBeNull();
    expect(byProduct.locationAccuracy).toBeNull();
    expect(keys(conclusions(byProduct))).toEqual(["ccAccuracy", "ccUnits"]);
  });

  test("numbers typed by the analyst are whole, and never below what the file shows", () => {
    const counted = [line({}), line({ location: "A-02-1" }), line({ location: "A-03-1", diffUnits: -1 })];
    expect(analyzeCounts(counted, { totalLocations: "10.9" }).totalLocations).toBe(10);
    const low = analyzeCounts(counted, { totalLocations: 2 });
    expect([low.totalTooSmall, low.totalFloor, low.coverage, low.weeksForFullRound]).toEqual([true, 3, null, null]);

    const adjusted = [line({ diffUnits: -1 }), line({ diffUnits: 2, location: "A-02-1" }), line({ diffUnits: -3, location: "A-03-1" })];
    const few = analyzeCounts(adjusted, { countedLocations: 2, totalLocations: 100 });
    expect([few.countedTooSmall, few.locationAccuracy, few.coverage]).toEqual([true, null, null]);
    const fine = analyzeCounts(adjusted, { countedLocations: "30.7", totalLocations: 100 });
    expect([fine.countedLocations, fine.locationAccuracy, fine.coverage]).toEqual([30, 0.9, 0.3]);
    ["0", "-5", "abc", ""].forEach((bad) => expect(analyzeCounts(counted, { totalLocations: bad }).totalLocations).toBeNull());
  });
});

describe("the example report", () => {
  ["es", "en"].forEach((lang) => {
    test(`reads cleanly through the same steps as an uploaded file (${lang})`, () => {
      const picked = pickSheet([{ name: "x", grid: sampleCountGrid(lang) }], { guess: guessCountMapping, validate: validateCountMapping, scanRows: 40 });
      const candidate = picked.candidates[picked.bestIndex];
      expect(candidate.ready).toBe(true);
      expect(Object.values(candidate.mapping).filter((v) => v === null)).toHaveLength(0);

      const { lines, report } = buildCountLines(candidate.table, candidate.mapping);
      expect(report.skippedBadDate).toBe(0);
      const a = analyzeCounts(lines, { totalLocations: SAMPLE_COUNT_TOTAL_LOCATIONS });
      expect(a.mode).toBe("detail");
      expect(a.lines).toBeGreaterThan(350);
      expect(a.lineAccuracy).toBeGreaterThan(0.88);
      expect(a.lineAccuracy).toBeLessThan(0.97);
      expect(a.lotSwaps.length).toBeGreaterThanOrEqual(3);
      expect(a.repeatLocations.length).toBeGreaterThanOrEqual(3);
      expect(a.months.map((m) => m.month)).toEqual(["2026-06", "2026-07", "2026-08"]);
      expect(a.coverage).toBeGreaterThan(0.5);
      expect(a.zones[0].zone).toBe("D");
      expect(keys(conclusions(a))).toEqual(
        expect.arrayContaining(["ccAccuracy", "ccValueAbs", "ccLots", "ccTop5", "ccReasonValue", "ccZone", "ccRepeat", "ccCoverage", "ccRound", "ccLag"])
      );
    });
  });

  test("is the same every time", () => {
    expect(sampleCountGrid("es")).toEqual(sampleCountGrid("es"));
  });
});
