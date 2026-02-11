import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import {
  Dashboard,
  Inventory,
  POS,
  Search,
  Analytics,
  Users
} from './pages'

function AppRoutes() {
  return (
    <Routes>
      {/* All routes accessible without login */}
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/inventory" element={<Inventory />} />
      <Route path="/pos" element={<POS />} />
      <Route path="/search" element={<Search />} />
      <Route path="/analytics" element={<Analytics />} />
      <Route path="/users" element={<Users />} />

      {/* Default route */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AppRoutes />
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
