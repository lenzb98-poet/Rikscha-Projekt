/** Bildbearbeitung vor dem Hochladen. */
import { supabase } from './supabase'

/** Vorgabe, falls die Einstellung nicht zu laden ist. */
export const MAX_KANTE = 1600
export const QUALITAET = 82

/** Längste Kante in Pixeln und JPEG-Qualität in Prozent. */
export type Kompression = { maxKante: number; qualitaet: number }

let zwischenspeicher: { wert: Kompression; seit: number } | null = null

/**
 * Die Bildkompression, die der Betreiber eingestellt hat (für alle
 * Organisationen). Fünf Minuten zwischengespeichert; klappt das Laden nicht,
 * gilt die Vorgabe - ein Bild soll daran nie scheitern.
 */
export async function bildKompression(): Promise<Kompression> {
  if (zwischenspeicher && Date.now() - zwischenspeicher.seit < 5 * 60_000) return zwischenspeicher.wert
  try {
    const { data, error } = await supabase.rpc('bild_einstellungen')
    if (error) throw error
    const z = (Array.isArray(data) ? data[0] : data) as { max_kante: number; qualitaet: number } | null
    const wert = z ? { maxKante: z.max_kante, qualitaet: z.qualitaet } : { maxKante: MAX_KANTE, qualitaet: QUALITAET }
    zwischenspeicher = { wert, seit: Date.now() }
    return wert
  } catch {
    return { maxKante: MAX_KANTE, qualitaet: QUALITAET }
  }
}

/** Nach dem Ändern in den Betreiber Einstellungen sofort neu laden. */
export function bildKompressionVergessen() {
  zwischenspeicher = null
}

export type VerkleinertesBild = {
  datei: Blob
  breite: number
  hoehe: number
}

/**
 * Verkleinert ein Foto auf die eingestellte längste Kante und speichert es als
 * JPEG in der eingestellten Qualität. Handyfotos sind sonst schnell mehrere
 * Megabyte groß und der Speicher wäre nach wenigen Dutzend Bildern voll.
 *
 * `kompression` nur für die Vorschau in den Betreiber Einstellungen; sonst
 * gilt, was der Betreiber gespeichert hat.
 */
export async function verkleinereBild(datei: File, kompression?: Kompression): Promise<VerkleinertesBild> {
  const { maxKante, qualitaet } = kompression ?? (await bildKompression())
  const bitmap = await ladeBitmap(datei)

  const faktor = Math.min(1, maxKante / Math.max(bitmap.width, bitmap.height))
  const breite = Math.max(1, Math.round(bitmap.width * faktor))
  const hoehe = Math.max(1, Math.round(bitmap.height * faktor))

  const canvas = document.createElement('canvas')
  canvas.width = breite
  canvas.height = hoehe

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Das Bild konnte nicht verarbeitet werden.')
  ctx.drawImage(bitmap, 0, 0, breite, hoehe)
  if ('close' in bitmap) bitmap.close()

  const blob = await new Promise<Blob | null>((fertig) =>
    canvas.toBlob(fertig, 'image/jpeg', qualitaet / 100),
  )
  if (!blob) throw new Error('Das Bild konnte nicht verarbeitet werden.')

  return { datei: blob, breite, hoehe }
}

async function ladeBitmap(datei: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(datei)
    } catch {
      // Manche Formate kann createImageBitmap nicht, dann über <img>
    }
  }
  return new Promise((fertig, fehler) => {
    const url = URL.createObjectURL(datei)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      fertig(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      fehler(new Error('Diese Datei ist kein Bild, das der Browser anzeigen kann.'))
    }
    img.src = url
  })
}

/** 1,4 MB statt 1468006 Bytes. */
export function formatiereGroesse(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`.replace('.', ',')
}
