-- Add featured column to existing videos table
ALTER TABLE videos 
ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE;
