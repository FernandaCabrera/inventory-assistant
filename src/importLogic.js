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
};

// Looser matching, checked in this order: specific fields first so that
// "stock minimo" is the reorder point and "unidades vendidas" is sales, not stock.
const LOOSE = [
  ["avg_daily_usage", /(diari|daily|por dia|per day)/, null],
  ["reorder_point", /(reorden|reorder|punto de (pedido|reposicion)|\bmin(imo|imum)?\b)/, null],
  ["lead_time_days", /(lead|reposicion|entrega|plazo|delivery)/, null],
  ["sales", /(vend|venta|sales|sold|salida|consumo|demand)/, /(precio|price|monto|amount|valor|revenue|ingreso|neto|bruto)/],
  ["unit_cost", /(costo|cost|precio (de )?(compra|costo)|purchase price)/, /total/],
  ["warehouse", /(bodega|almacen|sucursal|warehouse|location|ubicacion|tienda|store)/, null],
  ["sku", /(sku|codigo|code|\bcod\b|\bid\b|referencia|\bref\b|part number|barcode)/, null],
  ["name", /(nombre|descripcion|producto|name|description|product|articulo|item|detalle|glosa)/, null],
  ["stock", /(stock|existencia|saldo|cantidad|qty|quantity|on hand|disponible|inventario|unidades|units|available)/, null],
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

// Accepts 1234.5, "1.234,5", "1,234.5", "$ 1.500", "(12)", "12 un"
export function parseNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined) return null;
  let s = String(value).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^0-9.,-]/g, "");
  if (s.startsWith("-")) {
    negative = true;
  }
  s = s.replace(/-/g, "");
  if (!/[0-9]/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // the later one is the decimal separator
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, "");
    else s = s.replace(",", ".");
  } else if (lastDot >= 0) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  }
  const n = Number(s);
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

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

// Exports often have a title or blank rows above the real header.
// Pick the row (among the first 20) where the most columns are recognized.
export function extractTable(grid) {
  const rows = grid.filter((r) => Array.isArray(r) && r.some((c) => !isBlank(c)));
  if (rows.length === 0) return { headers: [], rows: [] };

  let headerIndex = 0;
  let bestScore = -1;
  rows.slice(0, 20).forEach((row, i) => {
    const mapping = guessMapping(row.map((c) => String(c ?? "")));
    const score = Object.values(mapping).filter((v) => v !== null).length;
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
      report.skippedNoStock += 1;
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

    items.push(item);
    report.read += 1;
  }

  return { items, report };
}
