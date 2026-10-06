// Writes one language's page from the index.html that "react-scripts build" leaves in build/.
// Two things go in:
//   1. In the <head>, what Google and link previews read: title, description, the official
//      address of the page (canonical), the address of the same page in the other language
//      (hreflang), and the data for previews when the link is shared.
//   2. Inside <div id="root">, the home page already written out, so the text is in the HTML
//      before any JavaScript runs. React draws the real page on top of it when it loads.
// Nothing here reads files: scripts/prerender.js does that and calls seoPage() once per language.

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Tags this script owns. Whatever index.html brought is taken out and written again, so there
// is never a second title or a second canonical.
const OWNED_TAGS = [
  /<title>[\s\S]*?<\/title>/gi,
  /<meta\s+name="description"[^>]*>/gi,
  /<meta\s+(?:property|name)="(?:og|twitter):[^"]*"[^>]*>/gi,
  /<link\s+rel="canonical"[^>]*>/gi,
  /<link\s+rel="alternate"\s+hreflang="[^>]*>/gi,
  /<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/gi,
];

function pageUrl(site, page) {
  return site.url + page.path;
}

// Structured data: tells Google the name of the site and what the tool is
function structuredData(site, page) {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${site.url}/#website`, url: `${site.url}/`, name: site.name },
      {
        "@type": "SoftwareApplication",
        name: site.name,
        url: pageUrl(site, page),
        description: page.description,
        inLanguage: page.lang,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        author: { "@type": "Person", name: site.ownerName, sameAs: site.ownerLinkedin },
      },
    ],
  };
  // "<" is written as < so no text can close the <script> tag early
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

// The page written into the HTML is the home page in this page's language. It is hidden for the
// two visitors who will see something else once React loads, so they never see it flash by:
// someone with an inventory already loaded (goes straight to the tool) and someone who chose the
// other language before.
function hidePrerenderScript(site, page, pages) {
  const stored = (lang) => JSON.stringify(lang); // how src/storage.js saves a value
  const others = pages.filter((p) => p.lang !== page.lang).map((p) => stored(p.lang));
  return (
    "(function(){try{var s=window.localStorage,l=s.getItem(" +
    JSON.stringify(`${site.storagePrefix}lang`) +
    ");if(s.getItem(" +
    JSON.stringify(`${site.storagePrefix}dataset`) +
    ")||" +
    JSON.stringify(others) +
    '.indexOf(l)>-1)document.documentElement.className+=" no-prerender"}catch(e){}})();'
  );
}

function headTags(site, page, pages) {
  const url = pageUrl(site, page);
  const fallback = pages.find((p) => p.lang === site.defaultLang) || pages[0];
  const tags = [
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${escapeHtml(page.description)}"/>`,
    `<link rel="canonical" href="${escapeHtml(url)}"/>`,
    ...pages.map((p) => `<link rel="alternate" hreflang="${p.lang}" href="${escapeHtml(pageUrl(site, p))}"/>`),
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(pageUrl(site, fallback))}"/>`,
    '<meta property="og:type" content="website"/>',
    `<meta property="og:site_name" content="${escapeHtml(site.name)}"/>`,
    `<meta property="og:title" content="${escapeHtml(page.title)}"/>`,
    `<meta property="og:description" content="${escapeHtml(page.description)}"/>`,
    `<meta property="og:url" content="${escapeHtml(url)}"/>`,
    `<meta property="og:image" content="${escapeHtml(site.url + site.image)}"/>`,
    `<meta property="og:locale" content="${escapeHtml(page.locale.replace("-", "_"))}"/>`,
    ...pages
      .filter((p) => p.lang !== page.lang)
      .map((p) => `<meta property="og:locale:alternate" content="${escapeHtml(p.locale.replace("-", "_"))}"/>`),
    '<meta name="twitter:card" content="summary"/>',
    `<script type="application/ld+json">${structuredData(site, page)}</script>`,
    "<style>.no-prerender #prerender{display:none}</style>",
    `<script>${hidePrerenderScript(site, page, pages)}</script>`,
  ];
  return tags.join("");
}

// Replaces exactly one match, and stops the build if index.html no longer has what is expected:
// better a failed build than a page published without its title or its text.
function replaceOnce(html, pattern, replacement, what) {
  const matches = html.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`));
  if (!matches || matches.length !== 1) {
    throw new Error(`seoPage: expected one ${what} in index.html, found ${matches ? matches.length : 0}`);
  }
  // a function, so "$" in the text is never read as a replacement pattern
  return html.replace(pattern, () => replacement);
}

// template: the built index.html.
// page:  { lang, path, locale, title, description, html } — html is the home page already drawn.
// pages: every language's page, to link them to each other.
// site:  { url, name, image, defaultLang, ownerName, ownerLinkedin, storagePrefix }
function seoPage(template, page, pages, site) {
  let html = template;
  for (const tag of OWNED_TAGS) html = html.replace(tag, "");
  html = replaceOnce(html, /<html\b[^>]*>/i, `<html lang="${escapeHtml(page.lang)}">`, "<html> tag");
  html = replaceOnce(html, /<\/head>/i, `${headTags(site, page, pages)}</head>`, "</head>");
  html = replaceOnce(html, /<div id="root">\s*<\/div>/i, `<div id="root"><div id="prerender">${page.html}</div></div>`, 'empty <div id="root">');
  return html;
}

module.exports = { seoPage, escapeHtml };
