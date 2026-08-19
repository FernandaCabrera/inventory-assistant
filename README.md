# Inventory Assistant

An AI-powered inventory analyst for food manufacturing operations. Ask questions in plain language, get decision-ready answers with real calculations — reorder timing, days of cover, and concrete purchasing recommendations — not just raw data.

Built to demonstrate applied AI product thinking: structured LLM output, a live interactive dashboard, automated email alerts, and exportable operational reports, all backed by a real inventory dataset.

## What it does

- **Conversational analysis** — ask about stockouts, excess inventory, slow-moving SKUs, or what to order this week. Claude calculates days of cover, reorder math, and priority — not just describes the data.
- **Full status report** — generates the standard multi-section report used in weekly operations reviews (Executive Summary, Stock Status, Reorder Actions, Excess & Slow-Moving Inventory, Recommendations).
- **Interactive dashboard** — live KPI cards and charts (status breakdown, days of cover, warehouse distribution) that scale cleanly whether the dataset has 6 SKUs or 500.
- **Excel export** — every answer can be exported as a formatted workbook with a narrative report sheet and a color-coded action plan table.
- **Automated email alerts** — a scheduled job checks the dataset and emails a formatted alert whenever SKUs fall below their reorder point.
- **Data protection by design** — sensitive fields (customer names, emails, phone numbers, etc.) are automatically filtered out before any data is sent to the AI, regardless of what the dataset contains.
- **Conversation memory** — follow-up questions ("what about that SKU in another warehouse?") work naturally within a session.

## Tech stack

- **Frontend:** React, Recharts (dashboard), ExcelJS (report export), QuickChart (chart images)
- **Backend:** Node.js, Express
- **AI:** Anthropic Claude API (Sonnet), structured JSON output (narrative + action items + relevant charts)
- **Email:** Resend, node-cron for scheduled checks

## Architecture

The frontend never talks to the Claude API directly. All requests go through a small Express backend, which holds the API key server-side and applies a data-sanitization layer before anything is sent to the model.

```
React app (browser)
      │
      ▼
Express backend  ──►  Claude API (Sonnet)
      │
      ▼
Resend (email alerts, on a cron schedule)
```

## Running locally

**1. Install dependencies**

```bash
npm install
cd server && npm install
```

**2. Set environment variables**

Create `server/.env`:

```
ANTHROPIC_API_KEY=your_key_here
RESEND_API_KEY=your_key_here
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

## Sample dataset

`src/data/inventory.json` contains a sample food-manufacturing inventory across multiple warehouses, used to demonstrate the assistant's analysis. Swap in your own dataset with the same shape (`sku`, `name`, `warehouse`, `stock`, `reorder_point`, `lead_time_days`, `avg_daily_usage`) to try it with different data.

## Screenshots

*(add screenshots of the chat, dashboard, and Excel export here)*

## Notes

This is a portfolio/demo project. For production use with real customer or business data, review the retention and zero-data-retention options in Anthropic's API documentation, and confirm the sanitization rules in `server.js` cover all sensitive fields relevant to your dataset.
