/** Bildbearbeitung vor dem Hochladen. */

export const MAX_KANTE = 1600
export const QUALITAET = 0.82

export type VerkleinertesBild = {
  datei: Blob
  breite: number
  hoehe: number
}

/**
 * Verkleinert ein Foto auf höchstens 1600 px Kantenlänge und speichert es als
 * JPEG. Handyfotos sind sonst schnell mehrere Megabyte groß und der Speicher
 * wäre nach wenigen Dutzend Bildern voll.
 */
export async function verkleinereBild(datei: File): Promise<VerkleinertesBild> {
  const bitmap = await ladeBitmap(datei)

  const faktor = Math.min(1, MAX_KANTE / Math.max(bitmap.width, bitmap.height))
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
    canvas.toBlob(fertig, 'image/jpeg', QUALITAET),
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
