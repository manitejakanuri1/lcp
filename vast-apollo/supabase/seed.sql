-- =====================================================
-- SEED DATA FOR TESTING
-- Run this AFTER creating your first founder user manually
-- =====================================================

-- Sample products (run after you've logged in as founder once)
INSERT INTO public.products (sku, vendor_name, purchase_date, cost_price, selling_price, saree_type, material, color, rack_location, status)
VALUES
  ('S-TEST001', 'Varanasi Silks', '2024-01-15', 2500, 4500, 'Banarasi', 'Pure Silk', 'Red', 'A-01', 'available'),
  ('S-TEST002', 'Varanasi Silks', '2024-01-15', 3000, 5500, 'Banarasi', 'Pure Silk', 'Maroon', 'A-02', 'available'),
  ('S-TEST003', 'Kanchipuram Weavers', '2024-01-18', 4500, 8000, 'Kanjeevaram', 'Silk', 'Gold', 'B-01', 'available'),
  ('S-TEST004', 'Kanchipuram Weavers', '2024-01-18', 4000, 7500, 'Kanjeevaram', 'Silk', 'Green', 'B-02', 'available'),
  ('S-TEST005', 'Bengal Handloom', '2024-01-20', 1500, 3000, 'Tant', 'Cotton', 'White', 'C-01', 'available'),
  ('S-TEST006', 'Bengal Handloom', '2024-01-20', 1800, 3500, 'Tant', 'Cotton', 'Yellow', 'C-02', 'available'),
  ('S-TEST007', 'Chanderi Arts', '2024-01-22', 2000, 4000, 'Chanderi', 'Silk Cotton', 'Pink', 'D-01', 'available'),
  ('S-TEST008', 'Chanderi Arts', '2024-01-22', 2200, 4200, 'Chanderi', 'Silk Cotton', 'Blue', 'D-02', 'available'),
  ('S-TEST009', 'Mysore Silk House', '2024-01-25', 3500, 6000, 'Mysore Silk', 'Pure Silk', 'Purple', 'E-01', 'available'),
  ('S-TEST010', 'Mysore Silk House', '2024-01-25', 3200, 5800, 'Mysore Silk', 'Pure Silk', 'Orange', 'E-02', 'available');

-- Note: To create users, go to Supabase Dashboard > Authentication > Users > Add User
-- The trigger will automatically create the profile with the role from user metadata
