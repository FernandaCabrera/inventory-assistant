// What the page works out about an account by itself: whether accounts are offered, the summary
// of an analysis, and what changed between two of them.

import { accountsWanted, accountHasPlan, figuresOf, changesBetween, withPrevious, figure } from "./account";
import { ACCOUNTS_ON } from "./config";
import { sampleInventory } from "./data/sample";

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

test("accounts are off until the setting says so, and can be tried in one browser with ?cuentas=1", () => {
  expect(ACCOUNTS_ON).toBe(false); // the site is published with accounts off until the server is ready
  expect(accountsWanted()).toBe(false);

  window.history.replaceState(null, "", "/?cuentas=1");
  expect(accountsWanted()).toBe(true);
  // it is remembered in this browser, also without the mark in the address
  window.history.replaceState(null, "", "/");
  expect(accountsWanted()).toBe(true);

  window.history.replaceState(null, "", "/en/?accounts=0");
  expect(accountsWanted()).toBe(false);
  window.history.replaceState(null, "", "/en/");
  expect(accountsWanted()).toBe(false);
});

test("the summary of an analysis has figures and nothing about the products", () => {
  const figures = figuresOf(sampleInventory("es"), 30);
  expect(figures).toEqual({
    skus: 46, warehouses: 5, units: 5614, critical: 9, low: 9, ok: 19, idle: 0, excess: 9, belowReorder: 18, stockouts: 0,
    availability: 1, hasCost: true, inventoryValue: 332205900, tiedUp: 47760800, orderLines: 18, orderUnits: 4087, orderCost: 181235300,
    lateLines: 12, daysOfInventory: expect.any(Number),
  });
  expect(JSON.stringify(figures)).not.toMatch(/Pechuga|MK-|Quilicura/);

  // a file without costs has no money figures to keep
  const plain = sampleInventory("es").map(({ unit_cost, ...rest }) => rest);
  const withoutCost = figuresOf(plain, 30);
  expect(withoutCost).toMatchObject({ hasCost: false, inventoryValue: undefined, tiedUp: undefined, orderCost: undefined, daysOfInventory: undefined });
});

const analysis = (id, figures) => ({ id, createdAt: 0, fileName: `${id}.xlsx`, figures });

test("what changed between two analyses, and whether it is good news", () => {
  const before = analysis("1", { belowReorder: 18, critical: 9, stockouts: 2, idle: 2, excess: 7, tiedUp: 1200000, inventoryValue: 4800000, orderCost: 900000 });
  const after = analysis("2", { belowReorder: 12, critical: 9, stockouts: 3, idle: 1, excess: 5, tiedUp: 1500000, inventoryValue: 5000000, orderCost: 700000 });
  expect(changesBetween(after, before).map((c) => [c.key, c.from, c.to, c.delta, c.verdict])).toEqual([
    ["belowReorder", 18, 12, -6, "better"],
    ["critical", 9, 9, 0, "same"],
    ["stockouts", 2, 3, 1, "worse"],
    ["notMoving", 9, 6, -3, "better"],
    ["tiedUp", 1200000, 1500000, 300000, "worse"],
    ["inventoryValue", 4800000, 5000000, 200000, "neutral"], // more or less stock is not good or bad by itself
    ["orderCost", 900000, 700000, -200000, "neutral"],
  ]);
  expect(changesBetween(after, before).filter((c) => c.money).map((c) => c.key)).toEqual(["tiedUp", "inventoryValue", "orderCost"]);
});

test("a figure that one of the two analyses lacks is not compared", () => {
  const withCost = analysis("1", { belowReorder: 3, critical: 1, tiedUp: 500 });
  const withoutCost = analysis("2", { belowReorder: 2, critical: 1 });
  expect(changesBetween(withoutCost, withCost).map((c) => c.key)).toEqual(["belowReorder", "critical"]);
  expect(figure(withoutCost, "notMoving")).toBeNull();
  expect(figure(null, "critical")).toBeNull();
});

test("an analysis is found in the history together with the one before it", () => {
  const account = { analyses: [analysis("3", {}), analysis("2", {}), analysis("1", {})] }; // newest first
  expect(withPrevious(account, "3")).toMatchObject({ current: { id: "3" }, previous: { id: "2" } });
  expect(withPrevious(account, "1")).toMatchObject({ current: { id: "1" }, previous: null });
  expect(withPrevious(account, "9")).toBeNull(); // deleted from the history, or from another account
  expect(withPrevious(null, "1")).toBeNull();
});

test("the plan of an account: when PayPal cannot be asked, what was known last stands", () => {
  expect(accountHasPlan(null)).toBe(false);
  expect(accountHasPlan({ plan: "unknown" })).toBe(false); // never seen with a plan
  expect(accountHasPlan({ plan: "active" })).toBe(true);
  expect(accountHasPlan({ plan: "unknown" })).toBe(true); // it was active on the last visit
  expect(accountHasPlan({ plan: "inactive" })).toBe(false);
  expect(accountHasPlan({ plan: "unknown" })).toBe(false);
});
