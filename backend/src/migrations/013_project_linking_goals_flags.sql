-- Per-program epic, used only in 'per_client' mode: the ticket that represents this program
-- inside its client's shared project. Sub-task checklist tickets get parent_id = this.
ALTER TABLE programs ADD COLUMN IF NOT EXISTS epic_ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL;

-- Program -> org-level Strategic Goal references (mirrors ticket_goal_links' shape). Purely a
-- reference link -- no changes to Goals' own progress/rollup computation.
CREATE TABLE IF NOT EXISTS program_goal_links (
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES project_goals(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (program_id, goal_id)
);

-- Singleton, mirrors program_settings' shape. Read by ANY authenticated user (nav needs it);
-- only admins can write it -- so it lives in its own table/route rather than inside
-- program_settings, which is entirely behind requireAdmin.
CREATE TABLE IF NOT EXISTS feature_flags (
  id INTEGER PRIMARY KEY DEFAULT 1,
  clients_enabled BOOLEAN NOT NULL DEFAULT true,
  programs_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO feature_flags (id) VALUES (1) ON CONFLICT DO NOTHING;
