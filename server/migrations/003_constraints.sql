-- Миграция 003: добавляет CHECK constraint на current_status в dining_tables.
-- Идемпотентна: сначала удаляем старый constraint (если есть), затем добавляем новый.

ALTER TABLE dining_tables DROP CONSTRAINT IF EXISTS dining_tables_status_check;
ALTER TABLE dining_tables ADD CONSTRAINT dining_tables_status_check
  CHECK (current_status IN ('free', 'reserved', 'occupied'));
