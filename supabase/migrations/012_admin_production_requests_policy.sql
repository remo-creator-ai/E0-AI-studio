-- Admin RPC functions for production request management (SECURITY DEFINER bypasses RLS)

-- Function: admin reads all production requests
CREATE OR REPLACE FUNCTION public.admin_get_all_requests()
RETURNS SETOF public.production_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
