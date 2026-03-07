-- Closed-testing remediation:
-- 1. Align profiles schema with client expectations
-- 2. Add server-side helpers for account deletion and trash purging

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS membership_level TEXT NOT NULL DEFAULT 'free',
ADD COLUMN IF NOT EXISTS max_tabs INTEGER NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS max_tasks INTEGER NOT NULL DEFAULT 30;

UPDATE public.profiles
SET
  membership_level = COALESCE(NULLIF(membership_level, ''), 'free'),
  max_tabs = COALESCE(max_tabs, 3),
  max_tasks = COALESCE(max_tasks, 30);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_membership_level_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_membership_level_check
      CHECK (membership_level IN ('free', 'pro'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.delete_account_data(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_tasks INTEGER := 0;
  deleted_tabs INTEGER := 0;
  deleted_profiles INTEGER := 0;
BEGIN
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id is required';
  END IF;

  DELETE FROM public.mytask
  WHERE user_id = target_user_id;
  GET DIAGNOSTICS deleted_tasks = ROW_COUNT;

  DELETE FROM public.tabs
  WHERE user_id = target_user_id;
  GET DIAGNOSTICS deleted_tabs = ROW_COUNT;

  DELETE FROM public.profiles
  WHERE id = target_user_id;
  GET DIAGNOSTICS deleted_profiles = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_tasks', deleted_tasks,
    'deleted_tabs', deleted_tabs,
    'deleted_profiles', deleted_profiles
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_account_data(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_account_data(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.delete_account_data(UUID) FROM authenticated;

CREATE OR REPLACE FUNCTION public.purge_deleted_tasks(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  purged_count INTEGER := 0;
BEGIN
  DELETE FROM public.mytask
  WHERE deleted_at IS NOT NULL
    AND deleted_at < timezone('utc', now()) - make_interval(days => retention_days);

  GET DIAGNOSTICS purged_count = ROW_COUNT;
  RETURN purged_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_deleted_tasks(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_deleted_tasks(INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.purge_deleted_tasks(INTEGER) FROM authenticated;
