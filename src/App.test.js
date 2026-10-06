import { render, screen, fireEvent, act, within, waitFor } from "@testing-library/react";
import App from "./App";
import { exportLastCounted } from "./countExport";

jest.mock("recharts", () => {
  const Stub = ({ children }) => <div>{children}</div>;
  return {
    BarChart: Stub, Bar: Stub, XAxis: Stub, YAxis: Stub, CartesianGrid: Stub, Tooltip: Stub, Cell: Stub,
    ResponsiveContainer: Stub, PieChart: Stub, Pie: Stub, Legend: Stub, ReferenceLine: Stub,
  };
});
jest.mock("exceljs/dist/exceljs.min.js", () => ({ Workbook: function Workbook() {} }));
jest.mock("./countExport", () => ({ exportCountReport: jest.fn(() => Promise.resolve()), exportLastCounted: jest.fn(() => Promise.resolve()) }));

beforeEach(() => {
  window.localStorage.clear();
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }));
  Element.prototype.scrollTo = () => {};
});

test("welcome screen offers upload and sample data, in both languages", () => {
  render(<App />);
  expect(screen.getByRole("button", { name: /Upload your Excel/ })).toBeInTheDocument();
  expect(screen.getByText("Try with sample data")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("link", { name: "ES" }));
  expect(screen.getByRole("button", { name: /Sube tu Excel/ })).toBeInTheDocument();
  expect(screen.getByText("Quién está detrás")).toBeInTheDocument();
  expect(screen.getByText(/Trabajó en bodegas y control de inventario en Canadá y Nueva Zelanda/)).toBeInTheDocument();
  // no figures from a former employer on the page
  expect(screen.queryByText(/99,99|25,2 millones|Vancouver/)).not.toBeInTheDocument();
  expect(screen.getByText("Pregúntale a tu inventario")).toBeInTheDocument();
});

test("sample data opens the assistant with the dashboard unlocked", () => {
  jest.useFakeTimers();
  render(<App />);
  fireEvent.click(screen.getByText("Try with sample data"));
  act(() => {
    jest.runAllTimers();
  });
  jest.useRealTimers();

  expect(screen.getByText(/Sample data loaded: 46 products across 5 warehouses/)).toBeInTheDocument();
  expect(screen.getByText("0 of 3 free questions used")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
  expect(screen.getByText("SKUs by status")).toBeInTheDocument();
  expect(screen.queryByText("The dashboard is part of the paid plan")).not.toBeInTheDocument();
});

test("a stored upload on the free plan shows the dashboard locked", async () => {
  window.localStorage.setItem(
    "mikardex.dataset",
    JSON.stringify({
      source: "upload",
      fileName: "stock.xlsx",
      loadedAt: "2026-10-01T12:00:00.000Z",
      items: [
        { sku: "A1", name: "Cafe", warehouse: "Main", stock: 2, reorder_point: 30, lead_time_days: 7, avg_daily_usage: 3, unit_cost: 10 },
        { sku: "A2", name: "Te", warehouse: "Main", stock: 50, reorder_point: 0, lead_time_days: 7, avg_daily_usage: 0, unit_cost: 5 },
      ],
    })
  );
  window.localStorage.setItem("mikardex.uploadsUsed", "3");
  render(<App />);

  expect(screen.getByText(/stock.xlsx loaded, products: 2. Critical: 1 · Low: 0 · No sales: 1 · Excess: 0/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
  expect(screen.getByText("The dashboard is part of the paid plan")).toBeInTheDocument();
  expect(screen.getByText(/Capital is tied up in 1 of your products/)).toBeInTheDocument();

  // once the three free uploads are used, another one opens the plan window instead of the file picker
  fireEvent.click(screen.getByText("Replace data"));
  expect(screen.getByText(/The free trial includes 3 uploads of your Excel\. With the plan you upload your updated Excel every day/)).toBeInTheDocument();
  expect(screen.getByTestId("plan-price")).toHaveTextContent("Price: USD 12 per month");
  // the server has no PayPal set up: the plan is requested by email, there is no pay button
  expect(await screen.findByText("Request the plan")).toBeInTheDocument();
  expect(screen.queryByTestId("plan-pay")).not.toBeInTheDocument();
});

test("the free plan allows three uploads: the second and third open the file picker", () => {
  const items = [{ sku: "A1", name: "Cafe", warehouse: "Main", stock: 2, reorder_point: 30, lead_time_days: 7, avg_daily_usage: 3 }];
  window.localStorage.setItem("mikardex.dataset", JSON.stringify({ source: "upload", fileName: "stock.xlsx", loadedAt: "2026-10-01T12:00:00.000Z", items }));
  window.localStorage.setItem("mikardex.uploadsUsed", "2");
  render(<App />);

  fireEvent.click(screen.getByText("Replace data"));
  expect(screen.getByRole("dialog", { name: "Upload your inventory" })).toBeInTheDocument();
  expect(screen.queryByText(/The free plan includes/)).not.toBeInTheDocument();
});

test("the home page states the free trial in both languages", () => {
  render(<App />);
  expect(screen.getByText("Free trial: 3 uploads of your Excel and 3 questions. No sign-up.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "ES" }));
  expect(screen.getByText("Prueba gratis: 3 subidas de tu Excel y 3 preguntas. Sin registro.")).toBeInTheDocument();
});

test("the home page goes: how it works, the cycle count tool, free trial and plan, who is behind it", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("link", { name: "ES" }));
  const order = ["Cómo funciona", "Informe de conteos cíclicos", "Prueba gratis y plan", "Quién está detrás"].map((title) => screen.getByRole("heading", { name: title }));
  for (let i = 0; i < order.length - 1; i += 1) {
    // each heading comes before the next one in the page
    expect(order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }

  // the cycle count tool says who it is for, what to upload and what comes out
  const counts = within(screen.getByTestId("counts-band"));
  expect(counts.getByText("Otra herramienta · para bodegas")).toBeInTheDocument();
  ["Para quién", "Qué subes", "Qué obtienes"].forEach((label) => expect(counts.getByText(label)).toBeInTheDocument());

  // what is free, what the plan adds, and the price, before hitting any limit
  const plans = within(screen.getByTestId("plans"));
  expect(plans.getByText("3 subidas de tu Excel")).toBeInTheDocument();
  expect(plans.getByText("3 preguntas al asistente")).toBeInTheDocument();
  expect(plans.getByText("Qué se agota primero y las primeras 3 filas de la lista de compra")).toBeInTheDocument();
  expect(screen.getByTestId("home-price")).toHaveTextContent("USD 12 al mes");
  expect(plans.getByText("Sube tu Excel actualizado todos los días, sin límite")).toBeInTheDocument();

  // "See the plan" opens the plan window from the home page
  fireEvent.click(plans.getByRole("button", { name: /Ver el plan/ }));
  expect(screen.getByRole("dialog", { name: "Plan MiKardex" })).toBeInTheDocument();
  expect(await screen.findByText("Solicitar el plan")).toBeInTheDocument();
});

test("the AI prompt is not shown to visitors", () => {
  jest.useFakeTimers();
  render(<App />);
  fireEvent.click(screen.getByText("Try with sample data"));
  act(() => {
    jest.runAllTimers();
  });
  jest.useRealTimers();
  expect(screen.getByText("New conversation")).toBeInTheDocument();
  expect(screen.queryByText("View prompt")).not.toBeInTheDocument();
});

test("privacy notice opens from the home page", () => {
  render(<App />);
  fireEvent.click(screen.getAllByText("Privacy notice")[0]);
  expect(screen.getByRole("dialog", { name: "Privacy notice" })).toBeInTheDocument();
  expect(screen.getByText(/passes them to Anthropic, the provider of the AI model/)).toBeInTheDocument();
  expect(screen.getByText(/MiKardex is operated by Fernanda Cabrera. Contact: hola@mikardex.cl./)).toBeInTheDocument();
});

test("sample data: summary cards and the full order list", () => {
  jest.useFakeTimers();
  render(<App />);
  fireEvent.click(screen.getByText("Try with sample data"));
  act(() => {
    jest.runAllTimers();
  });
  jest.useRealTimers();

  expect(screen.getByText("Running out first")).toBeInTheDocument();
  expect(screen.getByText("To order today")).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/health$/));

  fireEvent.click(screen.getByText("See the order list"));
  expect(screen.getByText("What to order today")).toBeInTheDocument();
  expect(screen.getByText("Download order list (Excel)")).toBeInTheDocument();
  expect(screen.queryByText("Unlock the full list")).not.toBeInTheDocument();
  expect(screen.getByText(/^Total · Products: \d+$/)).toBeInTheDocument();
});

test("own file on the free plan: three rows of the order list, the rest behind the plan", async () => {
  const items = Array.from({ length: 6 }, (_, i) => ({
    sku: `A${i}`, name: `Product ${i}`, warehouse: "Main", stock: i, reorder_point: 30, lead_time_days: 7, avg_daily_usage: 3, unit_cost: 10,
  }));
  window.localStorage.setItem("mikardex.dataset", JSON.stringify({ source: "upload", fileName: "stock.xlsx", loadedAt: "2026-10-01T12:00:00.000Z", items }));
  window.localStorage.setItem("mikardex.uploadsUsed", "1");
  render(<App />);

  // summary: money stays behind the plan
  expect(screen.getByTestId("summary-cards")).toBeInTheDocument();
  expect(screen.queryByText(/Estimated order:/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /^Order list/ }));
  expect(screen.getByText("Product 0")).toBeInTheDocument();
  expect(screen.getByText("Product 2")).toBeInTheDocument();
  expect(screen.queryByText("Product 3")).not.toBeInTheDocument();
  expect(screen.getByText(/More products on the list: 3\./)).toBeInTheDocument();

  fireEvent.click(screen.getByText("Unlock the full list"));
  expect(screen.getByText("The full order list and its Excel download are part of the plan.")).toBeInTheDocument();
  expect(await screen.findByText("Request the plan")).toBeInTheDocument();
});

test("Home goes back to the first page and offers the way back to the loaded file", () => {
  const items = [{ sku: "A1", name: "Cafe", warehouse: "Main", stock: 2, reorder_point: 30, lead_time_days: 7, avg_daily_usage: 3 }];
  window.localStorage.setItem("mikardex.dataset", JSON.stringify({ source: "upload", fileName: "stock.xlsx", loadedAt: "2026-10-01T12:00:00.000Z", items }));
  window.localStorage.setItem("mikardex.uploadsUsed", "1");
  window.scrollTo = () => {};
  render(<App />);

  // opens straight into the loaded file
  expect(screen.getByText(/stock.xlsx loaded, products: 1/)).toBeInTheDocument();
  fireEvent.click(screen.getByTestId("home"));

  // the home page, with its sections and the way back
  expect(screen.getByText("How it works")).toBeInTheDocument();
  expect(screen.getByText("Continue with stock.xlsx")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Replace data/ })).toBeInTheDocument();

  fireEvent.click(screen.getByTestId("continue"));
  expect(screen.getByText(/stock.xlsx loaded, products: 1/)).toBeInTheDocument();

  // removing the data leaves a clean home page and an empty browser store
  fireEvent.click(screen.getByTestId("home"));
  window.confirm = () => true;
  fireEvent.click(screen.getByText("Remove my data from this browser"));
  expect(screen.queryByTestId("continue")).not.toBeInTheDocument();
  expect(window.localStorage.getItem("mikardex.dataset")).toBeNull();
  expect(screen.getByRole("button", { name: /Upload your Excel/ })).toBeInTheDocument();
});

test("after trying the sample, the home page still leads back to the visitor's own file", () => {
  const items = [{ sku: "A1", name: "Cafe", warehouse: "Main", stock: 2, reorder_point: 30, lead_time_days: 7, avg_daily_usage: 3 }];
  window.localStorage.setItem("mikardex.dataset", JSON.stringify({ source: "upload", fileName: "stock.xlsx", loadedAt: "2026-10-01T12:00:00.000Z", items }));
  window.scrollTo = () => {};
  jest.useFakeTimers();
  render(<App />);
  fireEvent.click(screen.getByTestId("home"));
  fireEvent.click(screen.getByText("Try with sample data"));
  act(() => {
    jest.runAllTimers();
  });
  jest.useRealTimers();
  expect(screen.getByText(/Sample data loaded: 46 products/)).toBeInTheDocument();

  fireEvent.click(screen.getByTestId("home"));
  fireEvent.click(screen.getByText("Continue with stock.xlsx"));
  expect(screen.getByText(/stock.xlsx loaded, products: 1/)).toBeInTheDocument();
});

test("the cycle count example shows its conclusions and stays in the browser", () => {
  window.scrollTo = () => {};
  render(<App />);
  fireEvent.click(screen.getByRole("link", { name: "ES" }));
  expect(screen.getByText("Informe de conteos cíclicos")).toBeInTheDocument();
  global.fetch.mockClear();

  fireEvent.click(screen.getByTestId("counts-sample"));
  expect(screen.getByText("Conclusiones")).toBeInTheDocument();
  expect(screen.getByText(/La exactitud por línea es/)).toBeInTheDocument();
  expect(screen.getByText(/Se contaron \d+ de 480 ubicaciones/)).toBeInTheDocument();
  expect(screen.getByTestId("count-lots")).toBeInTheDocument();
  expect(screen.getByTestId("count-people")).toHaveTextContent("Estos nombres no salen de tu navegador");

  // how long since a location was counted: any location can be looked up
  expect(screen.getByText("Hace cuánto no se cuenta cada ubicación")).toBeInTheDocument();
  fireEvent.change(screen.getByTestId("count-last-search"), { target: { value: "d-11-1" } });
  expect(screen.getByTestId("count-last-matches")).toHaveTextContent("Coincidencias: 1");
  expect(screen.getByTestId("count-last")).toHaveTextContent("CD1 · D-11-1");
  fireEvent.change(screen.getByTestId("count-last-search"), { target: { value: "zz-99" } });
  expect(screen.getByTestId("count-last-matches")).toHaveTextContent("Nada coincide con esa búsqueda.");
  fireEvent.change(screen.getByTestId("count-last-search"), { target: { value: "" } });

  // the coverage sentence depends on the number typed by the analyst
  fireEvent.change(screen.getByTestId("count-total"), { target: { value: "" } });
  expect(screen.queryByText(/Se contaron \d+ de 480 ubicaciones/)).not.toBeInTheDocument();
  expect(screen.getByText(/Escribe arriba cuántas ubicaciones tiene la bodega/)).toBeInTheDocument();

  expect(global.fetch).not.toHaveBeenCalled();
  expect(Object.keys(window.localStorage).filter((key) => /count/i.test(key))).toEqual([]);

  fireEvent.change(screen.getByTestId("count-total"), { target: { value: "600" } });
  fireEvent.click(screen.getByTestId("home"));
  expect(screen.getByTestId("counts-continue")).toHaveTextContent("Datos de ejemplo");

  // what was typed is still there on the way back, and after a change of language
  fireEvent.click(screen.getByTestId("counts-continue"));
  expect(screen.getByTestId("count-total")).toHaveValue(600);
  fireEvent.click(screen.getByRole("link", { name: "EN" }));
  expect(screen.getByTestId("count-total")).toHaveValue(600);
  expect(screen.getByText(/of 600 locations were counted/)).toBeInTheDocument();
  expect(screen.getByText(/The first is Interfold paper towel x20/)).toBeInTheDocument();
});

test("the count report says where to count: cycle, filter and areas", () => {
  window.scrollTo = () => {};
  render(<App />);
  fireEvent.click(screen.getByRole("link", { name: "ES" }));
  fireEvent.click(screen.getByTestId("counts-sample"));

  // the cycle is set at the top of the report, in days and months
  expect(screen.getByText("Ciclo de conteo:")).toBeInTheDocument();
  expect(screen.getByTestId("count-cycle")).toHaveValue("60");
  expect(screen.getByText("Dónde contar: ubicaciones fuera del ciclo de 60 días, por zona")).toBeInTheDocument();

  // only what is outside the cycle, then one area of it
  fireEvent.change(screen.getByTestId("count-last-filter"), { target: { value: "outside" } });
  const outside = Number(/Coincidencias: (\d+)/.exec(screen.getByTestId("count-last-matches").textContent)[1]);
  expect(outside).toBeGreaterThan(50);
  expect(screen.getByTestId("count-last-rows")).not.toHaveTextContent("Dentro del ciclo");
  const firstArea = within(screen.getByTestId("count-last-zones")).getAllByRole("button")[0];
  const inArea = Number(/· (\d+)/.exec(firstArea.textContent)[1]);
  fireEvent.click(firstArea);
  expect(firstArea).toHaveAttribute("aria-pressed", "true");
  expect(inArea).toBeLessThan(outside);

  // by the month of the last count
  fireEvent.change(screen.getByTestId("count-last-filter"), { target: { value: "2026-06" } });
  expect(screen.getByTestId("count-last-matches")).toHaveTextContent(/Coincidencias: \d+/);
  expect(screen.getByTestId("count-last-rows")).toHaveTextContent("jun 2026");
  expect(screen.getByTestId("count-last-rows")).not.toHaveTextContent("jul 2026");

  // a longer cycle leaves nothing outside it in a three-month example
  fireEvent.change(screen.getByTestId("count-cycle"), { target: { value: "90" } });
  fireEvent.change(screen.getByTestId("count-last-filter"), { target: { value: "outside" } });
  expect(screen.getByTestId("count-last-matches")).toHaveTextContent("Nada coincide con esa búsqueda.");
});

test("the dashboard has the cycle counts, and the way to the report and back", () => {
  window.scrollTo = () => {};
  jest.useFakeTimers();
  render(<App />);
  fireEvent.click(screen.getByRole("link", { name: "ES" }));
  fireEvent.click(screen.getByText("Probar con datos de ejemplo"));
  act(() => {
    jest.runAllTimers();
  });
  jest.useRealTimers();
  fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));

  // nothing loaded yet: the dashboard asks for the count report
  expect(screen.getByTestId("dash-counts")).toHaveTextContent("Sube tu reporte de conteos para ver aquí qué parte de la bodega toca contar.");
  fireEvent.click(screen.getByRole("button", { name: /Ver un ejemplo/ }));
  expect(screen.getByTestId("cycle-counts")).toBeInTheDocument();

  // the report opened as the tab next to the dashboard; back in the dashboard, the same figures
  expect(screen.getByRole("button", { name: "Conteo cíclico" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
  const block = screen.getByTestId("dash-counts");
  expect(block).toHaveTextContent("Dentro del ciclo");
  expect(block).toHaveTextContent("Fuera del ciclo");
  expect(block).toHaveTextContent("Dónde contar: ubicaciones fuera del ciclo de 60 días, por zona");
  fireEvent.click(screen.getByTestId("dash-counts-open"));
  expect(screen.getByTestId("count-conclusions")).toBeInTheDocument();
});

test("the cycle count has its own tab next to the dashboard", () => {
  window.scrollTo = () => {};
  jest.useFakeTimers();
  render(<App />);
  fireEvent.click(screen.getByRole("link", { name: "ES" }));
  fireEvent.click(screen.getByText("Probar con datos de ejemplo"));
  act(() => {
    jest.runAllTimers();
  });
  jest.useRealTimers();

  const tabs = screen.getAllByRole("button").map((button) => button.textContent);
  expect(tabs.indexOf("Conteo cíclico")).toBe(tabs.indexOf("Dashboard") + 1);

  // nothing loaded: the tab offers to upload a report or see the example
  fireEvent.click(screen.getByRole("button", { name: "Conteo cíclico" }));
  expect(screen.getByTestId("counts-tab-empty")).toHaveTextContent("Informe de conteos cíclicos");
  fireEvent.click(screen.getByTestId("counts-sample"));
  expect(screen.getByTestId("count-conclusions")).toBeInTheDocument();

  // the other tabs are still there, and the report is still in its tab on the way back
  fireEvent.click(screen.getByRole("button", { name: "Asistente" }));
  expect(screen.queryByTestId("cycle-counts")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Conteo cíclico" }));
  expect(screen.getByTestId("cycle-counts")).toBeInTheDocument();

  // from the home page, the report opens in its tab too
  fireEvent.click(screen.getByTestId("home"));
  fireEvent.click(screen.getByTestId("counts-continue"));
  expect(screen.getByTestId("cycle-counts")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
});

test("the list of last counts is exported as it stands on screen", async () => {
  window.scrollTo = () => {};
  exportLastCounted.mockClear();
  render(<App />);
  fireEvent.click(screen.getByRole("link", { name: "ES" }));
  fireEvent.click(screen.getByTestId("counts-sample"));

  fireEvent.change(screen.getByTestId("count-last-filter"), { target: { value: "outside" } });
  const outside = Number(/Coincidencias: (\d+)/.exec(screen.getByTestId("count-last-matches").textContent)[1]);
  expect(screen.getByTestId("count-last-export")).toHaveTextContent(`Exportar esta lista (Excel) · ${outside}`);
  fireEvent.click(screen.getByTestId("count-last-export"));
  await waitFor(() => expect(exportLastCounted).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByTestId("count-last-export")).toHaveTextContent("Exportar esta lista"));
  const sent = exportLastCounted.mock.calls[0][0];
  expect(sent.rows).toHaveLength(outside); // every row of the filter, not only the ten on screen
  expect(sent.rows.every((row) => row.overdue)).toBe(true);
  expect(sent.details).toEqual({ filter: "Fuera del ciclo (más de 60 días sin contar)", zone: null, query: "" });
  expect(sent.fileName).toBe("Datos de ejemplo");

  // an area and a search narrow what is exported
  fireEvent.click(within(screen.getByTestId("count-last-zones")).getAllByRole("button")[0]);
  fireEvent.click(screen.getByTestId("count-last-export"));
  await waitFor(() => expect(exportLastCounted).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByTestId("count-last-export")).toHaveTextContent("Exportar esta lista"));
  const narrowed = exportLastCounted.mock.calls[1][0];
  expect(narrowed.rows.length).toBeLessThan(outside);
  expect(new Set(narrowed.rows.map((row) => row.zone)).size).toBe(1);
  expect(narrowed.details.zone).toBe(narrowed.rows[0].zone);

  fireEvent.change(screen.getByTestId("count-last-search"), { target: { value: "zz-99" } });
  expect(screen.getByTestId("count-last-export")).toBeDisabled();
});

// The address decides the language, so Google (which browses in English) reads Spanish at
// mikardex.cl/ and English at mikardex.cl/en/.

test("mikardex.cl/ is in Spanish for a new visitor, also with a browser in English", async () => {
  window.history.replaceState(null, "", "/");
  render(<App />);
  expect(screen.getByRole("button", { name: /Sube tu Excel/ })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pregúntale a tu inventario");
  expect(document.documentElement.lang).toBe("es");
  expect(document.title).toMatch(/^MiKardex · Analiza tu inventario desde Excel/);
  expect(window.location.pathname).toBe("/");
  expect(screen.getByRole("link", { name: "ES" })).toHaveAttribute("aria-current", "true");
  expect(screen.getByRole("link", { name: "EN" })).toHaveAttribute("href", "/en/");

  // the browser of the tests is in English: the page stays in Spanish and offers English
  const offer = await screen.findByTestId("other-language");
  expect(offer).toHaveTextContent("View in English");
  expect(offer).toHaveAttribute("href", "/en/");
  fireEvent.click(offer);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ask Your Inventory");
  expect(window.location.pathname).toBe("/en/");
  expect(screen.queryByTestId("other-language")).not.toBeInTheDocument();
});

test("the language switch moves the address with it and is remembered", () => {
  render(<App />); // starts at /en/
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ask Your Inventory");
  expect(document.documentElement.lang).toBe("en");
  expect(document.title).toMatch(/^MiKardex · Inventory analysis from your Excel/);
  expect(screen.queryByTestId("other-language")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("link", { name: "ES" }));
  expect(window.location.pathname).toBe("/");
  expect(document.documentElement.lang).toBe("es");
  expect(JSON.parse(window.localStorage.getItem("mikardex.lang"))).toBe("es");

  fireEvent.click(screen.getByRole("link", { name: "EN" }));
  expect(window.location.pathname).toBe("/en/");
  expect(JSON.parse(window.localStorage.getItem("mikardex.lang"))).toBe("en");
});

test("a visitor who chose English before gets English at mikardex.cl/, and the address follows", () => {
  window.history.replaceState(null, "", "/");
  window.localStorage.setItem("mikardex.lang", JSON.stringify("en"));
  render(<App />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ask Your Inventory");
  expect(window.location.pathname).toBe("/en/");
});

test("Ctrl+click on a language opens it as a normal link instead of switching in place", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("link", { name: "ES" }), { ctrlKey: true });
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ask Your Inventory");
  expect(window.location.pathname).toBe("/en/");
});
