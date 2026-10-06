// Draws the home page of each language to plain HTML, with the same components and the same
// texts as the live page. scripts/prerender.js bundles this file and runs it when the site is built.

import { renderToStaticMarkup } from "react-dom/server";
import App from "../src/App";
import { LANGS, LANG_PATHS, LOCALES, translator } from "../src/i18n";
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

export const pages = LANGS.map((lang) => {
  const t = translator(lang);
  return {
    lang,
    path: LANG_PATHS[lang],
    locale: LOCALES[lang],
    title: t("seoTitle"),
    description: t("seoDescription"),
    h1: t("title"),
    html: renderToStaticMarkup(<App path={LANG_PATHS[lang]} />),
  };
});
