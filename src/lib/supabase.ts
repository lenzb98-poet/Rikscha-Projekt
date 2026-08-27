import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

if (!isSupabaseConfigured) {
  console.warn(
    'Supabase ist nicht konfiguriert. Bitte .env anlegen (siehe .env.example).',
  )
}

/* --- Angemeldet bleiben --------------------------------------------------
 *
 * Die Anmeldung liegt entweder dauerhaft im Browser (localStorage) oder nur
 * für die laufende Sitzung (sessionStorage). Beim Schließen des Browsers ist
 * sie im zweiten Fall weg – sinnvoll auf einem geteilten Gerät.
 *
 * Welcher Speicher gilt, entscheidet sich erst beim Anmelden, deshalb liest
 * der Adapter die Einstellung bei jedem Zugriff neu.
 */
const MERKEN = 'rikscha.angemeldet-bleiben'

export function angemeldetBleiben(): boolean {
  try {
    // Vorgabe: angemeldet bleiben
    return localStorage.getItem(MERKEN) !== '0'
  } catch {
    return true
  }
}

export function setzeAngemeldetBleiben(wert: boolean): void {
  try {
    localStorage.setItem(MERKEN, wert ? '1' : '0')
  } catch {
    // Privater Modus ohne Speicher: dann gilt die Vorgabe
  }
}

const authSpeicher = {
  getItem(key: string): string | null {
    try {
      // Beide durchsuchen, damit ein Wechsel der Einstellung nicht abmeldet
      return sessionStorage.getItem(key) ?? localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem(key: string, value: string): void {
    try {
      if (angemeldetBleiben()) {
        localStorage.setItem(key, value)
        sessionStorage.removeItem(key)
      } else {
        sessionStorage.setItem(key, value)
        localStorage.removeItem(key)
      }
    } catch {
      // Kein Speicher verfügbar: die Anmeldung gilt nur für diese Seite
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    } catch {
      // nichts zu tun
    }
  },
}

export const supabase = createClient(
  url ?? 'http://localhost',
  anonKey ?? 'public-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: authSpeicher,
    },
  },
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
  /** Gesetzt, sobald die Person ein Passwort vergeben hat. */
  auth_user_id: string | null
}

/** Lädt alle Einträge. Nicht-Admins erhalten durch RLS nur den eigenen. */
export async function listUsers(): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from('app_users')
    .select('id, full_name, role, is_active, phone, contact_email, auth_user_id')
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

/** Hat die Person schon ein Passwort vergeben? */
export function hatPasswort(m: TeamMember): boolean {
  return m.auth_user_id !== null
}

/**
 * Setzt das Passwort zurück: Das Anmeldekonto wird entfernt, der Eintrag
 * bleibt. Beim nächsten Anmelden vergibt die Person selbst ein neues.
 */
export async function resetPassword(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('admin_reset_password', { p_id: id })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return (row as { full_name: string }).full_name
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

export type ChatNachricht = {
  id: string
  body: string
  created_at: string
  author_id: string
  author_name: string
  ist_eigene: boolean
  image_path: string | null
  image_width: number | null
  image_height: number | null
  image_removed: boolean
}

export const BILDER_BUCKET = 'chat-bilder'

/** Lädt den Verlauf, neueste zuerst. */
export async function listMessages(limit = 200): Promise<ChatNachricht[]> {
  const { data, error } = await supabase.rpc('list_messages', { p_limit: limit })
  if (error) throw error
  return (data ?? []) as ChatNachricht[]
}

/**
 * Besorgt für die Bildpfade befristet gültige Adressen. Der Speicher ist nicht
 * öffentlich, ohne Unterschrift lässt sich also kein Bild abrufen.
 */
export async function bildAdressen(pfade: string[]): Promise<Record<string, string>> {
  if (pfade.length === 0) return {}
  const { data, error } = await supabase.storage
    .from(BILDER_BUCKET)
    .createSignedUrls(pfade, 3600)
  if (error) throw error

  const map: Record<string, string> = {}
  for (const eintrag of data ?? []) {
    if (eintrag.signedUrl && eintrag.path) map[eintrag.path] = eintrag.signedUrl
  }
  return map
}

/** Lädt ein Bild hoch und gibt seinen Pfad im Speicher zurück. */
export async function ladeBildHoch(datei: Blob, endung = 'jpg'): Promise<string> {
  const pfad = `${crypto.randomUUID()}.${endung}`
  const { error } = await supabase.storage
    .from(BILDER_BUCKET)
    .upload(pfad, datei, { contentType: datei.type || 'image/jpeg', upsert: false })
  if (error) throw error
  return pfad
}

export type NeueNachricht = {
  body: string
  imagePath?: string | null
  imageSize?: number | null
  imageWidth?: number | null
  imageHeight?: number | null
}

/** Sendet eine Nachricht. Der Absender wird serverseitig aus der Anmeldung bestimmt. */
export async function sendMessage(n: NeueNachricht): Promise<ChatNachricht> {
  const { data, error } = await supabase.rpc('send_message', {
    p_body: n.body,
    p_image_path: n.imagePath ?? null,
    p_image_size: n.imageSize ?? null,
    p_image_width: n.imageWidth ?? null,
    p_image_height: n.imageHeight ?? null,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return row as ChatNachricht
}

/** Löscht eine Nachricht samt Bild. Erlaubt für eigene, für Admins auch fremde. */
export async function deleteMessage(id: string): Promise<void> {
  const { data, error } = await supabase.rpc('delete_message', { p_id: id })
  if (error) throw error

  const row = Array.isArray(data) ? data[0] : data
  const pfad = (row as { image_path: string | null } | null)?.image_path
  if (pfad) {
    await supabase.storage.from(BILDER_BUCKET).remove([pfad])
  }
}

/**
 * Räumt den Bildspeicher auf: älteste Bilder verschwinden, bis die Grenze von
 * 750 MiB wieder eingehalten wird.
 *
 * Dreistufig, weil ein Löschen in der Datenbank die Datei im Speicher nicht
 * mit entfernt. Bricht der Ablauf ab, läuft er beim nächsten Hochladen erneut.
 * Gibt die Zahl der entfernten Bilder zurück.
 */
export async function raeumeBildspeicherAuf(): Promise<number> {
  const { data, error } = await supabase.rpc('chat_aufraeum_kandidaten')
  if (error) throw error

  const pfade = ((data ?? []) as { image_path: string }[])
    .map((r) => r.image_path)
    .filter(Boolean)
  if (pfade.length === 0) return 0

  const { error: weg } = await supabase.storage.from(BILDER_BUCKET).remove(pfade)
  if (weg) throw weg

  const { error: melden } = await supabase.rpc('chat_bilder_geloescht', { p_pfade: pfade })
  if (melden) throw melden

  return pfade.length
}

/**
 * Ruft `onChange` auf, sobald sich am Verlauf etwas ändert.
 * Nutzt Supabase Realtime; zusätzlich wird regelmäßig nachgeladen, falls
 * Realtime im Projekt nicht aktiv ist.
 */
export function watchMessages(onChange: () => void): () => void {
  // Eigener Kanalname je Aufruf, siehe watchRides in fahrten.ts
  const kanal = supabase
    .channel(`chat-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, onChange)
    .subscribe()

  const intervall = window.setInterval(() => {
    if (document.visibilityState === 'visible') onChange()
  }, 20000)

  return () => {
    supabase.removeChannel(kanal)
    window.clearInterval(intervall)
  }
}
