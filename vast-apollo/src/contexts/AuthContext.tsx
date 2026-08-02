/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile, UserRole } from '../types/database'

interface AuthContextType {
    user: User | null
    profile: Profile | null
    session: Session | null
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

/**
 * Remove the stored Supabase session.
 *
 * supabase.auth.signOut() is no use here: it calls the server, and the whole reason
 * we are in this branch is that the auth client is stuck. Clearing the key directly
 * is what actually unsticks the next page load.
 */
function purgeStoredSession() {
    try {
        Object.keys(localStorage)
            .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
            .forEach((k) => localStorage.removeItem(k))
        console.warn('[Auth] Cleared a stale session — please sign in again.')
    } catch {
        // Private-mode storage restrictions; nothing useful to do.
    }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [session, setSession] = useState<Session | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    const role = profile?.role ?? null
    const isFounder = role === 'founder'
    const isSalesman = role === 'salesman'
    const isAccounting = role === 'accounting'

    const fetchProfile = async (userId: string) => {
        try {
            console.log('Fetching profile for user:', userId)
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single()

            if (error) {
                console.error('Error fetching profile:', error)
                // If profile doesn't exist, sign out the user
                if (error.code === 'PGRST116') {
                    console.error('Profile not found, signing out')
                    await supabase.auth.signOut()
                }
                return null
            }
            console.log('Profile fetched:', data)
            return data as Profile
        } catch (err) {
            console.error('Error in fetchProfile:', err)
            return null
        }
    }

    const refreshProfile = async () => {
        if (user) {
            const profileData = await fetchProfile(user.id)
            setProfile(profileData)
        }
    }

    useEffect(() => {
        let mounted = true

        // Add timeout to prevent infinite loading
        const timeout = setTimeout(() => {
            if (mounted) {
                console.warn('Auth loading timeout - forcing loading to false')
                setIsLoading(false)
            }
        }, 5000) // 5 second timeout

        // Get initial session with 3s timeout to prevent hanging
        const sessionPromise = supabase.auth.getSession()
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('getSession timeout')), 3000)
        )

        Promise.race([sessionPromise, timeoutPromise]).then(async ({ data: { session } }) => {
            if (!mounted) return

            setSession(session)
            setUser(session?.user ?? null)

            if (session?.user) {
                const profileData = await fetchProfile(session.user.id)
                if (mounted) {
                    setProfile(profileData)
                }
            }

            if (mounted) {
                setIsLoading(false)
                clearTimeout(timeout)
            }
        }).catch((err) => {
            console.error('Error getting session:', err)
            // getSession stalls when the stored refresh token is no longer accepted —
            // after a password change, for instance. It keeps retrying and never settles,
            // which leaves every signed-in request waiting on a token that will never
            // arrive. Drop the dead session so the next load starts from a clean login
            // instead of limping along with it.
            if (err instanceof Error && err.message === 'getSession timeout') {
                purgeStoredSession()
            }
            if (mounted) {
                setIsLoading(false)
                clearTimeout(timeout)
            }
        })

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (_event, session) => {
                if (!mounted) return

                setSession(session)
                setUser(session?.user ?? null)

                if (session?.user) {
                    const profileData = await fetchProfile(session.user.id)
                    if (mounted) {
                        setProfile(profileData)
                    }
                } else {
                    setProfile(null)
                }

                if (mounted) {
                    setIsLoading(false)
                }
            }
        )

        return () => {
            mounted = false
            clearTimeout(timeout)
            subscription.unsubscribe()
        }
    }, [])

    const signIn = async (username: string, password: string) => {
        try {
            // Supabase authenticates by email, so resolve the username first. This goes
            // through get_login_email rather than reading profiles directly: the table is
            // no longer readable before sign-in, because that exposed every staff email,
            // name and role to anyone on the internet.
            // This file's Database type is hand-maintained and doesn't match the shape
            // supabase-js infers rpc arguments from, so it types them as `undefined`.
            // The call is correct; the cast is only to get past that.
            const { data: loginEmail, error: profileError } = (await (supabase.rpc as unknown as (
                fn: string,
                args: Record<string, unknown>
            ) => Promise<{ data: string | null; error: { code?: string; message: string } | null }>)(
                'get_login_email',
                { p_username: username }
            ))

            // An error means the lookup itself failed (offline, stale cached build
            // pointing at a bad URL, Supabase down). Calling that a wrong password sends
            // people off resetting credentials that were never the problem.
            if (profileError) {
                console.error('[Auth] Username lookup failed:', profileError)
                return {
                    error: new Error("Can't reach the server. Check your internet, then fully close and reopen the app."),
                    role: null
                }
            }

            // No error and no email means the username simply doesn't exist.
            if (!loginEmail) {
                return { error: new Error('Invalid username or password'), role: null }
            }

            const { data: authData, error } = await supabase.auth.signInWithPassword({
                email: loginEmail,
                password
            })
            if (error || !authData.user) {
                return { error: (error as Error) ?? new Error('Invalid username or password'), role: null }
            }

            // Read the role only now that we're signed in. Returning it from the
            // pre-login lookup would put it back within reach of anyone who guessed a
            // username, which is what this change set out to stop.
            const { data: profileRow } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', authData.user.id)
                .single<{ role: string }>()

            return { error: null, role: profileRow?.role ?? null }
        } catch (err) {
            // supabase-js throws rather than returning an error when fetch itself fails.
            console.error('[Auth] Sign-in threw:', err)
            return {
                error: new Error("Can't reach the server. Check your internet, then fully close and reopen the app."),
                role: null
            }
        }
    }

    const signOut = async () => {
        await supabase.auth.signOut()
        setUser(null)
        setProfile(null)
        setSession(null)
    }

    const value: AuthContextType = {
        user,
        profile,
        session,
        role,
        isLoading,
        isFounder,
        isSalesman,
        isAccounting,
        signIn,
        signOut,
        refreshProfile
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
