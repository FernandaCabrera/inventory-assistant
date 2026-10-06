// Pure logic for turning a spreadsheet (as a grid of cells) into inventory items.
// No file or browser APIs here, so it can be unit-tested.

import { SAFETY_FACTOR, MAX_ROWS } from "./config";

export const FIELDS = [
  "sku",
  "name",
  "warehouse",
  "stock",
  "sales",
  "avg_daily_usage",
  "reorder_point",
  "lead_time_days",
  "unit_cost",
  "on_order",
];

// lowercase, no accents, punctuation -> spaces
export function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Exact header names (already normalized), Spanish and English
const EXACT = {
  sku: ["sku", "codigo", "code", "cod", "item code", "codigo producto", "codigo de producto", "product code", "id"],
  name: [
    "nombre", "producto", "descripcion", "name", "product", "description", "item", "articulo",
    "item name", "product name", "nombre producto", "nombre del producto",
  ],
  warehouse: ["bodega", "almacen", "sucursal", "warehouse", "location", "ubicacion"],
  stock: [
    "stock", "existencias", "existencia", "cantidad", "saldo", "qty", "quantity", "on hand",
    "stock actual", "current stock", "disponible",
  ],
  sales: ["ventas", "vendido", "vendidos", "sales", "units sold", "unidades vendidas", "sold"],
  avg_daily_usage: ["avg daily usage", "consumo diario", "venta diaria", "daily usage", "daily sales"],
  reorder_point: ["reorder point", "punto de reorden", "punto de pedido", "stock minimo", "minimo", "min stock"],
  lead_time_days: ["lead time", "lead time days", "dias de reposicion", "tiempo de reposicion"],
  unit_cost: ["costo", "costo unitario", "cost", "unit cost"],
  on_order: ["on order", "open po qty", "open po", "in transit", "en transito", "por recibir", "unidades pedidas"],
};

// Looser matching, checked in this order: specific fields first so that
// "stock minimo" is the reorder point and "unidades vendidas" is sales, not stock.
const LOOSE = [
  ["avg_daily_usage", /(diari|daily|por dia|per day)/, null],
  [
    "on_order",
    // units already ordered from the supplier and not yet received
    /(open po|on order|in transit|en transito|por recibir|por llegar|pendiente de (recibir|recepcion)|oc (abierta|pendiente)|pedidos? pendientes?|qty ordered|unidades pedidas|ya pedid)/,
    /(date|fecha|value|valor|cost|costo)/,
  ],
  [
    "reorder_point",
    /(reorden|reorder|punto de (pedido|reposicion)|\bmin(imo|imum)?\b)/,
    // a minimum ORDER quantity is not a minimum stock
    /(order qty|order quantity|\bmoq\b|pedido minimo|compra minima|min(imo|imum)? (order|purchase|compra|pedido)|reorder (qty|quantity))/,
  ],
  ["lead_time_days", /(lead|reposicion|entrega|plazo|delivery)/, null],
  [
    "sales",
    /(vend|venta|sales|sold|salida|consumo|demand)/,
    // money, and the columns of a sales record (who sold, when, which document), are not units sold
    /(precio|price|monto|amount|valor|revenue|ingreso|neto|bruto|vendedor|vendor|seller|salesperson|sales (rep|person|order|channel)|fecha|date|canal|punto de venta|\b(orden|nota|numero|n|tipo|documento) de venta)/,
  ],
  ["unit_cost", /(costo|cost|precio (de )?(compra|costo)|purchase price)/, /total/],
  ["warehouse", /(bodega|almacen|sucursal|warehouse|location|ubicacion|tienda|store)/, null],
  ["sku", /(sku|codigo|code|\bcod\b|\bid\b|referencia|\bref\b|part number|barcode)/, null],
  ["name", /(nombre|descripcion|producto|name|description|product|articulo|item|detalle|glosa)/, null],
  [
    "stock",
    /(stock|existencia|saldo|cantidad|qty|quantity|on hand|disponible|inventario|unidades|units|available)/,
    // safety stock, stock value, target stock, order quantities... are not the stock on hand
    /(safety|seguridad|value|valor|target|objetivo|\bmin|\bmax|order|pedido|\bpo\b|\boc\b|stockout|quiebre|status|estado|date|fecha|days|dias)/,
  ],
];

// headers: array of strings -> { field: columnIndex | null }
export function guessMapping(headers) {
  const normalized = headers.map(normalizeHeader);
  const mapping = {};
  FIELDS.forEach((f) => {
    mapping[f] = null;
  });
  const taken = new Set();

  FIELDS.forEach((field) => {
    const idx = normalized.findIndex((h, i) => !taken.has(i) && EXACT[field].includes(h));
    if (idx >= 0) {
      mapping[field] = idx;
      taken.add(idx);
    }
  });

  LOOSE.forEach(([field, include, exclude]) => {
    if (mapping[field] !== null) return;
    const idx = normalized.findIndex(
      (h, i) => !taken.has(i) && h && include.test(h) && !(exclude && exclude.test(h))
    );
    if (idx >= 0) {
      mapping[field] = idx;
      taken.add(idx);
    }
  });

  return mapping;
}

// A currency mark in front of an amount ("$ 1.500", "USD 12", "S/ 30")
const CURRENCY = /^(?:[$€£]|us\$|u\$s|r\$|s\/\.?|usd|clp|cad|nzd|aud|eur|mxn|pen|cop|ars|gbp|brl|uf)?$/i;
// What may follow the number: a short unit ("un", "kg", "cajas", "%") or a currency code
const UNIT = /^[a-záéíóúñü%°./²³$€£]{0,15}$/i;

// Accepts 1234.5, "1.234,5", "1,234.5", "1 234", "$ 1.500", "(12)", "12 un", and negatives written
// "-3", "−3" or "3-" (SAP). A cell that is text with a number inside ("Café grano 1 kg"), a date
// ("2026-09-01") or a code ("A-12-3") is not a number: it answers null, so a column of names or
// dates chosen by mistake is not read as stock.
export function parseNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined) return null;
  let s = String(value).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/[\u2212\u2012\u2013\u2014]/g, "-");

  const first = s.search(/[0-9]/);
  if (first < 0) return null;
  let last = s.length - 1;
  while (!/[0-9]/.test(s[last])) last -= 1;

  // before the number: at most a sign and a currency mark
  const before = s.slice(0, first).replace(/\s/g, "");
  const sign = before.replace(/[^-+]/g, "");
  if (sign.length > 1 || !CURRENCY.test(before.replace(/[-+]/g, ""))) return null;
  if (sign === "-") negative = true;

  // after the number: at most a trailing minus and a unit
  let after = s.slice(last + 1).trim();
  if (after.startsWith(".-")) {
    after = after.slice(2).trim(); // "$12.990.-" is how prices are closed in Chile, not a negative
  } else if (after.startsWith("-")) {
    negative = true;
    after = after.slice(1).trim();
  }
  if (!UNIT.test(after.replace(/\s/g, ""))) return null;

  // the number itself: digits with "." and ",", or groups of three separated by spaces
  let core = s.slice(first, last + 1);
  if (/^\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d+)?$/.test(core)) core = core.replace(/[ \u00a0]/g, "");
  if (!/^[0-9.,]+$/.test(core)) return null;

  const lastDot = core.lastIndexOf(".");
  const lastComma = core.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // the later one is the decimal separator
    if (lastComma > lastDot) core = core.replace(/\./g, "").replace(",", ".");
    else core = core.replace(/,/g, "");
  } else if (lastComma >= 0) {
    if (/^\d{1,3}(,\d{3})+$/.test(core)) core = core.replace(/,/g, "");
    else core = core.replace(",", ".");
  } else if (lastDot >= 0) {
    if (/^\d{1,3}(\.\d{3})+$/.test(core)) core = core.replace(/\./g, "");
  }
  const n = Number(core);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 5).join("\n");
  const candidates = [";", ",", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  candidates.forEach((d) => {
    let count = 0;
    let quoted = false;
    for (let i = 0; i < sample.length; i += 1) {
      const ch = sample[i];
      if (ch === '"') quoted = !quoted;
      else if (ch === d && !quoted) count += 1;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  });
  return best;
}

// CSV text -> grid of strings. Handles quotes, ; , tab and | separators.
export function parseCsv(text) {
  const clean = text.replace(/^﻿/, "");
  const delimiter = detectDelimiter(clean);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

export function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

// Exports often have a title or blank rows above the real header.
// Pick the row (among the first ones) where the most columns are recognized.
// guess: the function that recognizes columns (inventory by default; cycle counts pass their own).
// validate: when given, a row whose columns are enough to work with beats one that only has more matches.
export function extractTable(grid, guess = guessMapping, scanRows = 20, validate = null) {
  const rows = grid.filter((r) => Array.isArray(r) && r.some((c) => !isBlank(c)));
  if (rows.length === 0) return { headers: [], rows: [] };

  let headerIndex = 0;
  let bestScore = -1;
  rows.slice(0, scanRows).forEach((row, i) => {
    const mapping = guess(row.map((c) => String(c ?? "")));
    const found = Object.values(mapping).filter((v) => v !== null).length;
    const score = found + (validate && validate(mapping).length === 0 ? 100 : 0);
    if (score > bestScore) {
      bestScore = score;
      headerIndex = i;
    }
  });
  if (bestScore < 2) {
    headerIndex = Math.max(0, rows.findIndex((r) => r.filter((c) => !isBlank(c)).length >= 2));
  }

  const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const seen = {};
  const headers = [];
  for (let c = 0; c < width; c += 1) {
    const raw = rows[headerIndex][c];
    let label = isBlank(raw) ? `#${c + 1}` : String(raw).trim();
    if (seen[label]) {
      seen[label] += 1;
      label = `${label} (${seen[label]})`;
    } else {
      seen[label] = 1;
    }
    headers.push(label);
  }
  return { headers, rows: rows.slice(headerIndex + 1) };
}

// A workbook can have several sheets (instructions, dashboard, products, movements...).
// Each sheet with data becomes a candidate; the best one is the sheet whose columns look
// most like an inventory list. Returns { candidates: [{ name, table, mapping }], bestIndex }.
export function pickSheet(sheets, kind = {}) {
  const guess = kind.guess || guessMapping;
  const validate = kind.validate || validateMapping;
  const candidates = [];
  sheets.forEach((sheet) => {
    const table = extractTable(sheet.grid, guess, kind.scanRows || 20, kind.validate || null);
    if (table.rows.length === 0) return;
    const mapping = guess(table.headers);
    const score = Object.values(mapping).filter((v) => v !== null).length;
    const ready = validate(mapping).length === 0;
    candidates.push({ name: sheet.name, table, mapping, score, ready });
  });
  let bestIndex = candidates.length > 0 ? 0 : -1;
  candidates.forEach((candidate, i) => {
    const best = candidates[bestIndex];
    if ((candidate.ready && !best.ready) || (candidate.ready === best.ready && candidate.score > best.score)) {
      bestIndex = i;
    }
  });
  return { candidates, bestIndex };
}

// Returns the list of problems that block the import (empty = ready).
export function validateMapping(mapping) {
  const problems = [];
  if (mapping.sku === null && mapping.name === null) problems.push("needProduct");
  if (mapping.stock === null) problems.push("needStock");
  if (mapping.sales === null && mapping.avg_daily_usage === null && mapping.reorder_point === null) {
    problems.push("needDemand");
  }
  return problems;
}

function round(value, decimals) {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

// table: { headers, rows } from extractTable
// settings: { salesPeriodDays, defaultLeadTime, defaultWarehouse }
export function buildInventory(table, mapping, settings) {
  const period = Math.max(1, parseNumber(settings.salesPeriodDays) || 30);
  const defaultLead = Math.max(1, parseNumber(settings.defaultLeadTime) || 7);
  const defaultWarehouse = settings.defaultWarehouse || "Principal";
  const at = (row, field) => (mapping[field] === null || mapping[field] === undefined ? undefined : row[mapping[field]]);

  const items = [];
  const report = { read: 0, skippedEmpty: 0, skippedNoStock: 0, negatives: 0, truncated: false };

  for (let r = 0; r < table.rows.length; r += 1) {
    const row = table.rows[r];
    const rawSku = at(row, "sku");
    const rawName = at(row, "name");
    const skuText = isBlank(rawSku) ? "" : String(rawSku).trim();
    const nameText = isBlank(rawName) ? "" : String(rawName).trim();

    if (!skuText && !nameText) {
      report.skippedEmpty += 1;
      continue;
    }
    // totals row at the bottom of an export
    if (/^(total|totales|subtotal|suma|total general|grand total)\s*:?$/i.test(skuText || nameText)) {
      report.skippedEmpty += 1;
      continue;
    }

    let stock = parseNumber(at(row, "stock"));
    if (stock === null) {
      // A line of text under the table (a note, a legend) has nothing in the data columns:
      // leave it out quietly. Only a row that looks like a product is reported.
      const looksLikeProduct =
        !isBlank(at(row, "stock")) ||
        ["sales", "avg_daily_usage", "reorder_point", "unit_cost", "lead_time_days"].some((f) => !isBlank(at(row, f)));
      if (looksLikeProduct) report.skippedNoStock += 1;
      else report.skippedEmpty += 1;
      continue;
    }
    if (stock < 0) {
      report.negatives += 1;
      stock = 0;
    }

    if (items.length >= MAX_ROWS) {
      report.truncated = true;
      break;
    }

    // daily usage: direct column, else sales / period, else unknown
    let usage = null;
    if (mapping.avg_daily_usage !== null) {
      const direct = parseNumber(at(row, "avg_daily_usage"));
      if (direct !== null) usage = Math.max(0, direct);
    }
    if (usage === null && mapping.sales !== null) {
      const sold = parseNumber(at(row, "sales"));
      usage = Math.max(0, sold === null ? 0 : sold) / period;
    }
    if (usage !== null) usage = round(usage, 3);

    let lead = parseNumber(at(row, "lead_time_days"));
    if (lead === null || lead <= 0) lead = defaultLead;

    let reorder = parseNumber(at(row, "reorder_point"));
    if (reorder === null || reorder <= 0) {
      if (usage === null) reorder = null;
      else if (usage === 0) reorder = 0;
      else reorder = Math.max(1, Math.ceil(usage * lead * SAFETY_FACTOR));
    }

    const warehouseRaw = at(row, "warehouse");
    const item = {
      sku: skuText || `P-${String(items.length + 1).padStart(4, "0")}`,
      name: (nameText || skuText).slice(0, 120),
      warehouse: isBlank(warehouseRaw) ? defaultWarehouse : String(warehouseRaw).trim(),
      stock,
      reorder_point: reorder,
      lead_time_days: lead,
      avg_daily_usage: usage,
    };
    const cost = parseNumber(at(row, "unit_cost"));
    if (cost !== null && cost > 0) item.unit_cost = cost;
    const onOrder = parseNumber(at(row, "on_order"));
    if (onOrder !== null && onOrder > 0) item.on_order = onOrder;

    items.push(item);
    report.read += 1;
  }

  return { items, report };
}

// ---- Does this look like an inventory? ----

// Column names that belong to a record of sales or documents, not to a list of stock
const TRANSACTION_HEADERS =
  /(cliente|customer|factura|invoice|boleta|folio|\brut\b|vendedor|salesperson|sales rep|numero de (documento|pedido|orden|venta)|n de (documento|pedido|orden|venta)|order (id|number|no)\b|document (number|no)\b|fecha de (venta|emision|factura|pedido)|invoice date|sale date|order date)/;

// Looks at what was read from the file and says what does not look like an inventory, so the
// visitor is told before the analysis instead of getting figures that mean nothing.
// built: what buildInventory returned. Returns { preview, total, warnings }, where each warning
// is { code, ...numbers for the message }.
export function reviewImport(table, mapping, built) {
  const { items, report } = built;
  const warnings = [];

  // The same product on many rows: an inventory has one row per product (and warehouse).
  // Repeats are what a list of sales or stock movements looks like.
  const byCode = mapping.sku !== null && mapping.sku !== undefined;
  const seen = new Set();
  let repeated = 0;
  items.forEach((item) => {
    const key = `${String(byCode ? item.sku : item.name).trim().toLowerCase()}|${String(item.warehouse).trim().toLowerCase()}`;
    if (seen.has(key)) repeated += 1;
    else seen.add(key);
  });
  if (items.length >= 6 && repeated / items.length >= 0.3) {
    warnings.push({ code: "warnRepeated", n: repeated, total: items.length });
  }

  // Columns of customers, invoices or sale dates that the inventory does not use
  const used = new Set(Object.values(mapping).filter((v) => v !== null && v !== undefined));
  const foreign = table.headers.filter((header, i) => !used.has(i) && TRANSACTION_HEADERS.test(normalizeHeader(header)));
  if (foreign.length > 0) {
    warnings.push({ code: "warnTransactions", cols: foreign.slice(0, 3).join(", ") });
  }

  // The stock column has no number on many rows: probably the wrong column
  const withStockCell = report.read + report.skippedNoStock;
  if (report.skippedNoStock >= 3 && report.skippedNoStock / withStockCell >= 0.3) {
    warnings.push({ code: "warnUnreadStock", n: report.skippedNoStock, total: withStockCell });
  }

  // A sales column was chosen but nothing sold: nothing can be said about what to order
  const hasDemandColumn = (mapping.sales !== null && mapping.sales !== undefined) || (mapping.avg_daily_usage !== null && mapping.avg_daily_usage !== undefined);
  if (hasDemandColumn && items.length >= 3 && items.every((item) => !(item.avg_daily_usage > 0))) {
    warnings.push({ code: "warnNoSales" });
  }

  return { preview: items.slice(0, 3), total: items.length, warnings };
}
