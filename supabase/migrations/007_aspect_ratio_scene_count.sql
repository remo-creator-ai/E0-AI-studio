-- Add aspect ratio and scene count columns to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS aspect_ratio TEXT DEFAULT '16:9';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS scene_count INTEGER DEFAULT 9;
