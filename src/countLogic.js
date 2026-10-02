// Cycle count reports: reading the export and working out what it says.
//
// The input is the spreadsheet an inventory analyst downloads from SAP, a WMS or a reporting
// tool. Three shapes are common, and all work:
//
//   coverage     Locations (or products) with the date they were last counted, nothing else.
//   detail       Every counted line: date, location, product, system quantity, counted quantity,
//                value of the difference, reason, who counted. Lines with no difference included.
//   adjustments  Only the lines that had a difference.
//
// Everything here is plain arithmetic and runs in the browser. Nothing is sent anywhere.

import { normalizeHeader, parseNumber, isBlank } from "./importLogic";

export const COUNT_FIELDS = [
  "count_date",
  "posted_date",
  "warehouse",
  "location",
  "sku",
  "name",
  "book_qty",
  "counted_qty",
  "diff_units",
  "book_value",
  "counted_value",
  "diff_value",
  "batch",
  "reason",
  "counter",
  "category",
];

// Exact header names (already normalized), most trusted first
const EXACT = {
  count_date: [
    "count date", "counted date", "date counted", "fecha conteo", "fecha de conteo", "fecha contado",
    "last count date", "last counted", "last count", "fecha ultimo conteo", "fecha de ultimo conteo", "ultimo conteo",
    "last inventory", "date of last inventory", "last inventory date", "inventory date", "fecha ultimo inventario",
    "fecha de ultimo inventario", "ultimo inventario", "fecha inventario", "fecha de inventario",
    "create date", "created date", "creation date", "fecha creacion", "fecha de creacion", "fecha", "date",
  ],
  posted_date: [
    "posted date", "posting date", "fecha contabilizacion", "fecha de contabilizacion", "fecha registro",
    "fecha de registro", "fecha posteo",
  ],
  warehouse: ["whse", "warehouse", "bodega", "almacen", "wh", "warehouse number", "numero de almacen", "storage type", "tipo de almacen", "tipo almacen"],
  location: ["location", "ubicacion", "bin", "storage bin", "bin location", "posicion", "locacion", "bin code"],
  sku: ["item code", "sku", "codigo", "code", "material", "item", "item no", "codigo producto", "codigo de producto", "product code", "articulo"],
  name: [
    "description", "descripcion", "product name", "nombre producto", "nombre del producto", "producto", "product",
    "item description", "item name", "material description", "texto breve de material", "texto breve",
  ],
  book_qty: [
    "current stock", "book qty", "book quantity", "system qty", "system quantity", "stock sistema", "cantidad sistema",
    "cantidad en sistema", "cantidad teorica", "teorico", "stock teorico", "on hand", "stock",
  ],
  counted_qty: [
    "counted stock", "counted qty", "counted quantity", "count qty", "cantidad contada", "stock contado", "conteo", "contado",
    "stock fisico", "fisico", "cantidad fisica", "count", "counted",
  ],
  diff_units: [
    "unit difference", "difference", "diferencia", "variance", "dif", "diferencia unidades", "diferencia en unidades",
    "qty difference", "quantity difference", "variance qty",
  ],
  book_value: ["current value", "book value", "valor sistema", "valor en sistema", "valor teorico", "system value"],
  counted_value: ["counted value", "valor contado", "valor fisico"],
  diff_value: [
    "cost difference", "value difference", "diferencia valor", "diferencia costo", "variance value", "diferencia en valor",
    "monto diferencia", "cost variance", "valor diferencia",
  ],
  batch: ["batch", "lote", "lot", "batch number", "lot number"],
  reason: ["reason", "motivo", "causa", "reason code", "causa raiz", "root cause"],
  counter: ["counter", "counted by", "contador", "usuario", "user", "responsable", "operador", "contado por"],
  category: ["category", "categoria", "item group", "grupo", "familia", "brand", "marca"],
};

// Dates that are about something other than the count
const OTHER_DATE = /(exp|venc|caduc|post|contabiliz|deliver|entrega|\bmfg\b|fabric|elabor|\bmov|recei|recep|ship|despach|modif|chang|updat|actualiz|\bdue\b|plan|program|next|prox)/;
// Columns that mention the count without being a quantity: its number, document, status, user
const NOT_A_QUANTITY = /(date|fecha|\bby\b|\bpor\b|value|valor|ultim|last|\bno\b|\bnum|\bnro\b|status|estado|doc|usuario|\buser\b|\bid\b|type|tipo|reason|motivo)/;

// Looser matching, most specific first: [field, must match, must not match]
const LOOSE = [
  ["posted_date", /(posted|posting|contabiliz).*(date|fecha)|(date|fecha).*(posted|posting|contabiliz)/, null],
  ["count_date", /(date|fecha).*(\bcount|conteo|contad|invent|cicl|cycle)|(\bcount|conteo|contad|invent|cicl|cycle).*(date|fecha)/, OTHER_DATE],
  ["count_date", /(date|fecha)/, OTHER_DATE],
  ["diff_value", /(cost|value|valor|costo|monto|amount).*(diff|dif|varia)|(diff|dif|varia).*(cost|value|valor|costo|monto|amount)/, null],
  ["diff_units", /(diff|diferencia|varia)/, /(cost|value|valor|costo|monto|amount)/],
  ["counted_value", /(\bcount|contad|fisic).*(value|valor)|(value|valor).*(\bcount|contad|fisic)/, null],
  ["book_value", /(value|valor)/, /(diff|dif|varia|\bcount|contad|fisic)/],
  ["counted_qty", /(\bcount|contad|fisic|conteo)/, NOT_A_QUANTITY],
  ["book_qty", /(stock|book|system|sistema|teoric|on hand|current)/, /(value|valor|date|fecha|\bcount|contad|type|tipo|status|estado)/],
  ["location", /(location|ubicac|\bbin\b|posicion|locac)/, null],
  ["warehouse", /(whse|warehouse|bodega|almacen)/, null],
  ["batch", /(batch|lote|\blot\b)/, null],
  ["reason", /(reason|motivo|causa)/, null],
  ["counter", /(counted by|contado por|counter|contador|usuario|\buser\b|responsable|operador)/, null],
  ["category", /(category|categoria|group|grupo|familia|brand|marca)/, null],
  ["sku", /(sku|item code|codigo|\bcode\b|material|articulo)/, /(desc|name|nombre|texto|group|grupo|reason|motivo)/],
  ["name", /(description|descripcion|product|producto)/, null],
];

// "% Dif" and "Diferencia $" lose their sign when a header is normalized; keep what it meant
function countHeader(value) {
  return normalizeHeader(String(value ?? "").replace(/%/g, " pct ").replace(/[$€£]/g, " valor "));
}
const IS_PERCENT = /\b(pct|percent|percentage|porcentaje|porcentual)\b/;

export function guessCountMapping(headers) {
  const normalized = headers.map(countHeader);
  const mapping = {};
  COUNT_FIELDS.forEach((f) => {
    mapping[f] = null;
  });
  const taken = new Set();
  normalized.forEach((h, i) => {
    if (IS_PERCENT.test(h)) taken.add(i); // a percentage is never a quantity or a value
  });
  const take = (field, idx) => {
    if (idx >= 0) {
      mapping[field] = idx;
      taken.add(idx);
    }
  };

  COUNT_FIELDS.forEach((field) => {
    for (let i = 0; i < EXACT[field].length && mapping[field] === null; i += 1) {
      const wanted = EXACT[field][i];
      take(field, normalized.findIndex((h, at) => !taken.has(at) && h === wanted));
    }
  });
  LOOSE.forEach(([field, include, exclude]) => {
    if (mapping[field] !== null) return;
    take(field, normalized.findIndex((h, i) => !taken.has(i) && h && include.test(h) && !(exclude && exclude.test(h))));
  });

  // A bare "Name" column is the product when nothing else names it; otherwise it is who counted.
  const bare = normalized.findIndex((h, i) => !taken.has(i) && (h === "name" || h === "nombre"));
  if (bare >= 0) {
    if (mapping.name === null) take("name", bare);
    else if (mapping.counter === null) take("counter", bare);
  }
  return mapping;
}

// Problems that block the import (empty = ready)
export function validateCountMapping(mapping) {
  const problems = [];
  if (mapping.count_date === null) problems.push("needCountDate");
  if (mapping.location === null && mapping.sku === null) problems.push("needLocationOrSku");
  return problems;
}

export const DAY = 86400000;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const SLASH_DATE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/;
// First three letters of month names, English and Spanish ("set" is how Peru and Chile often write September)
const MONTHS = { jan: 1, ene: 1, feb: 2, mar: 3, apr: 4, abr: 4, may: 5, jun: 6, jul: 7, aug: 8, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dec: 12, dic: 12 };

function utc(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1990 && y <= 2100)) return null;
  const ms = Date.UTC(y, m - 1, d);
  return new Date(ms).getUTCDate() === d ? ms : null;
}

const fullYear = (text) => (Number(text) < 100 ? 2000 + Number(text) : Number(text));

// order: "dmy" or "mdy", used only for dates written like 03/04/2026
export function parseDateValue(value, order = "dmy") {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }
  if (typeof value === "number") {
    // Excel stores dates as days since 1899-12-30
    if (value > 20000 && value < 80000) return EXCEL_EPOCH + Math.floor(value) * DAY;
    if (value >= 19900101 && value <= 21001231 && Number.isInteger(value)) return parseDateValue(String(value), order);
    return null;
  }
  const s = String(value).trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(s); // 20260304, as SAP writes it
  if (m) return utc(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return utc(Number(m[1]), Number(m[2]), Number(m[3]));
  m = SLASH_DATE.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = fullYear(m[3]);
    const first = order === "mdy" ? utc(y, a, b) : utc(y, b, a);
    return first !== null ? first : order === "mdy" ? utc(y, b, a) : utc(y, a, b);
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) return parseDateValue(Number(s), order); // a serial number kept as text

  // 3-abr-2026, 15 ago 2026, 3 de abril de 2026, Apr 3, 2026
  const plain = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  m = /^(\d{1,2})[\s\-/.]*(?:de\s+)?([a-z]{3,10})\.?[\s\-/.,]*(?:de\s+)?(\d{2,4})\b/.exec(plain);
  if (m && MONTHS[m[2].slice(0, 3)]) return utc(fullYear(m[3]), MONTHS[m[2].slice(0, 3)], Number(m[1]));
  m = /^([a-z]{3,10})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/.exec(plain);
  if (m && MONTHS[m[1].slice(0, 3)]) return utc(Number(m[3]), MONTHS[m[1].slice(0, 3)], Number(m[2]));
  return null;
}

// How systems write "no date": blank, 0, 00.00.0000, 00000000, a dash
function isEmptyDate(value) {
  if (isBlank(value)) return true;
  if (value === 0) return true;
  return typeof value === "string" && /^[0\s./\-–—]+$/.test(value.trim());
}

// Looks at a column of dates written like 03/04/2026 and works out which part is the day.
// order is null when every date could be read both ways; written says whether any date is in that style.
export function dateOrderInfo(values) {
  let order = null;
  let written = false;
  for (let i = 0; i < values.length && order === null; i += 1) {
    const m = typeof values[i] === "string" ? SLASH_DATE.exec(values[i].trim()) : null;
    if (m) {
      written = true;
      if (Number(m[1]) > 12) order = "dmy";
      else if (Number(m[2]) > 12) order = "mdy";
    }
  }
  return { order, written };
}

export function isoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// A cell with a quantity or an amount. Accounting formats write zero as a dash.
function amount(value) {
  if (typeof value === "string" && /^[-–—]$/.test(value.trim())) return 0;
  return parseNumber(value);
}

// Totals and footers under the table are not locations
const NOT_A_CODE = /^(total|totales|subtotal|grand total|suma|sum|count|cuenta)\b/i;
const looksLikeCode = (text) => !text.includes(":") && text.split(/\s+/).length <= 2 && !NOT_A_CODE.test(text);

// table: { headers, rows } -> { lines, undated, report }
// options:
//   dateOrder  "dmy" | "mdy", used when the file itself does not settle it
//   maxDate    dates after this are a typing mistake, not a count (pass tomorrow)
//   maxRows    stop after this many lines
export function buildCountLines(table, mapping, options = {}) {
  const has = (field) => mapping[field] !== null && mapping[field] !== undefined;
  const at = (row, field) => (has(field) ? row[mapping[field]] : undefined);
  const text = (value) => (isBlank(value) ? "" : String(value).trim());
  const headerText = table.headers.map(normalizeHeader);
  const mappedColumns = COUNT_FIELDS.map((f) => mapping[f]).filter((i) => i !== null && i !== undefined);
  const maxRows = options.maxRows || Infinity;
  const maxDate = options.maxDate ?? Infinity;

  const info = dateOrderInfo(table.rows.map((row) => at(row, "count_date")));
  const order = info.order || options.dateOrder || "dmy";
  const lines = [];
  const undated = []; // locations (or products) in the file with no count date: never counted
  const report = { read: 0, skippedHeaders: 0, skippedBadDate: 0, truncated: false };
  const blankUnits = []; // lines whose difference cell was left empty
  const blankValue = [];

  for (let r = 0; r < table.rows.length; r += 1) {
    const row = table.rows[r];
    // reports pasted together block after block repeat the header row inside the data
    const repeats = mappedColumns.filter((i) => !isBlank(row[i]) && normalizeHeader(row[i]) === headerText[i]).length;
    if (repeats >= 2) {
      report.skippedHeaders += 1;
      continue;
    }
    const location = text(at(row, "location"));
    const sku = text(at(row, "sku"));
    if (!location && !sku) continue; // totals, notes and blank filler

    const warehouse = text(at(row, "warehouse"));
    const rawDate = at(row, "count_date");
    const date = parseDateValue(rawDate, order);
    if (date === null || date > maxDate) {
      if (isEmptyDate(rawDate)) {
        if (looksLikeCode(location || sku)) undated.push({ warehouse, location: location || sku });
      } else {
        report.skippedBadDate += 1;
      }
      continue;
    }
    if (lines.length >= maxRows) {
      report.truncated = true;
      break;
    }

    // The difference: as written, else worked out from the two quantities
    const book = amount(at(row, "book_qty"));
    const counted = amount(at(row, "counted_qty"));
    let diffUnits = amount(at(row, "diff_units"));
    if (diffUnits === null && book !== null && counted !== null) diffUnits = counted - book;
    if (diffUnits === null && has("diff_units") && isBlank(at(row, "diff_units"))) blankUnits.push(lines.length);

    const bookValue = amount(at(row, "book_value"));
    const countedValue = amount(at(row, "counted_value"));
    let diffValue = amount(at(row, "diff_value"));
    if (diffValue === null && bookValue !== null && countedValue !== null) diffValue = countedValue - bookValue;
    if (diffValue === null && has("diff_value") && isBlank(at(row, "diff_value"))) blankValue.push(lines.length);

    lines.push({
      date,
      posted: parseDateValue(at(row, "posted_date"), order),
      warehouse,
      location,
      sku,
      name: text(at(row, "name")).slice(0, 120),
      book,
      counted,
      diffUnits,
      bookValue,
      diffValue,
      batch: text(at(row, "batch")),
      reason: text(at(row, "reason")).slice(0, 60),
      counter: text(at(row, "counter")).slice(0, 60),
      category: text(at(row, "category")).slice(0, 60),
    });
    report.read += 1;
  }

  // Some reports leave the difference empty when there is none. That reading is only safe when
  // the column is in use: a sheet of counts still to be done has it empty on every line.
  if (lines.some((l) => l.diffUnits !== null)) {
    blankUnits.forEach((i) => {
      lines[i].diffUnits = 0;
    });
  }
  if (lines.some((l) => l.diffValue !== null)) {
    blankValue.forEach((i) => {
      lines[i].diffValue = 0;
    });
  }

  return { lines, undated, report };
}

// "10BR-A08A1" -> "10BR-A", "12-ADJ02" -> "12-ADJ", "A-03-2" -> "A", "B0412" -> "B":
// the aisle or area a location sits in.
export function zoneOf(location) {
  const parts = String(location || "").trim().split(/[-_./ ]+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length > 1) {
    const letters = /^[A-Za-z]+/.exec(parts[1]);
    return letters ? `${parts[0]}-${letters[0]}` : parts[0];
  }
  const code = parts[0];
  const letters = /^[A-Za-z]+/.exec(code);
  if (letters && letters[0].length < code.length) return letters[0];
  if (/^\d{4,}$/.test(code)) return code.slice(0, 2);
  return code;
}

function mondayOf(ms) {
  const day = new Date(ms).getUTCDay(); // 0 = Sunday
  return ms - ((day + 6) % 7) * DAY;
}

function previousMonth(month) {
  const [year, number] = month.split("-").map(Number);
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, "0")}`;
}

function bump(map, key, init) {
  let entry = map.get(key);
  if (!entry) {
    entry = init();
    map.set(key, entry);
  }
  return entry;
}

const ratio = (a, b) => (b > 0 ? a / b : null);
// a whole number typed by the analyst, or null
const typed = (value) => (Number(value) >= 1 ? Math.floor(Number(value)) : null);
const oneDecimal = (value) => Math.round(value * 10) / 10;

export const CYCLE_OPTIONS = [30, 60, 90, 180, 365];
// Days since the last count, in bands that line up with the cycle options
const AGE_BANDS = [
  { key: "d30", from: 0, to: 30 },
  { key: "d60", from: 31, to: 60 },
  { key: "d90", from: 61, to: 90 },
  { key: "d180", from: 91, to: 180 },
  { key: "d365", from: 181, to: 365 },
  { key: "older", from: 366, to: Infinity },
];
// A file where fewer than this share of the lines match the system is a list of adjustments,
// not a record of everything counted
const ADJUSTMENTS_BELOW = 0.25;
const WEEK = 7 * DAY;

// lines -> everything the report shows.
// options:
//   undated          locations with no count date (from buildCountLines)
//   totalLocations   how many locations the warehouse has (typed by the analyst)
//   countedLocations how many locations were counted in the period (only needed for adjustment reports)
//   cycleDays        every location should be counted at least this often
//   asOf             "today" for the days-since-last-count figures; defaults to the last date in the file
export function analyzeCounts(lines, options = {}) {
  const hasValue = lines.some((l) => l.diffValue !== null);
  const hasLocations = lines.some((l) => l.location);
  const locKey = (l) => `${l.warehouse}|${l.location || l.sku}`;
  // the difference on a line: in units when the file has them, else in value; null = not measured
  const delta = (l) => (l.diffUnits !== null ? l.diffUnits : l.diffValue);

  let from = Infinity;
  let to = -Infinity;
  const days = new Set();
  const locations = new Map();
  const skus = new Map();
  const events = new Map(); // location + date
  const months = new Map();
  const weeks = new Map();
  const reasons = new Map();
  const zones = new Map();
  const counters = new Map();
  const lots = new Map(); // product + location + date -> lines with a difference

  const totals = {
    measured: 0,
    exact: 0,
    surplusValue: 0,
    shortageValue: 0,
    surplusUnits: 0,
    shortageUnits: 0,
    bookValue: 0,
    unposted: 0,
    lagSum: 0,
    lagCount: 0,
    offNoReason: 0,
  };
  const grow = () => ({ lines: 0, measured: 0, exact: 0, surplus: 0, shortage: 0, surplusUnits: 0, shortageUnits: 0 });

  lines.forEach((l) => {
    from = Math.min(from, l.date);
    to = Math.max(to, l.date);
    days.add(l.date);
    const d = delta(l);
    const measured = d !== null;
    const off = measured && d !== 0;
    // units and value count only on lines that are off, so every table adds up to the same totals
    const du = off ? l.diffUnits ?? 0 : 0;
    const dv = off ? l.diffValue ?? 0 : 0;

    if (measured) {
      totals.measured += 1;
      if (!off) totals.exact += 1;
    }
    if (du > 0) totals.surplusUnits += du;
    else totals.shortageUnits += du;
    if (dv > 0) totals.surplusValue += dv;
    else totals.shortageValue += dv;
    if (l.bookValue !== null) totals.bookValue += Math.abs(l.bookValue);
    if (l.posted === null) totals.unposted += 1;
    else {
      totals.lagSum += Math.max(0, (l.posted - l.date) / DAY);
      totals.lagCount += 1;
    }
    if (off && !l.reason) totals.offNoReason += 1;

    const key = locKey(l);
    const zoneName = zoneOf(l.location);
    const loc = bump(locations, key, () => ({
      warehouse: l.warehouse, location: l.location || l.sku, zone: zoneName, last: l.date, diffDates: new Set(), absValue: 0, absUnits: 0,
    }));
    loc.last = Math.max(loc.last, l.date);
    if (off) {
      loc.diffDates.add(l.date);
      loc.absValue += Math.abs(dv);
      loc.absUnits += Math.abs(du);
    }

    const event = bump(events, `${key}|${l.date}`, () => ({ date: l.date, measured: 0, off: 0 }));
    if (measured) event.measured += 1;
    if (off) event.off += 1;

    if (l.sku) {
      const sku = bump(skus, l.sku, () => ({ sku: l.sku, name: l.name, lines: 0, netUnits: 0, absUnits: 0, netValue: 0, absValue: 0 }));
      if (!sku.name && l.name) sku.name = l.name;
      if (off) {
        sku.lines += 1;
        sku.netUnits += du;
        sku.absUnits += Math.abs(du);
        sku.netValue += dv;
        sku.absValue += Math.abs(dv);
      }
    }

    [bump(months, isoDate(l.date).slice(0, 7), grow), bump(weeks, mondayOf(l.date), grow)].forEach((bucket) => {
      bucket.lines += 1;
      if (measured) {
        bucket.measured += 1;
        if (!off) bucket.exact += 1;
      }
      if (du > 0) bucket.surplusUnits += du;
      else bucket.shortageUnits += du;
      if (dv > 0) bucket.surplus += dv;
      else bucket.shortage += dv;
    });

    if (off) {
      const reason = bump(reasons, l.reason, () => ({ reason: l.reason, lines: 0, absValue: 0, netValue: 0, absUnits: 0 }));
      reason.lines += 1;
      reason.absValue += Math.abs(dv);
      reason.netValue += dv;
      reason.absUnits += Math.abs(du);
    }

    if (l.location) {
      const zone = bump(zones, zoneName, () => ({ zone: zoneName, lines: 0, measured: 0, exact: 0, off: 0, absValue: 0, absUnits: 0 }));
      zone.lines += 1;
      if (measured) {
        zone.measured += 1;
        if (off) zone.off += 1;
        else zone.exact += 1;
      }
      zone.absValue += Math.abs(dv);
      zone.absUnits += Math.abs(du);
    }

    if (l.counter) {
      const counter = bump(counters, l.counter, () => ({ counter: l.counter, lines: 0, off: 0, locations: new Set(), days: new Set() }));
      counter.lines += 1;
      if (off) counter.off += 1;
      counter.locations.add(key);
      counter.days.add(l.date);
    }

    if (off && l.sku && l.batch && l.diffUnits !== null) {
      bump(lots, `${l.sku}|${key}|${l.date}`, () => ({ sku: l.sku, name: l.name, location: l.location, date: l.date, lines: [] })).lines.push(l);
    }
  });

  // Same product, same location, same day, one lot up and a different lot down: usually stock
  // recorded under the wrong lot, not stock that is missing.
  const lotSwaps = [];
  lots.forEach((group) => {
    const plus = group.lines.filter((l) => l.diffUnits > 0);
    const minus = group.lines.filter((l) => l.diffUnits < 0);
    const lotsUp = new Set(plus.map((l) => l.batch));
    if (plus.length === 0 || !minus.some((l) => !lotsUp.has(l.batch))) return;
    lotSwaps.push({
      sku: group.sku,
      name: group.name,
      location: group.location,
      date: group.date,
      plusUnits: plus.reduce((sum, l) => sum + l.diffUnits, 0),
      minusUnits: minus.reduce((sum, l) => sum + l.diffUnits, 0),
      netUnits: group.lines.reduce((sum, l) => sum + l.diffUnits, 0),
      apparentValue: group.lines.reduce((sum, l) => sum + Math.abs(l.diffValue ?? 0), 0),
      netValue: group.lines.reduce((sum, l) => sum + (l.diffValue ?? 0), 0),
    });
  });
  lotSwaps.sort((a, b) => b.apparentValue - a.apparentValue || b.plusUnits - a.plusUnits);

  let eventsMeasured = 0;
  let eventsOff = 0;
  events.forEach((event) => {
    if (event.measured > 0) {
      eventsMeasured += 1;
      if (event.off > 0) eventsOff += 1;
    }
  });

  // What kind of file this is
  const off = totals.measured - totals.exact;
  let mode = "coverage"; // locations and dates only
  if (totals.measured > 0) mode = totals.exact / totals.measured < ADJUSTMENTS_BELOW ? "adjustments" : "detail";

  const absValue = totals.surplusValue - totals.shortageValue;
  const netValue = totals.surplusValue + totals.shortageValue;
  const rank = hasValue ? "absValue" : "absUnits";

  const topSkus = [...skus.values()].filter((s) => s.lines > 0).sort((a, b) => b[rank] - a[rank] || b.lines - a.lines);
  const top5 = topSkus.slice(0, 5).reduce((sum, s) => sum + s[rank], 0);
  const allSkus = topSkus.reduce((sum, s) => sum + s[rank], 0);

  const reasonList = [...reasons.values()].sort((a, b) => (hasValue ? b.absValue - a.absValue : 0) || b.lines - a.lines);
  const reasonTotal = reasonList.reduce((sum, r) => sum + (hasValue ? r.absValue : r.lines), 0);

  // only meaningful when the file has locations: without them these would be products
  const repeatLocations = hasLocations
    ? [...locations.values()]
        .filter((loc) => loc.diffDates.size >= 2)
        .map((loc) => ({ warehouse: loc.warehouse, location: loc.location, times: loc.diffDates.size, absValue: loc.absValue, absUnits: loc.absUnits }))
        .sort((a, b) => b.times - a.times || b[rank] - a[rank])
    : [];

  // Every week of the period, including the ones with no counts
  const weekLocations = new Map();
  events.forEach((event) => {
    const week = mondayOf(event.date);
    weekLocations.set(week, (weekLocations.get(week) || 0) + 1);
  });
  const firstWeek = lines.length ? mondayOf(from) : 0;
  const lastWeek = lines.length ? mondayOf(to) : 0;
  const span = lines.length ? Math.round((lastWeek - firstWeek) / WEEK) + 1 : 0;
  const weekStarts = span <= 106 ? Array.from({ length: span }, (unused, i) => firstWeek + i * WEEK) : [...weeks.keys()].sort((a, b) => a - b);
  const weekList = weekStarts.map((week) => {
    const w = weeks.get(week) || grow();
    return { week, ...w, locations: weekLocations.get(week) || 0, accuracy: ratio(w.exact, w.measured) };
  });
  // pace: the last four calendar weeks of the period (fewer when the period is shorter)
  const paceWeeks = Math.min(4, span);
  let recentLocations = 0;
  weekLocations.forEach((count, week) => {
    if (week > lastWeek - paceWeeks * WEEK) recentLocations += count;
  });
  const perWeek = paceWeeks > 0 ? recentLocations / paceWeeks : 0;

  // What the analyst typed. A number smaller than what the file itself shows is a mistake.
  const neverKeys = new Map();
  (options.undated || []).forEach((u) => {
    const key = `${u.warehouse}|${u.location}`;
    if (!locations.has(key)) neverKeys.set(key, { warehouse: u.warehouse, location: u.location, zone: zoneOf(u.location) });
  });
  const inFile = locations.size + neverKeys.size;
  const totalFloor = mode === "coverage" ? inFile : locations.size;
  const totalTyped = typed(options.totalLocations);
  const countedTyped = typed(options.countedLocations);
  const totalTooSmall = totalTyped !== null && totalTyped < totalFloor;
  const countedTooSmall = countedTyped !== null && countedTyped < eventsOff;
  const typedTotal = totalTooSmall ? null : totalTyped;
  const countedLocations = mode === "adjustments" && hasLocations && !countedTooSmall ? countedTyped : null;

  // Accuracy by location. An adjustment report only lists what was off, so it needs the number counted.
  let locationAccuracy = null;
  if (hasLocations && mode === "detail") locationAccuracy = ratio(eventsMeasured - eventsOff, eventsMeasured);
  else if (countedLocations) locationAccuracy = 1 - eventsOff / countedLocations;

  // Coverage: how much of the warehouse has been counted
  const asOf = lines.length ? Math.max(options.asOf ?? to, to) : null;
  const cycleDays = typed(options.cycleDays) || 90;

  // How long since each location was last counted, oldest first. An adjustment report cannot
  // say: it only has the dates on which something was corrected.
  const lastCounted =
    mode === "adjustments"
      ? []
      : [...locations.values()]
          .map((loc) => {
            const daysSince = Math.round((asOf - loc.last) / DAY);
            return { warehouse: loc.warehouse, location: loc.location, zone: loc.zone, last: loc.last, daysSince, overdue: mode === "coverage" ? daysSince > cycleDays : null };
          })
          .sort((a, b) => a.last - b.last);
  let coverage = null;
  let totalLocations = null;
  let aging = null;
  if (mode === "coverage") {
    // The file is the list of locations with their last count, so it is its own denominator
    totalLocations = Math.max(typedTotal || 0, inFile);
    const never = totalLocations - locations.size;
    const bands = AGE_BANDS.map((band) => ({ key: band.key, from: band.from, to: band.to, locations: 0, overdue: band.from > cycleDays }));
    const zoneAging = new Map();
    const zoneFor = (name) => bump(zoneAging, name, () => ({ zone: name, locations: 0, overdue: 0, never: 0, oldest: 0 }));
    let onTime = 0;
    let recent = 0;
    locations.forEach((loc) => {
      const age = Math.round((asOf - loc.last) / DAY);
      bands.find((band) => age <= band.to).locations += 1;
      const late = age > cycleDays;
      if (!late) onTime += 1;
      if (age < 28) recent += 1;
      const zone = zoneFor(loc.zone);
      zone.locations += 1;
      if (late) zone.overdue += 1;
      zone.oldest = Math.max(zone.oldest, age);
    });
    neverKeys.forEach((u) => {
      const zone = zoneFor(u.zone);
      zone.locations += 1;
      zone.overdue += 1;
      zone.never += 1;
    });
    coverage = ratio(onTime, totalLocations);
    aging = {
      asOf,
      cycleDays,
      bands,
      never,
      neverList: [...neverKeys.values()],
      onTime,
      overdue: totalLocations - onTime,
      compliance: coverage,
      perWeek: recent / 4,
      needed: totalLocations / (cycleDays / 7),
      oldest: lastCounted,
      zones: hasLocations
        ? [...zoneAging.values()]
            .map((z) => ({ ...z, compliance: ratio(z.locations - z.overdue, z.locations) }))
            .sort((a, b) => a.compliance - b.compliance || b.overdue - a.overdue)
        : [],
    };
  } else if (hasLocations && typedTotal) {
    totalLocations = typedTotal;
    const counted = mode === "adjustments" ? countedLocations : locations.size;
    coverage = counted ? Math.min(1, counted / typedTotal) : null;
  }

  const zoneList = [...zones.values()].map((z) => ({ ...z, accuracy: ratio(z.exact, z.measured), share: ratio(z.off, off) }));
  if (mode === "detail") zoneList.sort((a, b) => (a.accuracy ?? 2) - (b.accuracy ?? 2) || b.off - a.off);
  else zoneList.sort((a, b) => b.off - a.off || b[rank] - a[rank]);

  return {
    mode,
    hasValue,
    hasLocations,
    hasReasons: reasonList.some((r) => r.reason),
    hasCounters: counters.size > 0,
    period: { from: lines.length ? from : null, to: lines.length ? to : null, days: days.size },
    lines: lines.length,
    measured: totals.measured,
    exact: totals.exact,
    off,
    lineAccuracy: mode === "detail" ? ratio(totals.exact, totals.measured) : null,
    locationAccuracy,
    events: events.size,
    eventsOff,
    countedLocations,
    locationsCounted: locations.size,
    skusCounted: skus.size,
    surplusValue: totals.surplusValue,
    shortageValue: totals.shortageValue,
    netValue,
    absValue,
    surplusUnits: totals.surplusUnits,
    shortageUnits: totals.shortageUnits,
    netUnits: totals.surplusUnits + totals.shortageUnits,
    absUnits: totals.surplusUnits - totals.shortageUnits,
    bookValue: totals.bookValue,
    // against the value of everything counted, which an adjustment report does not have
    absPct: mode === "detail" ? ratio(absValue, totals.bookValue) : null,
    months: [...months.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([month, m]) => ({ month, ...m, accuracy: ratio(m.exact, m.measured) })),
    weeks: weekList,
    reasons: reasonList.map((r) => ({ ...r, share: ratio(hasValue ? r.absValue : r.lines, reasonTotal) })),
    noReasonShare: ratio(totals.offNoReason, off),
    zones: zoneList,
    topSkus,
    top5Share: ratio(top5, allSkus),
    repeatLocations,
    lotSwaps,
    lotApparent: lotSwaps.reduce((sum, g) => sum + g.apparentValue, 0),
    lotNet: lotSwaps.reduce((sum, g) => sum + g.netValue, 0),
    lotUnits: lotSwaps.reduce((sum, g) => sum + Math.min(g.plusUnits, -g.minusUnits), 0),
    counters: [...counters.values()]
      .map((c) => ({ counter: c.counter, lines: c.lines, off: c.off, locations: c.locations.size, days: c.days.size }))
      .sort((a, b) => b.lines - a.lines),
    coverage,
    asOf,
    lastCounted,
    // locations of the warehouse that the file does not mention at all
    notInFile: mode === "detail" && hasLocations && typedTotal ? typedTotal - locations.size : null,
    totalLocations,
    totalFloor,
    totalTooSmall,
    countedTooSmall,
    perWeek,
    weeksForFullRound: mode === "detail" && hasLocations && typedTotal && perWeek > 0 ? typedTotal / perWeek : null,
    postingLag: totals.lagCount > 0 ? totals.lagSum / totals.lagCount : null,
    unposted: totals.lagCount > 0 ? totals.unposted : 0,
    aging,
  };
}

// The findings, in the order a manager would ask for them. Each one is a list of sentences,
// { key, vars }, that the screen translates and formats: no wording lives here.
// Keys ending in P are the same sentence for a file counted by product, with no locations.
export function conclusions(a) {
  const out = [];
  if (a.lines === 0) return out;
  const say = (...parts) => out.push(parts.filter(Boolean));
  const noun = (key) => (a.hasLocations ? key : `${key}P`);

  if (a.mode === "coverage") {
    const g = a.aging;
    say({ key: noun("ccaTotal"), vars: { total: a.totalLocations, pct: g.compliance, cycle: g.cycleDays } });
    if (g.overdue > 0) {
      say({ key: noun("ccaOverdue"), vars: { n: g.overdue, cycle: g.cycleDays } }, g.never > 0 && { key: noun("ccaNever"), vars: { n: g.never } });
    } else {
      say({ key: noun("ccaNoOverdue"), vars: { cycle: g.cycleDays } });
    }
    if (g.oldest.length > 0 && g.oldest[0].daysSince > 0) {
      say({ key: "ccaOldest", vars: { location: g.oldest[0].location, days: g.oldest[0].daysSince } });
    }
    const lateZone = g.zones.find((z) => z.locations >= 3 && z.overdue > 0);
    if (g.zones.length > 1 && lateZone && lateZone.compliance < g.compliance) {
      say({ key: "ccaZone", vars: { zone: lateZone.zone, n: lateZone.overdue, total: lateZone.locations } });
    }
    // compared as they are shown, so the sentence never contradicts its own numbers
    const gap = oneDecimal(g.needed) - oneDecimal(g.perWeek);
    say(
      { key: noun("ccaPace"), vars: { cycle: g.cycleDays, needed: g.needed, perWeek: g.perWeek } },
      gap > 0 ? { key: "ccaPaceShort", vars: { gap } } : { key: "ccaPaceOk", vars: {} }
    );
    return out;
  }

  if (a.mode === "detail") {
    say(
      { key: "ccAccuracy", vars: { pct: a.lineAccuracy, exact: a.exact, lines: a.measured } },
      a.locationAccuracy !== null && { key: "ccAccuracyLoc", vars: { pct: a.locationAccuracy } }
    );
  } else if (a.locationAccuracy !== null) {
    say({ key: "ccAccuracyTyped", vars: { pct: a.locationAccuracy, counted: a.countedLocations, off: a.eventsOff } });
  } else {
    say({ key: noun("ccAdjustments"), vars: { off: a.off, lines: a.measured } });
  }

  if (a.hasValue && a.absValue > 0) {
    let net = { key: "ccValueNetZero", vars: {} };
    if (a.netValue < 0) net = { key: "ccValueNetShort", vars: { net: -a.netValue } };
    else if (a.netValue > 0) net = { key: "ccValueNetSurplus", vars: { net: a.netValue } };
    say({ key: "ccValueAbs", vars: { abs: a.absValue } }, a.absPct !== null && { key: "ccValuePct", vars: { pct: a.absPct } }, net);
  } else if (a.absUnits > 0) {
    say({ key: "ccUnits", vars: { abs: a.absUnits, surplus: a.surplusUnits, shortage: Math.abs(a.shortageUnits) } });
  }

  if (a.lotSwaps.length > 0) {
    say(
      { key: "ccLots", vars: { n: a.lotSwaps.length } },
      a.hasValue && a.lotApparent > 0
        ? { key: "ccLotsValue", vars: { apparent: a.lotApparent, net: Math.abs(a.lotNet) } }
        : { key: "ccLotsUnits", vars: { units: a.lotUnits } }
    );
  }
  if (a.topSkus.length > 5 && a.top5Share !== null && a.top5Share >= 0.3) {
    say({ key: "ccTop5", vars: { pct: a.top5Share, first: a.topSkus[0].name || a.topSkus[0].sku } });
  }
  const named = a.reasons.filter((r) => r.reason);
  if (named.length > 1 && named[0].share !== null) {
    say({ key: a.hasValue ? "ccReasonValue" : "ccReasonLines", vars: { reason: named[0].reason, pct: named[0].share } });
  }
  if (a.hasReasons && a.noReasonShare !== null && a.noReasonShare >= 0.1) {
    say({ key: "ccNoReason", vars: { pct: a.noReasonShare } });
  }
  if (a.zones.length > 1) {
    if (a.mode === "detail") {
      const weak = a.zones.find((z) => z.measured >= 5 && z.accuracy !== null);
      if (weak && weak.accuracy < a.lineAccuracy) say({ key: "ccZone", vars: { zone: weak.zone, pct: weak.accuracy, lines: weak.measured } });
    } else if (a.zones[0].share !== null && a.zones[0].share >= 0.25) {
      say({ key: "ccZoneShare", vars: { zone: a.zones[0].zone, pct: a.zones[0].share } });
    }
  }
  if (a.repeatLocations.length > 0) {
    say({ key: "ccRepeat", vars: { n: a.repeatLocations.length, location: a.repeatLocations[0].location, times: a.repeatLocations[0].times } });
  }
  if (a.mode === "detail") {
    if (a.coverage !== null) {
      say(
        { key: "ccCoverage", vars: { n: a.locationsCounted, total: a.totalLocations, pct: a.coverage } },
        a.weeksForFullRound !== null && { key: "ccRound", vars: { perWeek: a.perWeek, weeks: a.weeksForFullRound } }
      );
    } else if (a.hasLocations && a.perWeek > 0) {
      say({ key: "ccPace", vars: { n: a.locationsCounted, perWeek: a.perWeek } });
    }
    if (a.hasLocations && a.lastCounted.length > 1 && a.lastCounted[0].daysSince >= 30) {
      say({ key: "ccOldestInFile", vars: { location: a.lastCounted[0].location, days: a.lastCounted[0].daysSince, date: a.asOf } });
    }
    // only against the month right before: a gap in between is not a trend
    const months = a.months.filter((m) => m.accuracy !== null);
    const last = months[months.length - 1];
    const previous = months[months.length - 2];
    if (previous && previous.month === previousMonth(last.month) && Math.abs(last.accuracy - previous.accuracy) >= 0.005) {
      say({ key: last.accuracy > previous.accuracy ? "ccTrendUp" : "ccTrendDown", vars: { month: last.month, pct: last.accuracy, previous: previous.accuracy } });
    }
  }
  if (a.postingLag !== null && (a.postingLag >= 1 || a.unposted > 0)) {
    say(a.postingLag >= 1 && { key: "ccLag", vars: { days: a.postingLag } }, a.unposted > 0 && { key: "ccUnposted", vars: { n: a.unposted } });
  }
  return out;
}
