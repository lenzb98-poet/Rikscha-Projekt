import { supabase } from './supabase'

export type Zustand = 'offen' | 'besetzt' | 'abgeschlossen' | 'abgesagt'
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
}

export const ZUSTAND_TEXT: Record<Zustand, string> = {
  offen: 'Offen',
  besetzt: 'Zugesagt',
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

/** Ruft `onChange` auf, sobald sich an den Fahrten etwas ändert. */
export function watchRides(onChange: () => void): () => void {
  const kanal = supabase
    .channel('fahrten')
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
