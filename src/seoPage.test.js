// What Google reads: the address of each language, the tags in the <head> and the files in public/.

import fs from "fs";
import path from "path";
import { LANGS, LANG_PATHS, LOCALES, langFromPath, translator } from "./i18n";
import { SITE_URL } from "./config";
import { seoPage } from "../scripts/seoPage";

const publicFile = (name) => fs.readFileSync(path.join(__dirname, "..", "public", name), "utf8");
// what "react-scripts build" hands to scripts/prerender.js, close enough for these checks
const template = publicFile("index.html").replace(/%PUBLIC_URL%/g, "");

const site = { url: SITE_URL, name: "MiKardex", image: "/logo512.png", defaultLang: "es", ownerName: "Someone", ownerLinkedin: "https://example.com/in/someone", storagePrefix: "mikardex." };
const pages = LANGS.map((lang) => ({
  lang,
  path: LANG_PATHS[lang],
  locale: LOCALES[lang],
  title: translator(lang)("seoTitle"),
  description: translator(lang)("seoDescription"),
  html: `<h1>${translator(lang)("title")}</h1>`,
}));
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

test("each language has its own title and description, short enough for a search result", () => {
  for (const lang of LANGS) {
    const t = translator(lang);
    expect(t("seoTitle")).toMatch(/^MiKardex · /);
    expect(t("seoTitle").length).toBeLessThanOrEqual(90);
    expect(t("seoDescription").length).toBeGreaterThan(70);
    expect(t("seoDescription").length).toBeLessThanOrEqual(200);
  }
  expect(translator("es")("seoTitle")).not.toBe(translator("en")("seoTitle"));
  expect(translator("es")("seoDescription")).not.toBe(translator("en")("seoDescription"));
});

test.each(LANGS)("the %s page gets one of each tag, its own address and the link to the other language", (lang) => {
  const page = pages.find((p) => p.lang === lang);
  const html = seoPage(template, page, pages, site);
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

test("the written home page is hidden for visitors who will see something else", () => {
  const html = seoPage(template, pages[0], pages, site);
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
  const page = { ...pages[0], title: 'A "quoted" <title> & more', html: "<p>costs $& and $1 and $`</p>" };
  const html = seoPage(template, page, [page, pages[1]], site);
  expect(html).toContain("<title>A &quot;quoted&quot; &lt;title&gt; &amp; more</title>");
  expect(html).toContain('<div id="prerender"><p>costs $& and $1 and $`</p></div>');
});

test("the build stops if index.html is not what the script expects", () => {
  expect(() => seoPage(template.replace('<div id="root"></div>', '<div id="app"></div>'), pages[0], pages, site)).toThrow(/root/);
  expect(() => seoPage(template.replace("</head>", ""), pages[0], pages, site)).toThrow(/head/);
});

test("public/index.html, the sitemap and robots.txt use the official address", () => {
  const index = publicFile("index.html");
  expect(index).toContain('<html lang="es">');
  expect(index).toContain(`<link rel="canonical" href="${SITE_URL}/" />`);

  const sitemap = publicFile("sitemap.xml");
  for (const lang of LANGS) {
    expect(sitemap).toContain(`<loc>${SITE_URL}${LANG_PATHS[lang]}</loc>`);
    // every page lists every language
    expect(count(sitemap, new RegExp(`hreflang="${lang}" href="${SITE_URL}${LANG_PATHS[lang]}"`, "g"))).toBe(LANGS.length);
  }
  expect(publicFile("robots.txt")).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
});
