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
  /** Namen der aktiven Administration ohne den Betreiber, mit Komma getrennt. */
  administration: string | null
  /** Der Betreiber, falls er zu dieser Organisation gehört. */
  betreiber: string | null
  personen: number
  fahrten: number
  nachrichten: number
  /** Chat-Bilder und Logo im Speicher. */
  bilder_bytes: number
  /** Personen, Fahrten, Nachrichten usw. - geschätzt aus den gespeicherten Zeilen. */
  text_bytes: number
  /** Anmeldekonten, Sitzungen und Push-Geräte der Personen - geschätzt. */
  uebrige_bytes: number
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
    text_bytes: Number(o.text_bytes),
    uebrige_bytes: Number(o.uebrige_bytes),
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
  /** Die ganze Datenbank: Text- und Fahrtdaten plus übrige Daten. */
  daten_bytes: number
  /** Bilder: Chat-Bilder und Logos. */
  bilder_bytes: number
  chat_bytes: number
  logo_bytes: number
  /** Die Tabellen der Vereine: Personen, Fahrten, Nachrichten usw. */
  text_bytes: number
  /** Der Rest der Datenbank: Anmeldekonten, Sitzungen, Protokolle, Verwaltung. */
  uebrige_bytes: number
  /** Was für Bilder tatsächlich gilt: das Kleinere aus Bildbudget und Restbudget. */
  bilder_grenze: number
  /** Geräumte Dateien, die noch aus dem Speicher entfernt werden müssen. */
  ausstehend: number
  /** Bildkompression: längste Kante in Pixeln, JPEG-Qualität in Prozent. */
  bild_max_kante: number
  bild_qualitaet: number
  /** Durchschnittsgröße der letzten (höchstens 20) Chat-Bilder; 0, wenn es keine gibt. */
  bild_schnitt_bytes: number
  bild_schnitt_anzahl: number
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
    chat_bytes: Number(z.chat_bytes),
    logo_bytes: Number(z.logo_bytes),
    text_bytes: Number(z.text_bytes),
    uebrige_bytes: Number(z.uebrige_bytes),
    bild_max_kante: Number(z.bild_max_kante),
    bild_qualitaet: Number(z.bild_qualitaet),
    bild_schnitt_bytes: Number(z.bild_schnitt_bytes ?? 0),
    bild_schnitt_anzahl: Number(z.bild_schnitt_anzahl ?? 0),
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

/** Bildkompression für alle Organisationen; gilt für neu hochgeladene Bilder. */
export async function bildKompressionSetzen(maxKante: number, qualitaet: number): Promise<void> {
  const { error } = await supabase.rpc('bild_einstellungen_setzen', {
    p_max_kante: Math.round(maxKante),
    p_qualitaet: Math.round(qualitaet),
  })
  if (error) throw error
}
