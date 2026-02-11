-- =====================================================
-- DISABLE RLS FOR DEVELOPMENT (No Auth Mode)
-- =====================================================
-- Run this to allow the app to work without authentication

-- Disable RLS on all tables
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items DISABLE ROW LEVEL SECURITY;

-- Grant full access to anonymous users
GRANT ALL ON public.profiles TO anon;
GRANT ALL ON public.products TO anon;
GRANT ALL ON public.bills TO anon;
GRANT ALL ON public.bill_items TO anon;
GRANT USAGE ON SCHEMA public TO anon;

-- Also grant to authenticated for later
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.products TO authenticated;
GRANT ALL ON public.bills TO authenticated;
GRANT ALL ON public.bill_items TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
