import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider } from './contexts/AuthContext'
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
  SalesBills
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

      {/* Default Routes */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
