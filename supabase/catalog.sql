-- Catalog-wide price tracking (run after schema.sql)

CREATE TABLE IF NOT EXISTS catalog_sync_runs (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  last_page INTEGER NOT NULL DEFAULT 0,
  products_synced INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS catalog_snapshots (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES catalog_sync_runs (id) ON DELETE CASCADE,
  shopify_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  handle TEXT NOT NULL,
  set_name TEXT,
  price DOUBLE PRECISION NOT NULL,
  compare_at_price DOUBLE PRECISION,
  available BOOLEAN NOT NULL,
  UNIQUE (run_id, shopify_id)
);

CREATE INDEX IF NOT EXISTS idx_catalog_snapshots_run
  ON catalog_snapshots (run_id);

CREATE INDEX IF NOT EXISTS idx_catalog_snapshots_set
  ON catalog_snapshots (set_name);

CREATE INDEX IF NOT EXISTS idx_catalog_sync_runs_completed
  ON catalog_sync_runs (completed_at DESC)
  WHERE status = 'complete';
