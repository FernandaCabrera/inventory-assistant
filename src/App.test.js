import { render, screen, fireEvent, act } from "@testing-library/react";
import App from "./App";

jest.mock("recharts", () => {
  const Stub = ({ children }) => <div>{children}</div>;
  return {
    BarChart: Stub, Bar: Stub, XAxis: Stub, YAxis: Stub, CartesianGrid: Stub, Tooltip: Stub, Cell: Stub,
    ResponsiveContainer: Stub, PieChart: Stub, Pie: Stub, Legend: Stub, ReferenceLine: Stub,
  };
});
jest.mock("exceljs/dist/exceljs.min.js", () => ({ Workbook: function Workbook() {} }));

beforeEach(() => {
  window.localStorage.clear();
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }));
  Element.prototype.scrollTo = () => {};
});

test("welcome screen offers upload and sample data, in both languages", () => {
  render(<App />);
  expect(screen.getByRole("button", { name: /Upload your Excel/ })).toBeInTheDocument();
  expect(screen.getByText("Try with sample data")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "ES" }));
  expect(screen.getByRole("button", { name: /Sube tu Excel/ })).toBeInTheDocument();
  expect(screen.getByText("Quién está detrás")).toBeInTheDocument();
  expect(screen.getByText(/99,99% de exactitud de inventario/)).toBeInTheDocument();
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

test("a stored upload on the free plan shows the dashboard locked", () => {
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
  window.localStorage.setItem("mikardex.uploadsUsed", "1");
  render(<App />);

  expect(screen.getByText(/stock.xlsx loaded, products: 2. Critical: 1 · Low: 0 · No sales: 1 · Excess: 0/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
  expect(screen.getByText("The dashboard is part of the paid plan")).toBeInTheDocument();
  expect(screen.getByText(/Capital is tied up in 1 of your products/)).toBeInTheDocument();

  // a second upload on the free plan opens the plan window instead of the file picker
  fireEvent.click(screen.getByText("Replace data"));
  expect(screen.getByText(/The free plan includes 1 file/)).toBeInTheDocument();
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

test("own file on the free plan: three rows of the order list, the rest behind the plan", () => {
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
  fireEvent.click(screen.getByRole("button", { name: "ES" }));
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
  fireEvent.click(screen.getByRole("button", { name: "EN" }));
  expect(screen.getByTestId("count-total")).toHaveValue(600);
  expect(screen.getByText(/of 600 locations were counted/)).toBeInTheDocument();
  expect(screen.getByText(/The first is Interfold paper towel x20/)).toBeInTheDocument();
});

test("the count report says where to count: cycle, filter and areas", () => {
  window.scrollTo = () => {};
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "ES" }));
  fireEvent.click(screen.getByTestId("counts-sample"));

  // the cycle is set at the top of the report, in days and months
  expect(screen.getByText("Ciclo de conteo:")).toBeInTheDocument();
  expect(screen.getByTestId("count-cycle")).toHaveValue("60");
  expect(screen.getByText("Dónde contar: ubicaciones fuera del ciclo de 60 días, por zona")).toBeInTheDocument();

  // only what is outside the cycle, then one area of it
  fireEvent.change(screen.getByTestId("count-last-filter"), { target: { value: "outside" } });
  const outside = Number(/Coincidencias: (\d+)/.exec(screen.getByTestId("count-last-matches").textContent)[1]);
  expect(outside).toBeGreaterThan(50);
  expect(screen.getByTestId("count-last").querySelector("tbody")).not.toHaveTextContent("Dentro del ciclo");
  const firstArea = screen.getByTestId("count-last-zones").querySelector("button");
  const inArea = Number(/· (\d+)/.exec(firstArea.textContent)[1]);
  fireEvent.click(firstArea);
  expect(firstArea).toHaveAttribute("aria-pressed", "true");
  expect(inArea).toBeLessThan(outside);

  // by the month of the last count
  fireEvent.change(screen.getByTestId("count-last-filter"), { target: { value: "2026-06" } });
  expect(screen.getByTestId("count-last-matches")).toHaveTextContent(/Coincidencias: \d+/);
  expect(screen.getByTestId("count-last").querySelector("tbody")).toHaveTextContent("jun 2026");
  expect(screen.getByTestId("count-last").querySelector("tbody")).not.toHaveTextContent("jul 2026");

  // a longer cycle leaves nothing outside it in a three-month example
  fireEvent.change(screen.getByTestId("count-cycle"), { target: { value: "90" } });
  fireEvent.change(screen.getByTestId("count-last-filter"), { target: { value: "outside" } });
  expect(screen.getByTestId("count-last-matches")).toHaveTextContent("Nada coincide con esa búsqueda.");
});

test("the dashboard has the cycle counts, and the way to the report and back", () => {
  window.scrollTo = () => {};
  jest.useFakeTimers();
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "ES" }));
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

  // back in the dashboard, the same figures as the report
  fireEvent.click(screen.getByTestId("count-back"));
  const block = screen.getByTestId("dash-counts");
  expect(block).toHaveTextContent("Dentro del ciclo");
  expect(block).toHaveTextContent("Fuera del ciclo");
  expect(block).toHaveTextContent("Dónde contar: ubicaciones fuera del ciclo de 60 días, por zona");
  fireEvent.click(screen.getByTestId("dash-counts-open"));
  expect(screen.getByTestId("count-conclusions")).toBeInTheDocument();
});
