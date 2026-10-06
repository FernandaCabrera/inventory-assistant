// The example inventory, in the language of the page: the same 46 products, with names,
// warehouses and costs that make sense in each one (Canadian dollars / Chilean pesos).

import en from "./inventory.json";
import es from "./inventory.es.json";

export function sampleInventory(lang) {
  return lang === "es" ? es : en;
}
