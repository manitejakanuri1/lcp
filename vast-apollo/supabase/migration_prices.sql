-- =====================================================
-- PRODUCT SCHEMA UPDATE - Multiple Price Tiers
-- =====================================================
-- Run this in Supabase SQL Editor to update the products table

-- Add new columns for multiple selling prices
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS selling_price_a DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS selling_price_b DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS selling_price_c DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS saree_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS cost_code VARCHAR(50);

-- Migrate existing selling_price to selling_price_a
UPDATE public.products 
SET selling_price_a = selling_price,
    selling_price_b = selling_price,
    selling_price_c = selling_price
WHERE selling_price_a IS NULL;

-- Make the new price columns NOT NULL with defaults
ALTER TABLE public.products 
ALTER COLUMN selling_price_a SET NOT NULL,
ALTER COLUMN selling_price_b SET NOT NULL,
ALTER COLUMN selling_price_c SET NOT NULL,
ALTER COLUMN quantity SET NOT NULL;

-- Set default for saree_name from saree_type for existing products
UPDATE public.products 
SET saree_name = saree_type
WHERE saree_name IS NULL;

-- Optional: Drop the old selling_price and image_url columns
-- Only run this after confirming the migration worked!
-- ALTER TABLE public.products DROP COLUMN IF EXISTS selling_price;
-- ALTER TABLE public.products DROP COLUMN IF EXISTS image_url;

-- Add comment for documentation
COMMENT ON COLUMN public.products.selling_price_a IS 'Regular price (Price A)';
COMMENT ON COLUMN public.products.selling_price_b IS 'Discount tier B';
COMMENT ON COLUMN public.products.selling_price_c IS 'Special price tier C';
COMMENT ON COLUMN public.products.saree_name IS 'Name of the saree';
COMMENT ON COLUMN public.products.quantity IS 'Number of sarees in stock';
COMMENT ON COLUMN public.products.cost_code IS 'Reference code for cost tracking';
