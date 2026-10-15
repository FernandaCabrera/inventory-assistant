import { counterScript, loadVisitCounter } from "./visits";

test("no address from Vercel, no counter: on a computer and in tests nothing is loaded", () => {
  expect(counterScript(undefined, undefined)).toBeNull();
  expect(counterScript("", "")).toBeNull();
  expect(loadVisitCounter(document, undefined, undefined)).toBe(false);
  expect(document.head.querySelector("script")).toBeNull();
});

test("the counter uses the project's own address, as Vercel's package does", () => {
  expect(counterScript("/a1b2c3", undefined)).toEqual({
    src: "/a1b2c3/insights/script.js",
    dataset: { sdkn: "@vercel/analytics/react", sdkv: "2.0.1", endpoint: "/a1b2c3/insights" },
  });
  expect(counterScript("a1b2c3", "{not json").src).toBe("/a1b2c3/insights/script.js");
  const configured = counterScript("/a1b2c3", JSON.stringify({ analytics: { scriptSrc: "/x/script.js", viewEndpoint: "x/view", dsn: "d1" } }));
  expect(configured.src).toBe("/x/script.js");
  expect(configured.dataset).toMatchObject({ viewEndpoint: "/x/view", dsn: "d1", endpoint: "/a1b2c3/insights" });
});

test("it is added to the page once", () => {
  expect(loadVisitCounter(document, "/a1b2c3", undefined)).toBe(true);
  expect(loadVisitCounter(document, "/a1b2c3", undefined)).toBe(false);
  const tags = document.head.querySelectorAll('script[src="/a1b2c3/insights/script.js"]');
  expect(tags).toHaveLength(1);
  expect(tags[0].defer).toBe(true);
  expect(tags[0].dataset.endpoint).toBe("/a1b2c3/insights");
  window.va("pageview");
  expect(window.vaq).toHaveLength(1);
});
