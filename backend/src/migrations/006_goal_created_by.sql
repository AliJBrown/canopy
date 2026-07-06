ALTER TABLE project_goals ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS project_goals_created_by ON project_goals(created_by);
