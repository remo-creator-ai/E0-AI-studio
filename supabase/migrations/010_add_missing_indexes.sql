-- Add missing indexes for frequently queried FK columns
CREATE INDEX IF NOT EXISTS idx_production_requests_user_id
  ON production_requests (user_id);

CREATE INDEX IF NOT EXISTS idx_production_requests_project_id
  ON production_requests (project_id);

CREATE INDEX IF NOT EXISTS idx_projects_original_creator
  ON projects (original_creator_id);
