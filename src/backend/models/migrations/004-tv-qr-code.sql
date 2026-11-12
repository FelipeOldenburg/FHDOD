ALTER TABLE tv_devices
  ADD COLUMN IF NOT EXISTS qr_sector_id TEXT REFERENCES sectors(id);

