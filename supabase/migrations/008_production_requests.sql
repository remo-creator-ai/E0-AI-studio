-- Production request table
CREATE TABLE IF NOT EXISTS production_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  project_title TEXT NOT NULL,
  requester_name TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  aspect_ratio TEXT DEFAULT '16:9',
  scene_count INTEGER DEFAULT 9,
  purpose TEXT NOT NULL,
  additional_notes TEXT,
  extra_file_urls TEXT[],
  storyboard_downloaded BOOLEAN DEFAULT false,
  assets_downloaded BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE production_requests ENABLE ROW LEVEL SECURITY;

-- Users can insert their own requests
CREATE POLICY "Users can insert own requests"
  ON production_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own requests
CREATE POLICY "Users can view own requests"
  ON production_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_production_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER production_requests_updated_at
  BEFORE UPDATE ON production_requests
  FOR EACH ROW EXECUTE FUNCTION update_production_requests_updated_at();
