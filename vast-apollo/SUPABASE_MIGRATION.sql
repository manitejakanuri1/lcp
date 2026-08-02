-- Add username column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- Update existing profiles with temporary usernames if they don't have one
UPDATE profiles SET username = LOWER(SPLIT_PART(email, '@', 1)) WHERE username IS NULL;

-- Make username NOT NULL after populating
ALTER TABLE profiles ALTER COLUMN username SET NOT NULL;

-- Create index on username for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- Insert founder user (srinu)
-- First, you need to create the auth user in Supabase Dashboard or using this:
-- Note: This requires service role key and should be done via Supabase Dashboard

/*
MANUAL STEPS TO CREATE FOUNDER USER:

1. Go to Supabase Dashboard → Authentication → Users
2. Click "Add User" → "Create new user"
3. Fill in:
   - Email: srinu@lakshmisareemandir.com
   - Password: srinu123
   - Confirm email: YES (check this box)

4. After creating the user, note the UUID (user ID)

5. Run this SQL in the SQL Editor (replace USER_UUID with the actual UUID):

INSERT INTO profiles (id, email, username, full_name, role)
VALUES 
  ('USER_UUID', 'srinu@lakshmisareemandir.com', 'srinu', 'Srinu (Founder)', 'founder')
ON CONFLICT (id) DO UPDATE
SET username = 'srinu', role = 'founder';

*/

-- Example: If the user UUID is 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
-- INSERT INTO profiles (id, email, username, full_name, role)
-- VALUES 
--   ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'srinu@lakshmisareemandir.com', 'srinu', 'Srinu (Founder)', 'founder')
-- ON CONFLICT (id) DO UPDATE
-- SET username = 'srinu', role = 'founder';
