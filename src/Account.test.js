// The visitor's account on the page: signing in with an email and a code to upload a file,
// "My account", the history of analyses and what changed since the previous one.
// The server is a stand-in kept in this file; the real one is tested in server/accounts.test.js.

import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { TextEncoder, TextDecoder } from "util";
import App from "./App";
import { SIGN_IN_RETRY } from "./AccountWindows";

jest.mock("./config", () => ({ ...jest.requireActual("./config"), ACCOUNTS_ON: true }));
jest.mock("recharts", () => {
  const Stub = ({ children }) => <div>{children}</div>;
  return {
    BarChart: Stub, Bar: Stub, XAxis: Stub, YAxis: Stub, CartesianGrid: Stub, Tooltip: Stub, Cell: Stub,
    ResponsiveContainer: Stub, PieChart: Stub, Pie: Stub, Legend: Stub, ReferenceLine: Stub,
  };
});
jest.mock("exceljs/dist/exceljs.min.js", () => ({ Workbook: function Workbook() {} }));
jest.mock("./countExport", () => ({ exportCountReport: jest.fn(() => Promise.resolve()), exportLastCounted: jest.fn(() => Promise.resolve()) }));

const KEY = "k".repeat(43);
const HEADER = "Código;Producto;Bodega;Stock;Ventas últimos 30 días;Costo unitario";
// Monday: coffee low, sugar out of stock. The next Monday: both restocked.
const MONDAY = [HEADER, "A1;Café grano 1 kg;Central;12;45;9500", "A2;Té verde 100 bolsas;Central;50;8;4200", "A3;Azúcar 1 kg;Central;0;30;1100"];
const NEXT_MONDAY = [HEADER, "A1;Café grano 1 kg;Central;40;45;9500", "A2;Té verde 100 bolsas;Central;50;8;4200", "A3;Azúcar 1 kg;Central;20;30;1100"];

// A stand-in for the server. accounts: false = it cannot run accounts.
// me: "down" = the account cannot be fetched when the page opens.
function fakeServer({ accounts = true, account = null, start = null, plan = "inactive", me = null } = {}) {
  const state = {
    calls: [],
    account: account && { email: "ana@tienda.cl", createdAt: Date.parse("2026-09-01T12:00:00Z"), marketingOk: false, plan, planCode: plan === "active" ? "I-BW452GLLEP1G" : "", uploadsUsed: 0, uploadsMax: 3, analyses: [], ...account },
    nextId: 10,
    clock: Date.parse("2026-10-05T12:00:00Z"),
  };
  const answer = (status, body) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
  global.fetch = jest.fn((url, init = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : {};
    const key = ((init.headers || {}).Authorization || "").replace("Bearer ", "");
    state.calls.push({ method, path, body, key });
    const signedIn = key === KEY && state.account;

    if (path === "/api/health") return answer(200, { ok: true, paypal: false, accounts });
    if (path === "/api/auth/start") {
      if (start === "down") return Promise.reject(new Error("network"));
      if (start) return answer(start.status, start.body);
      return /@/.test(body.email) ? answer(200, { ok: true }) : answer(400, { error: "email" });
    }
    if (path === "/api/auth/verify") {
      if (body.code.replace(/\D/g, "") !== "123456") return answer(400, { error: "code", left: 4 });
      state.account = state.account || { email: body.email.toLowerCase(), createdAt: state.clock, marketingOk: body.marketingOk === true, plan, planCode: "", uploadsUsed: 0, uploadsMax: 3, analyses: [] };
      return answer(200, { ok: true, token: KEY, created: true, account: state.account });
    }
    if (path === "/api/validate-code") return answer(200, { valid: String(body.code).toUpperCase() === "CAFE-2291" });
    if (path === "/api/ask") return answer(200, { answer: "Order the sugar today.", actionItems: [] });
    if (!signedIn) return answer(401, { error: "signed_out" });

    if (path === "/api/me") return me === "down" ? answer(503, { error: "unavailable" }) : answer(200, { account: state.account });
    if (path === "/api/analyses" && method === "POST") {
      if (state.account.plan !== "active" && state.account.uploadsUsed >= state.account.uploadsMax) return answer(402, { error: "limit", account: state.account });
      const analysis = { id: String(state.nextId++), createdAt: (state.clock += 7 * 24 * 3600 * 1000), fileName: body.fileName, figures: body.figures };
      state.account = { ...state.account, uploadsUsed: state.account.uploadsUsed + 1, analyses: [analysis, ...state.account.analyses] };
      return answer(200, { ok: true, analysisId: analysis.id, account: state.account });
    }
    if (path === "/api/analyses" && method === "DELETE") {
      state.account = { ...state.account, analyses: [] };
      return answer(200, { ok: true, account: state.account });
    }
    if (path === "/api/account" && method === "PATCH") {
      state.account = { ...state.account, marketingOk: body.marketingOk };
      return answer(200, { account: state.account });
    }
    if (path === "/api/account" && method === "DELETE") {
      state.account = null;
      return answer(200, { ok: true });
    }
    if (path === "/api/account/plan") {
      if (body.code !== "CAFE-2291") return answer(200, { valid: false });
      state.account = { ...state.account, plan: "active", planCode: body.code };
      return answer(200, { valid: true, account: state.account });
    }
    if (path === "/api/auth/signout") return answer(200, { ok: true });
    return answer(404, {});
  });
  state.sent = (path, method = "POST") => state.calls.filter((call) => call.path === path && call.method === method);
  return state;
}

beforeAll(() => {
  global.TextDecoder = global.TextDecoder || TextDecoder;
});

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/en/");
  Element.prototype.scrollTo = () => {};
  window.scrollTo = () => {};
  SIGN_IN_RETRY.tries = 1;
  SIGN_IN_RETRY.waitMs = 0;
});

afterEach(() => {
  jest.restoreAllMocks();
});

// The page, once the server has said whether it runs accounts
async function open(server) {
  render(<App />);
  await waitFor(() => expect(server.sent("/api/health", "GET").length).toBeGreaterThan(0));
  await screen.findByRole("button", { name: /Upload your Excel/ });
  // one more turn, so the answer has reached the page
  await waitFor(() => {});
}

function chooseFile(name, lines) {
  const bytes = new TextEncoder().encode(lines.join("\n"));
  fireEvent.change(screen.getByTestId("file-input"), { target: { files: [{ name, arrayBuffer: () => Promise.resolve(bytes.buffer) }] } });
}

async function signIn(email = "Ana@Tienda.cl", { news = false } = {}) {
  const dialog = within(await screen.findByRole("dialog", { name: "Sign in with your email" }));
  fireEvent.change(dialog.getByLabelText("Your email"), { target: { value: email } });
  if (news) fireEvent.click(dialog.getByLabelText("Send me inventory tips and MiKardex news by email"));
  fireEvent.click(dialog.getByRole("button", { name: /Send code/ }));
  fireEvent.change(await dialog.findByLabelText("6-digit code"), { target: { value: "123 456" } });
  fireEvent.click(dialog.getByRole("button", { name: "Sign in" }));
}

async function analyze(name, lines) {
  chooseFile(name, lines);
  await screen.findByRole("dialog", { name: "Check the columns" });
  fireEvent.click(screen.getByRole("button", { name: "Analyze inventory" }));
}

test("the home page says the sample is open and a file needs an email, and offers to sign in", async () => {
  const server = fakeServer();
  await open(server);
  expect(screen.getByText(/The sample opens without signing up; your own file only needs your email\./)).toBeInTheDocument();
  expect(screen.getByText("History of your analyses, compared with the one before")).toBeInTheDocument();
  expect(screen.getByText(/If you open an account we keep your email and the summary of each analysis/)).toBeInTheDocument();
  expect(screen.getByTestId("account-button")).toHaveTextContent("Sign in");

  // the sample opens without an account
  fireEvent.click(screen.getByRole("button", { name: /Try with sample data/ }));
  expect(await screen.findByText(/Sample data loaded: 46 products/)).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(server.sent("/api/auth/start")).toHaveLength(0);
});

test("uploading a file asks for an email and a code, and then carries on to the file", async () => {
  const server = fakeServer();
  await open(server);
  fireEvent.click(screen.getByRole("button", { name: /Upload your Excel/ }));

  const dialog = within(await screen.findByRole("dialog", { name: "Sign in with your email" }));
  expect(dialog.getByText(/To upload your own file you need an account\. Just your email/)).toBeInTheDocument();
  expect(dialog.getByText(/Your products are not stored on our servers/)).toBeInTheDocument();
  expect(screen.queryByTestId("file-input")).not.toBeInTheDocument();

  await signIn("Ana@Tienda.cl", { news: true });
  // the window to choose the file opens by itself, with the uploads of the account
  expect(await screen.findByTestId("uploads-left")).toHaveTextContent("Free trial: 3 of 3 uploads left.");
  expect(server.sent("/api/auth/start")[0].body).toEqual({ email: "Ana@Tienda.cl", lang: "en" });
  expect(server.sent("/api/auth/verify")[0].body).toEqual({ email: "Ana@Tienda.cl", code: "123 456", lang: "en", marketingOk: true });
  expect(JSON.parse(window.localStorage.getItem("mikardex.session"))).toBe(KEY);

  await analyze("stock-monday.csv", MONDAY);
  expect(await screen.findByText(/stock-monday.csv loaded, products: 3/)).toBeInTheDocument();

  // what goes to the account is the summary: the file name and figures, nothing about the products
  await waitFor(() => expect(server.sent("/api/analyses")).toHaveLength(1));
  const recorded = server.sent("/api/analyses")[0];
  expect(recorded.key).toBe(KEY);
  expect(recorded.body.fileName).toBe("stock-monday.csv");
  expect(recorded.body.figures).toMatchObject({ skus: 3, warehouses: 1, critical: 1, low: 1, excess: 1, idle: 0, belowReorder: 2, stockouts: 1, hasCost: true, inventoryValue: 324000, tiedUp: 172200, orderCost: 510600 });
  expect(JSON.stringify(recorded.body)).not.toMatch(/Café|Azúcar|A1|items|inventory"/);
  // the upload is counted on the account, not in the browser
  expect(window.localStorage.getItem("mikardex.uploadsUsed")).toBeNull();

  expect(await screen.findByTestId("since-last")).toHaveTextContent("This is your first saved analysis.");
  expect(screen.getByTestId("account-button")).toHaveTextContent("My account");
});

test("the second upload says what changed since the first one", async () => {
  const server = fakeServer();
  await open(server);
  fireEvent.click(screen.getByRole("button", { name: /Upload your Excel/ }));
  await signIn();
  await screen.findByTestId("uploads-left");
  await analyze("stock-monday.csv", MONDAY);
  await screen.findByTestId("since-last");

  fireEvent.click(screen.getByRole("button", { name: /Replace data/ }));
  expect(await screen.findByTestId("uploads-left")).toHaveTextContent("Free trial: 2 of 3 uploads left.");
  await analyze("stock-next-monday.csv", NEXT_MONDAY);

  const card = await screen.findByTestId("since-last");
  await waitFor(() => expect(card).toHaveTextContent("stock-monday.csv"));
  // fewer products below the reorder point is good news; a higher inventory value is neither
  expect(within(card).getByTestId("change-belowReorder")).toHaveTextContent("2 → 0−2");
  expect(within(card).getByTestId("change-critical")).toHaveTextContent("1 → 0−1");
  expect(within(card).getByTestId("change-stockouts")).toHaveTextContent("1 → 0−1");
  expect(within(card).getByTestId("change-notMoving")).toHaveTextContent("1 → 1No change");
  expect(within(card).getByTestId("change-inventoryValue")).toHaveTextContent("$324,000 → $612,000+$288,000");
  expect(within(card).queryByTestId("change-orderCost")).not.toBeInTheDocument(); // nothing to order now

  // the history has both, newest first
  fireEvent.click(within(card).getByRole("button", { name: "See the history" }));
  const account = within(await screen.findByRole("dialog", { name: "My account" }));
  expect(account.getByTestId("account-email")).toHaveTextContent("ana@tienda.cl");
  expect(account.getByTestId("account-plan")).toHaveTextContent("Free trial: 2 of 3 uploads used");
  const rows = within(account.getByTestId("history-table")).getAllByRole("row");
  expect(rows).toHaveLength(3);
  expect(rows[1]).toHaveTextContent("stock-next-monday.csv");
  expect(rows[2]).toHaveTextContent("stock-monday.csv");
});

test("a wrong code says how many tries are left, and the email can be changed", async () => {
  const server = fakeServer();
  await open(server);
  fireEvent.click(screen.getByTestId("account-button"));
  const dialog = within(await screen.findByRole("dialog", { name: "Sign in with your email" }));
  expect(dialog.getByText("We send a 6-digit code to your email. There is no password.")).toBeInTheDocument();

  fireEvent.click(dialog.getByRole("button", { name: /Send code/ }));
  expect(dialog.getByRole("alert")).toHaveTextContent("Enter a valid email.");
  expect(server.sent("/api/auth/start")).toHaveLength(0);

  fireEvent.change(dialog.getByLabelText("Your email"), { target: { value: "ana@tienda.cl" } });
  fireEvent.click(dialog.getByRole("button", { name: /Send code/ }));
  expect(await dialog.findByText("We sent a code to ana@tienda.cl. Check your spam folder too.")).toBeInTheDocument();
  expect(dialog.getByText("You can ask for another code in 60 s")).toBeInTheDocument();

  fireEvent.click(dialog.getByRole("button", { name: "Sign in" }));
  expect(dialog.getByRole("alert")).toHaveTextContent("The code has 6 digits.");
  fireEvent.change(dialog.getByLabelText("6-digit code"), { target: { value: "000000" } });
  fireEvent.click(dialog.getByRole("button", { name: "Sign in" }));
  expect(await dialog.findByRole("alert")).toHaveTextContent("That code is not right. Tries left: 4.");

  fireEvent.click(dialog.getByRole("button", { name: "Use another email" }));
  expect(dialog.getByLabelText("Your email")).toHaveValue("ana@tienda.cl");

  // signing in from the button, not on the way to a file, opens the account
  fireEvent.click(dialog.getByRole("button", { name: /Send code/ }));
  fireEvent.change(await dialog.findByLabelText("6-digit code"), { target: { value: "123456" } });
  fireEvent.click(dialog.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("dialog", { name: "My account" })).toBeInTheDocument();
  expect(screen.getByText(/No analyses yet\. Each file you upload is listed here/)).toBeInTheDocument();
});

test("someone who signed in before is recognized, and sees their history with what changed", async () => {
  window.localStorage.setItem("mikardex.session", JSON.stringify(KEY));
  const server = fakeServer({
    account: {
      uploadsUsed: 2,
      analyses: [
        { id: "2", createdAt: Date.parse("2026-10-05T12:00:00Z"), fileName: "octubre.xlsx", figures: { skus: 48, belowReorder: 12, critical: 4, stockouts: 0, idle: 2, excess: 5, hasCost: true, tiedUp: 900000, inventoryValue: 5000000 } },
        { id: "1", createdAt: Date.parse("2026-09-28T12:00:00Z"), fileName: "septiembre.xlsx", figures: { skus: 46, belowReorder: 18, critical: 9, stockouts: 2, idle: 2, excess: 7, hasCost: true, tiedUp: 1200000, inventoryValue: 4800000 } },
      ],
    },
  });
  await open(server);
  await waitFor(() => expect(screen.getByTestId("account-button")).toHaveTextContent("My account"));
  expect(server.sent("/api/me", "GET")[0].key).toBe(KEY);

  // no sign-in window on the way to a file
  fireEvent.click(screen.getByRole("button", { name: /Upload your Excel/ }));
  expect(await screen.findByTestId("uploads-left")).toHaveTextContent("Free trial: 1 of 3 uploads left.");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));

  fireEvent.click(screen.getByTestId("account-button"));
  const account = within(await screen.findByRole("dialog", { name: "My account" }));
  expect(account.getByText("Account opened on September 1, 2026")).toBeInTheDocument();
  const rows = within(account.getByTestId("history-table")).getAllByRole("row");
  expect(rows[0]).toHaveTextContent("DateFileTotal SKUsBelow reorder pointAt a critical levelOut of stockNo sales or excessCapital tied upInventory value");
  // October against September: 6 fewer below the reorder point, 5 fewer critical, $300,000 less tied up
  expect(rows[1]).toHaveTextContent("octubre.xlsx4812−64−50−27−2$900,000−$300,000$5,000,000+$200,000");
  expect(rows[2]).toHaveTextContent("septiembre.xlsx4618929$1,200,000$4,800,000"); // the oldest has nothing to compare with
});

test("with three files used and no plan, the next upload opens the plan instead", async () => {
  window.localStorage.setItem("mikardex.session", JSON.stringify(KEY));
  const server = fakeServer({ account: { uploadsUsed: 3 } });
  await open(server);
  await waitFor(() => expect(screen.getByTestId("account-button")).toHaveTextContent("My account"));
  fireEvent.click(screen.getByRole("button", { name: /Upload your Excel/ }));
  const plan = within(await screen.findByRole("dialog", { name: "MiKardex plan" }));
  expect(plan.getByText(/The free trial includes 3 uploads of your Excel/)).toBeInTheDocument();
  expect(screen.queryByTestId("file-input")).not.toBeInTheDocument();
});

test("a plan on the account opens everything in any browser the customer signs in on", async () => {
  window.localStorage.setItem("mikardex.session", JSON.stringify(KEY));
  const server = fakeServer({ account: { uploadsUsed: 9 }, plan: "active" });
  await open(server);
  await waitFor(() => expect(screen.getByTestId("account-button")).toHaveTextContent("My account"));

  fireEvent.click(screen.getByRole("button", { name: /Upload your Excel/ }));
  await screen.findByTestId("import-guide");
  expect(screen.queryByTestId("uploads-left")).not.toBeInTheDocument(); // no limit
  await analyze("stock.csv", MONDAY);
  await screen.findByText(/stock.csv loaded/);

  // the dashboard of their own file is open, and "Plan active" shows their subscription
  fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
  expect(screen.queryByText("The dashboard is part of the paid plan")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Plan active/ }));
  expect(await screen.findByTestId("plan-code")).toHaveValue("I-BW452GLLEP1G");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));

  // a question goes with the key of the session, so the server knows the plan
  fireEvent.click(screen.getByRole("button", { name: "Assistant" }));
  fireEvent.click(screen.getByRole("button", { name: "Which SKUs are below reorder point?" }));
  await screen.findByText("Order the sugar today.");
  expect(server.sent("/api/ask")[0].key).toBe(KEY);
});

test("a code entered while signed in is tied to the account", async () => {
  window.localStorage.setItem("mikardex.session", JSON.stringify(KEY));
  const server = fakeServer({ account: {} });
  await open(server);
  await waitFor(() => expect(screen.getByTestId("account-button")).toHaveTextContent("My account"));

  fireEvent.click(screen.getByRole("button", { name: /See the plan/ }));
  const plan = within(await screen.findByRole("dialog", { name: "MiKardex plan" }));
  fireEvent.change(plan.getByLabelText("Access code"), { target: { value: "cafe-2291" } });
  fireEvent.click(plan.getByRole("button", { name: /Activate/ }));
  await waitFor(() => expect(server.sent("/api/account/plan")).toHaveLength(1));
  expect(server.sent("/api/account/plan")[0]).toMatchObject({ key: KEY, body: { code: "CAFE-2291" } });
  await waitFor(() => expect(server.account.plan).toBe("active"));
});

test("when the browser did not know the free uploads were used up, the server's no takes the file back", async () => {
  window.localStorage.setItem("mikardex.session", JSON.stringify(KEY));
  const server = fakeServer({ account: { uploadsUsed: 3 }, me: "down" });
  await open(server);
  // the account has not arrived, so the file window opens on what this browser knows
  fireEvent.click(screen.getByRole("button", { name: /Upload your Excel/ }));
  await analyze("stock.csv", MONDAY);

  const plan = within(await screen.findByRole("dialog", { name: "MiKardex plan" }));
  expect(plan.getByText(/The free trial includes 3 uploads of your Excel/)).toBeInTheDocument();
  expect(server.sent("/api/analyses")).toHaveLength(1);
  expect(screen.queryByText(/stock.csv loaded/)).not.toBeInTheDocument();
  expect(window.localStorage.getItem("mikardex.dataset")).toBeNull();
  expect(screen.getByRole("button", { name: /Upload your Excel/ })).toBeInTheDocument();
});

test("when too many codes were asked for, the visitor can carry on without an account", async () => {
  const server = fakeServer({ start: { status: 429, body: { error: "limit" } } });
  await open(server);
  fireEvent.click(screen.getByRole("button", { name: /Upload your Excel/ }));
  const dialog = within(await screen.findByRole("dialog", { name: "Sign in with your email" }));
  fireEvent.change(dialog.getByLabelText("Your email"), { target: { value: "ana@tienda.cl" } });
  fireEvent.click(dialog.getByRole("button", { name: /Send code/ }));
  expect(await dialog.findByRole("alert")).toHaveTextContent("Too many codes were asked for today.");
  fireEvent.click(dialog.getByRole("button", { name: /Continue without an account/ }));
  expect(await screen.findByTestId("import-guide")).toBeInTheDocument();
});

test("when the server cannot run accounts, a file is uploaded as before, without signing in", async () => {
  const server = fakeServer({ accounts: false });
  await open(server);
  expect(screen.queryByTestId("account-button")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Upload your Excel/ }));
  expect(await screen.findByTestId("uploads-left")).toHaveTextContent("Free trial: 3 of 3 uploads left.");
  await analyze("stock.csv", MONDAY);
  await screen.findByText(/stock.csv loaded/);
  expect(window.localStorage.getItem("mikardex.uploadsUsed")).toBe("1");
  expect(server.sent("/api/analyses")).toHaveLength(0);
});

test.each([
  ["the code cannot be sent", { start: { status: 503, body: { error: "unavailable" } } }],
  ["the server does not answer", { start: "down" }],
])("when %s, the visitor can carry on without an account", async (name, options) => {
  const server = fakeServer(options);
  await open(server);
  fireEvent.click(screen.getByRole("button", { name: /Upload your Excel/ }));
  const dialog = within(await screen.findByRole("dialog", { name: "Sign in with your email" }));
  fireEvent.change(dialog.getByLabelText("Your email"), { target: { value: "ana@tienda.cl" } });
  fireEvent.click(dialog.getByRole("button", { name: /Send code/ }));
  expect(await dialog.findByRole("alert")).toHaveTextContent("We could not send the code right now.");

  fireEvent.click(dialog.getByRole("button", { name: /Continue without an account/ }));
  await analyze("stock.csv", MONDAY);
  await screen.findByText(/stock.csv loaded/);
  // counted in the browser, like before accounts
  expect(window.localStorage.getItem("mikardex.uploadsUsed")).toBe("1");
  // and not asked again during this visit
  fireEvent.click(screen.getByRole("button", { name: /Replace data/ }));
  expect(await screen.findByTestId("uploads-left")).toHaveTextContent("Free trial: 2 of 3 uploads left.");
});

test("when accounts were switched off on the server meanwhile, the file window opens by itself", async () => {
  const server = fakeServer({ start: { status: 503, body: { error: "disabled" } } });
  await open(server);
  fireEvent.click(screen.getByRole("button", { name: /Upload your Excel/ }));
  const dialog = within(await screen.findByRole("dialog", { name: "Sign in with your email" }));
  fireEvent.change(dialog.getByLabelText("Your email"), { target: { value: "ana@tienda.cl" } });
  fireEvent.click(dialog.getByRole("button", { name: /Send code/ }));
  expect(await screen.findByTestId("import-guide")).toBeInTheDocument();
  expect(screen.queryByRole("dialog", { name: "Sign in with your email" })).not.toBeInTheDocument();
});

test("a session that has ended signs the browser out quietly", async () => {
  window.localStorage.setItem("mikardex.session", JSON.stringify("x".repeat(43)));
  const server = fakeServer({ account: {} });
  await open(server);
  await waitFor(() => expect(window.localStorage.getItem("mikardex.session")).toBeNull());
  expect(screen.getByTestId("account-button")).toHaveTextContent("Sign in");
  fireEvent.click(screen.getByRole("button", { name: /Upload your Excel/ }));
  expect(await screen.findByRole("dialog", { name: "Sign in with your email" })).toBeInTheDocument();
});

test("signing out closes the account and takes the loaded file out of the browser", async () => {
  jest.spyOn(window, "confirm").mockReturnValue(true);
  const server = fakeServer();
  await open(server);
  fireEvent.click(screen.getByRole("button", { name: /Upload your Excel/ }));
  await signIn();
  await screen.findByTestId("uploads-left");
  await analyze("stock.csv", MONDAY);
  await screen.findByTestId("since-last");
  expect(window.localStorage.getItem("mikardex.dataset")).not.toBeNull();

  fireEvent.click(screen.getByTestId("account-button"));
  const account = within(await screen.findByRole("dialog", { name: "My account" }));
  fireEvent.click(account.getByRole("button", { name: /Sign out/ }));
  expect(window.confirm).toHaveBeenCalledWith("You will be signed out and the file you loaded will be removed from this browser. Continue?");

  // back on the home page, signed out, with nothing of theirs left behind
  await waitFor(() => expect(screen.getByTestId("account-button")).toHaveTextContent("Sign in"));
  expect(screen.getByRole("button", { name: /Try with sample data/ })).toBeInTheDocument();
  expect(window.localStorage.getItem("mikardex.session")).toBeNull();
  expect(window.localStorage.getItem("mikardex.dataset")).toBeNull();
  expect(server.sent("/api/auth/signout")).toHaveLength(1);
});

test("the history can be deleted, the news switched on, and the account deleted", async () => {
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(true);
  window.localStorage.setItem("mikardex.session", JSON.stringify(KEY));
  const server = fakeServer({ account: { uploadsUsed: 1, analyses: [{ id: "1", createdAt: Date.parse("2026-10-05T12:00:00Z"), fileName: "stock.xlsx", figures: { skus: 5, belowReorder: 1, critical: 0 } }] } });
  await open(server);
  await waitFor(() => expect(screen.getByTestId("account-button")).toHaveTextContent("My account"));
  fireEvent.click(screen.getByTestId("account-button"));
  const account = within(await screen.findByRole("dialog", { name: "My account" }));

  fireEvent.click(account.getByLabelText("Send me inventory tips and MiKardex news by email"));
  await waitFor(() => expect(server.account.marketingOk).toBe(true));
  await waitFor(() => expect(account.getByLabelText("Send me inventory tips and MiKardex news by email")).toBeChecked());

  fireEvent.click(account.getByRole("button", { name: /Delete history/ }));
  expect(await account.findByText(/No analyses yet/)).toBeInTheDocument();
  expect(account.getByTestId("account-plan")).toHaveTextContent("Free trial: 1 of 3 uploads used"); // deleting it gives no uploads back

  // not confirming leaves the account alone
  confirm.mockReturnValue(false);
  fireEvent.click(account.getByRole("button", { name: /Delete my account/ }));
  expect(server.sent("/api/account", "DELETE")).toHaveLength(0);
  confirm.mockReturnValue(true);
  fireEvent.click(account.getByRole("button", { name: /Delete my account/ }));
  await waitFor(() => expect(server.account).toBeNull());
  await waitFor(() => expect(screen.getByTestId("account-button")).toHaveTextContent("Sign in"));
  expect(window.localStorage.getItem("mikardex.session")).toBeNull();
});
