import { useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ThemeToggle } from '../ui'
import { useAuth } from '../../contexts/AuthContext'
import {
    LayoutDashboard,
    Package,
    FileText,
    Receipt,
    ShoppingCart,
    Search,
    BarChart3,
    Users,
    LogOut,
    Menu,
    X,
    ChevronsLeft,
} from 'lucide-react'

export function Layout({ children }: { children: ReactNode }) {
    const location = useLocation()
    const navigate = useNavigate()
    const { profile, signOut } = useAuth()
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [collapsed, setCollapsed] = useState(false)

    const handleLogout = async () => {
        await signOut()
        navigate('/login', { replace: true })
    }

    const navItems = [
        { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { path: '/inventory', label: 'Inventory', icon: Package },
        { path: '/purchases', label: 'Purchases', icon: FileText },
        { path: '/sales-bills', label: 'Sales', icon: Receipt },
        { path: '/pos', label: 'POS', icon: ShoppingCart },
        { path: '/search', label: 'Search', icon: Search },
        { path: '/analytics', label: 'Analytics', icon: BarChart3 },
        { path: '/users', label: 'Users', icon: Users },
    ]

    const isActive = (path: string) => location.pathname === path

    return (
        <div className="min-h-screen bg-[var(--color-surface)] flex">
            {/* Sidebar overlay (mobile) */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/40 lg:hidden animate-fade-in"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
                    fixed inset-y-0 left-0 z-50
                    ${collapsed ? 'w-[68px]' : 'w-60'}
                    bg-[var(--color-surface-elevated)] border-r border-[var(--color-border)]
                    flex flex-col
                    transition-all duration-200 ease-in-out
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
                `}
            >
                {/* Logo area */}
                <div className="h-14 flex items-center justify-between px-4 border-b border-[var(--color-border)]">
                    {!collapsed && (
                        <Link to="/dashboard" className="font-semibold text-sm text-[var(--color-text)] truncate tracking-tight">
                            Lakshmi Sarees
                        </Link>
                    )}
                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        className="hidden lg:flex p-1.5 rounded-md hover:bg-[var(--color-surface)] transition-colors"
                        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        <ChevronsLeft className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} />
                    </button>
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="lg:hidden p-1.5 rounded-md hover:bg-[var(--color-surface)] transition-colors"
                    >
                        <X className="w-5 h-5 text-[var(--color-text-muted)]" />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
                    {navItems.map((item) => {
                        const Icon = item.icon
                        const active = isActive(item.path)
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                onClick={() => setSidebarOpen(false)}
                                title={collapsed ? item.label : undefined}
                                className={`
                                    flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-colors
                                    ${active
                                        ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]'
                                    }
                                    ${collapsed ? 'justify-center px-2' : ''}
                                `}
                            >
                                <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={active ? 2.5 : 2} />
                                {!collapsed && <span>{item.label}</span>}
                            </Link>
                        )
                    })}
                </nav>

                {/* User section */}
                <div className="border-t border-[var(--color-border)] p-3">
                    {!collapsed ? (
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[var(--color-primary-light)] flex items-center justify-center text-xs font-semibold text-[var(--color-primary)]">
                                {(profile?.full_name || profile?.username || 'U').charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-[var(--color-text)] truncate">
                                    {profile?.full_name || profile?.username || 'User'}
                                </p>
                                <p className="text-xs text-[var(--color-text-muted)] capitalize">
                                    {profile?.role || 'User'}
                                </p>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="p-1.5 rounded-md hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
                                title="Sign out"
                            >
                                <LogOut className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-[var(--color-primary-light)] flex items-center justify-center text-xs font-semibold text-[var(--color-primary)]">
                                {(profile?.full_name || profile?.username || 'U').charAt(0).toUpperCase()}
                            </div>
                            <button
                                onClick={handleLogout}
                                className="p-1.5 rounded-md hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
                                title="Sign out"
                            >
                                <LogOut className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            </aside>

            {/* Main content area */}
            <div className={`flex-1 min-w-0 transition-all duration-200 ${collapsed ? 'lg:ml-[68px]' : 'lg:ml-60'}`}>
                {/* Mobile header */}
                <header className="sticky top-0 z-30 h-14 bg-[var(--color-surface-elevated)] border-b border-[var(--color-border)] flex items-center justify-between px-4 lg:hidden">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="p-2 rounded-md hover:bg-[var(--color-surface)] transition-colors"
                    >
                        <Menu className="w-5 h-5 text-[var(--color-text-muted)]" />
                    </button>
                    <span className="font-semibold text-sm text-[var(--color-text)]">Lakshmi Sarees</span>
                    <ThemeToggle />
                </header>

                {/* Desktop top bar */}
                <header className="hidden lg:flex sticky top-0 z-30 h-12 bg-[var(--color-surface)] border-b border-[var(--color-border)] items-center justify-end px-6">
                    <ThemeToggle />
                </header>

                {/* Page content */}
                <main>
                    {children}
                </main>
            </div>
        </div>
    )
}
