import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Zustand = 'offen' | 'besetzt' | 'nachtragen' | 'abgeschlossen' | 'abgesagt'
export type RideStatus = 'geplant' | 'abgesagt' | 'abgeschlossen'

export type Pilot = { id: string; name: string }
export type Notiz = { id: string; name: string; body: string; created_at: string }

export type Fahrt = {
  id: string
  starts_at: string
  location: string
  info: string
  pilots_needed: number
  status: RideStatus
  zustand: Zustand
  angemeldet: number
  bin_dabei: boolean
  piloten: Pilot[]
  notizen: Notiz[]
  /** Nachtrag nach der Fahrt; null, solange niemand ihn eingetragen hat. */
  report_km: number | null
  report_minutes: number | null
  report_passengers: number | null
  report_name: string | null
  report_at: string | null
  /** Bis wann nachgetragen werden kann – von der Datenbank berechnet. */
  report_deadline: string
}

export const ZUSTAND_TEXT: Record<Zustand, string> = {
  offen: 'Offen',
  besetzt: 'Zugesagt',
  nachtragen: 'Angaben fehlen',
  abgeschlossen: 'Abgeschlossen',
  abgesagt: 'Abgesagt',
}

/** 'offen' = noch Plätze frei, 'kommend' = besetzt, 'alle' = Kalender/Verwaltung */
export async function listRides(bereich: 'offen' | 'kommend' | 'alle'): Promise<Fahrt[]> {
  const { data, error } = await supabase.rpc('list_rides', { p_bereich: bereich })
  if (error) throw error
  return (data ?? []) as Fahrt[]
}

export async function rideSignup(rideId: string): Promise<void> {
  const { error } = await supabase.rpc('ride_signup', { p_ride_id: rideId })
  if (error) throw error
}

/** Abmelden, wahlweise mit Mitteilung an die Koordination. */
export async function rideSignoff(rideId: string, note?: string): Promise<void> {
  const { error } = await supabase.rpc('ride_signoff', {
    p_ride_id: rideId,
    p_note: note?.trim() || null,
  })
  if (error) throw error
}

/** Mitteilung zu einer Fahrt, ohne sich abzumelden. */
export async function rideAddNote(rideId: string, note: string): Promise<void> {
  const { error } = await supabase.rpc('ride_add_note', { p_ride_id: rideId, p_note: note })
  if (error) throw error
}

export type FahrtEingabe = {
  startsAt: string
  location: string
  info: string
  pilotsNeeded: number
  status: RideStatus
}

export async function createRide(f: FahrtEingabe): Promise<string> {
  const { data, error } = await supabase.rpc('admin_create_ride', {
    p_starts_at: new Date(f.startsAt).toISOString(),
    p_location: f.location,
    p_info: f.info,
    p_pilots_needed: f.pilotsNeeded,
  })
  if (error) throw error
  return data as string
}

export async function updateRide(id: string, f: FahrtEingabe): Promise<void> {
  const { error } = await supabase.rpc('admin_update_ride', {
    p_id: id,
    p_starts_at: new Date(f.startsAt).toISOString(),
    p_location: f.location,
    p_info: f.info,
    p_pilots_needed: f.pilotsNeeded,
    p_status: f.status,
  })
  if (error) throw error
}

export async function deleteRide(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_ride', { p_id: id })
  if (error) throw error
}

export async function setPilot(rideId: string, pilotId: string, dabei: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_pilot', {
    p_ride_id: rideId,
    p_pilot_id: pilotId,
    p_dabei: dabei,
  })
  if (error) throw error
}

export async function listPilots(): Promise<Pilot[]> {
  const { data, error } = await supabase.rpc('list_pilots')
  if (error) throw error
  return ((data ?? []) as { id: string; full_name: string }[]).map((p) => ({
    id: p.id,
    name: p.full_name,
  }))
}

/**
 * Ruft `onChange` auf, sobald sich an den Fahrten etwas ändert.
 *
 * Jeder Aufruf bekommt einen eigenen Kanalnamen. Supabase gibt bei gleichem
 * Namen den bereits laufenden Kanal zurück und lehnt weitere Callbacks ab
 * ("cannot add postgres_changes callbacks ... after subscribe()"). Da die
 * Startseite und die Fahrtenansichten gleichzeitig zuhören, muss jede
 * Anmeldung für sich stehen.
 */
export function watchRides(onChange: () => void): () => void {
  const kanal = supabase
    .channel(`fahrten-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_pilots' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_notes' }, onChange)
    .subscribe()

  const intervall = window.setInterval(() => {
    if (document.visibilityState === 'visible') onChange()
  }, 30000)

  return () => {
    supabase.removeChannel(kanal)
    window.clearInterval(intervall)
  }
}

/* --- Datum und Zeit ------------------------------------------------------ */

export function formatiereTermin(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatiereKurz(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Wandelt einen Zeitpunkt in den Wert für ein datetime-local-Feld um. */
export function fuerEingabefeld(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * Lädt alle Fahrten und hält sie aktuell. Auf der Startseite werden sie an
 * mehreren Stellen gebraucht (Meldung und Zähler unter den Knöpfen), deshalb
 * an einer Stelle laden statt mehrfach abfragen.
 */
export function useFahrten() {
  const [fahrten, setFahrten] = useState<Fahrt[] | null>(null)
  const [uebernahmen, setUebernahmen] = useState<Uebernahme[]>([])

  const laden = useCallback(() => {
    listRides('alle')
      .then(setFahrten)
      .catch(() => {
        // Auf der Startseite lieber still bleiben als eine Fehlermeldung zeigen
      })
    // Für die Auswertung: die Zahlen aus der Zeit vor dieser App
    listUebernahmen()
      .then(setUebernahmen)
      .catch(() => setUebernahmen([]))
  }, [])

  useEffect(() => {
    laden()
    return watchRides(laden)
  }, [laden])

  return { fahrten, uebernahmen, laden }
}

/** Standardgrund, den die Absage-Auswahl vorschlägt. */
export const GRUND_REGEN = 'Wegen Regen abgesagt'

/**
 * Sagt die ganze Fahrt ab – für alle Eingetragenen. Erlaubt für eingetragene
 * Pilot:innen und die Koordination; der Grund ist Pflicht und wird als
 * Mitteilung an der Fahrt festgehalten.
 */
export async function rideCancel(rideId: string, grund: string): Promise<void> {
  const { error } = await supabase.rpc('ride_cancel', {
    p_ride_id: rideId,
    p_grund: grund.trim(),
  })
  if (error) throw error
}

export type Bericht = { km: string; minuten: string; personen: string }

/**
 * Trägt nach der Fahrt Kilometer, Dauer und Fahrgäste nach. Erst damit gilt
 * die Fahrt als abgeschlossen. Erlaubt für eingetragene Pilot:innen und die
 * Koordination.
 */
export async function rideReport(rideId: string, b: Bericht): Promise<void> {
  // Leere Felder bleiben leer statt zu 0 zu werden – die Datenbank lässt
  // sie dann unangetastet, sodass sich Angaben ergänzen lassen.
  const zahl = (wert: string) => {
    const t = wert.trim().replace(',', '.')
    return t === '' ? null : Number(t)
  }

  const { error } = await supabase.rpc('ride_report', {
    p_ride_id: rideId,
    p_km: zahl(b.km),
    p_minutes: zahl(b.minuten),
    p_passengers: zahl(b.personen),
  })
  if (error) throw error
}

/** Sind alle drei Angaben vorhanden? Erst dann gilt die Fahrt als abgeschlossen. */
export function berichtVollstaendig(f: Fahrt): boolean {
  return f.report_km !== null && f.report_minutes !== null && f.report_passengers !== null
}

/** "8,5 km · 1 Std. 15 Min. · 2 Fahrgäste" – nur die vorhandenen Angaben. */
export function formatiereBericht(f: Fahrt): string | null {
  const teile: string[] = []

  if (f.report_km !== null) teile.push(`${String(f.report_km).replace('.', ',')} km`)

  if (f.report_minutes !== null) {
    const m = f.report_minutes
    teile.push(
      m >= 60 ? `${Math.floor(m / 60)} Std.${m % 60 ? ` ${m % 60} Min.` : ''}` : `${m} Min.`,
    )
  }

  if (f.report_passengers !== null) {
    teile.push(f.report_passengers === 1 ? '1 Fahrgast' : `${f.report_passengers} Fahrgäste`)
  }

  return teile.length ? teile.join(' · ') : null
}

/** Welche Angaben fehlen noch? Für den Hinweis im Dialog. */
export function fehlendeAngaben(f: Fahrt): string[] {
  const fehlt: string[] = []
  if (f.report_km === null) fehlt.push('Kilometer')
  if (f.report_minutes === null) fehlt.push('Dauer')
  if (f.report_passengers === null) fehlt.push('Fahrgäste')
  return fehlt
}

export type Auswertung = {
  km: number
  minuten: number
  personen: number
  /** Fahrten, zu denen mindestens eine Angabe vorliegt. */
  fahrten: number
}

/**
 * Summiert die nachgetragenen Angaben aller Fahrten.
 *
 * Gezählt wird, was eingetragen ist – auch aus Fahrten, bei denen erst ein Teil
 * der Angaben vorliegt. Fehlende Werte zählen als nichts, nicht als null.
 */
export function werteAus(fahrten: Fahrt[]): Auswertung {
  const summe: Auswertung = { km: 0, minuten: 0, personen: 0, fahrten: 0 }

  for (const f of fahrten) {
    if (f.report_km === null && f.report_minutes === null && f.report_passengers === null) {
      continue
    }
    summe.km += f.report_km ?? 0
    summe.minuten += f.report_minutes ?? 0
    summe.personen += f.report_passengers ?? 0
    summe.fahrten += 1
  }

  // Kommastellen sauber halten: 8,5 + 3,2 ergibt sonst 11,700000000000001
  summe.km = Math.round(summe.km * 10) / 10
  return summe
}

const ZAHL = new Intl.NumberFormat('de-DE')
const ZAHL_KOMMA = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

export const formatiereZahl = (n: number) => ZAHL.format(n)
export const formatiereKomma = (n: number) => ZAHL_KOMMA.format(n)

/** "20 Std. 40 Min." – als Lesehilfe unter der Minutenzahl. */
export function alsStunden(minuten: number): string {
  const std = Math.floor(minuten / 60)
  const rest = minuten % 60
  if (std === 0) return ''
  return rest ? `${ZAHL.format(std)} Std. ${rest} Min.` : `${ZAHL.format(std)} Std.`
}

/**
 * Wie lange bleibt noch Zeit für den Nachtrag? Leerer Text heißt: Frist vorbei.
 * Gerundet auf ganze Tage und Stunden – auf die Minute genau hilft hier niemandem.
 */
export function verbleibendeFrist(bis: string): string {
  const ms = new Date(bis).getTime() - Date.now()
  if (ms <= 0) return ''

  const minuten = Math.floor(ms / 60000)
  const stunden = Math.floor(minuten / 60)
  const tage = Math.floor(stunden / 24)

  if (tage >= 1) {
    const restStunden = stunden % 24
    const tagText = tage === 1 ? 'ein Tag' : `${tage} Tage`
    if (restStunden === 0) return tagText
    return `${tagText} und ${restStunden} ${restStunden === 1 ? 'Stunde' : 'Stunden'}`
  }

  if (stunden >= 1) {
    return `${stunden} ${stunden === 1 ? 'Stunde' : 'Stunden'}`
  }

  return `${Math.max(1, minuten)} Minuten`
}

/** "Mo., 26. August, 14:00 Uhr" – der Zeitpunkt, zu dem die Frist abläuft. */
export function formatiereFrist(bis: string): string {
  return new Date(bis).toLocaleString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/* --- Übernahme der bisherigen Statistik ---------------------------------- */

export type Uebernahme = {
  id: string
  bezeichnung: string
  km: number
  minuten: number
  personen: number
  erfasst_von: string | null
  erfasst_am: string
}

export async function listUebernahmen(): Promise<Uebernahme[]> {
  const { data, error } = await supabase.rpc('list_uebernahmen')
  if (error) throw error
  return (data ?? []) as Uebernahme[]
}

export type UebernahmeEingabe = {
  bezeichnung: string
  km: string
  minuten: string
  personen: string
}

export async function saveUebernahme(id: string | null, e: UebernahmeEingabe): Promise<void> {
  const zahl = (w: string) => {
    const t = w.trim().replace(',', '.')
    return t === '' ? 0 : Number(t)
  }
  const { error } = await supabase.rpc('admin_save_uebernahme', {
    p_id: id,
    p_bezeichnung: e.bezeichnung.trim(),
    p_km: zahl(e.km),
    p_minuten: zahl(e.minuten),
    p_personen: zahl(e.personen),
  })
  if (error) throw error
}

export async function deleteUebernahme(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_uebernahme', { p_id: id })
  if (error) throw error
}

/** Summe aus Fahrten und übernommener Statistik. */
export function werteAusGesamt(fahrten: Fahrt[], uebernahmen: Uebernahme[]): Auswertung {
  const summe = werteAus(fahrten)

  for (const u of uebernahmen) {
    summe.km += Number(u.km) || 0
    summe.minuten += u.minuten || 0
    summe.personen += u.personen || 0
  }

  summe.km = Math.round(summe.km * 10) / 10
  return summe
}
