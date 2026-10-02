// Product settings in one place. Change a number here and rebuild.

// Free plan
export const FREE_UPLOADS = 1; // files a visitor can analyze without a plan
export const FREE_QUESTIONS = 3; // questions to the assistant without a plan

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
