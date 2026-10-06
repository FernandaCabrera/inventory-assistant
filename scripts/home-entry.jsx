// Draws every page of the site (src/pages.js) to plain HTML, with the same components and the
// same texts as the live page. scripts/prerender.js bundles this file and runs it when the site
// is built.

import { renderToStaticMarkup } from "react-dom/server";
import App from "../src/App";
import { LANGS, LOCALES, translator } from "../src/i18n";
import { PAGES } from "../src/pages";
import { landingText } from "../src/landingText";
import { SITE_URL, OWNER_NAME, OWNER_LINKEDIN } from "../src/config";
import { PREFIX } from "../src/storage";

export const site = {
  url: SITE_URL,
  name: "MiKardex",
  image: "/logo512.png", // shown when the link is shared
  defaultLang: LANGS[0], // the language of mikardex.cl/ and the one offered when no other fits
  ownerName: OWNER_NAME,
  ownerLinkedin: OWNER_LINKEDIN,
  storagePrefix: PREFIX,
};

// What Google shows for a page: the home page takes it from src/i18n.js, the others from src/landingText.js
function searchTexts(id, lang) {
  if (id !== "home") return landingText(id, lang);
  const t = translator(lang);
  return { seoTitle: t("seoTitle"), seoDescription: t("seoDescription"), h1: t("title") };
}

export const pages = Object.keys(PAGES).flatMap((id) => {
  const langs = LANGS.filter((lang) => PAGES[id][lang]);
  // the same page in every language it exists in, to link the versions to each other
  const alternates = langs.map((lang) => ({ lang, path: PAGES[id][lang], locale: LOCALES[lang] }));
  return langs.map((lang) => {
    const texts = searchTexts(id, lang);
    return {
      id,
      lang,
      path: PAGES[id][lang],
      locale: LOCALES[lang],
      isHome: id === "home",
      alternates,
      title: texts.seoTitle,
      description: texts.seoDescription,
      h1: texts.h1,
      html: renderToStaticMarkup(<App path={PAGES[id][lang]} />),
    };
  });
});
