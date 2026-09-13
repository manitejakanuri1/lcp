# Username Authentication Setup Guide

This guide will help you set up username-based authentication for the Lakshmi Saree Mandir POS application.

## Prerequisites

- Supabase project created and configured
- Database tables created (profiles, products, bills, etc.)

## Step 1: Create Founder Auth User

1. Go to your **Supabase Dashboard**
2. Navigate to **Authentication → Users** in the left sidebar
3. Click the **Add User** button
4. Fill in the form:
   - **Email**: `srinu@lsm.com`
   - **Password**: `srinu123`
   - **Auto Confirm User**: ✅ **IMPORTANT: Check this box!**
5. Click **Create User**
6. **Copy the User ID** that appears (it's a UUID like `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)

## Step 2: Run Database Migration

1. Go to **SQL Editor** in your Supabase Dashboard
2. Click **New Query**
3. Run the following SQL (replace `YOUR_USER_ID` with the ID you copied in Step 1):

```sql
-- Add username column to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS username TEXT;

-- Create the founder profile with username
-- REPLACE 'YOUR_USER_ID_HERE' with the actual UUID from Step 1!
INSERT INTO profiles (id, email, username, full_name, role, created_at, updated_at)
VALUES (
    'YOUR_USER_ID_HERE',  -- ⚠️ Replace this with your actual user ID!
    'srinu@lsm.com',
    'srinu',
    'Srinu - Founder',
    'founder',
    NOW(),
    NOW()
)
ON CONFLICT (id)
DO UPDATE SET
    username = 'srinu',
    full_name = 'Srinu - Founder',
    updated_at = NOW();

-- Handle any other existing users (if any)
UPDATE profiles
SET username = LOWER(SPLIT_PART(email, '@', 1))
WHERE username IS NULL;

-- Add unique constraint and index
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_idx ON profiles(username);

-- Make username required
ALTER TABLE profiles
ALTER COLUMN username SET NOT NULL;
```

4. Click **RUN** to execute the SQL

## Step 3: Verify Setup

### Check Auth User
Run this query to verify the auth user exists:

```sql
SELECT id, email, confirmed_at FROM auth.users WHERE email = 'srinu@lsm.com';
```

You should see:
- The user ID
- Email: `srinu@lsm.com`
- `confirmed_at` should have a timestamp (not null)

### Check Profile
Run this query to verify the profile was created:

```sql
SELECT id, email, username, full_name, role FROM profiles WHERE username = 'srinu';
```

You should see:
- Same user ID as the auth user
- Username: `srinu`
- Role: `founder`

## Step 4: Test Login

1. Go to your application URL (https://vast-apollo.vercel.app or http://localhost:5173)
2. You should see the login page with a **Username** field
3. Enter:
   - **Username**: `srinu`
   - **Password**: `srinu123`
4. Click **Sign In**

You should be redirected to the dashboard with full access to all features.

## Features Available After Login

### Founder Access (srinu)
- ✅ Dashboard
- ✅ Inventory Management
- ✅ Point of Sale (POS)
- ✅ Search Products
- ✅ Analytics & Reports
- ✅ User Management (create salesman and accounting users)

### Logout
- Click the **Logout** button in the top-right corner
- Or on mobile: Open menu and click **Logout** at the bottom

## Creating Additional Users

Once logged in as founder, you can create additional users:

1. Go to **Users** page (👥 icon in navigation)
2. Click **Create User**
3. Fill in the form:
   - Username (required)
   - Email (required)
   - Password (required)
   - Full Name (optional)
   - Role: Choose from Founder, Salesman, or Accounting
4. Click **Create User**

### Role Permissions

**Founder**
- Full access to all features
- Can create and manage users

**Salesman**
- POS (Sales)
- Search Products
- Cannot view analytics or manage inventory

**Accounting**
- Analytics & Reports
- Dashboard (view only)
- Inventory (view only)
- Cannot create bills or manage users

## Troubleshooting

### Error: "Invalid username or password"

**Possible causes:**
1. Username column not added to profiles table
2. Profile doesn't have username set
3. Auth user password is incorrect

**Solution:**
- Re-run the SQL migration from Step 2
- Make sure you replaced `YOUR_USER_ID_HERE` with the actual UUID
- Verify the profile exists with: `SELECT * FROM profiles WHERE email = 'srinu@lsm.com'`

### Error: "User not found"

**Cause:** Auth user doesn't exist in Supabase Auth

**Solution:**
- Go to Authentication → Users in Supabase Dashboard
- Check if user with email `srinu@lsm.com` exists
- If not, create it following Step 1

### Login page not showing Username field

**Cause:** Old version cached in browser

**Solution:**
- Hard refresh the page: Press `Ctrl + Shift + R` (or `Cmd + Shift + R` on Mac)
- Or clear browser cache

### Profile not loading after login

**Cause:** Profile ID doesn't match Auth user ID

**Solution:**
Run this to check IDs match:
```sql
SELECT
    au.id as auth_id,
    au.email as auth_email,
    p.id as profile_id,
    p.email as profile_email,
    p.username
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
WHERE au.email = 'srinu@lsm.com';
```

If `profile_id` is NULL or different from `auth_id`, re-run the INSERT statement from Step 2.

## Support

For issues or questions:
1. Check the error message in the browser console (F12 → Console tab)
2. Verify database setup with the queries in Step 3
3. Check Vercel deployment logs if using production

## Summary

After completing this setup:
- ✅ Username-based authentication is working
- ✅ Founder user (srinu/srinu123) can log in
- ✅ Founder can create additional users
- ✅ Role-based access control is active
- ✅ Logout functionality is available
