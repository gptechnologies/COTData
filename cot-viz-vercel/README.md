# COT – Non-Commercials (Next.js + Plotly on Vercel)

Rebuild of the Streamlit app with the same visuals and features:
- Dark theme, two-row subplot (lines top, bars bottom)
- Unified tooltip (customdata carrier)
- Asset select, Show Net toggle
- Start/End date pickers (default to most-recent date)
- ΔShort inverted so covering is positive
- Deep-linkable via query params (`?symbol=&start=&end=`)

## 1) Setup

```bash
pnpm i   # or npm i / yarn
cp .env.example .env
# Set DATA_URL to a public CSV (GitHub raw link)
```

Your CSV should include at least:
- `Report_Date_as_YYYY_MM_DD` (or `date` / `report_date`)
- `CONTRACT_MARKET_NAME` (or `symbol` / `market` / `asset`)
- `NonComm_Positions_Long_All` (or `long`)
- `NonComm_Positions_Short_All` (or `short`)
- Optional: `Change_in_NonComm_Long_All`, `Change_in_NonComm_Short_All`

## 2) Dev

```bash
pnpm dev
# open http://localhost:3000
```

## 3) Deploy on Vercel

1. Push this repo to GitHub.
2. In Vercel → “New Project” → import the repo.
3. Add env var `DATA_URL` with the RAW CSV URL (same as `.env`).
4. Deploy.

The API response is cached at the edge for 1 hour and served stale for 24h while revalidating.

## Notes

- If your CSV gets large, consider pre-aggregating or moving to Supabase and swapping the API to SQL.
- To share a pre-filtered view, append query params:
  ```
  https://your-domain.app/?symbol=Gold&start=2024-01-01&end=2024-12-31
  ```
