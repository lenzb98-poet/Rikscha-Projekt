import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'

/**
 * Die Organisation, zu der man sich anmeldet.
 *
 * Vor der Anmeldung wählt man sie aus einer Liste. Die Wahl merkt sich der
 * Browser, damit sie beim nächsten Öffnen nicht erneut nötig ist; auf der
 * Anmeldeseite lässt sie sich wechseln.
 *
 * Ein Link mit ?org=kürzel wählt die Organisation gleich aus - so lässt sich
 * den Pilot:innen ein Link schicken, der direkt zur richtigen Anmeldung führt.
 */
export type Organisation = {
  id: string
  name: string
  kuerzel: string
}

const MERKEN = 'rikscha.organisation'

let gewaehlt: Organisation | null = gemerkt()
const hoerer = new Set<() => void>()

function gemerkt(): Organisation | null {
  try {
    const roh = localStorage.getItem(MERKEN)
    if (!roh) return null
    const o = JSON.parse(roh) as Partial<Organisation>
    return o.id && o.name && o.kuerzel ? { id: o.id, name: o.name, kuerzel: o.kuerzel } : null
  } catch {
    return null
  }
}

function setze(o: Organisation | null) {
  gewaehlt = o
  try {
    if (o) localStorage.setItem(MERKEN, JSON.stringify(o))
    else localStorage.removeItem(MERKEN)
  } catch {
    // Ohne Speicher gilt die Wahl nur, bis die Seite geschlossen wird
  }
  hoerer.forEach((h) => h())
}

/** Die gewählte Organisation außerhalb von React. */
export function gewaehlteOrganisation(): Organisation | null {
  return gewaehlt
}

/** Die gewählte Organisation, null solange keine gewählt ist. */
export function useOrganisation(): Organisation | null {
  return useSyncExternalStore(
    (h) => {
      hoerer.add(h)
      return () => hoerer.delete(h)
    },
    () => gewaehlt,
  )
}

export function waehleOrganisation(o: Organisation): void {
  setze(o)
}

/** Zurück zur Auswahl. */
export function organisationWechseln(): void {
  setze(null)
}

/** Hört auf einen Wechsel der gewählten Organisation. */
export function beiOrganisationswechsel(h: () => void): () => void {
  hoerer.add(h)
  return () => hoerer.delete(h)
}

/**
 * Die Organisation der angemeldeten Person, aus der Datenbank. Dateien im
 * Speicher liegen in einem Ordner mit dieser Kennung.
 */
export async function eigeneOrgId(): Promise<string> {
  const { data, error } = await supabase.rpc('eigene_org_id')
  if (error) throw error
  if (!data) throw new Error('Dein Zugang ist nicht freigeschaltet.')
  return data as string
}

/** Alle Organisationen, die die App nutzen - lesbar auch vor der Anmeldung. */
export async function listOrganisationen(): Promise<Organisation[]> {
  const { data, error } = await supabase.rpc('list_organisationen')
  if (error) throw error
  return (data ?? []) as Organisation[]
}

/**
 * Liest ?org=kürzel aus der Adresse und entfernt es wieder, damit es beim
 * Neuladen oder Teilen des Links nicht ungewollt erneut greift.
 */
export function kuerzelAusLink(): string | null {
  const url = new URL(window.location.href)
  const kuerzel = url.searchParams.get('org')?.trim().toLowerCase() || null
  if (kuerzel) {
    url.searchParams.delete('org')
    window.history.replaceState(window.history.state, '', url.toString())
  }
  return kuerzel
}
