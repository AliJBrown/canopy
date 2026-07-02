CREATE TABLE IF NOT EXISTS goal_assignees (
  goal_id UUID NOT NULL REFERENCES project_goals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (goal_id, user_id)
);
CREATE INDEX IF NOT EXISTS goal_assignees_goal_id ON goal_assignees(goal_id);
