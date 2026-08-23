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

/**
 * Legt eine:n neue:n Fahrer:in an. Die Rechteprüfung erfolgt in der
 * Datenbank, nicht hier – die Oberfläche blendet den Zugang nur aus.
 */
export async function createUser(daten: Stammdaten): Promise<TeamMember> {
  const { data, error } = await supabase.rpc('admin_create_user', {
    p_full_name: daten.fullName.trim(),
    p_role: daten.role,
    p_phone: daten.phone.trim() || null,
    p_contact_email: daten.contactEmail.trim() || null,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return row as TeamMember
}

export type Rolle = 'admin' | 'koordinator' | 'fahrer'

export type TeamMember = {
  id: string
  full_name: string
  role: Rolle
  is_active: boolean
  phone: string | null
  contact_email: string | null
}

/** Lädt alle Einträge. Nicht-Admins erhalten durch RLS nur den eigenen. */
export async function listUsers(): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from('app_users')
    .select('id, full_name, role, is_active, phone, contact_email')
    .order('full_name')
  if (error) throw error
  return (data ?? []) as TeamMember[]
}

export type Stammdaten = {
  fullName: string
  role: Rolle
  phone: string
  contactEmail: string
}

/** Ändert alle Stammdaten. Rechteprüfung erfolgt in der Datenbank. */
export async function updateUser(
  id: string,
  daten: Stammdaten & { isActive: boolean },
): Promise<TeamMember> {
  const { data, error } = await supabase.rpc('admin_update_user', {
    p_id: id,
    p_full_name: daten.fullName.trim(),
    p_role: daten.role,
    p_is_active: daten.isActive,
    p_phone: daten.phone.trim() || null,
    p_contact_email: daten.contactEmail.trim() || null,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return row as TeamMember
}

/**
 * Löscht einen Eintrag endgültig, inklusive des zugehörigen Anmeldekontos.
 * Zum Sperren ohne Datenverlust stattdessen updateUser(..., isActive: false).
 */
export async function deleteUser(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('admin_delete_user', { p_id: id })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return (row as { full_name: string }).full_name
}
