// A small .xlsx reader that only looks at cell values.
//
// An .xlsx file is a zip of XML files. Full-featured libraries also parse tables, styles,
// validations and so on, and fail on files they do not fully understand. The import only
// needs the values, so this reads just: the list of sheets, the shared strings, and the cells.
// For cells with formulas it takes the value Excel saved next to the formula.

import JSZip from "jszip";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXml(text) {
  if (!text) return "";
  let out = text;
  if (out.indexOf("&") >= 0) {
    out = out.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (match, code) => {
      if (code[0] === "#") {
        const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : match;
      }
      return ENTITIES[code] !== undefined ? ENTITIES[code] : match;
    });
  }
  // Excel writes control characters as _x000D_ and similar
  if (out.indexOf("_x") >= 0) {
    out = out.replace(/_x([0-9A-Fa-f]{4})_/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
  return out;
}

function attributes(tagBody) {
  const attrs = {};
  const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(tagBody)) !== null) {
    attrs[m[1]] = m[2] !== undefined ? m[2] : m[3];
  }
  return attrs;
}

// Text of every <t> inside a fragment (a shared string or an inline string), without phonetic hints
function textOf(fragment) {
  const clean = fragment.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, "");
  const re = /<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g;
  let out = "";
  let m;
  while ((m = re.exec(clean)) !== null) out += m[1];
  return decodeXml(out);
}

export function parseSharedStrings(xml) {
  const strings = [];
  if (!xml) return strings;
  const re = /<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g;
  let m;
  while ((m = re.exec(xml)) !== null) strings.push(m[1] ? textOf(m[1]) : "");
  return strings;
}

// "B12" -> 1, "AA3" -> 26
function columnIndex(ref) {
  let n = 0;
  for (let i = 0; i < ref.length; i += 1) {
    const code = ref.charCodeAt(i);
    if (code >= 65 && code <= 90) n = n * 26 + (code - 64);
    else if (code >= 97 && code <= 122) n = n * 26 + (code - 96);
    else break;
  }
  return n - 1;
}

const MAX_COLUMNS = 400;

// Sheet XML -> grid of values (rows of cells). Empty rows are dropped.
export function parseSheet(xml, sharedStrings) {
  const grid = [];
  const rowRe = /<(?:\w+:)?row\b(?:[^>/]|\/(?!>))*>([\s\S]*?)<\/(?:\w+:)?row>/g;
  const cellRe = /<(?:\w+:)?c\b((?:[^>/]|\/(?!>))*)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
  const valueRe = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/;

  let rowMatch;
  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const cells = [];
    let next = 0;
    let hasValue = false;
    cellRe.lastIndex = 0;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) {
      const attrs = attributes(cellMatch[1]);
      let col = attrs.r ? columnIndex(attrs.r) : next;
      if (col < 0) col = next;
      next = col + 1;
      if (col >= MAX_COLUMNS) continue;
      const inner = cellMatch[2];
      if (!inner) continue;

      let value = "";
      const type = attrs.t;
      if (type === "inlineStr") {
        value = textOf(inner);
      } else {
        const v = valueRe.exec(inner);
        const raw = v ? v[1] : "";
        if (type === "s") {
          const shared = sharedStrings[parseInt(raw, 10)];
          value = shared === undefined ? "" : shared;
        } else if (type === "str" || type === "d") {
          value = decodeXml(raw);
        } else if (type === "b") {
          value = raw === "1";
        } else if (type === "e") {
          value = "";
        } else if (raw !== "") {
          const n = Number(raw);
          value = Number.isFinite(n) ? n : decodeXml(raw);
        }
      }
      if (value !== "") {
        cells[col] = value;
        hasValue = true;
      }
    }
    if (hasValue) {
      for (let i = 0; i < cells.length; i += 1) {
        if (cells[i] === undefined) cells[i] = "";
      }
      grid.push(cells);
    }
  }
  return grid;
}

function resolvePath(baseDir, target) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = (baseDir ? baseDir.split("/") : []).concat(target.split("/"));
  const out = [];
  parts.forEach((part) => {
    if (part === "..") out.pop();
    else if (part !== "." && part !== "") out.push(part);
  });
  return out.join("/");
}

async function readText(zip, path) {
  const entry = zip.file(path);
  return entry ? entry.async("string") : null;
}

// buffer (ArrayBuffer / Uint8Array) -> [{ name, grid }] for every visible sheet that has data
export async function readXlsxSheets(buffer) {
  const zip = await JSZip.loadAsync(buffer);

  // where the workbook lives (normally xl/workbook.xml)
  let workbookPath = "xl/workbook.xml";
  const rootRels = await readText(zip, "_rels/.rels");
  if (rootRels) {
    const re = /<(?:\w+:)?Relationship\b([^>]*)>/g;
    let m;
    while ((m = re.exec(rootRels)) !== null) {
      const attrs = attributes(m[1]);
      if (attrs.Type && /\/officeDocument$/.test(attrs.Type) && attrs.Target) {
        workbookPath = resolvePath("", attrs.Target);
      }
    }
  }
  const workbookXml = await readText(zip, workbookPath);
  if (!workbookXml) throw new Error("no workbook");

  const dir = workbookPath.includes("/") ? workbookPath.slice(0, workbookPath.lastIndexOf("/")) : "";
  const file = workbookPath.slice(workbookPath.lastIndexOf("/") + 1);
  const relsXml = await readText(zip, `${dir ? `${dir}/` : ""}_rels/${file}.rels`);
  const targets = {};
  if (relsXml) {
    const re = /<(?:\w+:)?Relationship\b([^>]*)>/g;
    let m;
    while ((m = re.exec(relsXml)) !== null) {
      const attrs = attributes(m[1]);
      if (attrs.Id && attrs.Target) {
        targets[attrs.Id] = { path: resolvePath(dir, attrs.Target), type: attrs.Type || "" };
      }
    }
  }

  const listed = [];
  const sheetRe = /<(?:\w+:)?sheet\b([^>]*)>/g;
  let m;
  while ((m = sheetRe.exec(workbookXml)) !== null) {
    const attrs = attributes(m[1]);
    const relKey = Object.keys(attrs).find((key) => key === "id" || key.endsWith(":id"));
    const target = relKey ? targets[attrs[relKey]] : undefined;
    // chart sheets and macro sheets have no cells
    if (target && /\/worksheet$/.test(target.type)) {
      listed.push({
        name: decodeXml(attrs.name || ""),
        path: target.path,
        hidden: Boolean(attrs.state) && attrs.state !== "visible",
      });
    }
  }
  const visible = listed.filter((sheet) => !sheet.hidden);
  const wanted = visible.length > 0 ? visible : listed;

  const sharedTarget = Object.values(targets).find((target) => /\/sharedStrings$/.test(target.type));
  const sharedPath = sharedTarget ? sharedTarget.path : `${dir ? `${dir}/` : ""}sharedStrings.xml`;
  const sharedStrings = parseSharedStrings(await readText(zip, sharedPath));

  const sheets = [];
  for (let i = 0; i < wanted.length; i += 1) {
    const xml = await readText(zip, wanted[i].path);
    if (!xml) continue;
    const grid = parseSheet(xml, sharedStrings);
    if (grid.length > 0) sheets.push({ name: wanted[i].name || `#${i + 1}`, grid });
  }
  return sheets;
}
