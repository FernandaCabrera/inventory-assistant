// Product settings in one place. Change a number here and rebuild.

// Free plan
// Every time a file is loaded counts as one upload, also when it is the same Excel with new numbers.
export const FREE_UPLOADS = 3; // uploads a visitor can analyze without a plan
export const FREE_QUESTIONS = 3; // questions to the assistant without a plan

// Show the "View prompt" button that lets visitors read the AI's instructions.
// Off for the public launch. To use it in a demo, set this to true AND start the
// server with EXPOSE_SYSTEM_PROMPT=true.
export const SHOW_PROMPT = false;

// Where people are sent when a request cannot be delivered automatically
export const CONTACT_EMAIL = "hola@mikardex.cl";

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
// This is only the text on the page: the amount that is charged is the one set in Stripe.
export const PLAN_PRICE = { es: "USD 12 al mes", en: "USD 12 per month" };

// Stripe. Paste the Payment Link of the monthly plan (it looks like https://buy.stripe.com/...).
// While it is empty the plan window shows the "request the plan" form instead of a pay button.
// In Stripe, set the link to send people back to the site after paying, to this address:
//   https://mikardex.cl/?session_id={CHECKOUT_SESSION_ID}
// The server also needs STRIPE_SECRET_KEY (see server/.env.example).
export const STRIPE_PAYMENT_LINK = "";

// Optional: the link of Stripe's customer portal (https://billing.stripe.com/p/login/...), where a
// customer changes their card or cancels. Shown to customers with an active plan.
export const STRIPE_PORTAL_LINK = "";

// Who is behind the tool (shown on the home page)
export const OWNER_NAME = "Fernanda Cabrera";
export const OWNER_LINKEDIN = "https://www.linkedin.com/in/fernandacabrera-data";
