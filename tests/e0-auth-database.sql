-- Run against E0 only. Test users and data are rolled back.
BEGIN;
INSERT INTO auth.users(id, email, raw_user_meta_data)
VALUES ('e0000000-0000-4000-8000-000000000001', 'e0-auth-check@example.invalid', '{"role":"master","name":"E0 test"}');
DO $$ BEGIN
  IF (SELECT role FROM public.profiles WHERE id='e0000000-0000-4000-8000-000000000001') <> 'user' THEN
    RAISE EXCEPTION 'User metadata granted admin authority';
  END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT * FROM public.initialize_user_credits('e0000000-0000-4000-8000-000000000001');
DO $$ BEGIN
  BEGIN
    UPDATE public.profiles SET role='master' WHERE id=auth.uid();
    RAISE EXCEPTION 'Self-promotion was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.admin_get_all_requests();
    RAISE EXCEPTION 'Admin request access was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
ROLLBACK;
