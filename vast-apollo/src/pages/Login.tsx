import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button, Input } from '../components/ui'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import { Shield, ShoppingCart, BarChart3 } from 'lucide-react'

export function LoginPage() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    const { signIn } = useAuth()
    const navigate = useNavigate()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setIsLoading(true)

        try {
            const { error, role } = await signIn(username, password)

            if (error) {
                setError(error.message)
                setIsLoading(false)
                return
            }

            // Always redirect based on role to avoid access denied issues
            const defaultPath = role === 'salesman' ? '/pos' : '/dashboard'
            navigate(defaultPath, { replace: true })
        } catch {
            setError('An unexpected error occurred')
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-[var(--color-surface)] flex flex-col">
            {/* Theme toggle in corner */}
            <div className="absolute top-4 right-4">
                <ThemeToggle />
            </div>

            <div className="flex-1 flex items-center justify-center p-4">
                <div className="w-full max-w-5xl">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        {/* Left Side - Branding */}
                        <div className="text-center lg:text-left">
                            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-[var(--color-primary)] mb-5">
                                <span className="text-white font-bold text-xl">LS</span>
                            </div>
                            <h1 className="text-3xl lg:text-4xl font-bold text-[var(--color-text)] mb-2 tracking-tight">
                                Lakshmi Saree Mandir
                            </h1>
                            <p className="text-base text-[var(--color-text-muted)] mb-10">
                                Inventory & Billing Management System
                            </p>

                            {/* Role Access Information */}
                            <div className="space-y-3">
                                <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-lg p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-[var(--color-primary-light)] flex items-center justify-center">
                                            <Shield className="w-4 h-4 text-[var(--color-primary)]" />
                                        </div>
                                        <div className="flex-1 text-left">
                                            <h3 className="text-sm font-semibold text-[var(--color-text)]">Founder</h3>
                                            <p className="text-xs text-[var(--color-text-muted)]">Full access to all features</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-lg p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-blue-500/8 dark:bg-blue-400/10 flex items-center justify-center">
                                            <ShoppingCart className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                        </div>
                                        <div className="flex-1 text-left">
                                            <h3 className="text-sm font-semibold text-[var(--color-text)]">Salesman</h3>
                                            <p className="text-xs text-[var(--color-text-muted)]">Access to Sales & Search only</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-lg p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-emerald-500/8 dark:bg-emerald-400/10 flex items-center justify-center">
                                            <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                        </div>
                                        <div className="flex-1 text-left">
                                            <h3 className="text-sm font-semibold text-[var(--color-text)]">Accounting</h3>
                                            <p className="text-xs text-[var(--color-text-muted)]">Analytics, Reports & Inventory view</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Side - Login Form */}
                        <div className="w-full">
                            <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-8 shadow-lg">
                                <h2 className="text-xl font-bold text-[var(--color-text)] mb-1">Sign In</h2>
                                <p className="text-sm text-[var(--color-text-muted)] mb-6">
                                    Enter your credentials to access the system
                                </p>

                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <Input
                                        type="text"
                                        label="Username"
                                        placeholder="Enter your username"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        required
                                        autoComplete="username"
                                        autoFocus
                                    />

                                    <Input
                                        type="password"
                                        label="Password"
                                        placeholder="Enter your password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        autoComplete="current-password"
                                    />

                                    {error && (
                                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm">
                                            {error}
                                        </div>
                                    )}

                                    <Button
                                        type="submit"
                                        variant="primary"
                                        size="lg"
                                        fullWidth
                                        loading={isLoading}
                                    >
                                        {isLoading ? 'Signing in...' : 'Sign In'}
                                    </Button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
