# Vercel Deployment Checklist

Follow these steps to successfully deploy your application to Vercel.

## Pre-Deployment Checklist

- [ ] All code is committed to git
- [ ] Environment variables are documented
- [ ] Build passes locally: `npm run build`
- [ ] Supabase database is set up with all required tables
- [ ] Supabase RLS policies are configured

## Deployment Steps

### 1. Prepare Environment Variables

You'll need these environment variables in Vercel:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
JWT_SECRET=your-secret-key-min-32-chars
NODE_ENV=production
```

**How to get Supabase credentials:**
1. Go to your Supabase project dashboard
2. Click "Settings" → "API"
3. Copy "Project URL" → use as `SUPABASE_URL`
4. Copy "service_role" key (NOT anon key) → use as `SUPABASE_SERVICE_KEY`

**Generate JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Deploy to Vercel

#### Option A: Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# Follow prompts:
# - Link to existing project or create new
# - Set environment variables when prompted
# - Deploy
```

#### Option B: Deploy via Git Integration

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Deployment: Ready for Vercel"
   git push origin main
   ```

2. **Import in Vercel**
   - Go to https://vercel.com/new
   - Import your GitHub repository
   - Vercel auto-detects framework (Vite)

3. **Configure Environment Variables**
   - In Vercel dashboard: Settings → Environment Variables
   - Add all 4 variables listed above
   - Set scope to "Production", "Preview", and "Development"

4. **Deploy**
   - Click "Deploy"
   - Wait for build to complete (2-3 minutes)

### 3. Post-Deployment Verification

After deployment, verify these:

- [ ] Frontend loads: `https://your-app.vercel.app`
- [ ] API health check works: `https://your-app.vercel.app/api/health`
- [ ] Login functionality works
- [ ] Products can be fetched
- [ ] No CORS errors in browser console

#### Quick Test Commands

```bash
# Test health endpoint
curl https://your-app.vercel.app/api/health

# Test login (replace with your credentials)
curl -X POST https://your-app.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'
```

## Common Deployment Issues

### Issue: "Cannot find module" errors

**Cause:** Dependencies missing from `package.json`

**Fix:**
```bash
npm install --save <missing-package>
git add package.json package-lock.json
git commit -m "Fix: Add missing dependencies"
git push
```

### Issue: API returns 404

**Cause:** Serverless function not deployed correctly

**Fix:**
1. Check `vercel.json` has correct `rewrites` configuration
2. Verify `api/package.json` exists with `"type": "module"`
3. Redeploy

### Issue: CORS errors in production

**Cause:** Frontend origin not allowed in API

**Fix:**
1. Check browser console for the exact origin being blocked
2. Verify `api/index.js` CORS configuration includes your domain
3. The current config should auto-detect Vercel URL

### Issue: Environment variables not working

**Cause:** Variables not set in Vercel dashboard

**Fix:**
1. Go to Vercel dashboard → Settings → Environment Variables
2. Add all required variables
3. **Important:** Redeploy after adding variables (deployments don't auto-trigger)

### Issue: Build succeeds but app shows blank page

**Cause:** Usually a runtime error or incorrect base path

**Fix:**
1. Check browser console for errors
2. Check Vercel function logs: Dashboard → Deployments → Your Deployment → Functions
3. Verify `VITE_API_URL` is not set (should use default `/api`)

## Updating Your Deployment

After making changes:

```bash
# Commit changes
git add .
git commit -m "Your changes description"
git push

# Vercel automatically redeploys on push
# Or trigger manual deployment:
vercel --prod
```

## Rollback Deployment

If something breaks:

1. Go to Vercel Dashboard → Deployments
2. Find last working deployment
3. Click "..." → "Promote to Production"

## Monitoring

### Check Logs

**Function Logs:**
Vercel Dashboard → Your Project → Deployments → Click deployment → Functions tab

**Real-time Logs:**
```bash
vercel logs your-app.vercel.app --follow
```

### Performance Monitoring

Vercel Dashboard → Analytics shows:
- Page load times
- Function execution times
- Bandwidth usage

## Security Checklist

Before going live:

- [ ] Service role key is set as environment variable (not in code)
- [ ] JWT_SECRET is strong and secret
- [ ] `.env` files are gitignored
- [ ] CORS is properly configured for production domain
- [ ] Supabase RLS policies are enabled
- [ ] HTTPS is enabled (automatic with Vercel)

## Support

If deployment fails after following this guide:

1. Check Vercel deployment logs
2. Review the error messages
3. Consult the troubleshooting section in README.md
4. Check Vercel documentation: https://vercel.com/docs

---

**Last Updated:** 2025-02-11
