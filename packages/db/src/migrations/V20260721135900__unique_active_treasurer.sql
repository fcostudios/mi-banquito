-- US-050 / US-098: serialize the invariant that each organization has at
-- most one active treasurer. Locking the table closes the write gap between
-- the legacy-data preflight and index installation.

LOCK TABLE public.member IN SHARE ROW EXCLUSIVE MODE;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.member
    WHERE role = 'tesorera' AND status = 'activo'
    GROUP BY org_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'active_treasurer_uniqueness_preflight_failed',
      DETAIL = 'At least one organization has multiple active treasurers.',
      HINT = 'Deactivate or reassign duplicate active treasurer rows, then rerun migrations.',
      ERRCODE = '23514';
  END IF;
END;
$migration$;

CREATE UNIQUE INDEX uq_member_org_single_active_treasurer
  ON public.member (org_id)
  WHERE role = 'tesorera' AND status = 'activo';
