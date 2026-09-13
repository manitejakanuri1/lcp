# Authentication & Role-Based Access Control

This document describes the authentication system and role-based access control (RBAC) implemented in the Lakshmi Saree Mandir POS application.

## Overview

The application supports three user roles with different levels of access:
- **Founder**: Full administrative access
- **Salesman**: Limited access to sales functions
- **Accounting**: View-only access to reports and analytics

## User Roles

### 1. Founder 👑
**Access Level**: Full Access

**Permissions**:
- ✅ Dashboard (full access)
- ✅ Inventory Management (create, edit, delete)
- ✅ POS / Billing (create sales)
- ✅ Product Search
- ✅ Analytics & Reports
- ✅ User Management (create/edit users)
- ✅ All administrative functions

**Default Landing Page**: `/dashboard`

---

### 2. Salesman 💼
**Access Level**: Sales Only

**Permissions**:
- ✅ POS / Billing (create sales)
- ✅ Product Search
- ❌ Dashboard
- ❌ Inventory Management
- ❌ Analytics
- ❌ User Management

**Default Landing Page**: `/pos`

**Restrictions**:
- Cannot view cost prices or profit margins
- Cannot add/edit/delete products
- Cannot access analytics or reports
- Cannot manage users

---

### 3. Accounting 📊
**Access Level**: View & Reports Only

**Permissions**:
- ✅ Dashboard (view only)
- ✅ Inventory (view only)
- ✅ Analytics & Reports
- ❌ POS / Billing
- ❌ Product Management (create/edit/delete)
- ❌ User Management

**Default Landing Page**: `/analytics`

**Restrictions**:
- Cannot create or modify sales
- Cannot edit inventory
- Cannot manage users
- View-only access to data

---

## Login Page

The new login page (`/login`) features:

- **Responsive Design**: Adapts to mobile and desktop
- **Role Information**: Shows access levels for each role
- **Modern UI**: Clean, professional interface with theme toggle
- **Error Handling**: Clear error messages for authentication failures
- **Auto-redirect**: Redirects to appropriate page based on user role

### Login Page Features:
- Email and password authentication
- Loading states during sign-in
- Validation and error messages
- Dark/Light theme support
- Responsive layout (2-column on desktop, stacked on mobile)

---

## Implementation Details

### Protected Routes

All routes except `/login` are protected and require authentication:

```typescript
<ProtectedRoute allowedRoles={['founder', 'accounting']}>
  <Dashboard />
</ProtectedRoute>
```

### Route Access Matrix

| Route | Founder | Salesman | Accounting |
|-------|---------|----------|------------|
| `/login` | ✅ | ✅ | ✅ |
| `/dashboard` | ✅ | ❌ | ✅ |
| `/inventory` | ✅ | ❌ | ✅ |
| `/pos` | ✅ | ✅ | ❌ |
| `/search` | ✅ | ✅ | ❌ |
| `/analytics` | ✅ | ❌ | ✅ |
| `/users` | ✅ | ❌ | ❌ |

---

## Authentication Flow

1. **User visits protected route** → Redirected to `/login`
2. **User enters credentials** → Submit to API
3. **API validates credentials** → Returns user data with role
4. **AuthContext stores user** → Updates application state
5. **Route protection activates** → Checks role permissions
6. **User redirected** → To appropriate default page based on role

---

## Database Schema

### profiles table

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT CHECK (role IN ('founder', 'salesman', 'accounting')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Creating Users

### Via API (Founder Only)

```bash
curl -X POST https://vast-apollo.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword",
    "fullName": "John Doe",
    "role": "salesman"
  }'
```

### Via Supabase Dashboard

1. Go to Supabase Dashboard → Authentication → Users
2. Click "Invite User"
3. Enter email and send invitation
4. After user confirms email, add role in Database → profiles table

---

## Security Features

### 1. Protected Routes
- All routes require authentication
- Role-based access control enforced on frontend
- Unauthorized access shows "Access Denied" page

### 2. JWT Authentication
- HTTP-only cookies for session management
- 7-day token expiration
- Secure transmission in production (HTTPS)

### 3. API Security
- Server-side validation of user roles
- Service role key kept secure on backend
- CORS configured for production domain

### 4. Session Management
- Automatic session refresh
- Secure logout functionality
- Session persistence across page reloads

---

## Usage Examples

### For Founders
```
1. Login at /login
2. Access all features
3. Manage users in /users
4. View analytics in /dashboard
5. Process sales in /pos
```

### For Salesmen
```
1. Login at /login
2. Redirected to /pos
3. Create sales invoices
4. Search for products
5. Cannot access other features
```

### For Accounting
```
1. Login at /login
2. Redirected to /analytics
3. View reports and analytics
4. Review inventory (read-only)
5. Cannot create sales or edit products
```

---

## Troubleshooting

### User Cannot Login
- Check email/password in Supabase auth users
- Verify profile exists in profiles table
- Check role is set correctly

### Access Denied Errors
- Verify user role in database
- Check route permissions in App.tsx
- Ensure ProtectedRoute has correct allowedRoles

### Role Not Updating
- Refresh profile in AuthContext
- Check database directly
- Clear browser cache/cookies

---

## Future Enhancements

Potential improvements for the authentication system:

- [ ] Password reset functionality
- [ ] Email verification
- [ ] Two-factor authentication (2FA)
- [ ] Activity logging
- [ ] Session timeout warnings
- [ ] Role-based UI customization
- [ ] Audit trail for sensitive actions

---

**Last Updated**: 2026-02-11
**Version**: 1.0.0
