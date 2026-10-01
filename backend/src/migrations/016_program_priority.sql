ALTER TABLE programs ADD COLUMN IF NOT EXISTS priority VARCHAR(2) NOT NULL DEFAULT 'p2'
  CHECK (priority IN ('p0', 'p1', 'p2', 'p3'));
