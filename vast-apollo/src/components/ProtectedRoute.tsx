import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface ProtectedRouteProps {
    children: React.ReactNode
    allowedRoles?: ('founder' | 'salesman' | 'accounting')[]
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
    const { user, role, isLoading } = useAuth()
    const location = useLocation()

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[var(--color-surface)] flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-500 border-r-transparent"></div>
                    <p className="mt-4 text-[var(--color-text-muted)]">Loading...</p>
                </div>
            </div>
        )
    }

    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />
    }

    if (allowedRoles && role && !allowedRoles.includes(role)) {
        // Redirect to the user's appropriate home page instead of showing access denied
        const homePath = role === 'salesman' ? '/pos' : '/dashboard'
        return <Navigate to={homePath} replace />
    }

    return <>{children}</>
}
