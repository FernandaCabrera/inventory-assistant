// The paid plan through Stripe: the pay button, coming back from the payment, and the plan window.
// config.js is replaced here so the Stripe links are set; App.test.js covers the page without them.

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";

jest.mock("./config", () => ({
  ...jest.requireActual("./config"),
  STRIPE_PAYMENT_LINK: "https://buy.stripe.com/test_abc123",
  STRIPE_PORTAL_LINK: "https://billing.stripe.com/p/login/test_abc123",
}));
jest.mock("recharts", () => {
  const Stub = ({ children }) => <div>{children}</div>;
  return {
    BarChart: Stub, Bar: Stub, XAxis: Stub, YAxis: Stub, CartesianGrid: Stub, Tooltip: Stub, Cell: Stub,
    ResponsiveContainer: Stub, PieChart: Stub, Pie: Stub, Legend: Stub, ReferenceLine: Stub,
  };
});
jest.mock("exceljs/dist/exceljs.min.js", () => ({ Workbook: function Workbook() {} }));
jest.mock("./countExport", () => ({ exportCountReport: jest.fn(() => Promise.resolve()), exportLastCounted: jest.fn(() => Promise.resolve()) }));

const SUB = "sub_1QabcDEF2345ghiJKL";
const SESSION = "cs_test_a1B2c3D4e5F6g7H8";

function answer(status, body) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
}

// routes: { "/api/stripe/activate": (body) => answer(...) }; anything else answers {}
function mockServer(routes = {}) {
  global.fetch = jest.fn((url, init) => {
    const path = Object.keys(routes).find((key) => String(url).endsWith(key));
    return path ? routes[path](init && init.body ? JSON.parse(init.body) : {}) : answer(200, {});
  });
}

function callsTo(path) {
  return global.fetch.mock.calls.filter(([url]) => String(url).endsWith(path));
}

function storeUpload(uploadsUsed) {
  const items = [
    { sku: "A1", name: "Cafe", warehouse: "Main", stock: 2, reorder_point: 30, lead_time_days: 7, avg_daily_usage: 3, unit_cost: 10 },
    { sku: "A2", name: "Te", warehouse: "Main", stock: 50, reorder_point: 0, lead_time_days: 7, avg_daily_usage: 0, unit_cost: 5 },
  ];
  window.localStorage.setItem("mikardex.dataset", JSON.stringify({ source: "upload", fileName: "stock.xlsx", loadedAt: "2026-10-01T12:00:00.000Z", items }));
  window.localStorage.setItem("mikardex.uploadsUsed", String(uploadsUsed));
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
  Element.prototype.scrollTo = () => {};
  mockServer();
});

test("after the free uploads, the plan window offers to subscribe on Stripe", () => {
  storeUpload(3);
  render(<App />);
  fireEvent.click(screen.getByText("Replace data"));

  expect(screen.getByText(/The free plan includes 3 uploads of your Excel/)).toBeInTheDocument();
  expect(screen.getByTestId("plan-price")).toHaveTextContent("Price: USD 12 per month");
  const pay = screen.getByTestId("plan-pay");
  expect(pay).toHaveTextContent("Subscribe");
  expect(pay).toHaveAttribute("href", "https://buy.stripe.com/test_abc123?locale=en");
  expect(screen.getByText(/Secure payment with Stripe/)).toBeInTheDocument();
  // paying replaces asking for the plan by email; a code can still be entered
  expect(screen.queryByText("Request the plan")).not.toBeInTheDocument();
  expect(screen.getByText("Already have a code?")).toBeInTheDocument();
});

test("the Stripe page opens in Spanish for Spanish visitors", () => {
  storeUpload(3);
  window.localStorage.setItem("mikardex.lang", JSON.stringify("es"));
  render(<App />);
  fireEvent.click(screen.getByText("Reemplazar datos"));

  expect(screen.getByTestId("plan-price")).toHaveTextContent("Precio: USD 12 al mes");
  expect(screen.getByTestId("plan-pay")).toHaveTextContent("Suscribirme");
  expect(screen.getByTestId("plan-pay")).toHaveAttribute("href", "https://buy.stripe.com/test_abc123?locale=es");
});

test("coming back from a paid Stripe session activates the plan and shows the access code", async () => {
  storeUpload(3);
  window.history.replaceState({}, "", `/?session_id=${SESSION}`);
  mockServer({ "/api/stripe/activate": () => answer(200, { valid: true, code: SUB }) });
  render(<App />);

  expect(screen.getByText(/Confirming your payment and activating your plan/)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("Plan active. The dashboard and new uploads are unlocked.")).toBeInTheDocument());
  expect(JSON.parse(callsTo("/api/stripe/activate")[0][1].body)).toEqual({ sessionId: SESSION });

  // the code is the subscription id, kept exactly as Stripe wrote it
  expect(screen.getByTestId("plan-code")).toHaveValue(SUB);
  expect(JSON.parse(window.localStorage.getItem("mikardex.accessCode"))).toBe(SUB);
  expect(screen.getByRole("link", { name: /Change card or cancel the subscription/ })).toHaveAttribute(
    "href",
    "https://billing.stripe.com/p/login/test_abc123"
  );
  // the session id is gone from the address
  expect(window.location.search).toBe("");

  // the plan is on: the dashboard is unlocked and uploads are no longer limited
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
  expect(screen.queryByText("The dashboard is part of the paid plan")).not.toBeInTheDocument();
  expect(screen.getByText("SKUs by status")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Replace data"));
  expect(screen.getByRole("dialog", { name: "Upload your inventory" })).toBeInTheDocument();
});

test("questions are sent with the Stripe code once the plan is active", async () => {
  storeUpload(3);
  window.localStorage.setItem("mikardex.accessCode", JSON.stringify(SUB));
  mockServer({
    "/api/validate-code": () => answer(200, { valid: true }),
    "/api/ask": () => answer(200, { answer: "Order coffee today.", actionItems: [] }),
  });
  render(<App />);

  fireEvent.change(screen.getByPlaceholderText("Ask a question about your inventory..."), { target: { value: "What do I order?" } });
  fireEvent.keyDown(screen.getByPlaceholderText("Ask a question about your inventory..."), { key: "Enter" });
  await waitFor(() => expect(screen.getByText("Order coffee today.")).toBeInTheDocument());
  expect(JSON.parse(callsTo("/api/ask")[0][1].body).code).toBe(SUB);

  // "Plan active" opens the customer's plan, with the code to use on another computer
  fireEvent.click(screen.getByRole("button", { name: /Plan active/ }));
  expect(screen.getByTestId("plan-code")).toHaveValue(SUB);
});

test("a payment that Stripe does not confirm leaves the free plan and says who to write to", async () => {
  storeUpload(3);
  window.history.replaceState({}, "", `/?session_id=${SESSION}`);
  mockServer({ "/api/stripe/activate": () => answer(200, { valid: false, error: "unpaid" }) });
  render(<App />);

  await waitFor(() => expect(screen.getByText(/We could not confirm this payment.*hola@mikardex.cl/)).toBeInTheDocument());
  expect(window.localStorage.getItem("mikardex.accessCode")).toBeNull();
  expect(window.location.search).toBe("");
  expect(screen.getByText("Free plan")).toBeInTheDocument();
});

test("if the server cannot be reached the payment can be confirmed again", async () => {
  storeUpload(3);
  window.history.replaceState({}, "", `/?session_id=${SESSION}`);
  let up = false;
  mockServer({ "/api/stripe/activate": () => (up ? answer(200, { valid: true, code: SUB }) : answer(503, { error: "unavailable" })) });
  render(<App />);

  await waitFor(() => expect(screen.getByText(/Your payment is not lost/)).toBeInTheDocument());
  expect(window.location.search).toBe(`?session_id=${SESSION}`); // kept, so a reload tries again too
  expect(window.localStorage.getItem("mikardex.accessCode")).toBeNull();

  up = true;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.getByTestId("plan-code")).toHaveValue(SUB));
  expect(callsTo("/api/stripe/activate")).toHaveLength(2);
  expect(window.location.search).toBe("");
});

test("subscribing again replaces an old code that is no longer valid", async () => {
  storeUpload(3);
  window.localStorage.setItem("mikardex.accessCode", JSON.stringify("sub_oldCancelled12345"));
  window.history.replaceState({}, "", `/?session_id=${SESSION}`);
  let releaseOldCheck;
  mockServer({
    // the check of the old code answers after the new payment was confirmed
    "/api/validate-code": () => new Promise((resolve) => { releaseOldCheck = () => resolve(answer(200, { valid: false })); }),
    "/api/stripe/activate": () => answer(200, { valid: true, code: SUB }),
  });
  render(<App />);

  await waitFor(() => expect(screen.getByTestId("plan-code")).toHaveValue(SUB));
  releaseOldCheck();
  await waitFor(() => expect(callsTo("/api/validate-code")).toHaveLength(1));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(JSON.parse(window.localStorage.getItem("mikardex.accessCode"))).toBe(SUB);
  expect(screen.getByTestId("plan-code")).toHaveValue(SUB);
});

test("a subscription code can be typed in on another computer, keeping its capitals", async () => {
  storeUpload(3);
  mockServer({ "/api/validate-code": (body) => answer(200, { valid: body.code === SUB }) });
  render(<App />);
  fireEvent.click(screen.getByText("Free plan"));

  fireEvent.change(screen.getByPlaceholderText("Access code"), { target: { value: `  ${SUB} ` } });
  fireEvent.click(screen.getByRole("button", { name: /Activate/ }));
  await waitFor(() => expect(screen.getByText("Plan active. The dashboard and new uploads are unlocked.")).toBeInTheDocument());
  expect(JSON.parse(window.localStorage.getItem("mikardex.accessCode"))).toBe(SUB);
});

test("codes handed out by hand are still stored in capitals", async () => {
  storeUpload(3);
  mockServer({ "/api/validate-code": () => answer(200, { valid: true }) });
  render(<App />);
  fireEvent.click(screen.getByText("Free plan"));

  fireEvent.change(screen.getByPlaceholderText("Access code"), { target: { value: "cafe-2291" } });
  fireEvent.click(screen.getByRole("button", { name: /Activate/ }));
  await waitFor(() => expect(JSON.parse(window.localStorage.getItem("mikardex.accessCode"))).toBe("CAFE-2291"));
});

test("an address without a real session id does nothing", () => {
  window.history.replaceState({}, "", "/?session_id=not-a-session");
  render(<App />);
  expect(screen.queryByText(/Confirming your payment/)).not.toBeInTheDocument();
  expect(callsTo("/api/stripe/activate")).toHaveLength(0);
});
