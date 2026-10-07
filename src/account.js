// The visitor's account, on the browser side: signing in with an email and a code, and the
// history of analyses. The server side is server/accounts.js.
//
// An account never holds the products of an inventory. What is sent after a file is analyzed is
// its summary: the file name and a handful of figures (figuresOf, below).

import { load, save, remove } from "./storage";
import { ACCOUNTS_ON } from "./config";
import { buildReport } from "./reportLogic";

// ---- is signing in offered at all? ----
// ACCOUNTS_ON in src/config.js switches it on for everyone. Before that, opening the site once
// with ?cuentas=1 (or ?accounts=1) switches it on in that browser only, to try it; ?cuentas=0 undoes it.
export function accountsWanted() {
  try {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("cuentas") ?? params.get("accounts");
    if (flag === "1") save("accountsPreview", true);
    if (flag === "0") remove("accountsPreview");
  } catch (err) {
    // no address to read (the site is being built): the setting decides
  }
  return ACCOUNTS_ON || load("accountsPreview", false) === true;
}

// ---- the key that keeps this browser signed in ----
export const storedSession = () => String(load("session", "") || "");
export function keepSession(key) {
  save("session", key);
}
export function forgetSession() {
  remove("session");
  remove("accountPlan");
}

// ---- talking to the server ----
// Every call answers { status, data }. status 0 = the server could not be reached at all.
async function call(apiUrl, path, { method = "GET", body, key } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (key) headers.Authorization = `Bearer ${key}`;
  try {
    const res = await fetch(`${apiUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data: data || {} };
  } catch (err) {
    return { status: 0, data: {} };
  }
}

export const startSignIn = (apiUrl, { email, lang }) => call(apiUrl, "/api/auth/start", { method: "POST", body: { email, lang } });
export const verifySignIn = (apiUrl, { email, code, lang, marketingOk }) =>
  call(apiUrl, "/api/auth/verify", { method: "POST", body: { email, code, lang, marketingOk } });
export const fetchAccount = (apiUrl, key) => call(apiUrl, "/api/me", { key });
export const signOut = (apiUrl, key) => call(apiUrl, "/api/auth/signout", { method: "POST", key });
export const recordAnalysis = (apiUrl, key, { fileName, figures }) => call(apiUrl, "/api/analyses", { method: "POST", key, body: { fileName, figures } });
export const clearHistory = (apiUrl, key) => call(apiUrl, "/api/analyses", { method: "DELETE", key });
export const linkPlan = (apiUrl, key, code) => call(apiUrl, "/api/account/plan", { method: "POST", key, body: { code } });
export const setNews = (apiUrl, key, marketingOk) => call(apiUrl, "/api/account", { method: "PATCH", key, body: { marketingOk } });
export const deleteAccount = (apiUrl, key) => call(apiUrl, "/api/account", { method: "DELETE", key });

// Does this account have the plan? When PayPal could not be asked right now ("unknown"), what
// was known on the last visit stands, so a customer is not locked out by someone else's outage.
export function accountHasPlan(account) {
  if (!account) return false;
  if (account.plan === "active" || account.plan === "inactive") save("accountPlan", account.plan);
  if (account.plan === "unknown") return load("accountPlan", "") === "active";
  return account.plan === "active";
}

// ---- the summary of an analysis: figures, never products ----
export function figuresOf(items, coverDays) {
  const { kpis: k, summary } = buildReport(items, { coverDays });
  return {
    skus: k.skus,
    warehouses: k.warehouses,
    units: k.units,
    critical: summary.counts.critical,
    low: summary.counts.low,
    ok: summary.counts.ok,
    idle: summary.counts.idle,
    excess: summary.counts.excess,
    belowReorder: k.belowReorder,
    stockouts: k.stockouts,
    availability: k.availability ?? undefined,
    hasCost: k.hasCost,
    inventoryValue: k.hasCost ? k.inventoryValue : undefined,
    tiedUp: k.hasCost ? k.tiedUp : undefined,
    orderLines: k.orderLines,
    orderUnits: k.orderUnits,
    orderCost: k.orderCost ?? undefined,
    lateLines: k.lateLines,
    daysOfInventory: k.daysOfInventory ?? undefined,
  };
}

// ---- comparing two analyses ----
// The figures worth following from one upload to the next. better: which way is good news
// ("down"), or null when a change is neither good nor bad on its own.
export const TRACKED = [
  { key: "belowReorder", label: "rpKBelow", better: "down" },
  { key: "critical", label: "acMCritical", better: "down" },
  { key: "stockouts", label: "rpColStockouts", better: "down" },
  { key: "notMoving", label: "rpKNotMoving", better: "down" },
  { key: "tiedUp", label: "kpiTiedUp", better: "down", money: true },
  { key: "inventoryValue", label: "kpiValue", better: null, money: true },
  { key: "orderCost", label: "rpKOrder", better: null, money: true },
];

// The value of one tracked figure in an analysis, or null when that analysis does not have it
export function figure(analysis, key) {
  const f = (analysis && analysis.figures) || {};
  if (key === "notMoving") return typeof f.idle === "number" && typeof f.excess === "number" ? f.idle + f.excess : null;
  return typeof f[key] === "number" ? f[key] : null;
}

// What changed between two analyses: [{ key, label, money, from, to, delta, verdict }]
// verdict: "better" | "worse" | "same" | "neutral". Figures that either analysis lacks are left out.
export function changesBetween(current, previous) {
  return TRACKED.map((item) => {
    const to = figure(current, item.key);
    const from = figure(previous, item.key);
    if (to === null || from === null) return null;
    const delta = to - from;
    const verdict = delta === 0 ? "same" : item.better === null ? "neutral" : delta < 0 ? "better" : "worse";
    return { key: item.key, label: item.label, money: item.money === true, from, to, delta, verdict };
  }).filter(Boolean);
}

// The analysis with this id and the one before it, from an account's history (newest first)
export function withPrevious(account, analysisId) {
  const list = (account && account.analyses) || [];
  const index = list.findIndex((analysis) => analysis.id === analysisId);
  if (index < 0) return null;
  return { current: list[index], previous: list[index + 1] || null };
}
