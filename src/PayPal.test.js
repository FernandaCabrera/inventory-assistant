// The paid plan through PayPal: the subscribe button, confirming the subscription, and the plan window.
// PayPal's script is replaced by a stand-in, so these tests never load anything from PayPal.

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import App from "./App";
import { PAYPAL_PLAN_ID } from "./config";

jest.mock("recharts", () => {
  const Stub = ({ children }) => <div>{children}</div>;
  return {
    BarChart: Stub, Bar: Stub, XAxis: Stub, YAxis: Stub, CartesianGrid: Stub, Tooltip: Stub, Cell: Stub,
    ResponsiveContainer: Stub, PieChart: Stub, Pie: Stub, Legend: Stub, ReferenceLine: Stub,
  };
});
jest.mock("exceljs/dist/exceljs.min.js", () => ({ Workbook: function Workbook() {} }));
jest.mock("./countExport", () => ({ exportCountReport: jest.fn(() => Promise.resolve()), exportLastCounted: jest.fn(() => Promise.resolve()) }));

const SUB = "I-BW452GLLEP1G";

function answer(status, body) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
}

// routes: { "/api/paypal/activate": (body) => answer(...) }. The server says PayPal is set up
// unless a route for /api/health says otherwise; anything else answers {}.
function mockServer(routes = {}) {
  const all = { "/api/health": () => answer(200, { ok: true, paypal: true }), ...routes };
  global.fetch = jest.fn((url, init) => {
    const path = Object.keys(all).find((key) => String(url).endsWith(key));
    return path ? all[path](init && init.body ? JSON.parse(init.body) : {}) : answer(200, {});
  });
}

function callsTo(path) {
  return global.fetch.mock.calls.filter(([url]) => String(url).endsWith(path));
}

// Stand-in for PayPal's script: remembers what the page asked for, and draws a placeholder.
let paypalButton;
function mockPayPal() {
  paypalButton = null;
  window.paypal = {
    Buttons: jest.fn((options) => {
      paypalButton = options;
      return {
        render: (element) => {
          element.textContent = "[PayPal button]";
          return Promise.resolve();
        },
        close: () => Promise.resolve(),
      };
    }),
  };
}

function storeUpload(uploadsUsed) {
  const items = [
    { sku: "A1", name: "Cafe", warehouse: "Main", stock: 2, reorder_point: 30, lead_time_days: 7, avg_daily_usage: 3, unit_cost: 10 },
    { sku: "A2", name: "Te", warehouse: "Main", stock: 50, reorder_point: 0, lead_time_days: 7, avg_daily_usage: 0, unit_cost: 5 },
  ];
  window.localStorage.setItem("mikardex.dataset", JSON.stringify({ source: "upload", fileName: "stock.xlsx", loadedAt: "2026-10-01T12:00:00.000Z", items }));
  window.localStorage.setItem("mikardex.uploadsUsed", String(uploadsUsed));
}

// Opens the plan window from a free plan that has used its uploads, and waits for PayPal's button
async function openPlanWindow() {
  fireEvent.click(screen.getByText("Replace data"));
  await waitFor(() => expect(screen.getByTestId("paypal-button")).toHaveTextContent("[PayPal button]"));
}

async function approve(subscriptionID = SUB) {
  await act(async () => {
    paypalButton.onApprove({ subscriptionID });
  });
}

beforeEach(() => {
  window.localStorage.clear();
  Element.prototype.scrollTo = () => {};
  mockServer();
  mockPayPal();
});

afterEach(() => {
  delete window.paypal;
  document.head.querySelectorAll('script[src*="paypal.com"]').forEach((script) => script.remove());
});

test("after the free uploads, the plan window offers PayPal's subscribe button for the monthly plan", async () => {
  storeUpload(3);
  render(<App />);
  await openPlanWindow();

  expect(screen.getByText(/The free plan includes 3 uploads of your Excel/)).toBeInTheDocument();
  expect(screen.getByTestId("plan-price")).toHaveTextContent("Price: USD 12 per month");
  expect(screen.getByText(/Secure payment with PayPal/)).toBeInTheDocument();
  // paying replaces asking for the plan by email; a code can still be entered
  expect(screen.queryByText("Request the plan")).not.toBeInTheDocument();
  expect(screen.getByText("Already have a code?")).toBeInTheDocument();

  // the button subscribes to the plan in config.js
  expect(paypalButton.style.label).toBe("subscribe");
  const create = jest.fn(() => Promise.resolve(SUB));
  await paypalButton.createSubscription({}, { subscription: { create } });
  expect(create).toHaveBeenCalledWith({ plan_id: PAYPAL_PLAN_ID });
  expect(PAYPAL_PLAN_ID).toMatch(/^P-/);
});

test("the plan window is in Spanish for Spanish visitors", async () => {
  storeUpload(3);
  window.localStorage.setItem("mikardex.lang", JSON.stringify("es"));
  render(<App />);
  fireEvent.click(screen.getByText("Reemplazar datos"));
  await waitFor(() => expect(screen.getByTestId("paypal-button")).toHaveTextContent("[PayPal button]"));

  expect(screen.getByTestId("plan-price")).toHaveTextContent("Precio: USD 12 al mes");
  expect(screen.getByText(/Pago seguro con PayPal: con tu cuenta PayPal o con tarjeta/)).toBeInTheDocument();
});

test("while the server has no PayPal set up there is no pay button, only the request form", async () => {
  storeUpload(3);
  mockServer({ "/api/health": () => answer(200, { ok: true, paypal: false }) });
  render(<App />);
  fireEvent.click(screen.getByText("Replace data"));

  expect(await screen.findByText("Request the plan")).toBeInTheDocument();
  expect(screen.queryByTestId("paypal-button")).not.toBeInTheDocument();
  expect(window.paypal.Buttons).not.toHaveBeenCalled();
});

test("while the server has not answered yet, the plan window says the payment is being prepared", async () => {
  storeUpload(3);
  let release;
  mockServer({ "/api/health": () => new Promise((resolve) => { release = () => resolve(answer(200, { ok: true, paypal: true })); }) });
  render(<App />);
  fireEvent.click(screen.getByText("Replace data"));

  expect(screen.getByText(/Getting the payment ready/)).toBeInTheDocument();
  expect(screen.queryByText("Request the plan")).not.toBeInTheDocument();
  await act(async () => {
    release();
  });
  await waitFor(() => expect(screen.getByTestId("paypal-button")).toHaveTextContent("[PayPal button]"));
});

test("approving the subscription in PayPal activates the plan and shows the access code", async () => {
  storeUpload(3);
  mockServer({ "/api/paypal/activate": () => answer(200, { valid: true, code: SUB }) });
  render(<App />);
  await openPlanWindow();
  await approve();

  await waitFor(() => expect(screen.getByText("Plan active. The dashboard and new uploads are unlocked.")).toBeInTheDocument());
  expect(JSON.parse(callsTo("/api/paypal/activate")[0][1].body)).toEqual({ subscriptionId: SUB });

  // the code is the PayPal subscription id; nothing is left waiting to be confirmed
  expect(screen.getByTestId("plan-code")).toHaveValue(SUB);
  expect(JSON.parse(window.localStorage.getItem("mikardex.accessCode"))).toBe(SUB);
  expect(window.localStorage.getItem("mikardex.pendingSubscription")).toBeNull();
  expect(screen.getByRole("link", { name: /See or cancel the subscription in PayPal/ })).toHaveAttribute(
    "href",
    "https://www.paypal.com/myaccount/autopay/"
  );
  expect(screen.getByText(/If you paid by card without a PayPal account, write to hola@mikardex.cl/)).toBeInTheDocument();

  // the plan is on: the dashboard is unlocked and uploads are no longer limited
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
  expect(screen.queryByText("The dashboard is part of the paid plan")).not.toBeInTheDocument();
  expect(screen.getByText("SKUs by status")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Replace data"));
  expect(screen.getByRole("dialog", { name: "Upload your inventory" })).toBeInTheDocument();
});

test("questions are sent with the PayPal code once the plan is active", async () => {
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

test("a subscription PayPal does not confirm leaves the free plan and says who to write to", async () => {
  storeUpload(3);
  mockServer({ "/api/paypal/activate": () => answer(200, { valid: false, error: "unpaid" }) });
  render(<App />);
  await openPlanWindow();
  await approve();

  await waitFor(() => expect(screen.getByText(/We could not confirm this payment.*hola@mikardex.cl/)).toBeInTheDocument());
  expect(window.localStorage.getItem("mikardex.accessCode")).toBeNull();
  expect(window.localStorage.getItem("mikardex.pendingSubscription")).toBeNull();
  expect(screen.getByText("Free plan")).toBeInTheDocument();
});

test("if the payment cannot be confirmed yet it is kept and can be confirmed again", async () => {
  storeUpload(3);
  let up = false;
  mockServer({ "/api/paypal/activate": () => (up ? answer(200, { valid: true, code: SUB }) : answer(503, { error: "pending" })) });
  render(<App />);
  await openPlanWindow();
  await approve();

  await waitFor(() => expect(screen.getByText(/We could not confirm your payment yet/)).toBeInTheDocument());
  // kept in the browser, so closing the page does not lose it
  expect(JSON.parse(window.localStorage.getItem("mikardex.pendingSubscription"))).toBe(SUB);
  expect(window.localStorage.getItem("mikardex.accessCode")).toBeNull();

  up = true;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.getByTestId("plan-code")).toHaveValue(SUB));
  expect(callsTo("/api/paypal/activate")).toHaveLength(2);
  expect(window.localStorage.getItem("mikardex.pendingSubscription")).toBeNull();
});

test("a payment left unconfirmed on an earlier visit is confirmed when the page opens again", async () => {
  storeUpload(3);
  window.localStorage.setItem("mikardex.pendingSubscription", JSON.stringify(SUB));
  mockServer({ "/api/paypal/activate": () => answer(200, { valid: true, code: SUB }) });
  render(<App />);

  expect(screen.getByText(/Confirming your payment and activating your plan/)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByTestId("plan-code")).toHaveValue(SUB));
  expect(JSON.parse(window.localStorage.getItem("mikardex.accessCode"))).toBe(SUB);
  expect(window.localStorage.getItem("mikardex.pendingSubscription")).toBeNull();
});

test("subscribing again replaces an old code that is no longer valid", async () => {
  storeUpload(3);
  window.localStorage.setItem("mikardex.accessCode", JSON.stringify("I-OLDCANCELLED1"));
  window.localStorage.setItem("mikardex.pendingSubscription", JSON.stringify(SUB));
  let releaseOldCheck;
  mockServer({
    // the check of the old code answers after the new subscription was confirmed
    "/api/validate-code": () => new Promise((resolve) => { releaseOldCheck = () => resolve(answer(200, { valid: false })); }),
    "/api/paypal/activate": () => answer(200, { valid: true, code: SUB }),
  });
  render(<App />);

  await waitFor(() => expect(screen.getByTestId("plan-code")).toHaveValue(SUB));
  await act(async () => {
    releaseOldCheck();
  });
  expect(JSON.parse(window.localStorage.getItem("mikardex.accessCode"))).toBe(SUB);
  expect(screen.getByTestId("plan-code")).toHaveValue(SUB);
});

test("a subscription code can be typed in on another computer, in any capitals", async () => {
  storeUpload(3);
  mockServer({ "/api/validate-code": (body) => answer(200, { valid: String(body.code).toUpperCase() === SUB }) });
  render(<App />);
  fireEvent.click(screen.getByText("Free plan"));

  fireEvent.change(screen.getByPlaceholderText("Access code"), { target: { value: `  ${SUB.toLowerCase()} ` } });
  fireEvent.click(screen.getByRole("button", { name: /Activate/ }));
  await waitFor(() => expect(screen.getByText("Plan active. The dashboard and new uploads are unlocked.")).toBeInTheDocument());
  expect(JSON.parse(window.localStorage.getItem("mikardex.accessCode"))).toBe(SUB);
});

test("if PayPal's script cannot be loaded the plan window says so", async () => {
  storeUpload(3);
  delete window.paypal; // PayPal's script has not loaded and will fail
  render(<App />);
  fireEvent.click(screen.getByText("Replace data"));

  expect(await screen.findByText("Loading PayPal...")).toBeInTheDocument();
  const script = document.head.querySelector('script[src*="paypal.com/sdk/js"]');
  expect(script.src).toContain("vault=true&intent=subscription");
  expect(script.src).toContain("client-id=");
  await act(async () => {
    script.onerror();
  });
  expect(await screen.findByText(/PayPal could not be loaded.*hola@mikardex.cl/)).toBeInTheDocument();
});

test("nothing is loaded from PayPal until the plan window is opened", () => {
  storeUpload(1);
  delete window.paypal;
  render(<App />);
  expect(callsTo("/api/health")).toHaveLength(1); // only the usual call that wakes the server
  expect(document.head.querySelector('script[src*="paypal.com"]')).toBeNull();
});
