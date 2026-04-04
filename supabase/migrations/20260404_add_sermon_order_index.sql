-- Add order_index for drag-to-reorder in sermon notes list
ALTER TABLE sermon_notes ADD COLUMN order_index INTEGER DEFAULT 0;

-- Purge function for sermon notes (mirrors purge_deleted_tasks)
CREATE OR REPLACE FUNCTION public.purge_deleted_sermon_notes(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  purged_count INTEGER;
BEGIN
  DELETE FROM public.sermon_notes
  WHERE deleted_at IS NOT NULL
    AND deleted_at < timezone('utc', now()) - make_interval(days => retention_days);
  GET DIAGNOSTICS purged_count = ROW_COUNT;
  RETURN purged_count;
END;
$$;
