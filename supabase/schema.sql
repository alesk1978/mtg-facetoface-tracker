-- Run this in Supabase → SQL Editor for a new project.

CREATE TABLE IF NOT EXISTS watchlist (
  shopify_id BIGINT PRIMARY KEY,
  title TEXT NOT NULL,
  handle TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  image_url TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id BIGSERIAL PRIMARY KEY,
  shopify_id BIGINT NOT NULL REFERENCES watchlist (shopify_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  compare_at_price DOUBLE PRECISION,
  available BOOLEAN NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_product_time
  ON price_snapshots (shopify_id, checked_at DESC);

-- Existing projects: run once if watchlist already exists without image_url
-- ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS image_url TEXT;
