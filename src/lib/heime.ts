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
}): Promise<Heim> {
  const { data, error } = await supabase.rpc('heim_speichern', {
    p_id: h.id ?? null,
    p_name: h.name.trim(),
    p_anschrift: h.anschrift.trim(),
    p_telefon: h.telefon.trim(),
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

/** Die Telefonzeile für den Infotext. */
export function heimTelefonzeile(h: Heim): string {
  return `Tel. ${h.name}: ${h.telefon}`
}

/**
 * Setzt die Telefonzeile des gewählten Hauses in den Infotext.
 *
 * Selbst geschriebene Hinweise bleiben stehen; nur eine Telefonzeile, die
 * von einem anderen Haus stammt, wird ersetzt. Sonst sammelten sich beim
 * Umwählen alte Nummern an. Dafür braucht es die ganze Liste - `alle` sind
 * die aktuell geladenen Vorlagen.
 */
export function infoMitTelefon(info: string, h: Heim, alle: Heim[]): string {
  const bekannt = new Set(alle.map(heimTelefonzeile))
  const rest = info
    .split('\n')
    .filter((zeile) => !bekannt.has(zeile.trim()))
    .join('\n')
    .trim()

  const zeile = heimTelefonzeile(h)
  return rest === '' ? zeile : `${zeile}\n${rest}`
}
