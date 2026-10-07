// The upload windows: which file works, how the file was read, and what happens with a file
// that is not an inventory.

import { render, screen, fireEvent, within } from "@testing-library/react";
import { TextEncoder, TextDecoder } from "util";
import App from "./App";

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

beforeAll(() => {
  // the test browser has no text decoder of its own
  global.TextDecoder = global.TextDecoder || TextDecoder;
});

beforeEach(() => {
  window.localStorage.clear();
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }));
  Element.prototype.scrollTo = () => {};
  window.scrollTo = () => {};
});

// A file as the browser hands it over: a name and its bytes
function csvFile(name, lines) {
  const bytes = new TextEncoder().encode(lines.join("\n"));
  return { name, arrayBuffer: () => Promise.resolve(bytes.buffer) };
}

async function chooseFile(file) {
  fireEvent.change(screen.getByTestId("file-input"), { target: { files: [file] } });
  await screen.findByRole("dialog", { name: "Check the columns" });
}

const INVENTORY = [
  "Código;Producto;Bodega;Stock;Ventas últimos 30 días;Costo unitario",
  "A1;Café grano 1 kg;Central;12;45;9500",
  "A2;Té verde 100 bolsas;Central;50;8;4200",
  "A3;Azúcar 1 kg;Central;0;30;1100",
  "A4;Leche 1 L;Norte;24;0;950",
  "A5;Galletas;Central;80;12;700",
];

const SALES = ["Fecha de venta;Factura;Cliente;Producto;Cantidad;Ventas"].concat(
  Array.from({ length: 12 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")};F-${100 + i};Cliente ${i};${["Café", "Té", "Azúcar"][i % 3]};${2 + i};${(2 + i) * 9500}`)
);

test("the upload window says which file works and how many free uploads are left", () => {
  window.localStorage.setItem("mikardex.uploadsUsed", "1");
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /Upload your Excel/ }));

  expect(screen.getByTestId("uploads-left")).toHaveTextContent("Free trial: 2 of 3 uploads left.");
  const guide = within(screen.getByTestId("import-guide"));
  expect(guide.getByText("Which file works")).toBeInTheDocument();
  expect(guide.getByText("A list of your products with their current stock: one row per product.")).toBeInTheDocument();
  ["Product", "Stock", "Sold (30 days)", "Coffee beans 1 kg"].forEach((text) => expect(guide.getByText(text)).toBeInTheDocument());
  expect(guide.getByText(/It does not work with a list of sales, invoices or stock movements/)).toBeInTheDocument();
  expect(guide.getByRole("button", { name: /Download template/ })).toBeInTheDocument();
});

test("an inventory file: the first rows are shown as they were read, then it is analyzed", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /Upload your Excel/ }));
  await chooseFile(csvFile("stock.csv", INVENTORY));

  const preview = within(screen.getByTestId("import-preview"));
  expect(preview.getByText("This is how your file was read")).toBeInTheDocument();
  expect(preview.getByText("Café grano 1 kg")).toBeInTheDocument();
  expect(preview.getByText("1.5")).toBeInTheDocument(); // 45 sold in 30 days
  expect(preview.getByText("and 2 more products")).toBeInTheDocument();
  expect(screen.queryByTestId("import-warnings")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Analyze inventory" }));
  expect(screen.getByText(/stock.csv loaded, products: 5/)).toBeInTheDocument();
  expect(window.localStorage.getItem("mikardex.uploadsUsed")).toBe("1");
});

test("a list of sales is flagged before it is analyzed", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /Upload your Excel/ }));
  await chooseFile(csvFile("ventas-septiembre.csv", SALES));

  const warnings = within(screen.getByTestId("import-warnings"));
  expect(warnings.getByText("Check this before analyzing")).toBeInTheDocument();
  expect(warnings.getByText(/9 of 12 rows repeat the same product\. An inventory has one row per product/)).toBeInTheDocument();
  expect(warnings.getByText(/The file has columns such as Fecha de venta, Factura, Cliente\. It looks like a record of sales/)).toBeInTheDocument();

  // it is not the normal way forward any more, but the visitor decides
  expect(screen.queryByRole("button", { name: "Analyze inventory" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Analyze anyway" })).toBeEnabled();
  expect(window.localStorage.getItem("mikardex.uploadsUsed")).toBeNull(); // nothing was used up yet
});

test("a file without the columns the analysis needs cannot be analyzed, and says what is missing", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /Upload your Excel/ }));
  await chooseFile(csvFile("clientes.csv", ["Cliente;Fecha;Monto;Vendedor", "Ana;2026-09-01;15000;Luis", "Beto;2026-09-02;8000;Luis"]));

  expect(screen.getByText("This file is missing what the analysis needs:")).toBeInTheDocument();
  expect(screen.getByText("Choose the column with the product code or name.")).toBeInTheDocument();
  expect(screen.getByText("Choose the column with the current stock.")).toBeInTheDocument();
  expect(screen.getByText(/download the template to see the format that works/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Analyze inventory" })).toBeDisabled();
  expect(screen.queryByTestId("import-preview")).not.toBeInTheDocument();
});

test("choosing the wrong stock column is caught by the preview and a warning", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /Upload your Excel/ }));
  await chooseFile(csvFile("stock.csv", INVENTORY));

  // the visitor points "stock" at the column with the product names
  const nameColumn = within(screen.getByTestId("map-name")).getByRole("option", { name: "Producto" }).value;
  fireEvent.change(screen.getByTestId("map-stock"), { target: { value: nameColumn } });
  expect(screen.getByRole("alert")).toHaveTextContent("No products could be read. Check that the stock column has numbers.");
  expect(screen.getByRole("button", { name: "Analyze inventory" })).toBeDisabled();
  expect(screen.queryByTestId("import-preview")).not.toBeInTheDocument();
});

test("with a plan there is no count of free uploads", () => {
  window.localStorage.setItem("mikardex.accessCode", JSON.stringify("CAFE-2291"));
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /Upload your Excel/ }));
  expect(screen.getByTestId("import-guide")).toBeInTheDocument();
  expect(screen.queryByTestId("uploads-left")).not.toBeInTheDocument();
});

test("the count upload window shows the two kinds of file that work", () => {
  render(<App />);
  fireEvent.click(screen.getByTestId("counts-upload"));

  const guide = within(screen.getByTestId("count-guide"));
  expect(guide.getByText("A list of locations with the date of their last count:")).toBeInTheDocument();
  expect(guide.getByText("Or the detail of the counts, one row per line counted:")).toBeInTheDocument();
  expect(guide.getAllByText("Location")).toHaveLength(2); // one example table for each kind
  ["Last count", "System", "Counted"].forEach((text) => expect(guide.getByText(text)).toBeInTheDocument());
  expect(guide.getByText(/It does not work with the list of products and their stock/)).toBeInTheDocument();
});
