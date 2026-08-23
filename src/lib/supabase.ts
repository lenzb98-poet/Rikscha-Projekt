import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

if (!isSupabaseConfigured) {
  console.warn(
    'Supabase ist nicht konfiguriert. Bitte .env anlegen (siehe .env.example).',
  )
}

export const supabase = createClient(
  url ?? 'http://localhost',
  anonKey ?? 'public-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true } },
)

export type LoginCheck = {
  found: boolean
  is_active: boolean
  has_account: boolean
  full_name: string | null
  /** Technische Kennung fuer Supabase Auth - nur intern, nie angezeigt. */
  login_email: string | null
}

/** Prüft, ob der Name in der Benutzertabelle hinterlegt ist. */
export async function checkLoginName(fullName: string): Promise<LoginCheck> {
  const { data, error } = await supabase.rpc('check_login_name', {
    p_full_name: fullName.trim(),
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return (row as LoginCheck) ?? {
    found: false,
    is_active: false,
    has_account: false,
    full_name: null,
    login_email: null,
  }
}

/** Verknüpft das frisch angelegte Auth-Konto mit dem Whitelist-Eintrag. */
export async function linkAuthAccount(): Promise<void> {
  const { error } = await supabase.rpc('link_auth_account')
  if (error) throw error
}
