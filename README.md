# Inventory Assistant

An AI-powered inventory analyst for small and mid-sized businesses, in English and Spanish. Upload a stock spreadsheet, ask questions in plain language, and get decision-ready answers with real calculations — reorder timing, days of cover, capital tied up, and concrete purchasing recommendations — not just raw data.

Built to demonstrate applied AI product thinking: structured LLM output, a live interactive dashboard, a free tier with a paid plan, automated email alerts, and exportable operational reports.

## What it does

- **Bring your own spreadsheet** — upload an `.xlsx` or `.csv` export from Excel, Bsale, Shopify or similar. In a workbook with several sheets the inventory sheet is picked automatically (and can be changed), columns are recognized in Spanish and English (and can be corrected by hand), title rows above the header are skipped, formulas are read from their saved values, and Chilean (`1.234,5`) and English (`1,234.5`) number formats are both read. The file is parsed in the browser.
- **Works from what a small business has** — only product, stock and units sold in a period are needed. Daily usage, reorder point (usage × lead time × 1.5) and days of cover are calculated. A unit cost column adds inventory value and capital tied up.
- **English and Spanish** — the interface follows the browser language and can be switched at any time; answers, reports and Excel exports come out in the same language.
- **Conversational analysis** — ask about stockouts, excess inventory, slow-moving SKUs, or what to order this week. Claude calculates days of cover, reorder math, and priority — not just describes the data.
- **Full status report** — generates the standard multi-section report used in weekly operations reviews (Executive Summary, Stock Status, Reorder Actions, Excess & Slow-Moving Inventory, Recommendations).
- **Interactive dashboard** — KPI cards and charts (status breakdown, days of cover, warehouse distribution, capital tied up) that scale cleanly whether the dataset has 6 SKUs or 5,000.
- **Free tier and paid plan** — without a plan: one file, three questions, and the dashboard shown locked. An access code unlocks the dashboard, new uploads and more questions. Visitors can request the plan from the app; the request is emailed to the owner.
- **Usage limits** — daily caps per visitor, per access code and in total keep the AI bill bounded.
- **Excel export** — every answer can be exported as a formatted workbook with a narrative report sheet and a color-coded action plan table.
- **Automated email alerts** — a scheduled job checks the sample dataset and emails a formatted alert whenever SKUs fall below their reorder point.
- **Data protection by design** — only the fields the analysis needs are sent to the AI, and sensitive fields (customer names, emails, phone numbers, etc.) are filtered out regardless of what the dataset contains.
- **Conversation memory** — follow-up questions ("what about that SKU in another warehouse?") work naturally within a session.

## Tech stack

- **Frontend:** React, Recharts (dashboard), JSZip with a small values-only reader (spreadsheet import), ExcelJS (report export)
- **Backend:** Node.js, Express
- **AI:** Anthropic Claude API (Sonnet), structured JSON output (narrative + action items + relevant charts)
- **Email:** Resend, node-cron for scheduled checks

## Architecture

The frontend never talks to the Claude API directly. All requests go through a small Express backend, which holds the API key server-side, enforces the usage limits and applies a data-sanitization layer before anything is sent to the model.

```
React app (browser) — reads the spreadsheet, keeps it in the browser
      │
      ▼
Express backend  ──►  Claude API (Sonnet)
      │
      ▼
Resend (plan requests, email alerts)
```

## Running locally

**1. Install dependencies**

```bash
npm install
cd server && npm install
```

**2. Set environment variables**

Copy `server/.env.example` to `server/.env` and fill it in:

```
ANTHROPIC_API_KEY=your_key_here
RESEND_API_KEY=your_key_here
ACCESS_CODES=CAFE-2291,TIENDA-8840
LEADS_RECIPIENT=you@example.com
```

**3. Run the backend**

```bash
cd server
node server.js
```

**4. Run the frontend** (in a separate terminal)

```bash
npm start
```

The app opens at `http://localhost:3000`.

**Tests**

```bash
npm test
```

## Plans, codes and limits

| What | Where | Default |
|---|---|---|
| Free files per browser | `src/config.js` → `FREE_UPLOADS` | 1 |
| Free questions per browser | `src/config.js` → `FREE_QUESTIONS` | 3 |
| Access codes for the paid plan | server env `ACCESS_CODES` (comma-separated) | none |
| Questions per day without a code, per network address | server env `FREE_DAILY_QUESTIONS_PER_IP` | 10 |
| Questions per day per access code | server env `PLAN_DAILY_QUESTIONS` | 100 |
| Questions per day in total | server env `GLOBAL_DAILY_QUESTIONS` | 200 |
| SKUs sent to the AI per question | server env `MAX_ITEMS_FOR_AI` | 800 |
| Where plan requests are emailed | server env `LEADS_RECIPIENT` | `ALERT_RECIPIENT` |
| "View prompt" button (shows the AI instructions) | `src/config.js` → `SHOW_PROMPT` and server env `EXPOSE_SYSTEM_PROMPT=true` | off |

To give a customer the plan: add a code to `ACCESS_CODES`, restart the server, and send them the code. They enter it under "Free plan" in the app. Removing the code switches their plan off on their next visit.

What these limits are and are not:

- The free limits (one file, three questions) and the dashboard lock are kept in the visitor's browser. They are a sales gate, not a security boundary: clearing browser data resets them. The server-side daily caps are what bound cost.
- Daily counters are held in memory, so they reset at 00:00 UTC and whenever the server restarts.
- A real paywall (accounts, stored inventories, online payment) is the next step once people are asking for the plan.
- Also set a monthly spend limit in the Anthropic Console as a last line of defense.

## Sample dataset

`src/data/inventory.json` contains a sample food-manufacturing inventory across multiple warehouses. It powers "Try with sample data" in the app and the demo email alert.

## Screenshots

*(add screenshots of the chat, dashboard, and Excel export here)*

## Notes

Inventory figures are sent to the Anthropic API when a visitor asks a question. For production use with real customer or business data, review the retention and zero-data-retention options in Anthropic's API documentation, and confirm the sanitization rules in `server.js` cover all sensitive fields relevant to your dataset.
