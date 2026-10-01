CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Core tables
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  key VARCHAR(10) NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  color VARCHAR(7) DEFAULT '#6366F1',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auth columns (idempotent)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'member';
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_unique ON users(google_id) WHERE google_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT DEFAULT '',
  type VARCHAR(20) NOT NULL DEFAULT 'task',
  status VARCHAR(20) NOT NULL DEFAULT 'backlog',
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  parent_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  labels TEXT[] DEFAULT '{}',
  order_index FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, number)
);

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permission tables
CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

CREATE TABLE IF NOT EXISTS project_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, team_id)
);

-- Triggers
CREATE OR REPLACE FUNCTION set_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  SELECT COALESCE(MAX(number), 0) + 1 INTO NEW.number
  FROM tickets WHERE project_id = NEW.project_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tickets_auto_number ON tickets;
CREATE TRIGGER tickets_auto_number BEFORE INSERT ON tickets
FOR EACH ROW EXECUTE FUNCTION set_ticket_number();

DROP TRIGGER IF EXISTS tickets_updated_at ON tickets;
CREATE TRIGGER tickets_updated_at BEFORE UPDATE ON tickets
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS comments_updated_at ON comments;
CREATE TRIGGER comments_updated_at BEFORE UPDATE ON comments
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS teams_updated_at ON teams;
CREATE TRIGGER teams_updated_at BEFORE UPDATE ON teams
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Time tracking columns on tickets (idempotent)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS estimate_hours FLOAT;

-- Time logs
CREATE TABLE IF NOT EXISTS time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  hours FLOAT NOT NULL CHECK (hours > 0 AND hours <= 24),
  description TEXT DEFAULT '',
  logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS time_logs_ticket_id_idx ON time_logs(ticket_id);

-- Notification log (prevents sending the same alert twice within 24h)
CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL DEFAULT 'overdue',
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sprints
CREATE TABLE IF NOT EXISTS sprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  goal TEXT DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'active', 'completed')),
  start_date DATE,
  end_date DATE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  metric VARCHAR(10) NOT NULL DEFAULT 'points' CHECK (metric IN ('points', 'hours')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS metric VARCHAR(10) NOT NULL DEFAULT 'points' CHECK (metric IN ('points', 'hours'));
CREATE UNIQUE INDEX IF NOT EXISTS sprints_one_active_per_project
  ON sprints(project_id) WHERE status = 'active';

DROP TRIGGER IF EXISTS sprints_updated_at ON sprints;
CREATE TRIGGER sprints_updated_at BEFORE UPDATE ON sprints
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Sprint columns on tickets (idempotent)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sprint_id UUID REFERENCES sprints(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS story_points INTEGER;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Auto-set completed_at when ticket status changes to/from 'done'
CREATE OR REPLACE FUNCTION set_ticket_completed_at() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'done' AND (OLD.status IS NULL OR OLD.status != 'done') THEN
    NEW.completed_at = NOW();
  ELSIF NEW.status != 'done' AND OLD.status = 'done' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ticket_completed_at ON tickets;
CREATE TRIGGER ticket_completed_at
  BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION set_ticket_completed_at();

-- Performance indexes (all idempotent)
CREATE INDEX IF NOT EXISTS tickets_project_status_order ON tickets(project_id, status, order_index);
CREATE INDEX IF NOT EXISTS tickets_project_sprint       ON tickets(project_id, sprint_id);
CREATE INDEX IF NOT EXISTS tickets_project_assignee     ON tickets(project_id, assignee_id);
CREATE INDEX IF NOT EXISTS tickets_project_type         ON tickets(project_id, type);
CREATE INDEX IF NOT EXISTS tickets_project_priority     ON tickets(project_id, priority);
CREATE INDEX IF NOT EXISTS tickets_project_created      ON tickets(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tickets_completed_at_partial ON tickets(completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS tickets_fts ON tickets USING GIN(
  to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))
);

-- Label management
CREATE TABLE IF NOT EXISTS project_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#6366F1',
  description TEXT DEFAULT '',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, name)
);
CREATE TABLE IF NOT EXISTS ticket_labels (
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  label_id  UUID NOT NULL REFERENCES project_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (ticket_id, label_id)
);
CREATE INDEX IF NOT EXISTS ticket_labels_label_id ON ticket_labels(label_id);

-- Custom fields
CREATE TABLE IF NOT EXISTS project_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  field_type VARCHAR(20) NOT NULL DEFAULT 'text'
    CHECK (field_type IN ('text','number','select','date','url')),
  options JSONB DEFAULT '[]',
  position INTEGER DEFAULT 0,
  is_required BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, name)
);
CREATE TABLE IF NOT EXISTS ticket_field_values (
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  field_id  UUID NOT NULL REFERENCES project_fields(id) ON DELETE CASCADE,
  value TEXT,
  PRIMARY KEY (ticket_id, field_id)
);
CREATE INDEX IF NOT EXISTS ticket_field_values_field_id ON ticket_field_values(field_id);

-- Saved filters (per user per project)
CREATE TABLE IF NOT EXISTS saved_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  filter_config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ticket attachments
CREATE TABLE IF NOT EXISTS ticket_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  uploader_id UUID REFERENCES users(id) ON DELETE SET NULL,
  filename VARCHAR(500) NOT NULL,
  original_name VARCHAR(500) NOT NULL,
  content_type VARCHAR(100) DEFAULT 'application/octet-stream',
  file_size BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ticket_attachments_ticket_id ON ticket_attachments(ticket_id);

-- Comment mentions
CREATE TABLE IF NOT EXISTS comment_mentions (
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (comment_id, user_id)
);

-- Project goals / KPI tree
CREATE TABLE IF NOT EXISTS project_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES project_goals(id) ON DELETE SET NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT DEFAULT '',
  goal_type VARCHAR(20) NOT NULL DEFAULT 'objective'
    CHECK (goal_type IN ('objective', 'key_result', 'milestone', 'initiative')),
  metric_type VARCHAR(20) NOT NULL DEFAULT 'completion'
    CHECK (metric_type IN ('completion', 'points', 'count', 'manual', 'currency')),
  target_value NUMERIC,
  current_value NUMERIC DEFAULT 0,
  unit VARCHAR(50) DEFAULT '%',
  weight NUMERIC DEFAULT 1.0,
  status VARCHAR(20) NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'on_track', 'at_risk', 'behind', 'completed', 'cancelled')),
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  start_date DATE,
  due_date DATE,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Allow org-level goals (project_id = NULL means company-wide)
ALTER TABLE project_goals ALTER COLUMN project_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS project_goals_project_id ON project_goals(project_id);
CREATE INDEX IF NOT EXISTS project_goals_parent_id ON project_goals(parent_id);
CREATE INDEX IF NOT EXISTS project_goals_org ON project_goals(project_id) WHERE project_id IS NULL;

DROP TRIGGER IF EXISTS project_goals_updated_at ON project_goals;
CREATE TRIGGER project_goals_updated_at BEFORE UPDATE ON project_goals
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Ticket → Goal links (direct individual ticket links)
CREATE TABLE IF NOT EXISTS ticket_goal_links (
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES project_goals(id) ON DELETE CASCADE,
  contribution_weight NUMERIC DEFAULT 1.0,
  PRIMARY KEY (ticket_id, goal_id)
);
CREATE INDEX IF NOT EXISTS ticket_goal_links_goal_id ON ticket_goal_links(goal_id);

-- Epic → Goal links: all sub-tickets of the epic count toward the goal
CREATE TABLE IF NOT EXISTS goal_epic_links (
  goal_id UUID NOT NULL REFERENCES project_goals(id) ON DELETE CASCADE,
  epic_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (goal_id, epic_id)
);
CREATE INDEX IF NOT EXISTS goal_epic_links_goal_id ON goal_epic_links(goal_id);

-- Per-goal ticket exclusions: opt specific sub-tickets out of an epic link
CREATE TABLE IF NOT EXISTS goal_ticket_exclusions (
  goal_id UUID NOT NULL REFERENCES project_goals(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  PRIMARY KEY (goal_id, ticket_id)
);
CREATE INDEX IF NOT EXISTS goal_ticket_exclusions_goal_id ON goal_ticket_exclusions(goal_id);

-- ============================================================
-- WORKFLOWS & AUTOMATIONS
-- ============================================================

-- Per-project workflow: defines valid status transitions
-- If no workflow exists for a project, any transition is allowed
CREATE TABLE IF NOT EXISTS project_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
  name VARCHAR(200) NOT NULL DEFAULT 'Default Workflow',
  is_enforced BOOLEAN DEFAULT false,  -- if true, block invalid transitions via API
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allowed transitions within a workflow
-- from_status = 'any' means this transition is allowed from any status
CREATE TABLE IF NOT EXISTS workflow_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES project_workflows(id) ON DELETE CASCADE,
  from_status VARCHAR(20) NOT NULL,
  to_status VARCHAR(20) NOT NULL,
  name VARCHAR(200) NOT NULL DEFAULT '',
  UNIQUE(workflow_id, from_status, to_status)
);
CREATE INDEX IF NOT EXISTS workflow_transitions_workflow_id ON workflow_transitions(workflow_id);

-- Automation rules
CREATE TABLE IF NOT EXISTS project_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  trigger_type VARCHAR(50) NOT NULL
    CHECK (trigger_type IN (
      'ticket.created', 'ticket.status_changed', 'ticket.assigned',
      'ticket.priority_changed', 'ticket.commented'
    )),
  trigger_config JSONB NOT NULL DEFAULT '{}',
  conditions JSONB NOT NULL DEFAULT '[]',
  actions JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  run_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS project_automations_project_id ON project_automations(project_id);

DROP TRIGGER IF EXISTS project_automations_updated_at ON project_automations;
CREATE TRIGGER project_automations_updated_at BEFORE UPDATE ON project_automations
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Automation execution log (keep last 500 per automation via application logic)
CREATE TABLE IF NOT EXISTS automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES project_automations(id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'failed', 'skipped')),
  result JSONB DEFAULT '{}',
  ran_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS automation_runs_automation_id ON automation_runs(automation_id, ran_at DESC);

-- API tokens: long-lived auth tokens for external automation/AI agents
CREATE TABLE IF NOT EXISTS api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  token_prefix VARCHAR(12) NOT NULL,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS api_tokens_user_id ON api_tokens(user_id);
CREATE INDEX IF NOT EXISTS api_tokens_token_hash ON api_tokens(token_hash);


-- Expand metric_type to include subgoal completion tracking
ALTER TABLE project_goals DROP CONSTRAINT IF EXISTS project_goals_metric_type_check;
ALTER TABLE project_goals ADD CONSTRAINT project_goals_metric_type_check
  CHECK (metric_type IN ('completion', 'points', 'count', 'manual', 'currency', 'subgoals'));

-- Expand goal_type to include task
ALTER TABLE project_goals DROP CONSTRAINT IF EXISTS project_goals_goal_type_check;
ALTER TABLE project_goals ADD CONSTRAINT project_goals_goal_type_check
  CHECK (goal_type IN ('objective', 'key_result', 'milestone', 'initiative', 'task'));

-- Personal goals: user_id marks a goal as belonging to a specific user
-- is_public=true + project_id set = published to that project's Goals page
ALTER TABLE project_goals ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE project_goals ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS project_goals_user_id ON project_goals(user_id);

-- Per-project configurable workflow statuses
CREATE TABLE IF NOT EXISTS project_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug VARCHAR(50) NOT NULL,
  name VARCHAR(50) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#94a3b8',
  category VARCHAR(20) NOT NULL DEFAULT 'in_progress'
    CHECK (category IN ('todo', 'in_progress', 'done')),
  position INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, slug)
);
CREATE INDEX IF NOT EXISTS project_statuses_project_id ON project_statuses(project_id, position);

-- Seed default statuses for existing projects
INSERT INTO project_statuses (project_id, slug, name, color, category, position, is_default)
SELECT p.id, s.slug, s.name, s.color, s.category, s.position, s.is_default
FROM projects p
CROSS JOIN (VALUES
  ('backlog',     'Backlog',     '#94a3b8', 'todo',        0, true),
  ('todo',        'To Do',       '#60a5fa', 'todo',        1, false),
  ('in_progress', 'In Progress', '#f59e0b', 'in_progress', 2, false),
  ('in_review',   'In Review',   '#8b5cf6', 'in_progress', 3, false),
  ('blocked',     'Blocked',     '#ef4444', 'in_progress', 4, false),
  ('done',        'Done',        '#10b981', 'done',        5, false)
) AS s(slug, name, color, category, position, is_default)
WHERE NOT EXISTS (SELECT 1 FROM project_statuses ps WHERE ps.project_id = p.id)
ON CONFLICT DO NOTHING;

-- Update completed_at trigger to honour custom done-category statuses
CREATE OR REPLACE FUNCTION set_ticket_completed_at() RETURNS TRIGGER AS $$
DECLARE
  new_cat VARCHAR(20);
  old_cat VARCHAR(20);
BEGIN
  SELECT category INTO new_cat FROM project_statuses
    WHERE project_id = NEW.project_id AND slug = NEW.status LIMIT 1;
  IF new_cat IS NULL THEN
    new_cat := CASE WHEN NEW.status = 'done' THEN 'done' ELSE 'in_progress' END;
  END IF;

  SELECT category INTO old_cat FROM project_statuses
    WHERE project_id = OLD.project_id AND slug = OLD.status LIMIT 1;
  IF old_cat IS NULL THEN
    old_cat := CASE WHEN OLD.status = 'done' THEN 'done' ELSE 'in_progress' END;
  END IF;

  IF new_cat = 'done' AND old_cat != 'done' THEN
    NEW.completed_at = NOW();
  ELSIF new_cat != 'done' AND old_cat = 'done' THEN
    NEW.completed_at = NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Permissions
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_manage_org_goals BOOLEAN NOT NULL DEFAULT false;

-- Goal locking
ALTER TABLE project_goals ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- RBAC: System-level permission grants per user
-- ============================================================
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission VARCHAR(100) NOT NULL,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, permission)
);

-- Migrate existing can_manage_org_goals flag into the new table
INSERT INTO user_permissions (user_id, permission)
  SELECT id, 'org_goals.write'  FROM users WHERE can_manage_org_goals = true ON CONFLICT DO NOTHING;
INSERT INTO user_permissions (user_id, permission)
  SELECT id, 'org_goals.delete' FROM users WHERE can_manage_org_goals = true ON CONFLICT DO NOTHING;
INSERT INTO user_permissions (user_id, permission)
  SELECT id, 'org_goals.lock'   FROM users WHERE can_manage_org_goals = true ON CONFLICT DO NOTHING;

-- ============================================================
-- RBAC: Configurable per-project role permissions
-- ============================================================
CREATE TABLE IF NOT EXISTS project_role_permissions (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role       VARCHAR(20) NOT NULL CHECK (role IN ('viewer', 'member', 'admin', 'owner')),
  permission VARCHAR(100) NOT NULL,
  PRIMARY KEY (project_id, role, permission)
);

-- -------------------------------------------------------
-- Ticket dependencies (blocks / blocked_by / relates_to)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS ticket_dependencies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  type       VARCHAR(20) NOT NULL DEFAULT 'blocks'
               CHECK (type IN ('blocks', 'relates_to', 'duplicates')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);
CREATE INDEX IF NOT EXISTS ticket_deps_blocker ON ticket_dependencies(blocker_id);
CREATE INDEX IF NOT EXISTS ticket_deps_blocked ON ticket_dependencies(blocked_id);

-- -------------------------------------------------------
-- Ticket activity / changelog
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS ticket_activity (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  action    VARCHAR(50) NOT NULL,
  field     VARCHAR(50),
  old_value TEXT,
  new_value TEXT,
  metadata  JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ticket_activity_ticket_id ON ticket_activity(ticket_id);

-- -------------------------------------------------------
-- In-app notifications
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  type       VARCHAR(50) NOT NULL,
  ticket_id  UUID REFERENCES tickets(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES comments(id) ON DELETE SET NULL,
  data       JSONB DEFAULT '{}',
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_unread  ON notifications(user_id) WHERE read_at IS NULL;

-- -------------------------------------------------------
-- WIP limits on statuses
-- -------------------------------------------------------
ALTER TABLE project_statuses ADD COLUMN IF NOT EXISTS wip_limit INTEGER DEFAULT NULL;

-- Seed default permissions for all existing projects
DO $$
DECLARE
  p UUID;
  defaults JSONB := jsonb_build_object(
    'viewer', '["tickets.view","goals.view","sprints.view","members.view","time.view","reports.view"]'::jsonb,
    'member', '["tickets.view","tickets.write","goals.view","goals.write","sprints.view","members.view","time.view","time.log","reports.view"]'::jsonb,
    'admin',  '["tickets.view","tickets.write","tickets.delete","goals.view","goals.write","goals.delete","goals.lock","sprints.view","sprints.manage","members.view","members.manage","time.view","time.log","reports.view","labels.manage","fields.manage","statuses.manage","project.settings"]'::jsonb,
    'owner',  '["tickets.view","tickets.write","tickets.delete","goals.view","goals.write","goals.delete","goals.lock","sprints.view","sprints.manage","members.view","members.manage","time.view","time.log","reports.view","labels.manage","fields.manage","statuses.manage","project.settings","project.delete"]'::jsonb
  );
  r TEXT;
  perm TEXT;
BEGIN
  FOR p IN SELECT id FROM projects LOOP
    FOR r IN SELECT jsonb_object_keys(defaults) LOOP
      FOR perm IN SELECT jsonb_array_elements_text(defaults->r) LOOP
        INSERT INTO project_role_permissions (project_id, role, permission)
        VALUES (p, r, perm) ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- PROGRAMS: client project/engagement tracking (separate from Goals/Projects)
-- A Client is a company. A Program is one project/engagement belonging to a client
-- (a client can have multiple simultaneous Programs). Every Program moves through the
-- same global, admin-configurable pipeline of stages, so they can all be shown together
-- in one master list.
-- ============================================================

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255) DEFAULT '',
  contact_email VARCHAR(255) DEFAULT '',
  contact_phone VARCHAR(50) DEFAULT '',
  notes TEXT DEFAULT '',
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Global, shared by every program (admin-managed, same shape as project_statuses)
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
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'on_hold', 'at_risk', 'completed', 'cancelled')),
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'invoiced', 'paid')),
  priority VARCHAR(2) NOT NULL DEFAULT 'p2' CHECK (priority IN ('p0', 'p1', 'p2', 'p3')),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  notes TEXT NOT NULL DEFAULT '',
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
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
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

-- Singleton settings row — dedicated purpose-built table, matching this schema's convention
-- of no generic key-value settings store.
CREATE TABLE IF NOT EXISTS program_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  ticket_project_mode VARCHAR(20) NOT NULL DEFAULT 'single'
    CHECK (ticket_project_mode IN ('single', 'per_client', 'per_program')),
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

-- Lets a stage be marked in-progress/done manually (a stage may need no checklist items at
-- all), and gives each (program, stage) a place for free-text notes.
CREATE TABLE IF NOT EXISTS program_stage_progress (
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  manual_state VARCHAR(20) CHECK (manual_state IN ('not_started', 'active', 'done')),
  notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (program_id, stage_id)
);

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
