import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button, Input } from '../components/ui'
import { ThemeToggle } from '../components/ui/ThemeToggle'

export function LoginPage() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    const { signIn } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()

    const from = (location.state as { from?: { pathname: string } })?.from?.pathname

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setIsLoading(true)

        try {
            const { error } = await signIn(username, password)

            if (error) {
                setError(error.message)
                setIsLoading(false)
                return
            }

            // Redirect will be handled by App.tsx based on role
            navigate(from || '/dashboard', { replace: true })
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
                    <div className="grid lg:grid-cols-2 gap-8 items-center">
                        {/* Left Side - Branding & Role Info */}
                        <div className="text-center lg:text-left">
                            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-4">
                                <span className="text-4xl">🪔</span>
                            </div>
                            <h1 className="text-3xl lg:text-4xl font-bold text-[var(--color-text)] mb-2">
                                Lakshmi Saree Mandir
                            </h1>
                            <p className="text-lg text-[var(--color-text-muted)] mb-8">
                                Inventory & Billing Management System
                            </p>

                            {/* Role Access Information */}
                            <div className="space-y-4 mt-8">
                                <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                            <span className="text-xl">👑</span>
                                        </div>
                                        <div className="flex-1 text-left">
                                            <h3 className="font-semibold text-[var(--color-text)]">Founder</h3>
                                            <p className="text-sm text-[var(--color-text-muted)]">Full access to all features</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                            <span className="text-xl">💼</span>
                                        </div>
                                        <div className="flex-1 text-left">
                                            <h3 className="font-semibold text-[var(--color-text)]">Salesman</h3>
                                            <p className="text-sm text-[var(--color-text-muted)]">Access to Sales & Search only</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                                            <span className="text-xl">📊</span>
                                        </div>
                                        <div className="flex-1 text-left">
                                            <h3 className="font-semibold text-[var(--color-text)]">Accounting</h3>
                                            <p className="text-sm text-[var(--color-text-muted)]">Analytics, Reports & Inventory view</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Side - Login Form */}
                        <div className="w-full">
                            <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-2xl p-8 shadow-xl">
                                <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">Sign In</h2>
                                <p className="text-[var(--color-text-muted)] mb-6">
                                    Enter your credentials to access the system
                                </p>

                                <form onSubmit={handleSubmit} className="space-y-5">
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
                                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
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
