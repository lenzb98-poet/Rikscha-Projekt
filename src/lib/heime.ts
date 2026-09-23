import { supabase } from './supabase'

/**
 * Die Seniorenheime, zu denen regelmäßig gefahren wird - als Vorlage beim
 * Anlegen einer Fahrt.
 *
 * Die Liste liegt in der Datenbank und wird in den Admin Einstellungen
 * gepflegt. Vorher stand sie fest im Programm; eine neue Nummer hätte damit
 * eine neue Version der App gebraucht.
 */
export type Heim = {
  id: string
  name: string
  anschrift: string
  telefon: string
  /** Eigener Hinweis zum Haus, kommt wie die Telefonnummer in den Infotext. */
  info: string
}

/** Lesen dürfen alle Freigeschalteten - jede Person legt mal eine Fahrt an. */
export async function listHeime(): Promise<Heim[]> {
  const { data, error } = await supabase.rpc('list_heime')
  if (error) throw error
  return (data ?? []) as Heim[]
}

/** Ohne id kommt ein Haus dazu, mit id wird das vorhandene geändert. */
export async function speichereHeim(h: {
  id?: string
  name: string
  anschrift: string
  telefon: string
  info: string
}): Promise<Heim> {
  const { data, error } = await supabase.rpc('heim_speichern', {
    p_id: h.id ?? null,
    p_name: h.name.trim(),
    p_anschrift: h.anschrift.trim(),
    p_telefon: h.telefon.trim(),
    p_info: h.info.trim(),
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return row as Heim
}

/**
 * Entfernt eine Vorlage. Schon angelegte Fahrten bleiben unberührt: Ort und
 * Infotext stehen dort als eigener Text und hängen nicht an der Vorlage.
 */
export async function loescheHeim(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('heim_loeschen', { p_id: id })
  if (error) throw error
  return data as string
}

/** Was im Feld „Wo“ steht: Name und Anschrift. */
export function heimOrt(h: Heim): string {
  return h.anschrift.trim() === '' ? h.name : `${h.name}, ${h.anschrift}`
}

/** Die Telefonzeile für den Infotext; ohne Nummer keine Zeile. */
export function heimTelefonzeile(h: Heim): string | null {
  return h.telefon.trim() === '' ? null : `Tel. ${h.name}: ${h.telefon}`
}

/** Was ein Haus in den Infotext schreibt: Telefonzeile und eigener Hinweis. */
export function heimInfozeilen(h: Heim): string[] {
  const zeilen = [heimTelefonzeile(h), ...h.info.split('\n')]
  return zeilen.map((z) => z?.trim() ?? '').filter((z) => z !== '')
}

/**
 * Setzt Telefonzeile und Hinweis des gewählten Hauses in den Infotext.
 *
 * Selbst geschriebene Hinweise bleiben stehen; nur Zeilen, die von einer
 * Vorlage stammen, werden ersetzt. Sonst sammelten sich beim Umwählen alte
 * Nummern und Hinweise an. Dafür braucht es die ganze Liste - `alle` sind
 * die aktuell geladenen Vorlagen.
 */
export function infoMitHeim(info: string, h: Heim, alle: Heim[]): string {
  const bekannt = new Set(alle.flatMap(heimInfozeilen))
  const rest = info
    .split('\n')
    .filter((zeile) => !bekannt.has(zeile.trim()))
    .join('\n')
    .trim()

  const neu = heimInfozeilen(h).join('\n')
  if (neu === '') return rest
  return rest === '' ? neu : `${neu}\n${rest}`
}
