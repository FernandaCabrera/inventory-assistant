# Inventory Assistant

An AI-powered inventory analyst for small and mid-sized businesses, in English and Spanish. Upload a stock spreadsheet, ask questions in plain language, and get decision-ready answers with real calculations — reorder timing, days of cover, capital tied up, and concrete purchasing recommendations — not just raw data.

Built to demonstrate applied AI product thinking: structured LLM output, a live interactive dashboard, a free tier with a paid plan, automated email alerts, and exportable operational reports.

## What it does

- **Bring your own spreadsheet** — upload an `.xlsx` or `.csv` export from Excel, Bsale, Shopify or similar. In a workbook with several sheets the inventory sheet is picked automatically (and can be changed), columns are recognized in Spanish and English (and can be corrected by hand), title rows above the header are skipped, formulas are read from their saved values, and Chilean (`1.234,5`) and English (`1,234.5`) number formats are both read. The file is parsed in the browser.
- **Works from what a small business has** — only product, stock and units sold in a period are needed. Daily usage, reorder point (usage × lead time × 1.5) and days of cover are calculated. A unit cost column adds inventory value and capital tied up.
- **Order list** — what to order today and how much, per product, counting units already on order: quantity = reorder point + the days of sales to cover − stock − units on order. Plain arithmetic in the browser, no AI call. Flags products that will run out before a new order arrives, and downloads as an Excel file to send to suppliers.
- **Cycle count report** — upload the count report downloaded from SAP or a warehouse system and get the conclusions written out, with charts and an Excel report. Two kinds of file work: a list of locations with the date of their last count (coverage, locations outside the cycle, locations never counted, the weekly pace needed), and a line-by-line count or adjustment report (accuracy by line and by location, value of the differences, reasons, areas, repeat locations, possible lot mix-ups, posting delay). It is computed entirely in the browser: the file is never sent to the server or to the AI, and it is not saved.
- **Summary on load** — right after a file loads, three cards say what runs out first, how many products need an order, and how much stock is not moving. No question needed.
- **English and Spanish** — each language has its own address (`mikardex.cl/` in Spanish, `mikardex.cl/en/` in English) and can be switched at any time; answers, reports and Excel exports come out in the same language. See [Search engines](#search-engines).
- **A page for each need** — the cycle count report and the inventory analysis each have their own page, which explains what the tool answers, which file works and how the figures are calculated. A third page offers Excel automation as a service. See [Pages for specific searches](#pages-for-specific-searches).
- **Conversational analysis** — ask about stockouts, excess inventory, slow-moving SKUs, or what to order this week. Claude calculates days of cover, reorder math, and priority — not just describes the data.
- **Full status report** — generates the standard multi-section report used in weekly operations reviews (Executive Summary, Stock Status, Reorder Actions, Excess & Slow-Moving Inventory, Recommendations).
- **Interactive dashboard** — KPI cards and charts (status breakdown, days of cover, warehouse distribution, capital tied up) that scale cleanly whether the dataset has 6 SKUs or 5,000. It downloads as a PowerPoint file: one slide per chart, each with what it shows and what to do, with charts and text that can be edited.
- **Executive report** — a PDF ready to send (summary, key figures, recommendations, stock status, ABC, warehouses, urgent replenishment, excess and no sales, method) and two Excel files: the action plan and the analyzed inventory. Written by fixed rules, not AI. See [Executive report and dashboard download](#executive-report-and-dashboard-download).
- **Free tier and paid plan** — without a plan: three uploads, three questions, the first three rows of the order list, and the dashboard shown locked. The plan (USD 12 per month) unlocks the full order list with its Excel download, the dashboard, the executive report and the dashboard in PowerPoint, unlimited uploads and more questions. With the sample data every download is open. Visitors subscribe with PayPal's button in the plan window and the plan switches on by itself; while PayPal is not set up on the server they request the plan from the page and the request is emailed to the owner.
- **Usage limits** — daily caps per visitor, per access code and in total keep the AI bill bounded.
- **Export an answer** — every answer of the assistant can be exported as a formatted workbook with the answer, a color-coded action plan table and the inventory.
- **Automated email alerts** — a scheduled job checks the sample dataset and emails a formatted alert whenever SKUs fall below their reorder point.
- **Data protection by design** — only the fields the analysis needs are sent to the AI, and sensitive fields (customer names, emails, phone numbers, etc.) are filtered out regardless of what the dataset contains.
- **Conversation memory** — follow-up questions ("what about that SKU in another warehouse?") work naturally within a session.

## Tech stack

- **Frontend:** React, Recharts (dashboard), JSZip with a small values-only reader (spreadsheet import), ExcelJS (Excel files), jsPDF with jspdf-autotable (PDF report), PptxGenJS (dashboard slides). The PDF and PowerPoint libraries are loaded only when their button is pressed.
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
PAYPAL_CLIENT_ID=your_app_client_id
PAYPAL_CLIENT_SECRET=your_app_secret
PAYPAL_PLAN_ID=P-your_plan_id
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
npm test                 # the page
cd server && npm test    # the PayPal logic on the server
```

## Plans, codes and limits

| What | Where | Default |
|---|---|---|
| Free uploads per browser (the same Excel loaded again counts) | `src/config.js` → `FREE_UPLOADS` | 3 |
| Free questions per browser | `src/config.js` → `FREE_QUESTIONS` | 3 |
| Order list rows shown without a plan | `src/config.js` → `ORDER_FREE_ROWS` | 3 |
| Days of sales a new order should cover | `src/config.js` → `ORDER_COVER_DAYS` (visitors can change it) | 30 |
| Count report: Excel download needs the plan | `src/config.js` → `COUNT_EXPORT_NEEDS_PLAN` | true |
| Count report: default cycle, in days | `src/config.js` → `DEFAULT_CYCLE_DAYS` (visitors can change it) | 90 |
| Count report: lines read from a file | `src/config.js` → `COUNT_MAX_LINES` | 50,000 |
| Price shown in the plan window, per language (the amount charged is the one set in the PayPal plan) | `src/config.js` → `PLAN_PRICE` | USD 12 per month |
| PayPal plan behind the subscribe button, and the client id that draws it | `src/config.js` → `PAYPAL_PLAN_ID`, `PAYPAL_CLIENT_ID` | the monthly plan |
| Where customers see or cancel their PayPal payments | `src/config.js` → `PAYPAL_MANAGE_LINK` | PayPal's automatic payments page |
| PayPal app the server uses to check subscriptions | server env `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | none (PayPal off, no pay button) |
| Only this PayPal plan unlocks the plan | server env `PAYPAL_PLAN_ID` | any subscription on the account |
| Test against PayPal's sandbox | server env `PAYPAL_ENV=sandbox` | live |
| Name and LinkedIn shown under "Who is behind it" | `src/config.js` → `OWNER_NAME`, `OWNER_LINKEDIN` | — |
| Access codes for the paid plan | server env `ACCESS_CODES` (comma-separated) | none |
| Questions per day without a code, per network address | server env `FREE_DAILY_QUESTIONS_PER_IP` | 10 |
| Questions per day per access code | server env `PLAN_DAILY_QUESTIONS` | 100 |
| Questions per day in total | server env `GLOBAL_DAILY_QUESTIONS` | 200 |
| SKUs sent to the AI per question | server env `MAX_ITEMS_FOR_AI` | 800 |
| Where plan requests are emailed | server env `LEADS_RECIPIENT` | `ALERT_RECIPIENT` |
| "View prompt" button (shows the AI instructions) | `src/config.js` → `SHOW_PROMPT` and server env `EXPOSE_SYSTEM_PROMPT=true` | off |

To give a customer the plan by hand: add a code to `ACCESS_CODES`, restart the server, and send them the code. They enter it under "Free plan" in the app. Removing the code switches their plan off on their next visit.

What these limits are and are not:

- The free limits (three uploads, three questions) and the dashboard lock are kept in the visitor's browser. They are a sales gate, not a security boundary: clearing browser data resets them. The server-side daily caps are what bound cost.
- Daily counters are held in memory, so they reset at 00:00 UTC and whenever the server restarts.
- There are no accounts and nothing about customers is stored on the server: PayPal is the record of who has paid.
- Also set a monthly spend limit in the Anthropic Console as a last line of defense.

## Subscriptions with PayPal

Visitors subscribe with PayPal's button in the plan window, with a PayPal account or with a card. PayPal gives the page the id of the subscription, the page asks the server to confirm it, and the plan switches on. From then on the server asks PayPal whether the subscription is still active, so a cancelled subscription or a failed payment switches the plan off by itself.

**Set it up once**

1. In PayPal (a business account), create the plan at `paypal.com/billing/plans`: fixed pricing, USD 12 every 1 month, unlimited cycles. Turn it on.
2. Put the plan id (`P-...`) and the client id from the button code PayPal shows in `src/config.js` → `PAYPAL_PLAN_ID` and `PAYPAL_CLIENT_ID`. Neither is secret.
3. In `developer.paypal.com` → Apps & Credentials → Live, create an app. Add its Client ID and Secret on the server host as `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`, add `PAYPAL_PLAN_ID` with the plan id, and restart the server. The log then says `PayPal: on (live)`.

The pay button only appears once step 3 is done: the page asks the server whether it can confirm payments, and until it can the plan window keeps the "request the plan" form. So the page can be published before the server is ready, and nobody can pay for a plan that cannot be switched on.

To try it without real money, create a sandbox app and a sandbox plan (`sandbox.paypal.com/billing/plans`), use their ids in `src/config.js` and on the server, and set `PAYPAL_ENV=sandbox`.

**How a customer keeps their plan**

- The access code is the PayPal subscription id (`I-...`). It is saved in the browser where they subscribed and shown to them in "Plan active", to enter on another computer under "Already have a code?". PayPal also emails it to them.
- If a customer loses the code, open the subscription in the PayPal account, copy its id and send it to them. It works as their code.
- If the server could not confirm a subscription (it was asleep, or the tab was closed), the id is kept in the customer's browser and confirmed the next time they open the page.
- A customer who cancels keeps the plan for the month already paid: until 31 days after their last payment. A failed payment switches the plan off (the PayPal plan pauses after 1 missed cycle).
- The server asks PayPal about an active code again after 10 minutes. If PayPal cannot be reached, customers already seen as active keep the plan for up to a day.
- Customers with a PayPal account cancel from PayPal's automatic payments page (linked in "Plan active"). Customers who paid by card without an account write in, and the subscription is cancelled from the PayPal account.
- The logic is in `server/paypal.js` (server), `src/plan.js`, `src/PayPalButton.jsx` and `src/PlanModal.jsx` (page).

## Cycle count report

The second tool on the home page. It reads a spreadsheet of cycle counts and writes the conclusions an analyst would otherwise build by hand.

- **What it reads** — `.xlsx` or `.csv`. The count date and the location (or product code) are required. System quantity, counted quantity, difference, values, lot, reason, who counted and posting date are used when present. Columns are recognized in English and Spanish, including the usual SAP names (`Storage Bin`, `Last inventory`, `Material`), and can be corrected by hand. Title rows, notes and small reference tables above the header are skipped, and so are header rows repeated inside the data when blocks were pasted one under another.
- **Three kinds of file** — locations (or products, when the count is by product) with their last count date: the report is about coverage and the counting cycle, and a row with no date counts as never counted; every counted line, including the ones with no difference: accuracy can be computed; and adjustments only, where nearly every line has a difference: accuracy needs the number of locations counted, which the analyst types in. The report says which one it found instead of showing an accuracy of zero.
- **How long since each location was counted** — a table, oldest first, with a search box to look up any location and its days without a count. With a list of locations it also says whether each one is inside or outside the cycle, and a search finds the ones that were never counted. With a detailed report it covers the locations in the file and says how many of the warehouse's locations the file does not mention. An adjustment report cannot answer this, so the table is not shown for it. The Excel report carries the full list.
- **Where to count** — the counting cycle is set at the top of the report (30, 60, 90, 180 or 365 days, shown in days and months). A chart shows, per area, how many locations are outside it. The table of last counts can be narrowed to what is outside the cycle, to what is inside it, or to the month of the last count, and then says which areas those locations are in; picking an area narrows the list to it.
- **Export the list** — the table of last counts has its own Excel download. It exports the list as it stands on screen: every row left after the filter, the area and the search, with the header on the first row so it can be sorted or printed as a count list, and a second sheet saying which file, cycle and filter it came from. Like the full report, it needs the plan for one's own file and is free for the example.
- **Its own tab** — with an inventory loaded, the report is the "Cycle count" tab next to the dashboard; with no report loaded the tab offers to upload one or see the example. With no inventory loaded, the report opens on its own from the home page.
- **In the dashboard** — the dashboard has a "Cycle counts" block with the share of locations within the cycle, the number outside it and the same chart by area, taken from the count report loaded in that visit, with a button that opens the cycle count tab. With no report loaded it offers to upload one. `src/countView.js` gives both screens the same figures.
- **Read as files really come** — negatives written `3-` or `−3`, zero written as a dash, empty SAP dates (`00.00.0000`), dates as Excel numbers, `dd.mm.yyyy`, `yyyymmdd` or with month names in English or Spanish. When a date like `03/04/2026` could be read two ways, the upload window asks.
- **Where the logic lives** — `src/countLogic.js` (columns, dates, analysis, conclusions), `src/CycleCounts.jsx` (screen), `src/CountCharts.jsx` (shared chart pieces), `src/CountSnapshot.jsx` (the block in the dashboard), `src/CountImportModal.jsx` (upload and column check), `src/countExport.js` (Excel report), `src/countFormat.js` (how figures are written). The conclusions are rules, not AI: the same file always gives the same report.
- **Privacy** — nothing in a count report leaves the browser, including the names of the people who counted, and it is kept only while the page is open. `src/App.test.js` checks that the example makes no network call and stores nothing.
- **Example** — `src/data/sampleCounts.js` builds an invented report (products, locations, people and numbers are all made up) that goes through the same steps as an uploaded file.

## Executive report and dashboard download

Four files, all built in the browser from the loaded inventory. Nothing is sent to the server or to the AI to make them, and the same file always gives the same report.

| File | Where | What is in it |
|---|---|---|
| Executive report, PDF (letter size) | Assistant tab → "Executive report" | Executive summary, key figures, recommendations with priority and timing, stock status with its reading, ABC classification, status by warehouse, urgent replenishment, transfers between warehouses, excess and no sales, notes on the data, assumptions and method |
| Action plan, Excel | same | Summary and recommendations; what to order (priority, quantity, cost, what another warehouse can send); transfers; excess and no sales with the suggested action |
| Analyzed inventory, Excel | same | Every product with status, ABC class, days of cover, value, quantity to order and capital tied up; ABC by class; warehouses; key figures and method |
| Dashboard, PowerPoint | Dashboard tab → "Download in PowerPoint" | Cover, key figures, one slide per chart (status, warehouses, days of cover, capital tied up) with its reading and what to do, and a closing slide with the first actions |

- **The figures** — `src/reportLogic.js`. Availability (products with sales that have stock), days of inventory and annual turnover (when the file has costs), median days of cover, capital tied up, the purchase needed and how much of it is urgent, ABC by consumption value (by units when the file has no costs), warehouse by warehouse, and transfers: stock that one warehouse can send to another that is about to buy the same product code.
- **The words** — `src/reportText.js` turns the figures into sentences by fixed rules: the executive summary, the recommendations, how to read each chart, the method and the notes on the data. Sentences are written so they read correctly with any number ("Products to order: 1").
- **The files** — `src/reportPdf.js`, `src/reportExcel.js`, `src/dashboardPptx.js`; `src/reportFiles.js` has what they share. The charts in the PowerPoint file are PowerPoint's own, so their data can be opened and changed. Excel cells hold numbers, with totals as formulas. The PDF uses the built-in fonts, so a symbol outside Western European letters is written with its closest plain character.
- **What the file assumed** — the upload window passes on the sales period, whether the reorder point was calculated and whether a default lead time was used; the report states them under "Assumptions and method", and the rows left out under "Notes on the data".
- **Days of cover** — the report uses the same number of days as the order list, so its quantities match that tab.
- **Plan** — with the visitor's own file the four downloads need the plan; with the sample data they are open.
- **Tests** — `src/reportLogic.test.js` (figures and text), `src/reportFiles.test.js` (builds each file and opens it again), `src/Reports.test.js` (the buttons). To keep the files and look at them: `REPORT_OUT=/tmp/reports npm test -- reportFiles`.

## Home page and privacy notice

The home page explains how the tool works, who is behind it and what happens to the data, and links to a privacy notice. The texts live in `src/i18n.js` (`aboutBody`, `dataPoints`, `privacySections`), in both languages. The privacy notice describes what the code does today; update it whenever that changes (new providers, accounts, analytics).

## Search engines

What Google needs to find the page, read it and show it in the right language.

- **One address per language** — `https://www.mikardex.cl/` is Spanish and `https://www.mikardex.cl/en/` is English (`LANG_PATHS` in `src/i18n.js`). The address decides the language, not the visitor's browser: Google browses in English, so a page that follows the browser is only ever read in English. A language the visitor picked with the ES / EN switch is remembered and comes first. A new visitor whose browser is in the other language gets a small link to it next to the switch.
- **Title and description** — `seoTitle` and `seoDescription` in `src/i18n.js`, one per language. They are the blue title and the two lines of a Google result, and the text of the preview when the link is shared.
- **The text is in the HTML** — the page is drawn by JavaScript, so on its own the HTML has no text. After `react-scripts build`, `scripts/prerender.js` draws every page of the site with the page's own components and texts and writes each one into its own file (`build/index.html`, `build/en/index.html`, `build/conteo-ciclico-sap/index.html`...), with its title, description, canonical address, links to its version in the other language (`hreflang`), preview data and structured data. Nothing is written twice: change a text and the next build carries it. React draws the live page over it when it loads.
- **It runs with the build** — `npm run build` does both steps. If the script finds something unexpected it stops with an error, the build fails and the published site stays as it was. Vercel has to build with `npm run build` (its default).
- **Official address** — `SITE_URL` in `src/config.js` (`https://www.mikardex.cl`, with `www`). `mikardex.cl` without `www` redirects to it, so it is the one named in the canonical link, the sitemap and `public/robots.txt`.
- **Sitemap** — `sitemap.xml` is written by the build from the list of pages, so it never has to be edited by hand.
- **After publishing a change to the texts** — in Google Search Console, inspect `https://www.mikardex.cl/` and press "Request indexing" so Google reads it again soon.
- **Tests** — `src/seoPage.test.js` (addresses, tags, sitemap) and the last tests of `src/App.test.js` (language, address and the pages below).

### Pages for specific searches

The home page can only rank for a few searches. Each of these pages is written for one need, with the words people type, and offers the tool right there with the same buttons as the home page.

| Page | Spanish | English |
|---|---|---|
| Cycle count report | `/conteo-ciclico-sap/` | `/en/cycle-count-report/` |
| Inventory analysis from an Excel file | `/analisis-inventario-excel/` | — |
| Excel automation (a service, not a tool) | `/automatizacion-excel/` | `/en/excel-automation/` |

- **Addresses** — `src/pages.js`. A page can exist in one language only; its language is the one of its address.
- **Texts** — `src/landingText.js`: title and description for Google, heading, sections, questions. Prices, limits and the numbers of the formulas are `{name}` marks filled in from `src/config.js` (the list is `landingVars` in `src/LandingPage.jsx`), so a page cannot state something the tool does not do. Everything else in the text has to be kept true by hand when the tool changes.
- **Layout** — `src/LandingPage.jsx`. Which buttons each page shows is decided in `src/InventoryAssistant.jsx` (`landingButtons`): the pages about a tool carry that tool's buttons, and the page about the service carries a button that opens an email to `CONTACT_EMAIL`.
- **The Excel automation page** describes a service done by hand: automating or fixing a spreadsheet someone already has, or building one from scratch, for any area of a business. It states no price and no delivery time; both are answered by email. Keep it that way unless the offer changes.
- **Links** — every page lists the others at the bottom, and the home page links to each one from the block it explains. Google finds a page through the links to it, so a page with no links barely counts.
- **To add a page** — add its address to `src/pages.js` and its texts to `src/landingText.js`. The build writes its HTML and adds it to the sitemap. Then, in Search Console, inspect the new address and press "Request indexing".
- **Someone with a file already loaded** who arrives at one of these pages sees the page, with the button to continue with their file, instead of going straight to the tool.

## Sample dataset

A sample food-manufacturing inventory across five warehouses, with unit costs. It powers "Try with sample data" and follows the language of the page: `src/data/inventory.json` in English (Canadian dollars; also used by the demo email alert) and `src/data/inventory.es.json` in Spanish (Chilean pesos). Both have the same 46 products and quantities; `src/reportLogic.test.js` checks that they stay in step.

## Screenshots

*(add screenshots of the chat, dashboard, and Excel export here)*

## Notes

Inventory figures are sent to the Anthropic API when a visitor asks a question. For production use with real customer or business data, review the retention and zero-data-retention options in Anthropic's API documentation, and confirm the sanitization rules in `server.js` cover all sensitive fields relevant to your dataset.
