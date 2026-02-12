import { useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ThemeToggle } from '../ui'
import { useAuth } from '../../contexts/AuthContext'

export function Layout({ children }: { children: ReactNode }) {
    const location = useLocation()
    const navigate = useNavigate()
    const { profile, signOut } = useAuth()
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

    const handleLogout = async () => {
        await signOut()
        navigate('/login', { replace: true })
    }

    // All nav items visible (no auth restrictions for now)
    const navItems = [
        { path: '/dashboard', label: 'Dashboard', icon: '📊' },
        { path: '/inventory', label: 'Inventory', icon: '📦' },
        { path: '/pos', label: 'POS', icon: '🛒' },
        { path: '/search', label: 'Search', icon: '🔍' },
        { path: '/analytics', label: 'Analytics', icon: '📈' },
        { path: '/users', label: 'Users', icon: '👥' },
    ]

    const isActive = (path: string) => location.pathname === path

    return (
        <div className="min-h-screen bg-[var(--color-surface)] flex flex-col">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-[var(--color-surface-elevated)] border-b border-[var(--color-border)] backdrop-blur-lg">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    {/* Logo */}
                    <Link to="/dashboard" className="flex items-center gap-2">

                        <span className="font-bold text-lg text-[var(--color-text)] hidden sm:inline">
                            Lakshmi Saree Mandir
                        </span>
                    </Link>

                    {/* Desktop Nav */}
                    <nav className="hidden md:flex items-center gap-1">
                        {navItems.map((item) => (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`
                                    px-4 py-2 rounded-lg font-medium text-sm transition-all
                                    ${isActive(item.path)
                                        ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white'
                                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border)]'
                                    }
                                `}
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>

                    {/* Right side */}
                    <div className="flex items-center gap-3">
                        <ThemeToggle />

                        {/* User info */}
                        <div className="hidden sm:flex items-center gap-3">
                            <div className="text-right">
                                <p className="text-sm font-medium text-[var(--color-text)]">
                                    {profile?.full_name || profile?.username || 'User'}
                                </p>
                                <p className="text-xs text-[var(--color-text-muted)] capitalize">
                                    {profile?.role || 'User'}
                                </p>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-sm font-medium transition-colors"
                                title="Logout"
                            >
                                Logout
                            </button>
                        </div>

                        {/* Mobile menu button */}
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="md:hidden p-2 rounded-lg hover:bg-[var(--color-border)] transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {isMobileMenuOpen ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                )}
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Mobile menu */}
                {isMobileMenuOpen && (
                    <div className="md:hidden border-t border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
                        <nav className="p-4 flex flex-col gap-2">
                            {/* User info on mobile */}
                            <div className="mb-2 p-3 bg-[var(--color-surface)] rounded-lg">
                                <p className="text-sm font-medium text-[var(--color-text)]">
                                    {profile?.full_name || profile?.username || 'User'}
                                </p>
                                <p className="text-xs text-[var(--color-text-muted)] capitalize">
                                    {profile?.role || 'User'}
                                </p>
                            </div>

                            {navItems.map((item) => (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className={`
                                        px-4 py-3 rounded-xl font-medium text-base transition-all flex items-center gap-3
                                        ${isActive(item.path)
                                            ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white'
                                            : 'text-[var(--color-text)] hover:bg-[var(--color-border)]'
                                        }
                                    `}
                                >
                                    <span>{item.icon}</span>
                                    {item.label}
                                </Link>
                            ))}

                            {/* Logout button on mobile */}
                            <button
                                onClick={handleLogout}
                                className="mt-2 px-4 py-3 rounded-xl font-medium text-base bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors flex items-center gap-3"
                            >
                                <span>🚪</span>
                                Logout
                            </button>
                        </nav>
                    </div>
                )}
            </header>

            {/* Main content */}
            <main className="flex-1">
                {children}
            </main>
        </div>
    )
}
