import { supabase } from './supabase'

/**
 * Die Rikschas der Organisation.
 *
 * Die Liste liegt in der Datenbank und wird in den Admin Einstellungen
 * gepflegt. Vorher stand sie fest im Programm; eine neue Rikscha hätte damit
 * eine neue Version der App gebraucht.
 */
export type Rikscha = {
  id: string
  name: string
  /** Stillgelegte lassen sich nicht mehr neu auswählen, bleiben aber in alten Einträgen. */
  aktiv: boolean
  position: number
  /** Wie viele Einträge im Fahrtenbuch diese Rikscha tragen. */
  eintraege: number
  km: number
  letzte_fahrt: string | null
}

/** Lesen dürfen alle Freigeschalteten - jede Person trägt mal eine Fahrt nach. */
export async function listRikschas(): Promise<Rikscha[]> {
  const { data, error } = await supabase.rpc('list_rikschas')
  if (error) throw error
  return ((data ?? []) as Rikscha[]).map((r) => ({ ...r, km: Number(r.km) }))
}

/** Ohne id kommt eine Rikscha dazu, mit id wird die vorhandene umbenannt. */
export async function speichereRikscha(r: { id?: string; name: string }): Promise<string> {
  const { data, error } = await supabase.rpc('rikscha_speichern', {
    p_id: r.id ?? null,
    p_name: r.name.trim(),
  })
  if (error) throw error
  const zeile = (Array.isArray(data) ? data[0] : data) as { name: string }
  return zeile.name
}

export async function setzeRikschaAktiv(id: string, aktiv: boolean): Promise<void> {
  const { error } = await supabase.rpc('rikscha_aktiv_setzen', { p_id: id, p_aktiv: aktiv })
  if (error) throw error
}

/**
 * Löscht die Rikscha endgültig. Die Datenbank verlangt den Namen als
 * Bestätigung. Liefert die Zahl der Einträge, die ihre Zuordnung verloren.
 */
export async function loescheRikscha(id: string, bestaetigung: string): Promise<number> {
  const { data, error } = await supabase.rpc('rikscha_loeschen', {
    p_id: id,
    p_bestaetigung: bestaetigung.trim(),
  })
  if (error) throw error
  return (data as number) ?? 0
}
