-- Ticket dependencies (blocks / blocked_by / relates_to)
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

-- Ticket activity / changelog
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

-- In-app notifications
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

-- WIP limits on statuses
ALTER TABLE project_statuses ADD COLUMN IF NOT EXISTS wip_limit INTEGER DEFAULT NULL;
