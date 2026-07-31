# MTG Face to Face Price Tracker

Track **Magic: The Gathering** singles price changes on [Face to Face Games](https://www.facetofacegames.com) using their public Shopify search API.

## Features

- Search MTG singles by card name
- Add listings to a local watchlist (by Shopify product handle)
- Run price checks and store history in SQLite
- View price changes between the last two checks

## Requirements

- Python 3.11+
- No third-party packages required

## Quick start

```bash
cd mtg-facetoface-tracker

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

Price history is stored locally in `data/prices.db`.

## Notes

- Prices are in **CAD**.
- Each printing is a separate product (handle), so watch the exact version you care about.
- Be respectful with request frequency; this tool is for personal tracking.

## GitHub

Create a remote repo and push:

```bash
git add .
git commit -m "Initial MTG Face to Face price tracker"
git remote add origin https://github.com/YOUR_USERNAME/mtg-facetoface-tracker.git
git push -u origin main
```
