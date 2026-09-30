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
