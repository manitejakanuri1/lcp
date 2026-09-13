# Database Setup for Username Authentication

## Step 1: Add Username Column to Profiles Table

Run this SQL in your Supabase SQL Editor (Dashboard → SQL Editor):

```sql
-- Add username column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- Update existing user (the one we just created) with username
UPDATE profiles 
SET username = 'srinu'
WHERE id = 'da933f83-3dd3-4b3a-8a81-a1e05d623f38';

-- Make username NOT NULL for future inserts (optional, but recommended)
-- Run this after all existing profiles have usernames
-- ALTER TABLE profiles ALTER COLUMN username SET NOT NULL;
```

## Step 2: Verify the Setup

After running the SQL:

1. Check that the profiles table has the username column:
   ```sql
   SELECT * FROM profiles WHERE username = 'srinu';
   ```

2. You should see the founder user with:
   - username: `srinu`
   - email: `srinu@lakshmisareemandir.com`
   - role: `founder`

## Step 3: Test Login

1. Go to https://vast-apollo.vercel.app/login
2. Login with:
   - Username: `srinu`
   - Password: `srinu123`

## Creating Additional Users

Once logged in as founder, you can create salesman and accounting users through the Users page (/users).

The founder can create:
- ✅ Salesman users (access to POS and Search only)
- ✅ Accounting users (access to Analytics, Dashboard, Inventory - view only)
- ✅ Additional founder users (full access)

