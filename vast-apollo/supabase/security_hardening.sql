-- Security hardening for the API-first application architecture.
-- Apply through the Supabase SQL editor or CLI after reviewing against staging.

BEGIN;

-- The browser authenticates through /api/auth/login. Do not expose a username-to-email
-- lookup function to anonymous callers.
DROP FUNCTION IF EXISTS public.get_login_email(TEXT);

-- The server uses the service role for business operations. Browser roles need schema
-- usage and authenticated users only need to read their own profile.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $$
BEGIN
    IF to_regclass('public.products_salesman') IS NOT NULL THEN
        ALTER VIEW public.products_salesman SET (security_invoker = true);
        REVOKE ALL ON TABLE public.products_salesman FROM anon, authenticated;
    END IF;
END
$$;

DO $$
DECLARE
    table_name TEXT;
    policy_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'profiles', 'products', 'bills', 'bill_items', 'vendor_bills', 'expenses'
    ] LOOP
        IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);

            FOR policy_name IN
                SELECT policyname FROM pg_policies
                WHERE schemaname = 'public' AND tablename = table_name
            LOOP
                EXECUTE format('DROP POLICY %I ON public.%I', policy_name, table_name);
            END LOOP;
        END IF;
    END LOOP;
END
$$;

GRANT SELECT ON TABLE public.profiles TO authenticated;

CREATE POLICY "Users read their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = id);

-- Profile creation uses trusted app_metadata for roles; user_metadata is intentionally
-- limited to display fields because users can edit it themselves.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    requested_role TEXT;
BEGIN
    requested_role := NEW.raw_app_meta_data->>'role';
    IF requested_role NOT IN ('founder', 'salesman', 'accounting') THEN
        requested_role := 'salesman';
    END IF;

    INSERT INTO public.profiles (id, email, username, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        NULLIF(LOWER(TRIM(NEW.raw_user_meta_data->>'username')), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
        requested_role
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMIT;
