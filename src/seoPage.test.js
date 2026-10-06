// What Google reads: the address of each page, the tags in the <head>, the sitemap and the
// files in public/.

import fs from "fs";
import path from "path";
import { LANGS, LANG_PATHS, LOCALES, langFromPath, translator } from "./i18n";
import { PAGES, LANDING_IDS, pageFromPath, landingPagesIn } from "./pages";
import { landingText } from "./landingText";
import { SITE_URL } from "./config";
import { seoPage, sitemapXml } from "../scripts/seoPage";

const publicFile = (name) => fs.readFileSync(path.join(__dirname, "..", "public", name), "utf8");
// what "react-scripts build" hands to scripts/prerender.js, close enough for these checks
const template = publicFile("index.html").replace(/%PUBLIC_URL%/g, "");

const site = { url: SITE_URL, name: "MiKardex", image: "/logo512.png", defaultLang: "es", ownerName: "Someone", ownerLinkedin: "https://example.com/in/someone", storagePrefix: "mikardex." };

// The same list scripts/home-entry.jsx builds, with a stand-in for the drawn page
const pages = Object.keys(PAGES).flatMap((id) => {
  const langs = LANGS.filter((lang) => PAGES[id][lang]);
  const alternates = langs.map((lang) => ({ lang, path: PAGES[id][lang], locale: LOCALES[lang] }));
  return langs.map((lang) => {
    const texts = id === "home" ? { seoTitle: translator(lang)("seoTitle"), seoDescription: translator(lang)("seoDescription"), h1: translator(lang)("title") } : landingText(id, lang);
    return { id, lang, path: PAGES[id][lang], locale: LOCALES[lang], isHome: id === "home", alternates, title: texts.seoTitle, description: texts.seoDescription, html: `<h1>${texts.h1}</h1>` };
  });
});
const pageOf = (id, lang) => pages.find((p) => p.id === id && p.lang === lang);
const count = (html, pattern) => (html.match(pattern) || []).length;

test("the address decides the language", () => {
  expect(LANG_PATHS).toEqual({ es: "/", en: "/en/" });
  expect(langFromPath("/")).toBe("es");
  expect(langFromPath("")).toBe("es");
  expect(langFromPath("/en")).toBe("en");
  expect(langFromPath("/en/")).toBe("en");
  expect(langFromPath("/EN/")).toBe("en");
  expect(langFromPath("/en/anything")).toBe("en");
  expect(langFromPath("/energia")).toBe("es"); // only the /en folder is English
  expect(langFromPath("/otra-pagina")).toBe("es");
});

test("the address decides the page", () => {
  expect(pageFromPath("/")).toEqual({ id: "home", lang: "es" });
  expect(pageFromPath("/en/")).toEqual({ id: "home", lang: "en" });
  expect(pageFromPath("/conteo-ciclico-sap/")).toEqual({ id: "counts", lang: "es" });
  expect(pageFromPath("/conteo-ciclico-sap")).toEqual({ id: "counts", lang: "es" });
  expect(pageFromPath("/Conteo-Ciclico-SAP/index.html")).toEqual({ id: "counts", lang: "es" });
  expect(pageFromPath("/en/cycle-count-report/")).toEqual({ id: "counts", lang: "en" });
  expect(pageFromPath("/analisis-inventario-excel/")).toEqual({ id: "analysis", lang: "es" });
  // an address that is not a page is the home page, in the language of its folder
  expect(pageFromPath("/no-existe/")).toEqual({ id: "home", lang: "es" });
  expect(pageFromPath("/en/no-such-page/")).toEqual({ id: "home", lang: "en" });

  // no two pages share an address, every address ends in "/" and English lives under /en/
  const all = pages.map((p) => p.path);
  expect(new Set(all).size).toBe(all.length);
  for (const p of pages) {
    expect(p.path).toMatch(/^\/([a-z0-9-]+\/)*$/);
    expect(p.path.startsWith("/en/")).toBe(p.lang === "en");
  }
  expect(pageFromPath("/automatizacion-excel/")).toEqual({ id: "excel", lang: "es" });
  expect(pageFromPath("/en/excel-automation/")).toEqual({ id: "excel", lang: "en" });
  expect(landingPagesIn("es")).toEqual(["counts", "analysis", "excel"]);
  expect(landingPagesIn("en")).toEqual(["counts", "excel"]);
});

test("each page has its own title and description, short enough for a search result", () => {
  for (const lang of LANGS) {
    expect(translator(lang)("seoTitle")).toMatch(/^MiKardex · /);
    // Google shows about 60 characters of a title: a longer one loses its second half
    expect(translator(lang)("seoTitle").length).toBeLessThanOrEqual(65);
  }
  for (const id of LANDING_IDS) {
    for (const lang of Object.keys(PAGES[id])) {
      const texts = landingText(id, lang);
      expect(texts.seoTitle).toMatch(/ · MiKardex$/);
      expect(texts.seoTitle.length).toBeLessThanOrEqual(70);
      expect(texts.navLabel && texts.h1 && texts.lead).toBeTruthy();
    }
  }
  for (const page of pages) {
    expect(page.description.length).toBeGreaterThan(70);
    expect(page.description.length).toBeLessThanOrEqual(200);
    expect(page.description).not.toMatch(/\{\w+\}/); // Google gets it as written: no marks to fill in
    expect(page.title).not.toMatch(/\{\w+\}/);
  }
  expect(new Set(pages.map((p) => p.title)).size).toBe(pages.length);
  expect(new Set(pages.map((p) => p.description)).size).toBe(pages.length);
});

test.each(LANGS)("the %s home page gets one of each tag, its own address and the link to the other language", (lang) => {
  const page = pageOf("home", lang);
  const html = seoPage(template, page, site);
  const url = SITE_URL + LANG_PATHS[lang];

  expect(html).toContain(`<html lang="${lang}">`);
  expect(count(html, /<title>/g)).toBe(1);
  expect(html).toContain(`<title>${page.title}</title>`);
  expect(count(html, /<meta\s+name="description"/g)).toBe(1);
  expect(html).toContain(`<meta name="description" content="${page.description}"/>`);
  expect(count(html, /rel="canonical"/g)).toBe(1);
  expect(html).toContain(`<link rel="canonical" href="${url}"/>`);
  expect(html).toContain('<link rel="alternate" hreflang="es" href="https://www.mikardex.cl/"/>');
  expect(html).toContain('<link rel="alternate" hreflang="en" href="https://www.mikardex.cl/en/"/>');
  expect(html).toContain('<link rel="alternate" hreflang="x-default" href="https://www.mikardex.cl/"/>');
  expect(html).toContain(`<meta property="og:url" content="${url}"/>`);
  expect(html).toContain('<meta property="og:image" content="https://www.mikardex.cl/logo512.png"/>');
  expect(html).toContain(`<meta property="og:locale" content="${lang === "es" ? "es_CL" : "en_CA"}"/>`);

  // the home page is inside the root, where React will draw over it
  expect(html).toContain(`<div id="root"><div id="prerender">${page.html}</div></div>`);
  // everything went into the <head>, before the page
  expect(html.indexOf("</head>")).toBeGreaterThan(html.indexOf('rel="canonical"'));
  expect(html.indexOf("</head>")).toBeLessThan(html.indexOf('id="prerender"'));

  const data = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)[1]);
  expect(data["@graph"][0]).toMatchObject({ "@type": "WebSite", name: "MiKardex", url: "https://www.mikardex.cl/" });
  expect(data["@graph"][1]).toMatchObject({ "@type": "SoftwareApplication", url, inLanguage: lang });
});

test("a page in two languages links its two versions, and not the home page", () => {
  const html = seoPage(template, pageOf("counts", "en"), site);
  expect(html).toContain('<html lang="en">');
  expect(html).toContain('<link rel="canonical" href="https://www.mikardex.cl/en/cycle-count-report/"/>');
  expect(html).toContain('<link rel="alternate" hreflang="es" href="https://www.mikardex.cl/conteo-ciclico-sap/"/>');
  expect(html).toContain('<link rel="alternate" hreflang="en" href="https://www.mikardex.cl/en/cycle-count-report/"/>');
  expect(html).toContain('<link rel="alternate" hreflang="x-default" href="https://www.mikardex.cl/conteo-ciclico-sap/"/>');
  expect(count(html, /hreflang=/g)).toBe(3);
  expect(html).toContain('<meta property="og:locale:alternate" content="es_CL"/>');
  const data = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)[1]);
  expect(data["@graph"][1]).toMatchObject({ "@type": "WebPage", url: "https://www.mikardex.cl/en/cycle-count-report/", inLanguage: "en" });
  // always shown as written: nothing to hide
  expect(html).not.toContain("no-prerender");
});

test("a page in one language has no other version to link", () => {
  const html = seoPage(template, pageOf("analysis", "es"), site);
  expect(html).toContain('<html lang="es">');
  expect(html).toContain('<link rel="canonical" href="https://www.mikardex.cl/analisis-inventario-excel/"/>');
  expect(html).not.toContain("hreflang=");
  expect(html).not.toContain("og:locale:alternate");
  expect(count(html, /<title>/g)).toBe(1);
});

test("on the home page, the written page is hidden for visitors who will see something else", () => {
  const html = seoPage(template, pageOf("home", "es"), site);
  const script = /<script>(\(function.*?)<\/script>/.exec(html)[1];
  const run = (stored) => {
    const doc = { documentElement: { className: "" } };
    // eslint-disable-next-line no-new-func
    new Function("window", "document", script)({ localStorage: { getItem: (key) => (key in stored ? stored[key] : null) } }, doc);
    return doc.documentElement.className.includes("no-prerender");
  };
  expect(run({})).toBe(false); // a new visitor sees it
  expect(run({ "mikardex.lang": '"es"' })).toBe(false); // chose Spanish, and this is the Spanish page
  expect(run({ "mikardex.lang": '"en"' })).toBe(true); // chose English: React will switch
  expect(run({ "mikardex.dataset": "{}" })).toBe(true); // has an inventory loaded: goes to the tool
  expect(html).toContain("<style>.no-prerender #prerender{display:none}</style>");
});

test("texts are written safely into the page", () => {
  const page = { ...pageOf("home", "es"), title: 'A "quoted" <title> & more', html: "<p>costs $& and $1 and $`</p>" };
  const html = seoPage(template, page, site);
  expect(html).toContain("<title>A &quot;quoted&quot; &lt;title&gt; &amp; more</title>");
  expect(html).toContain('<div id="prerender"><p>costs $& and $1 and $`</p></div>');
});

test("the build stops if index.html is not what the script expects", () => {
  const page = pageOf("home", "es");
  expect(() => seoPage(template.replace('<div id="root"></div>', '<div id="app"></div>'), page, site)).toThrow(/root/);
  expect(() => seoPage(template.replace("</head>", ""), page, site)).toThrow(/head/);
});

test("the sitemap lists every page once, with its versions in other languages", () => {
  const sitemap = sitemapXml(pages, site);
  expect(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset ')).toBe(true);
  expect(count(sitemap, /<url>/g)).toBe(pages.length);
  for (const page of pages) {
    expect(count(sitemap, new RegExp(`<loc>${SITE_URL}${page.path}</loc>`, "g"))).toBe(1);
  }
  // the home page, the cycle count page and the Excel service exist in two languages: each version lists both and the default
  expect(count(sitemap, /hreflang="x-default"/g)).toBe(6);
  expect(count(sitemap, /hreflang="en" href="https:\/\/www\.mikardex\.cl\/en\/cycle-count-report\/"/g)).toBe(2);
  // the page in Spanish only lists nothing else
  const analysis = sitemap.split("<url>").find((block) => block.includes("/analisis-inventario-excel/"));
  expect(analysis).not.toContain("xhtml:link");
});

test("public/index.html and robots.txt use the official address", () => {
  const index = publicFile("index.html");
  expect(index).toContain('<html lang="es">');
  expect(index).toContain(`<link rel="canonical" href="${SITE_URL}/" />`);
  expect(publicFile("robots.txt")).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
});
