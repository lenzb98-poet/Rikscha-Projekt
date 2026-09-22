import { supabase } from './supabase'

/**
 * Der Betreiber verwaltet die Organisationen, die die App nutzen.
 *
 * Wer Betreiber ist, entscheidet allein die Datenbank (Tabelle betreiber,
 * nur per Migration beschreibbar). Jede Funktion hier prüft das dort erneut -
 * die Oberfläche blendet die Betreiber Einstellungen nur aus.
 */
export type OrgUebersicht = {
  id: string
  name: string
  kuerzel: string
  aktiv: boolean
  /** Die Stammorganisation, zu der alle bisherigen Daten gehören. */
  stamm: boolean
  created_at: string
  /** Namen der aktiven Administration, mit Komma getrennt. */
  administration: string | null
  personen: number
  fahrten: number
  nachrichten: number
  bilder_bytes: number
  /** Geschätzt: Summe der gespeicherten Zeilen. */
  daten_bytes: number
}

export async function istBetreiber(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_betreiber')
  if (error) return false
  return data === true
}

export async function listOrganisationenBetreiber(): Promise<OrgUebersicht[]> {
  const { data, error } = await supabase.rpc('betreiber_organisationen')
  if (error) throw error
  return ((data ?? []) as OrgUebersicht[]).map((o) => ({
    ...o,
    bilder_bytes: Number(o.bilder_bytes),
    daten_bytes: Number(o.daten_bytes),
  }))
}

/** Neue Organisation samt erster Administration. Liefert das vergebene Kürzel. */
export async function orgAnlegen(name: string, adminName: string): Promise<{ name: string; kuerzel: string }> {
  const { data, error } = await supabase.rpc('org_anlegen', {
    p_name: name.trim(),
    p_admin_name: adminName.trim(),
  })
  if (error) throw error
  return (Array.isArray(data) ? data[0] : data) as { name: string; kuerzel: string }
}

export async function orgSpeichern(id: string, name: string, kuerzel: string): Promise<void> {
  const { error } = await supabase.rpc('org_speichern', {
    p_id: id,
    p_name: name.trim(),
    p_kuerzel: kuerzel.trim().toLowerCase(),
  })
  if (error) throw error
}

export async function orgAktivSetzen(id: string, aktiv: boolean): Promise<void> {
  const { error } = await supabase.rpc('org_aktiv_setzen', { p_id: id, p_aktiv: aktiv })
  if (error) throw error
}

/** Löscht die Organisation mit allem, was ihr gehört. Verlangt den Namen als Bestätigung. */
export async function orgLoeschen(id: string, bestaetigung: string): Promise<number> {
  const { data, error } = await supabase.rpc('org_loeschen', {
    p_id: id,
    p_bestaetigung: bestaetigung.trim(),
  })
  if (error) throw error
  return (data as number) ?? 0
}

/** Der Link, der direkt zur Anmeldung dieser Organisation führt. */
export function anmeldeLink(kuerzel: string): string {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('org', kuerzel)
  return url.toString()
}

/* --- Speicher-Budget ------------------------------------------------------ */

export type SpeicherStand = {
  /** Das ganze Budget, Vorgabe 1 GB. */
  gesamt_budget: number
  /** Höchstens so viel für Chat-Bilder aller Organisationen. */
  bilder_budget: number
  /** Übrige Daten: die ganze Datenbank und die Logos. */
  daten_bytes: number
  bilder_bytes: number
  /** Was für Bilder tatsächlich gilt: das Kleinere aus Bildbudget und Restbudget. */
  bilder_grenze: number
  /** Geräumte Dateien, die noch aus dem Speicher entfernt werden müssen. */
  ausstehend: number
}

export const MB = 1024 * 1024

export async function speicherStand(): Promise<SpeicherStand> {
  const { data, error } = await supabase.rpc('speicher_stand')
  if (error) throw error
  const z = (Array.isArray(data) ? data[0] : data) as Record<keyof SpeicherStand, number | string>
  return {
    gesamt_budget: Number(z.gesamt_budget),
    bilder_budget: Number(z.bilder_budget),
    daten_bytes: Number(z.daten_bytes),
    bilder_bytes: Number(z.bilder_bytes),
    bilder_grenze: Number(z.bilder_grenze),
    ausstehend: Number(z.ausstehend),
  }
}

/** Setzt beide Grenzen in MB. Räumen muss danach raeumeBildspeicherAuf(). */
export async function speicherBudgetSetzen(gesamtMb: number, bilderMb: number): Promise<void> {
  const { error } = await supabase.rpc('speicher_budget_setzen', {
    p_gesamt_mb: Math.round(gesamtMb),
    p_bilder_mb: Math.round(bilderMb),
  })
  if (error) throw error
}
