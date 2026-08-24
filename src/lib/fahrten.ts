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

  const laden = useCallback(() => {
    listRides('alle')
      .then(setFahrten)
      .catch(() => {
        // Auf der Startseite lieber still bleiben als eine Fehlermeldung zeigen
      })
  }, [])

  useEffect(() => {
    laden()
    return watchRides(laden)
  }, [laden])

  return { fahrten, laden }
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
