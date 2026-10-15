// Visit counts with Vercel Web Analytics, without the npm package (its optional peer dependencies
// break npm install next to react-scripts). It does what the package does: Vercel gives each
// project its own address for the counter and hands it to the build as
// REACT_APP_VERCEL_OBSERVABILITY_BASEPATH, with optional settings in
// REACT_APP_VERCEL_OBSERVABILITY_CLIENT_CONFIG. On a computer and in tests there is no address,
// and nothing is loaded.

const absolute = (url) => (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/") ? url : `/${url}`);

// basePath, configString -> { src, dataset } for the script tag, or null when there is no counter
export function counterScript(basePath, configString) {
  let settings = {};
  try {
    settings = (configString && JSON.parse(configString).analytics) || {};
  } catch (err) {
    settings = {};
  }
  if (!basePath && !settings.scriptSrc) return null;

  const dataset = { sdkn: "@vercel/analytics/react", sdkv: "2.0.1" };
  ["viewEndpoint", "eventEndpoint", "sessionEndpoint"].forEach((key) => {
    if (settings[key]) dataset[key] = absolute(settings[key]);
  });
  if (settings.dsn) dataset.dsn = settings.dsn;
  if (settings.endpoint) dataset.endpoint = settings.endpoint;
  else if (basePath) dataset.endpoint = absolute(`${basePath}/insights`);

  const src = settings.scriptSrc ? absolute(settings.scriptSrc) : absolute(`${basePath}/insights/script.js`);
  return { src, dataset };
}

// Adds the counter to the page once. Returns true when it was added.
export function loadVisitCounter(doc, basePath, configString) {
  const script = counterScript(basePath, configString);
  if (!script || !doc || !doc.head) return false;
  const win = doc.defaultView || window;
  win.va =
    win.va ||
    function queue() {
      (win.vaq = win.vaq || []).push(arguments); // eslint-disable-line prefer-rest-params
    };
  if (doc.head.querySelector(`script[src="${script.src}"]`)) return false;
  const tag = doc.createElement("script");
  tag.src = script.src;
  tag.defer = true;
  Object.entries(script.dataset).forEach(([key, value]) => {
    tag.dataset[key] = value;
  });
  doc.head.appendChild(tag);
  return true;
}
