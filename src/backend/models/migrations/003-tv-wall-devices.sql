CREATE TABLE IF NOT EXISTS tv_devices(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT UNIQUE,
  pairing_code_hash TEXT,
  pairing_expires_at TEXT,
  paired_at TEXT,
  revoked_at TEXT,
  all_sectors INTEGER NOT NULL DEFAULT 1,
  sector_ids_json TEXT NOT NULL DEFAULT '[]',
  metrics_json TEXT NOT NULL DEFAULT '["satisfaction","responses","nps","pending","trend","sectors"]',
  period TEXT NOT NULL DEFAULT 'current_month',
  refresh_seconds INTEGER NOT NULL DEFAULT 30,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE INDEX IF NOT EXISTS tv_devices_token_hash ON tv_devices(token_hash);
CREATE INDEX IF NOT EXISTS tv_devices_last_seen ON tv_devices(last_seen_at);
