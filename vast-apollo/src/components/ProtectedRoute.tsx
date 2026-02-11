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
        return (
            <div className="min-h-screen bg-[var(--color-surface)] flex items-center justify-center p-4">
                <div className="text-center max-w-md">
                    <div className="text-6xl mb-4">🚫</div>
                    <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">
                        Access Denied
                    </h1>
                    <p className="text-[var(--color-text-muted)] mb-6">
                        You don't have permission to access this page. Please contact your administrator.
                    </p>
                    <button
                        onClick={() => window.history.back()}
                        className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        )
    }

    return <>{children}</>
}
