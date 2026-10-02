// How the figures of the cycle count report are written out, on screen and in the Excel file.

import { formatNumber, formatMoney, LOCALES } from "./i18n";

const day = (lang, ms, options) => new Date(ms).toLocaleDateString(LOCALES[lang] || LOCALES.en, { ...options, timeZone: "UTC" });

export const percent = (lang, value) => `${formatNumber(lang, value * 100, 1)}%`;
export const shortDate = (lang, ms) => day(lang, ms, { day: "numeric", month: "short", year: "numeric" });
export const dayMonth = (lang, ms) => day(lang, ms, { day: "numeric", month: "short" });
export const monthName = (lang, month) => day(lang, Date.parse(`${month}-01T00:00:00Z`), { month: "long", year: "numeric" });
export const monthYear = (lang, month) => day(lang, Date.parse(`${month}-01T00:00:00Z`), { month: "short", year: "numeric" });
// per-week paces: one decimal while the number is small enough for it to matter
export const pace = (lang, value) => formatNumber(lang, value, value < 100 ? 1 : 0);

export function signed(lang, value, money = false) {
  const text = money ? formatMoney(lang, Math.abs(value)) : formatNumber(lang, Math.abs(value), 2);
  if (value > 0) return `+${text}`;
  if (value < 0) return `−${text}`;
  return text;
}

const PERCENT = ["pct", "previous"];
const MONEY = ["abs", "net", "apparent"];
const PACE = ["perWeek", "needed", "gap"];
const ONE_DECIMAL = ["weeks", "days"];

// One sentence of a conclusion: { key, vars } -> text
export function sentence(t, lang, part) {
  const vars = {};
  Object.entries(part.vars).forEach(([name, value]) => {
    if (name === "month") vars[name] = monthName(lang, value);
    else if (name === "date") vars[name] = shortDate(lang, value);
    else if (typeof value !== "number") vars[name] = value;
    else if (PERCENT.includes(name)) vars[name] = percent(lang, value);
    else if (MONEY.includes(name) && part.key !== "ccUnits") vars[name] = formatMoney(lang, value);
    else if (PACE.includes(name)) vars[name] = pace(lang, value);
    else if (ONE_DECIMAL.includes(name)) vars[name] = formatNumber(lang, value, 1);
    else vars[name] = formatNumber(lang, value, 2);
  });
  return t(part.key, vars);
}

// A whole conclusion: its sentences, one after another
export const finding = (t, lang, parts) => parts.map((part) => sentence(t, lang, part)).join(" ");
