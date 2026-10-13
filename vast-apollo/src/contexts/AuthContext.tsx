/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { authApi } from '../lib/api'
import { clearToken, setToken } from '../lib/session'
import type { Profile, UserRole } from '../types/database'

/**
 * Who is signed in.
 *
 * Sign-in used to happen in the browser against Supabase, which meant the screens held a
 * Supabase session and read the staff row themselves. Both are gone: the API checks the
 * password (through Firebase Auth) and answers with its own token, and the staff row comes
 * from /auth/me. That removed the auth lock this file used to fight - the stalled getSession,
 * the 10s and 12s timeouts and the "clear the stale session" rescue are all unnecessary now.
 */
export interface StaffUser {
    id: string
    username: string | null
    email: string
    full_name: string | null
    role: UserRole
    is_active?: boolean
}

interface AuthContextType {
    user: StaffUser | null
    profile: Profile | null
    /** Kept so screens that only check "is somebody signed in" need no change. */
    session: { user: StaffUser } | null
    role: UserRole | null
    isLoading: boolean
    isFounder: boolean
    isSalesman: boolean
    isAccounting: boolean
    signIn: (username: string, password: string) => Promise<{ error: Error | null; role: string | null }>
    signOut: () => Promise<void>
    refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<StaffUser | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    const role = user?.role ?? null
    const isFounder = role === 'founder'
    const isSalesman = role === 'salesman'
    const isAccounting = role === 'accounting'

    // The screens were written against a Supabase profile row; the staff row carries the same
    // fields under the same names, so they need no change.
    const profile = user ? ({ ...user } as unknown as Profile) : null

    const loadMe = async () => {
        try {
            const { user: me } = await authApi.getMe()
            setUser(me as unknown as StaffUser)
            return me as unknown as StaffUser
        } catch {
            // 401 means the token is gone, the role changed, or the login was switched off.
            // api.ts has already cleared the token; there is nothing to rescue.
            setUser(null)
            return null
        }
    }

    useEffect(() => {
        let mounted = true
        loadMe().finally(() => {
            if (mounted) setIsLoading(false)
        })
        return () => { mounted = false }
    }, [])

    const refreshProfile = async () => {
        await loadMe()
    }

    const signIn = async (username: string, password: string) => {
        try {
            const result = await authApi.login(username, password)
            if (result.token) setToken(result.token)
            const me = (result.user ?? null) as StaffUser | null
            setUser(me)
            return { error: null, role: me?.role ?? null }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Sign-in failed'
            // A wrong password and an unreachable server are different problems, and telling
            // somebody to reset a password that was never wrong wastes their evening.
            const unreachable = /failed to fetch|network|aborted|timeout/i.test(message)
            return {
                error: new Error(unreachable
                    ? "Can't reach the server. Check your internet, then fully close and reopen the app."
                    : message),
                role: null,
            }
        }
    }

    const signOut = async () => {
        // The cookie is the server's to clear; the token is ours. Clear ours even if the call
        // fails, or a staff member could not sign out while the network is down.
        await authApi.logout().catch(() => {})
        clearToken()
        setUser(null)
    }

    const value: AuthContextType = {
        user,
        profile,
        session: user ? { user } : null,
        role,
        isLoading,
        isFounder,
        isSalesman,
        isAccounting,
        signIn,
        signOut,
        refreshProfile,
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
