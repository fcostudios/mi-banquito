ALTER TABLE expense ADD COLUMN IF NOT EXISTS notes text;

DROP FUNCTION IF EXISTS refresh_movement_read_models();
