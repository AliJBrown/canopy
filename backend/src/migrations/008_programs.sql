-- Programs: client-engagement pipeline tracking (separate from Goals/Projects)

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  company VARCHAR(255) DEFAULT '',
  contact_email VARCHAR(255) DEFAULT '',
  contact_phone VARCHAR(50) DEFAULT '',
  notes TEXT DEFAULT '',
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS program_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(program_id, slug)
);

CREATE TABLE IF NOT EXISTS engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'invoiced', 'paid')),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS engagements_program_id ON engagements(program_id);
CREATE INDEX IF NOT EXISTS engagements_client_id ON engagements(client_id);

CREATE TABLE IF NOT EXISTS engagement_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES program_stages(id) ON DELETE CASCADE,
  item_type VARCHAR(10) NOT NULL CHECK (item_type IN ('task', 'ticket')),
  title VARCHAR(500),
  is_done BOOLEAN NOT NULL DEFAULT false,
  ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CHECK (
    (item_type = 'task' AND title IS NOT NULL) OR
    (item_type = 'ticket' AND ticket_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS engagement_checklist_items_engagement_stage
  ON engagement_checklist_items(engagement_id, stage_id);
CREATE INDEX IF NOT EXISTS engagement_checklist_items_ticket_id
  ON engagement_checklist_items(ticket_id);

-- Singleton settings row — dedicated purpose-built table, matching this schema's convention
-- of no generic key-value settings store.
CREATE TABLE IF NOT EXISTS program_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  ticket_project_mode VARCHAR(20) NOT NULL DEFAULT 'single'
    CHECK (ticket_project_mode IN ('single', 'per_client', 'per_engagement')),
  shared_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO program_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

DROP TRIGGER IF EXISTS clients_updated_at ON clients;
CREATE TRIGGER clients_updated_at BEFORE UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS programs_updated_at ON programs;
CREATE TRIGGER programs_updated_at BEFORE UPDATE ON programs
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS engagements_updated_at ON engagements;
CREATE TRIGGER engagements_updated_at BEFORE UPDATE ON engagements
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
