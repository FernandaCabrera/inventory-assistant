// The pages of the site and the address of each one, per language.
//
// "home" is the tool. The others are pages written for one specific Google search each; their
// texts are in src/landingText.js. A page can exist in one language only.
//
// To add a page: add it here with its address and write its texts in src/landingText.js. The
// build writes it into the HTML and into sitemap.xml by itself (scripts/prerender.js). A new page
// shows the buttons of the inventory tool; src/InventoryAssistant.jsx (landingButtons) is the
// place to give it other buttons.

import { LANGS, LANG_PATHS, langFromPath } from "./i18n";

export const PAGES = {
  home: LANG_PATHS,
  counts: { es: "/conteo-ciclico-sap/", en: "/en/cycle-count-report/" },
  analysis: { es: "/analisis-inventario-excel/" },
  // A service, not a tool: its button writes an email instead of opening the tool
  excel: { es: "/automatizacion-excel/", en: "/en/excel-automation/" },
  // Guides: they teach how to do something by hand, and then offer the tool
  reorder: { es: "/punto-de-reorden-excel/" },
  kardex: { es: "/kardex-excel/" },
};

// Every page that is not the tool itself
export const LANDING_IDS = Object.keys(PAGES).filter((id) => id !== "home");

// "/Conteo-Ciclico-SAP", "/conteo-ciclico-sap/index.html" and "/conteo-ciclico-sap/" are the same page
function clean(path) {
  const lower = String(path || "/").toLowerCase().replace(/index\.html$/, "");
  return lower.endsWith("/") ? lower : `${lower}/`;
}

// Which page and language an address is. An address that is not a page is the home page.
export function pageFromPath(path) {
  const wanted = clean(path);
  for (const id of LANDING_IDS) {
    for (const lang of LANGS) {
      if (PAGES[id][lang] === wanted) return { id, lang };
    }
  }
  return { id: "home", lang: langFromPath(path) };
}

// The pages that exist in a language, to link to them
export function landingPagesIn(lang) {
  return LANDING_IDS.filter((id) => PAGES[id][lang]);
}
