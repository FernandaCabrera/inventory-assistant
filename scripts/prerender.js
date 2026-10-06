// Runs after "react-scripts build" (see "build" in package.json).
//
// The page is drawn by JavaScript, so the HTML that the build leaves has no text in it. Google
// can run JavaScript, but it does so later and not always; other search engines, AI assistants
// and the previews in WhatsApp or LinkedIn do not run it at all. This script writes the home
// page into the HTML, once per language:
//
//   build/index.html      Spanish  ->  https://www.mikardex.cl/
//   build/en/index.html   English  ->  https://www.mikardex.cl/en/
//
// Each one gets its own title, description, canonical and hreflang (scripts/seoPage.js).
// The texts are the ones in src/i18n.js: nothing is written twice.
//
// If anything is not as expected the script stops with an error, the build fails and the site
// that is already published stays as it is.

const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");
const { seoPage } = require("./seoPage");

const root = path.join(__dirname, "..");
const buildDir = path.join(root, "build");

async function drawPages() {
  // The page's code is written for the browser's build tools (JSX, imports of .css). esbuild
  // turns it into one file Node can run. It is written to a temporary folder, not to build/.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mikardex-prerender-"));
  const outfile = path.join(tmp, "home.cjs");
  try {
    await esbuild.build({
      entryPoints: [path.join(__dirname, "home-entry.jsx")],
      outfile,
      bundle: true,
      platform: "node",
      format: "cjs",
      jsx: "automatic",
      loader: { ".js": "jsx", ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "error",
    });
    return require(outfile);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function check(condition, message) {
  if (!condition) throw new Error(`prerender: ${message}`);
}

async function main() {
  const templatePath = path.join(buildDir, "index.html");
  check(fs.existsSync(templatePath), "build/index.html not found. Run this after react-scripts build.");
  const template = fs.readFileSync(templatePath, "utf8");
  check(!template.includes('id="prerender"'), "build/index.html was already written by this script. Run npm run build again.");

  const { site, pages } = await drawPages();

  for (const page of pages) {
    // The drawn page has to be the home page, in its language, with its texts
    check(page.html.includes("<h1"), `the ${page.lang} page has no <h1>`);
    check(page.html.includes(page.h1), `the ${page.lang} page does not show its heading "${page.h1}"`);
    check(page.title && page.description, `the ${page.lang} page has no title or description (seoTitle, seoDescription in src/i18n.js)`);

    const html = seoPage(template, page, pages, site);
    const file = path.join(buildDir, page.path, "index.html");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
    console.log(`prerender: ${path.relative(root, file)}  (${page.lang}, ${site.url}${page.path}, ${Math.round(html.length / 1024)} kB)`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
