import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'

/**
 * Das Logo der Organisation, von der Administration hochgeladen.
 *
 * Es erscheint oben in der Leiste und auf der Anmeldeseite. Beide lesen
 * denselben Stand; lädt die Administration ein neues hoch, wechselt es überall
 * sofort, ohne die Seite neu zu laden.
 *
 * Die zuletzt bekannte Adresse merkt sich der Browser. So steht beim nächsten
 * Öffnen gleich das richtige Logo da, statt kurz das alte aufblitzen zu lassen.
 */
export const LOGO_BUCKET = 'vereinslogo'
export const LOGO_MAX_BYTES = 2 * 1024 * 1024
export const LOGO_TYPEN = ['image/png', 'image/jpeg', 'image/webp']

const MERKEN = 'rikscha.vereinslogo'

/** undefined: noch unbekannt, null: kein eigenes Logo, sonst die Adresse. */
type Stand = string | null | undefined

let stand: Stand = gemerkt()
let geladen = false
const hoerer = new Set<() => void>()

function gemerkt(): Stand {
  try {
    const wert = localStorage.getItem(MERKEN)
    if (wert === null) return undefined
    return wert === '' ? null : wert
  } catch {
    return undefined
  }
}

function setze(neu: string | null) {
  stand = neu
  try {
    localStorage.setItem(MERKEN, neu ?? '')
  } catch {
    // Ohne Speicher wird das Logo eben bei jedem Öffnen neu erfragt
  }
  hoerer.forEach((h) => h())
}

function adresse(pfad: string | null): string | null {
  if (!pfad) return null
  return supabase.storage.from(LOGO_BUCKET).getPublicUrl(pfad).data.publicUrl
}

/** Fragt das Logo einmal pro Seitenaufruf ab. */
async function lade() {
  if (geladen) return
  geladen = true
  const { data, error } = await supabase.rpc('vereinslogo')
  if (error) {
    // Datenbank noch ohne Logo-Funktion oder offline: beim Standard bleiben
    geladen = false
    if (stand === undefined) setze(null)
    return
  }
  setze(adresse((data as string | null) ?? null))
}

function abonniere(h: () => void) {
  hoerer.add(h)
  void lade()
  return () => hoerer.delete(h)
}

/** Adresse des eigenen Logos, null ohne eigenes, undefined solange unbekannt. */
export function useVereinslogo(): Stand {
  return useSyncExternalStore(abonniere, () => stand)
}

/** Prüft die Datei, bevor sie hochgeladen wird. Liefert den Grund oder null. */
export function pruefeLogo(datei: File): string | null {
  if (!LOGO_TYPEN.includes(datei.type)) {
    return 'Bitte ein Bild als PNG, JPG oder WebP wählen.'
  }
  if (datei.size > LOGO_MAX_BYTES) {
    return 'Das Bild ist größer als 2 MB. Bitte eine kleinere Datei wählen.'
  }
  return null
}

/**
 * Lädt ein neues Logo hoch und setzt es.
 *
 * Jede Datei bekommt einen neuen Namen. Sonst zeigte der Browser, der das alte
 * Bild zwischengespeichert hat, unter derselben Adresse weiter das alte.
 */
export async function logoHochladen(datei: File): Promise<void> {
  const endung = datei.type === 'image/png' ? 'png' : datei.type === 'image/webp' ? 'webp' : 'jpg'
  const pfad = `logo-${Date.now()}.${endung}`

  const { error: hoch } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(pfad, datei, { contentType: datei.type, upsert: false })
  if (hoch) throw hoch

  const { data: alt, error } = await supabase.rpc('vereinslogo_setzen', { p_pfad: pfad })
  if (error) {
    // Nicht gesetzt: die frische Datei nicht verwaist liegen lassen
    await supabase.storage.from(LOGO_BUCKET).remove([pfad])
    throw error
  }

  setze(adresse(pfad))
  await entferneDatei(alt as string | null)
}

/** Zurück zum Standard-Logo. */
export async function logoEntfernen(): Promise<void> {
  const { data: alt, error } = await supabase.rpc('vereinslogo_setzen', { p_pfad: null })
  if (error) throw error
  setze(null)
  await entferneDatei(alt as string | null)
}

/** Die alte Datei ist nur noch Ballast; scheitert das Löschen, bleibt sie eben. */
async function entferneDatei(pfad: string | null) {
  if (!pfad) return
  await supabase.storage.from(LOGO_BUCKET).remove([pfad])
}
