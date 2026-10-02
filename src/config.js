// Product settings in one place. Change a number here and rebuild.

// Free plan
export const FREE_UPLOADS = 1; // files a visitor can analyze without a plan
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

// Price shown in the plan window, per language, e.g. { es: "$19.990 al mes", en: "CAD $29 per month" }.
// Leave empty to show no price.
export const PLAN_PRICE = { es: "", en: "" };

// Who is behind the tool (shown on the home page)
export const OWNER_NAME = "Fernanda Cabrera";
export const OWNER_LINKEDIN = "https://www.linkedin.com/in/fernandacabrera-data";
