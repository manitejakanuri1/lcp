import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/Login'
import {
  Dashboard,
  Inventory,
  POS,
  Search,
  Analytics,
  Users,
  Purchases,
  SalesBills,
  Expenses,
  GSTReport,
  ProfitLoss
} from './pages'

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
  return (
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
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
