-- Goal privacy: mark a goal (and its subtree) as private
ALTER TABLE project_goals ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;

-- Explicit members who can view/edit a private goal
CREATE TABLE IF NOT EXISTS goal_members (
  goal_id UUID NOT NULL REFERENCES project_goals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (goal_id, user_id)
);

CREATE INDEX IF NOT EXISTS goal_members_goal_id ON goal_members(goal_id);
CREATE INDEX IF NOT EXISTS goal_members_user_id ON goal_members(user_id);
