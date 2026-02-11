-- =====================================================
-- SAREE INVENTORY & BILLING PWA - FIXED SCHEMA
-- =====================================================
-- Run this in your Supabase SQL Editor
-- This fixes the "Database error finding user" issue

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- STEP 1: DROP EXISTING OBJECTS (Clean slate)
-- =====================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_bill_item_created ON public.bill_items;
DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.mark_product_sold() CASCADE;
DROP FUNCTION IF EXISTS public.generate_bill_number() CASCADE;
DROP FUNCTION IF EXISTS public.get_analytics_summary(DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS public.get_daily_sales(INT) CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at() CASCADE;
DROP VIEW IF EXISTS public.products_salesman CASCADE;
DROP TABLE IF EXISTS public.bill_items CASCADE;
DROP TABLE IF EXISTS public.bills CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- =====================================================
-- PROFILES TABLE (extends Supabase auth.users)
-- =====================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'salesman' CHECK (role IN ('founder', 'salesman')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- FIXED: Allow service role to insert profiles (for trigger)
CREATE POLICY "Enable insert for service role" ON public.profiles
  FOR INSERT WITH CHECK (true);

-- Allow users to view all profiles (needed for role checking)
CREATE POLICY "Enable read for all authenticated users" ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- =====================================================
-- FUNCTION: Auto-create profile on user signup
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'salesman')
  );
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Trigger for new user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- PRODUCTS TABLE
-- =====================================================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku TEXT UNIQUE NOT NULL,
  vendor_name TEXT NOT NULL,
  purchase_date DATE NOT NULL,
  cost_price DECIMAL(10,2) NOT NULL CHECK (cost_price >= 0),
  selling_price DECIMAL(10,2) NOT NULL CHECK (selling_price >= 0),
  saree_type TEXT NOT NULL,
  material TEXT NOT NULL,
  color TEXT,
  rack_location TEXT,
  image_url TEXT,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'sold')),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_sku ON public.products(sku);
CREATE INDEX idx_products_status ON public.products(status);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Simple policies for products
CREATE POLICY "Authenticated can read products" ON public.products
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can insert products" ON public.products
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can update products" ON public.products
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can delete products" ON public.products
  FOR DELETE USING (auth.role() = 'authenticated');

-- =====================================================
-- BILLS TABLE
-- =====================================================
CREATE TABLE public.bills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_number TEXT UNIQUE NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  salesman_id UUID REFERENCES public.profiles(id),
  total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
  total_cost DECIMAL(10,2) DEFAULT 0 CHECK (total_cost >= 0),
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'upi')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bills_number ON public.bills(bill_number);
CREATE INDEX idx_bills_created_at ON public.bills(created_at);

ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read bills" ON public.bills
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can insert bills" ON public.bills
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- =====================================================
-- BILL ITEMS TABLE
-- =====================================================
CREATE TABLE public.bill_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID REFERENCES public.bills(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  selling_price DECIMAL(10,2) NOT NULL CHECK (selling_price >= 0),
  cost_price DECIMAL(10,2) DEFAULT 0 CHECK (cost_price >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bill_items_bill ON public.bill_items(bill_id);

ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read bill_items" ON public.bill_items
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can insert bill_items" ON public.bill_items
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- =====================================================
-- FUNCTION: Mark product as sold after billing
-- =====================================================
CREATE OR REPLACE FUNCTION public.mark_product_sold()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.products 
  SET status = 'sold', updated_at = NOW()
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_bill_item_created
  AFTER INSERT ON public.bill_items
  FOR EACH ROW EXECUTE FUNCTION public.mark_product_sold();

-- =====================================================
-- FUNCTION: Generate unique bill number
-- =====================================================
CREATE OR REPLACE FUNCTION public.generate_bill_number()
RETURNS TEXT AS $$
DECLARE
  new_number TEXT;
  today_prefix TEXT;
  counter INT;
BEGIN
  today_prefix := 'B-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-';
  
  SELECT COUNT(*) + 1 INTO counter
  FROM public.bills
  WHERE bill_number LIKE today_prefix || '%';
  
  new_number := today_prefix || LPAD(counter::TEXT, 4, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ANALYTICS FUNCTIONS
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_analytics_summary(
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  total_sales DECIMAL,
  total_cost DECIMAL,
  total_profit DECIMAL,
  total_items_sold BIGINT,
  total_items_in_stock BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(b.total_amount), 0)::DECIMAL as total_sales,
    COALESCE(SUM(b.total_cost), 0)::DECIMAL as total_cost,
    COALESCE(SUM(b.total_amount) - SUM(b.total_cost), 0)::DECIMAL as total_profit,
    (SELECT COUNT(*) FROM public.products WHERE status = 'sold')::BIGINT as total_items_sold,
    (SELECT COUNT(*) FROM public.products WHERE status = 'available')::BIGINT as total_items_in_stock
  FROM public.bills b
  WHERE 
    (start_date IS NULL OR b.created_at::DATE >= start_date) AND
    (end_date IS NULL OR b.created_at::DATE <= end_date);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_daily_sales(
  days_back INT DEFAULT 30
)
RETURNS TABLE (
  sale_date DATE,
  total_amount DECIMAL,
  total_profit DECIMAL,
  bill_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.created_at::DATE as sale_date,
    SUM(b.total_amount)::DECIMAL as total_amount,
    SUM(b.total_amount - b.total_cost)::DECIMAL as total_profit,
    COUNT(*)::BIGINT as bill_count
  FROM public.bills b
  WHERE b.created_at >= NOW() - (days_back || ' days')::INTERVAL
  GROUP BY b.created_at::DATE
  ORDER BY sale_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- UPDATED_AT TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =====================================================
-- SECURE VIEW FOR SALESMEN
-- =====================================================
CREATE VIEW public.products_salesman AS
SELECT 
  id, sku, saree_type, material, color, selling_price, rack_location, image_url, status, created_at
FROM public.products;
