-- Migration: Add quantity column to bill_items
-- Run this in Supabase SQL Editor

-- Add quantity column to bill_items
ALTER TABLE public.bill_items 
ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;

-- Update existing rows to have quantity 1
UPDATE public.bill_items SET quantity = 1 WHERE quantity IS NULL;

-- Add NOT NULL constraint after setting defaults
ALTER TABLE public.bill_items 
ALTER COLUMN quantity SET NOT NULL;


-- Add check constraint
ALTER TABLE public.bill_items 
ADD CONSTRAINT bill_items_quantity_check CHECK (quantity > 0);
