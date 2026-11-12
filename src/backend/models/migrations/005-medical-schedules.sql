ALTER TABLE responses
  ADD COLUMN IF NOT EXISTS attended_time TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS schedule_imports(
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  imported_by TEXT REFERENCES users(id),
  imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS medical_shifts(
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES schedule_imports(id) ON DELETE CASCADE,
  sector_id TEXT NOT NULL REFERENCES sectors(id),
  shift_date TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  professional_name TEXT NOT NULL,
  registration TEXT NOT NULL DEFAULT '',
  specialty TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS medical_shifts_sector_date
  ON medical_shifts(sector_id, shift_date);
CREATE INDEX IF NOT EXISTS medical_shifts_import
  ON medical_shifts(import_id);

