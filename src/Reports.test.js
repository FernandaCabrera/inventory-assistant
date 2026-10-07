// The downloads on the page: the executive report in the assistant tab and the dashboard in
// PowerPoint. The files themselves are checked in reportFiles.test.js; here the writers are
// stand-ins, to see when they are called and with what.

import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { TextEncoder, TextDecoder } from "util";
import App from "./App";
import { downloadExecutivePdf } from "./reportPdf";
import { downloadActionPlan, downloadAnalyzedInventory } from "./reportExcel";
import { downloadDashboardPptx } from "./dashboardPptx";

// These tests are about the page without the visitor's account, as it works when the server cannot
// run accounts. The page with accounts is tested in Account.test.js.
jest.mock("./config", () => ({ ...jest.requireActual("./config"), ACCOUNTS_ON: false }));
jest.mock("recharts", () => {
  const Stub = ({ children }) => <div>{children}</div>;
  return {
    BarChart: Stub, Bar: Stub, XAxis: Stub, YAxis: Stub, CartesianGrid: Stub, Tooltip: Stub, Cell: Stub,
    ResponsiveContainer: Stub, PieChart: Stub, Pie: Stub, Legend: Stub, ReferenceLine: Stub,
  };
});
jest.mock("exceljs/dist/exceljs.min.js", () => ({ Workbook: function Workbook() {} }));
jest.mock("./countExport", () => ({ exportCountReport: jest.fn(() => Promise.resolve()), exportLastCounted: jest.fn(() => Promise.resolve()) }));
jest.mock("./reportPdf", () => ({ downloadExecutivePdf: jest.fn(() => Promise.resolve()) }));
jest.mock("./reportExcel", () => ({ downloadActionPlan: jest.fn(() => Promise.resolve()), downloadAnalyzedInventory: jest.fn(() => Promise.resolve()) }));
jest.mock("./dashboardPptx", () => ({ downloadDashboardPptx: jest.fn(() => Promise.resolve()) }));

beforeAll(() => {
  global.TextDecoder = global.TextDecoder || TextDecoder;
});

beforeEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }));
  Element.prototype.scrollTo = () => {};
  window.scrollTo = () => {};
});

const INVENTORY = [
  "Código;Producto;Bodega;Stock;Ventas últimos 30 días;Costo unitario",
  "A1;Café grano 1 kg;Central;12;45;9500",
  "A2;Té verde 100 bolsas;Central;50;8;4200",
  "A3;Azúcar 1 kg;Central;0;30;1100",
];

async function uploadInventory() {
  fireEvent.click(screen.getByRole("button", { name: /Upload your Excel/ }));
  const bytes = new TextEncoder().encode(INVENTORY.join("\n"));
  fireEvent.change(screen.getByTestId("file-input"), { target: { files: [{ name: "stock.csv", arrayBuffer: () => Promise.resolve(bytes.buffer) }] } });
  await screen.findByRole("dialog", { name: "Check the columns" });
  fireEvent.click(screen.getByRole("button", { name: "Analyze inventory" }));
}

// The sample opens after a short scan animation
async function openSample(label = /Try with sample data/) {
  fireEvent.click(screen.getByRole("button", { name: label }));
  await screen.findByTestId("report-card");
}

// the last call of a writer, once the button has gone back to rest
async function lastCall(writer) {
  await waitFor(() => expect(writer).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.queryByText("Preparing...")).not.toBeInTheDocument());
  return writer.mock.calls[0][0];
}

test("with the sample data, the executive report downloads as a PDF and two Excel files", async () => {
  render(<App />);
  await openSample();

  const card = within(screen.getByTestId("report-card"));
  expect(card.getByText("Executive report")).toBeInTheDocument();
  expect(card.getByText(/ready to send: a report in PDF and two Excel files/)).toBeInTheDocument();
  expect(card.getByText(/With the sample data the downloads are open/)).toBeInTheDocument();

  fireEvent.click(card.getByRole("button", { name: "Report (PDF)" }));
  const pdf = await lastCall(downloadExecutivePdf);
  expect(pdf.sourceName).toBe("Sample data");
  expect(pdf.lang).toBe("en");
  expect(pdf.report.kpis).toMatchObject({ skus: 46, warehouses: 5, hasCost: true });
  expect(pdf.text.findings[0]).toBe("Below the reorder point: 18 of 46 products (39%). At a critical level: 9.");

  fireEvent.click(card.getByRole("button", { name: "Action plan (Excel)" }));
  expect((await lastCall(downloadActionPlan)).report.orders.rows).toHaveLength(18);
  fireEvent.click(card.getByRole("button", { name: "Analyzed inventory (Excel)" }));
  expect((await lastCall(downloadAnalyzedInventory)).items).toHaveLength(46);
});

test("the report uses the days of cover chosen on the order list", async () => {
  render(<App />);
  await openSample();
  fireEvent.click(screen.getByRole("button", { name: /Order list/ }));
  fireEvent.change(screen.getByTestId("cover-days"), { target: { value: "60" } });
  fireEvent.click(screen.getByRole("button", { name: "Assistant" }));
  fireEvent.click(screen.getByRole("button", { name: "Report (PDF)" }));
  const pdf = await lastCall(downloadExecutivePdf);
  expect(pdf.report.orders.coverDays).toBe(60);
  expect(pdf.text.findings.join(" ")).toMatch(/sized to cover 60 days of sales/);
});

test("the dashboard tab downloads the charts as a PowerPoint file", async () => {
  render(<App />);
  await openSample();
  fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
  const bar = within(screen.getByTestId("dashboard-download"));
  expect(bar.getByText("Every chart with its reading, in a file you can edit.")).toBeInTheDocument();
  fireEvent.click(bar.getByRole("button", { name: /Download in PowerPoint/ }));
  const deck = await lastCall(downloadDashboardPptx);
  expect(Object.keys(deck.text.reading)).toEqual(["status", "warehouse", "cover", "tiedUp"]);
  expect(deck.text.charts.cover).toHaveLength(10);
});

test("in Spanish the sample data is in Spanish, and it follows the language switch", async () => {
  window.localStorage.setItem("mikardex.lang", JSON.stringify("es"));
  render(<App />);
  await openSample(/Probar con datos de ejemplo/);
  expect(screen.getByText(/Datos de ejemplo cargados: 46 productos en 5 bodegas/)).toBeInTheDocument();
  expect(screen.getAllByText("Pechuga de pollo congelada (caja 5 kg)").length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Planta Quilicura/).length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole("link", { name: "EN" }));
  expect(screen.getAllByText("Frozen chicken breast (5kg case)").length).toBeGreaterThan(0);
  expect(screen.queryByText("Pechuga de pollo congelada (caja 5 kg)")).not.toBeInTheDocument();
});

test("with the visitor's own file and no plan, the downloads open the plan window", async () => {
  render(<App />);
  await uploadInventory();

  const card = within(screen.getByTestId("report-card"));
  expect(card.getByText("The executive report (PDF and Excel) and the dashboard in PowerPoint are part of the plan.")).toBeInTheDocument();
  expect(card.queryByText(/With the sample data/)).not.toBeInTheDocument();
  fireEvent.click(card.getByRole("button", { name: "Report (PDF)" }));

  const dialog = within(await screen.findByRole("dialog"));
  expect(dialog.getByText("The executive report (PDF and Excel) and the dashboard in PowerPoint are part of the plan.")).toBeInTheDocument();
  expect(dialog.getByText("Executive report in PDF and Excel, and the dashboard in PowerPoint")).toBeInTheDocument();
  expect(downloadExecutivePdf).not.toHaveBeenCalled();
  // the dashboard itself is locked, so its download is not offered
  fireEvent.click(dialog.getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
  expect(screen.queryByTestId("dashboard-download")).not.toBeInTheDocument();
});

test("with a plan, the report of the visitor's file says what was assumed when it was loaded", async () => {
  window.localStorage.setItem("mikardex.accessCode", JSON.stringify("CAFE-2291"));
  render(<App />);
  await uploadInventory();

  fireEvent.click(screen.getByRole("button", { name: "Report (PDF)" }));
  const pdf = await lastCall(downloadExecutivePdf);
  expect(pdf.sourceName).toBe("stock.csv");
  expect(pdf.report.importInfo).toMatchObject({ demandFrom: "sales", periodDays: 30, reorderComputed: true, defaultLeadUsed: true, defaultLead: 7 });
  expect(pdf.text.method).toContain("Daily usage: units sold in the period of the file, divided by 30 days.");
  expect(pdf.text.method).toContain("The file has no lead times: 7 days were used for every product.");
  expect(pdf.text.actions.map((a) => a.title)).toContain("Use each supplier's real lead time");

  fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
  fireEvent.click(screen.getByRole("button", { name: /Download in PowerPoint/ }));
  expect((await lastCall(downloadDashboardPptx)).sourceName).toBe("stock.csv");
});

test("when a file cannot be built, the page says so and the button works again", async () => {
  downloadExecutivePdf.mockImplementationOnce(() => Promise.reject(new Error("no memory")));
  const quiet = jest.spyOn(console, "error").mockImplementation(() => {});
  render(<App />);
  await openSample();
  fireEvent.click(screen.getByRole("button", { name: "Report (PDF)" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The file could not be created. Please try again.");
  expect(screen.getByRole("button", { name: "Report (PDF)" })).toBeEnabled();
  quiet.mockRestore();
});

test("an answer of the assistant is exported as that answer, not as the report", async () => {
  global.fetch = jest.fn((url) =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(String(url).includes("/api/ask") ? { answer: "Order the chicken today.", actionItems: [] } : {}) })
  );
  render(<App />);
  await openSample();
  fireEvent.click(screen.getByRole("button", { name: "Which SKUs are below reorder point?" }));
  expect(await screen.findByText("Order the chicken today.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Export this answer/ })).toBeInTheDocument();
});
