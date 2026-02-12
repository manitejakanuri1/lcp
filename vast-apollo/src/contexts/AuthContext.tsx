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
    signIn: (username: string, password: string) => Promise<{ error: Error | null }>
    signOut: () => Promise<void>
    refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

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

        // Get initial session
        supabase.auth.getSession().then(async ({ data: { session } }) => {
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
            // First, find the user by username to get their email
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('email')
                .eq('username', username)
                .single<{ email: string }>()

            if (profileError || !profile) {
                return { error: new Error('Invalid username or password') }
            }

            const { error } = await supabase.auth.signInWithPassword({
                email: profile.email,
                password
            })
            return { error: error as Error | null }
        } catch (err) {
            return { error: err as Error }
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
