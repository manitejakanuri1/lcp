import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button, Input } from '../components/ui'
import { ThemeToggle } from '../components/ui/ThemeToggle'

export function RegisterPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [fullName, setFullName] = useState('')
    const [role, setRole] = useState<'founder' | 'salesman'>('salesman')
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    const navigate = useNavigate()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setIsLoading(true)

        try {
            // Step 1: Sign up the user
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: fullName,
                        role: role
                    }
                }
            })

            if (authError) {
                setError(authError.message)
                setIsLoading(false)
                return
            }

            // Step 2: Manually create profile (since trigger may not work)
            if (authData.user) {
                const { error: profileError } = await supabase
                    .from('profiles')
                    .insert({
                        id: authData.user.id,
                        email: email,
                        full_name: fullName,
                        role: role
                    } as never)

                if (profileError) {
                    console.error('Profile creation error:', profileError)
                    // Don't fail registration if profile creation fails
                    // The trigger might have already created it
                }
            }

            setSuccess(true)
            setTimeout(() => {
                navigate('/login')
            }, 2000)
        } catch (err) {
            console.error('Registration error:', err)
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
                <div className="w-full max-w-md">
                    {/* Logo */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-4">
                            <span className="text-4xl">🪔</span>
                        </div>
                        <h1 className="text-2xl font-bold text-[var(--color-text)]">
                            Create Account
                        </h1>
                        <p className="text-[var(--color-text-muted)] mt-2">
                            Register for Saree Inventory & Billing
                        </p>
                    </div>

                    {/* Success Message */}
                    {success ? (
                        <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-2xl p-6 shadow-lg text-center">
                            <div className="text-5xl mb-4">✅</div>
                            <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">
                                Registration Successful!
                            </h2>
                            <p className="text-[var(--color-text-muted)]">
                                Redirecting to login...
                            </p>
                        </div>
                    ) : (
                        /* Registration Form */
                        <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-2xl p-6 shadow-lg">
                            <form onSubmit={handleSubmit} className="space-y-5">
                                <Input
                                    label="Full Name"
                                    placeholder="Enter your name"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    required
                                />

                                <Input
                                    type="email"
                                    label="Email"
                                    placeholder="Enter your email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoComplete="email"
                                />

                                <Input
                                    type="password"
                                    label="Password"
                                    placeholder="Create a password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    autoComplete="new-password"
                                    helperText="Minimum 6 characters"
                                />

                                {/* Role Selection */}
                                <div>
                                    <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                                        Select Role
                                    </label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setRole('salesman')}
                                            className={`
                                                flex-1 py-3 rounded-xl font-medium transition-all
                                                ${role === 'salesman'
                                                    ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white'
                                                    : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)]'
                                                }
                                            `}
                                        >
                                            🛒 Salesman
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setRole('founder')}
                                            className={`
                                                flex-1 py-3 rounded-xl font-medium transition-all
                                                ${role === 'founder'
                                                    ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white'
                                                    : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)]'
                                                }
                                            `}
                                        >
                                            👑 Founder
                                        </button>
                                    </div>
                                </div>

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
                                    Create Account
                                </Button>
                            </form>
                        </div>
                    )}

                    {/* Footer */}
                    <p className="text-center text-sm text-[var(--color-text-muted)] mt-6">
                        Already have an account?{' '}
                        <Link to="/login" className="text-indigo-500 hover:underline">
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    )
}
