-- Programs v2: flatten Program to be one client project (was a container of many client
-- "engagement" rows). Only throwaway test data existed under the v1 shape, so these tables are
-- dropped and recreated rather than migrated in place.

DROP TABLE IF EXISTS engagement_checklist_items;
DROP TABLE IF EXISTS engagements;
DROP TABLE IF EXISTS program_stages;
DROP TABLE IF EXISTS programs;

ALTER TABLE clients DROP COLUMN IF EXISTS company;

-- Global, shared by every program (admin-managed, same CRUD/reorder shape as project_statuses)
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL UNIQUE,
  color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- One row per client project/engagement
CREATE TABLE IF NOT EXISTS programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'on_hold', 'at_risk', 'completed', 'cancelled')),
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'invoiced', 'paid')),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS programs_client_id ON programs(client_id);

CREATE TABLE IF NOT EXISTS program_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS program_checklist_items_program_stage
  ON program_checklist_items(program_id, stage_id);
CREATE INDEX IF NOT EXISTS program_checklist_items_ticket_id
  ON program_checklist_items(ticket_id);

INSERT INTO pipeline_stages (name, slug, position) VALUES
  ('Client Acquisition', 'client_acquisition', 0),
  ('Contract Signed', 'contract_signed', 1),
  ('Requirements Acceptance', 'requirements_acceptance', 2),
  ('Execution', 'execution', 3),
  ('Delivery', 'delivery', 4),
  ('Payment', 'payment', 5),
  ('Project Close', 'project_close', 6)
ON CONFLICT DO NOTHING;

ALTER TABLE program_settings DROP CONSTRAINT IF EXISTS program_settings_ticket_project_mode_check;
ALTER TABLE program_settings ADD CONSTRAINT program_settings_ticket_project_mode_check
  CHECK (ticket_project_mode IN ('single', 'per_client', 'per_program'));

DROP TRIGGER IF EXISTS programs_updated_at ON programs;
CREATE TRIGGER programs_updated_at BEFORE UPDATE ON programs
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
