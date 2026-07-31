# MTG Face to Face Price Tracker

Track **Magic: The Gathering** singles price changes on [Face to Face Games](https://www.facetofacegames.com) using their public Shopify search API.

## Features

- Search MTG singles by card name
- Add listings to a watchlist (by Shopify product handle)
- Run price checks and store history
- View price changes between the last two checks
- **Web UI** deployable on Vercel
- **CLI** for local terminal use

## Requirements

- Python 3.11+ (CLI)
- Node.js 20+ (web app)

## Web app (Vercel)

The web interface is a Next.js app at the repo root.

### Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy `.env.example` to `.env.local` and fill in your Supabase credentials.

### Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run the schema in [`supabase/schema.sql`](supabase/schema.sql).
3. In **Project Settings → API**, copy:
   - **Project URL** → `SUPABASE_URL` (base URL only, no `/rest/v1/`)
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (server-side only)

### Deploy to Vercel

1. Push this repo to GitHub.
2. Import the project in [Vercel](https://vercel.com/new).
3. Leave **Root Directory** empty (the Next.js app is at the repo root).
4. In Vercel → **Settings → Environment Variables**, add:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Deploy.

## CLI

No third-party Python packages required.

```bash
# Search for a card
python -m src.cli search "Lightning Bolt"

# Add a specific printing to your watchlist (use handle from search output)
python -m src.cli watch lightning-bolt-162-revised-edition-non-foil

# List watched cards
python -m src.cli list

# Fetch current prices and save a snapshot
python -m src.cli check

# Run check again later, then compare
python -m src.cli changes
```

## How it works

Face to Face runs on Shopify. The app reads public JSON endpoints:

- Search: `/search/suggest.json?q=...&resources[type]=product`
- Product detail: `/products/{handle}.json`

Price history is stored in SQLite (CLI: `data/prices.db`) or Supabase Postgres (web app).

## Notes

- Prices are in **CAD**.
- Each printing is a separate product (handle), so watch the exact version you care about.
- Be respectful with request frequency; this tool is for personal tracking.
