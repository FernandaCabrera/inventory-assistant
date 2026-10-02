import { render, screen, fireEvent, act } from "@testing-library/react";
import App from "./App";

jest.mock("recharts", () => {
  const Stub = ({ children }) => <div>{children}</div>;
  return {
    BarChart: Stub, Bar: Stub, XAxis: Stub, YAxis: Stub, CartesianGrid: Stub, Tooltip: Stub, Cell: Stub,
    ResponsiveContainer: Stub, PieChart: Stub, Pie: Stub, Legend: Stub,
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
  expect(screen.getByText("Upload your Excel")).toBeInTheDocument();
  expect(screen.getByText("Try with sample data")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "ES" }));
  expect(screen.getByText("Sube tu Excel")).toBeInTheDocument();
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
