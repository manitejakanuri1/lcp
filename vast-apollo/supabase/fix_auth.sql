-- =====================================================
-- MINIMAL SCHEMA - RUN THIS FIRST
-- =====================================================
-- This removes the trigger that's causing the 500 error

-- Drop the problematic trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Make sure profiles table allows inserts
DROP POLICY IF EXISTS "Enable insert for service role" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.profiles;

CREATE POLICY "Allow anyone to insert their profile" ON public.profiles
  FOR INSERT WITH CHECK (true);

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.profiles TO anon, authenticated;
GRANT ALL ON public.products TO anon, authenticated;
GRANT ALL ON public.bills TO anon, authenticated;
GRANT ALL ON public.bill_items TO anon, authenticated;
