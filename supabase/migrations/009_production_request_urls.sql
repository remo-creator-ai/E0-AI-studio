-- Add dedicated URL columns for storyboard and assets downloads
ALTER TABLE production_requests ADD COLUMN IF NOT EXISTS storyboard_url TEXT;
ALTER TABLE production_requests ADD COLUMN IF NOT EXISTS assets_url TEXT;
