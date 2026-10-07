// Product settings in one place. Change a number here and rebuild.

// Free plan
// Every time a file is loaded counts as one upload, also when it is the same Excel with new numbers.
export const FREE_UPLOADS = 3; // uploads a visitor can analyze without a plan
export const FREE_QUESTIONS = 3; // questions to the assistant without a plan

// Accounts. true = uploading one's own file asks to sign in with an email and a code (the sample
// stays open), the free uploads are counted per account and each analysis joins a history.
// It only takes effect when the server can run accounts (a database and a sender address: see
// server/.env.example); if it cannot, the page works as with false. With false, the accounts can
// still be tried in one browser by opening the site once with ?cuentas=1 at the end of the address.
export const ACCOUNTS_ON = true;

// Show the "View prompt" button that lets visitors read the AI's instructions.
// Off for the public launch. To use it in a demo, set this to true AND start the
// server with EXPOSE_SYSTEM_PROMPT=true.
export const SHOW_PROMPT = false;

// Where people are sent when a request cannot be delivered automatically
export const CONTACT_EMAIL = "hola@mikardex.cl";

// The public address of the site, with www and without a final slash. It is what Google is told
// is the official address of each page (the canonical link), so it has to be the one that loads
// without redirecting. If it changes, change it also in public/index.html and public/robots.txt.
export const SITE_URL = "https://www.mikardex.cl";

// Import defaults
export const MAX_ROWS = 5000;
export const DEFAULT_SALES_PERIOD_DAYS = 30;
export const DEFAULT_LEAD_TIME_DAYS = 7;

// Reorder point when the file has none:
//   daily usage x lead time x SAFETY_FACTOR  (1.5 = 50% safety buffer)
export const SAFETY_FACTOR = 1.5;

// Stock above EXCESS_RATIO x reorder point counts as excess
export const EXCESS_RATIO = 3;

// Order list
export const ORDER_COVER_DAYS = 30; // days of sales a new order should cover, on top of the reorder point
export const ORDER_FREE_ROWS = 3; // rows of the order list shown without a plan
export const COVER_DAYS_MIN = 1;
export const COVER_DAYS_MAX = 365;

// Cycle count report
export const COUNT_MAX_LINES = 50000; // lines read from a count report
export const COUNT_TABLE_ROWS = 10; // rows shown per table on screen (the Excel report has them all)
export const DEFAULT_CYCLE_DAYS = 90; // every location should be counted at least this often
// The report on screen is free. true = downloading it as Excel needs the plan.
export const COUNT_EXPORT_NEEDS_PLAN = true;

// Price shown in the plan window, per language. Leave empty to show no price.
// This is only the text on the page: the amount that is charged is the one set in the PayPal plan.
export const PLAN_PRICE = { es: "USD 12 al mes", en: "USD 12 per month" };

// PayPal. The plan window shows PayPal's subscribe button for this plan. Both values come from
// the button code PayPal gives after creating the plan (paypal.com/billing/plans); neither is secret.
// The button only appears once the server has PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET
// (see server/.env.example): until then the plan window keeps the "request the plan" form.
// Leave either one empty to switch the button off.
export const PAYPAL_CLIENT_ID = "BAAOtZP8GN_EhgfPGYtQ8k3LQrleJntydz3DJMK5Y0pOpfR7cf-B50O7X5-cNH4mmChFwr2wAbeVS0yUFg";
export const PAYPAL_PLAN_ID = "P-5LR918731A854994WNLCDVUY"; // Plan mensual / Monthly plan, USD 12

// Where a customer with a PayPal account sees and cancels their automatic payments
export const PAYPAL_MANAGE_LINK = "https://www.paypal.com/myaccount/autopay/";

// Who is behind the tool (shown on the home page)
export const OWNER_NAME = "Fernanda Cabrera";
export const OWNER_LINKEDIN = "https://www.linkedin.com/in/fernandacabrera-data";
