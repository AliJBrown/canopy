CREATE TABLE IF NOT EXISTS goal_dependencies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES project_goals(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES project_goals(id) ON DELETE CASCADE,
  type       VARCHAR(20) NOT NULL DEFAULT 'blocks'
               CHECK (type IN ('blocks', 'relates_to')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

CREATE INDEX IF NOT EXISTS goal_deps_blocker ON goal_dependencies(blocker_id);
CREATE INDEX IF NOT EXISTS goal_deps_blocked ON goal_dependencies(blocked_id);
