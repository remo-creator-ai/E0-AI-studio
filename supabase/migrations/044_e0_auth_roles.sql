-- E0: client-controlled metadata must never grant administrative privileges.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url, login_id, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'login_id'
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'login_id',
    'user'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE OR REPLACE FUNCTION public.protect_profile_authority()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IN ('authenticated', 'anon') AND NOT public.is_master()
     AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status
          OR NEW.id IS DISTINCT FROM OLD.id OR NEW.email IS DISTINCT FROM OLD.email) THEN
    RAISE EXCEPTION 'Profile authority fields require an administrator' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_profile_authority BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_authority();

-- Admin RPC functions for production request management (SECURITY DEFINER bypasses RLS)

-- Function: admin reads all production requests
CREATE OR REPLACE FUNCTION public.admin_get_all_requests()
RETURNS SETOF public.production_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_master() THEN
    RAISE EXCEPTION 'Master role required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.production_requests ORDER BY created_at DESC;
END;
$$;

-- Function: admin updates a request's status
CREATE OR REPLACE FUNCTION public.admin_update_request_status(
  p_request_id UUID,
  p_status TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_master() THEN
    RAISE EXCEPTION 'Master role required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('pending', 'in_progress', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  UPDATE public.production_requests
  SET status = p_status, updated_at = now()
  WHERE id = p_request_id;
END;
$$;

-- Grant execute to authenticated users (SECURITY DEFINER ensures only admin logic runs)
GRANT EXECUTE ON FUNCTION public.admin_get_all_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_request_status(UUID, TEXT) TO authenticated;
