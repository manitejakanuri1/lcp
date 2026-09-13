# Lakshmi Saree Mandir - POS Application

A full-stack Point of Sale (POS) system built with React, TypeScript, Vite, Express, and Supabase.

## Features

- 🔐 Authentication with role-based access (Founder/Salesman)
- 📦 Product inventory management
- 🧾 Billing and invoice generation
- 📊 Analytics and sales reporting
- 👥 User management
- 🏪 Vendor bill management
- 📱 Progressive Web App (PWA) support

## Tech Stack

**Frontend:**
- React 19 + TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- React Router for routing
- Recharts for analytics

**Backend:**
- Express.js serverless functions
- Supabase for database and authentication
- JWT for session management

## Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd vast-apollo
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**

   Create a `.env` file in the root directory:
   ```env
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_SERVICE_KEY=your_supabase_service_role_key
   JWT_SECRET=your_jwt_secret_key
   NODE_ENV=development
   ```

4. **Run development server**
   ```bash
   # Start frontend (Vite dev server)
   npm run dev

   # Start backend API (in a separate terminal)
   cd server
   node index.js
   ```

## Deployment to Vercel

### Prerequisites
- Vercel account
- Supabase project set up

### Step 1: Configure Environment Variables

In your Vercel project settings, add the following environment variables:

```
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
JWT_SECRET=your_jwt_secret_key
NODE_ENV=production
```

### Step 2: Deploy

**Option A: Using Vercel CLI**
```bash
npm i -g vercel
vercel
```

**Option B: Using Git Integration**
1. Push your code to GitHub
2. Import the repository in Vercel
3. Vercel will automatically detect the configuration from `vercel.json`
4. Add environment variables in Vercel dashboard
5. Deploy

### Step 3: Verify Deployment

After deployment, verify:
- Frontend loads at your Vercel URL
- API health check: `https://your-app.vercel.app/api/health`
- CORS is working properly

## Project Structure

```
vast-apollo/
├── api/                    # Serverless API functions
│   ├── index.js           # Main Express app (serverless)
│   └── package.json       # API dependencies config
├── src/                   # Frontend source code
│   ├── components/        # React components
│   ├── pages/            # Page components
│   ├── lib/              # API client and utilities
│   └── types/            # TypeScript types
├── dist/                 # Build output (generated)
├── public/               # Static assets
├── vercel.json          # Vercel configuration
└── package.json         # Project dependencies

```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### Products
- `GET /api/products` - Get all products (with filters)
- `GET /api/products/sku/:sku` - Get product by SKU
- `POST /api/products` - Create product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product

### Bills
- `GET /api/bills` - Get all bills
- `GET /api/bills/generate-number` - Generate bill number
- `POST /api/bills` - Create bill
- `PUT /api/bills/:id` - Update bill
- `DELETE /api/bills/:id` - Delete bill

### Analytics
- `GET /api/analytics/summary` - Get sales summary
- `GET /api/analytics/daily-sales` - Get daily sales data

### Vendor Bills
- `GET /api/vendor-bills` - Get all vendor bills
- `GET /api/vendor-bills/:id` - Get vendor bill details
- `POST /api/vendor-bills` - Create vendor bill

## Troubleshooting

### Vercel Deployment Issues

**Problem: 404 on API routes**
- Solution: Ensure `vercel.json` has correct rewrites configuration
- Verify `api/package.json` has `"type": "module"` for ES module support

**Problem: CORS errors in production**
- Solution: Check that `VERCEL_URL` environment variable is set
- Verify CORS configuration in `api/index.js` includes your production domain

**Problem: Build fails**
- Solution: Check that all dependencies are in `package.json` (not just `devDependencies`)
- Verify TypeScript compiles without errors: `npm run build`

**Problem: Environment variables not working**
- Solution: Add them in Vercel dashboard under Settings → Environment Variables
- Redeploy after adding environment variables

## License

Private - Lakshmi Saree Mandir
