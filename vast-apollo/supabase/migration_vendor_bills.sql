-- Migration: Create Vendor Bills table and link to products
-- Run this in Supabase SQL Editor

-- Create vendor_bills table
CREATE TABLE IF NOT EXISTS public.vendor_bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name TEXT NOT NULL,
    bill_number TEXT,
    bill_date DATE NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    vendor_gst_number TEXT,
    is_local_transaction BOOLEAN DEFAULT true,
    cgst_rate DECIMAL(5,2) DEFAULT 2.5,
    sgst_rate DECIMAL(5,2) DEFAULT 2.5,
    igst_rate DECIMAL(5,2) DEFAULT 5.0,
    gst_amount DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key and hsn_code to products
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS vendor_bill_id UUID REFERENCES public.vendor_bills(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS hsn_code TEXT;

-- Disable RLS for the new table (matching project pattern)
ALTER TABLE public.vendor_bills DISABLE ROW LEVEL SECURITY;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_vendor_bills_date ON public.vendor_bills(bill_date);
CREATE INDEX IF NOT EXISTS idx_products_vendor_bill ON public.products(vendor_bill_id);
