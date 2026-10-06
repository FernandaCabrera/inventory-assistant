// What the downloads have in common: where the data came from, the date, and saving a file.

import { LOCALES } from "./i18n";
import { COLORS, STATUS_STYLE } from "./theme";

// Colors as the file formats want them: "15181A" (PowerPoint), "FF15181A" (Excel), [21, 24, 26] (PDF)
export const hex = (color) => color.replace("#", "").toUpperCase();
export const argb = (color) => `FF${hex(color)}`;
export const rgb = (color) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));

export const STATUS_COLOR = Object.fromEntries(Object.entries(STATUS_STYLE).map(([status, style]) => [status, style.color]));
export const TONE_COLOR = { critical: COLORS.critical, idle: COLORS.idle, ok: COLORS.ok };
export const PRIORITY_COLOR = { high: COLORS.critical, medium: COLORS.low, low: COLORS.inkMuted };
export const ORDER_COLOR = { urgent: COLORS.critical, high: COLORS.low, normal: COLORS.inkMuted };
export const WAREHOUSE_COLORS = [COLORS.ok, COLORS.low, COLORS.excess, COLORS.critical, COLORS.idle, COLORS.inkMuted];

// The line under the title of every file: which inventory this is and when it was analyzed
export function documentInfo({ t, lang, sourceName, report, now = new Date() }) {
  const date = now.toLocaleDateString(LOCALES[lang] || LOCALES.en, { day: "numeric", month: "long", year: "numeric" });
  return {
    source: t("rpDocSource", { name: sourceName }),
    date: t("rpDocDate", { date }),
    scope: t("rpDocScope", { skus: report.kpis.skus, wh: report.kpis.warehouses }),
    // the day in the visitor's own time zone, for the file name
    stamp: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
  };
}

export const shorten = (text, max) => (String(text).length > max ? `${String(text).slice(0, max - 1).trimEnd()}…` : String(text));

export function saveFile(content, fileName, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
