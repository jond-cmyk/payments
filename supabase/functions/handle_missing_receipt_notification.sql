CREATE OR REPLACE FUNCTION public.handle_missing_receipt_notification()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path TO 'pg_catalog, public, net'
AS $$
BEGIN
    RAISE NOTICE 'handle_missing_receipt_notification: DEBUG - Function entered. Operation: %, Transaction ID: %', TG_OP, NEW.id;
    RETURN NEW;
END;
$$;