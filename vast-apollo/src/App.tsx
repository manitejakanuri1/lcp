import { Suspense, useEffect } from 'react'
import { lazyPage } from './lib/lazyPage'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ChunkErrorBoundary, clearChunkReloadFlag } from './components/ChunkErrorBoundary'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/Login'

/**
 * Routes are loaded on demand rather than imported up front.
 *
 * Importing them eagerly put every page in one bundle — 1.75 MB, 470 KB over
 * the wire — so the login screen was downloading the charting library, the PDF
 * writer and the barcode scanner before it could render, on a phone, on shop
 * wifi. Each page now arrives only when someone actually opens it.
 *
 * The pages barrel is bypassed deliberately: importing through ./pages pulls in
 * the whole index and defeats the split.
 */
const Dashboard = lazyPage(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const Inventory = lazyPage(() => import('./pages/Inventory').then(m => ({ default: m.Inventory })))
const Website = lazyPage(() => import('./pages/Website').then(m => ({ default: m.Website })))
const POS = lazyPage(() => import('./pages/POS').then(m => ({ default: m.POS })))
const Search = lazyPage(() => import('./pages/Search').then(m => ({ default: m.Search })))
const Analytics = lazyPage(() => import('./pages/Analytics').then(m => ({ default: m.Analytics })))
const Users = lazyPage(() => import('./pages/Users').then(m => ({ default: m.Users })))
const Purchases = lazyPage(() => import('./pages/Purchases').then(m => ({ default: m.Purchases })))
const SalesBills = lazyPage(() => import('./pages/SalesBills').then(m => ({ default: m.SalesBills })))
const Expenses = lazyPage(() => import('./pages/Expenses').then(m => ({ default: m.Expenses })))
const GSTReport = lazyPage(() => import('./pages/GSTReport').then(m => ({ default: m.GSTReport })))
const ProfitLoss = lazyPage(() => import('./pages/ProfitLoss').then(m => ({ default: m.ProfitLoss })))

function PageLoader() {
  return (
    <div className="min-h-screen bg-[var(--color-surface)] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

/**
 * Role-Based Access Control:
 *
 * Founder: Full access to all features
 * - Dashboard, Inventory, POS, Search, Analytics, Users
 *
 * Salesman: Limited access
 * - POS (Sales)
 * - Search
 *
 * Accounting: View & Reports only
 * - Analytics
 * - Dashboard (view only)
 * - Inventory (view only)
 */

function AppRoutes() {
  // Nothing threw, so the current build's chunks are reachable. Release the
  // one-shot flag so a genuine failure later can still trigger its own reload.
  useEffect(clearChunkReloadFlag, [])

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
      {/* Public Route */}
      <Route path="/login" element={<LoginPage />} />

      {/* Founder Only - Full Access */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute allowedRoles={['founder', 'accounting']}>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/inventory"
        element={
          <ProtectedRoute allowedRoles={['founder', 'accounting']}>
            <Inventory />
          </ProtectedRoute>
        }
      />

      <Route
        path="/purchases"
        element={
          <ProtectedRoute allowedRoles={['founder', 'accounting']}>
            <Purchases />
          </ProtectedRoute>
        }
      />

      <Route
        path="/sales-bills"
        element={
          <ProtectedRoute allowedRoles={['founder', 'accounting']}>
            <SalesBills />
          </ProtectedRoute>
        }
      />

      <Route
        path="/users"
        element={
          <ProtectedRoute allowedRoles={['founder']}>
            <Users />
          </ProtectedRoute>
        }
      />

      <Route
        path="/analytics"
        element={
          <ProtectedRoute allowedRoles={['founder', 'accounting']}>
            <Analytics />
          </ProtectedRoute>
        }
      />

      <Route
        path="/expenses"
        element={
          <ProtectedRoute allowedRoles={['founder', 'accounting']}>
            <Expenses />
          </ProtectedRoute>
        }
      />

      <Route
        path="/website"
        element={
          <ProtectedRoute allowedRoles={['founder', 'accounting']}>
            <Website />
          </ProtectedRoute>
        }
      />

      <Route
        path="/gst-report"
        element={
          <ProtectedRoute allowedRoles={['founder', 'accounting']}>
            <GSTReport />
          </ProtectedRoute>
        }
      />

      <Route
        path="/profit-loss"
        element={
          <ProtectedRoute allowedRoles={['founder', 'accounting']}>
            <ProfitLoss />
          </ProtectedRoute>
        }
      />

      {/* Salesman & Founder Access */}
      <Route
        path="/pos"
        element={
          <ProtectedRoute allowedRoles={['founder', 'salesman']}>
            <POS />
          </ProtectedRoute>
        }
      />

      <Route
        path="/search"
        element={
          <ProtectedRoute allowedRoles={['founder', 'salesman']}>
            <Search />
          </ProtectedRoute>
        }
      />

      {/* Default Routes - redirect based on role */}
      <Route path="/" element={<RoleRedirect />} />
      <Route path="*" element={<RoleRedirect />} />
      </Routes>
    </Suspense>
  )
}

function RoleRedirect() {
  const { role, isLoading, user } = useAuth()
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-surface)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  const target = role === 'salesman' ? '/pos' : '/dashboard'
  return <Navigate to={target} replace />
}

function App() {
  return (
    <ChunkErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ChunkErrorBoundary>
  )
}

export default App
