import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type AppUser = {
  id: string
  full_name: string
  contact_email: string | null
  phone: string | null
  role: 'admin' | 'koordinator' | 'fahrer'
  is_active: boolean
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      return
    }
    let cancelled = false
    supabase
      .from('app_users')
      .select('id, full_name, contact_email, phone, role, is_active')
      .eq('login_email', session.user.email?.toLowerCase() ?? '')
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProfile((data as AppUser) ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [session])

  return { session, profile, loading, signOut: () => supabase.auth.signOut() }
}
