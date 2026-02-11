-- Migration: Add GST Support to Vendor Bills
-- Run this in Supabase SQL Editor

ALTER TABLE public.vendor_bills 
  ADD COLUMN IF NOT EXISTS vendor_gst_number TEXT,
  ADD COLUMN IF NOT EXISTS is_local_transaction BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS cgst_rate DECIMAL(5,2) DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS sgst_rate DECIMAL(5,2) DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS igst_rate DECIMAL(5,2) DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS gst_amount DECIMAL(10,2) DEFAULT 0;

-- Add comment
COMMENT ON COLUMN public.vendor_bills.is_local_transaction IS 'True for local state (CGST+SGST), False for interstate (IGST)';
