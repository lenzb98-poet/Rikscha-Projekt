import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'

/**
 * Das Erscheinungsbild der Organisation: Logo, Akzentfarbe und Name der App,
 * alle von der Administration in den Admin Einstellungen festgelegt.
 *
 * Alle Stellen lesen denselben Stand. Ändert die Administration etwas, wechselt
 * es überall sofort, ohne die Seite neu zu laden.
 *
 * Der zuletzt bekannte Stand liegt im Browser. So stehen beim nächsten Öffnen
 * gleich das richtige Logo und die richtige Farbe da, statt kurz die alten
 * aufblitzen zu lassen.
 */
export const LOGO_BUCKET = 'vereinslogo'
export const LOGO_MAX_BYTES = 2 * 1024 * 1024
export const LOGO_TYPEN = ['image/png', 'image/jpeg', 'image/webp']

/** Das Blau des Vereins - gilt, solange keine eigene Farbe gewählt ist. */
export const STANDARDFARBE = '#245892'
/** Name der App, solange kein eigener gewählt ist. */
export const STANDARDNAME = 'Rikscha-Fahrten'
export const NAME_MAX = 40
/** Mindestkontrast für weiße Schrift auf der Akzentfarbe (WCAG AA). */
export const MIN_KONTRAST = 4.5

const MERKEN = 'rikscha.erscheinungsbild'

/** undefined: noch unbekannt, null: Standard, sonst der eigene Wert. */
type Stand = {
  logo: string | null | undefined
  farbe: string | null | undefined
  name: string | null | undefined
}

let stand: Stand = gemerkt()
let geladen = false
const hoerer = new Set<() => void>()

// Die gemerkte Farbe und den Namen gleich beim Start setzen, noch bevor
// React zeichnet
wendeFarbeAn(stand.farbe ?? null)
wendeNamenAn(stand.name ?? null)

function gemerkt(): Stand {
  try {
    const roh = localStorage.getItem(MERKEN)
    if (roh === null) return { logo: undefined, farbe: undefined, name: undefined }
    const w = JSON.parse(roh) as { logo?: string | null; farbe?: string | null; name?: string | null }
    return { logo: w.logo ?? null, farbe: w.farbe ?? null, name: w.name ?? null }
  } catch {
    return { logo: undefined, farbe: undefined, name: undefined }
  }
}

function setze(neu: Partial<Stand>) {
  stand = { ...stand, ...neu }
  if ('farbe' in neu) wendeFarbeAn(stand.farbe ?? null)
  if ('name' in neu) wendeNamenAn(stand.name ?? null)
  try {
    localStorage.setItem(
      MERKEN,
      JSON.stringify({
        logo: stand.logo ?? null,
        farbe: stand.farbe ?? null,
        name: stand.name ?? null,
      }),
    )
  } catch {
    // Ohne Speicher wird das Erscheinungsbild eben bei jedem Öffnen neu erfragt
  }
  hoerer.forEach((h) => h())
}

function logoAdresse(pfad: string | null): string | null {
  if (!pfad) return null
  return supabase.storage.from(LOGO_BUCKET).getPublicUrl(pfad).data.publicUrl
}

/** Fragt das Erscheinungsbild einmal pro Seitenaufruf ab. */
async function lade() {
  if (geladen) return
  geladen = true
  const { data, error } = await supabase.rpc('erscheinungsbild')
  if (error) {
    // Datenbank noch ohne die Funktion oder offline: beim Bekannten bleiben
    geladen = false
    setze({ logo: stand.logo ?? null, farbe: stand.farbe ?? null, name: stand.name ?? null })
    return
  }
  const zeile = (Array.isArray(data) ? data[0] : data) as
    | { logo_pfad: string | null; akzentfarbe: string | null; app_name?: string | null }
    | undefined
  setze({
    logo: logoAdresse(zeile?.logo_pfad ?? null),
    farbe: zeile?.akzentfarbe ?? null,
    name: zeile?.app_name ?? null,
  })
}

function abonniere(h: () => void) {
  hoerer.add(h)
  void lade()
  return () => hoerer.delete(h)
}

/** Adresse des eigenen Logos, null ohne eigenes, undefined solange unbekannt. */
export function useVereinslogo(): string | null | undefined {
  return useSyncExternalStore(abonniere, () => stand.logo)
}

/** Die eigene Akzentfarbe, null für das Standardblau, undefined solange unbekannt. */
export function useAkzentfarbe(): string | null | undefined {
  return useSyncExternalStore(abonniere, () => stand.farbe)
}

/** Der eigene Name der App, null für „Rikscha-Fahrten“, undefined solange unbekannt. */
export function useAppName(): string | null | undefined {
  return useSyncExternalStore(abonniere, () => stand.name)
}

/* --- Name ---------------------------------------------------------------- */

/** Speichert den Namen; null oder leer stellt „Rikscha-Fahrten“ wieder her. */
export async function appNameSetzen(name: string | null): Promise<void> {
  const { data, error } = await supabase.rpc('app_name_setzen', { p_name: name?.trim() || null })
  if (error) throw error
  setze({ name: (data as string | null) ?? null })
}

/** Der Browser-Tab trägt denselben Namen wie die Anmeldeseite. */
function wendeNamenAn(name: string | null) {
  if (typeof document === 'undefined') return
  document.title = name ?? STANDARDNAME
}

/* --- Logo ---------------------------------------------------------------- */

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

  setze({ logo: logoAdresse(pfad) })
  await entferneDatei(alt as string | null)
}

/** Entfernt das Logo; danach bleibt der Platz leer. */
export async function logoEntfernen(): Promise<void> {
  const { data: alt, error } = await supabase.rpc('vereinslogo_setzen', { p_pfad: null })
  if (error) throw error
  setze({ logo: null })
  await entferneDatei(alt as string | null)
}

/** Die alte Datei ist nur noch Ballast; scheitert das Löschen, bleibt sie eben. */
async function entferneDatei(pfad: string | null) {
  if (!pfad) return
  await supabase.storage.from(LOGO_BUCKET).remove([pfad])
}

/* --- Akzentfarbe --------------------------------------------------------- */

/** Speichert die Akzentfarbe; null stellt das Standardblau wieder her. */
export async function akzentfarbeSetzen(farbe: string | null): Promise<void> {
  if (farbe !== null && kontrastZuWeiss(farbe) < MIN_KONTRAST) {
    throw new Error('Auf dieser Farbe wäre weiße Schrift nicht gut lesbar. Bitte eine dunklere wählen.')
  }
  const { data, error } = await supabase.rpc('akzentfarbe_setzen', { p_farbe: farbe })
  if (error) throw error
  setze({ farbe: (data as string | null) ?? null })
}

/** '#1A4 270' und ähnliches zu '#1a4270'; null, wenn es keine Farbe ist. */
export function normalisiereFarbe(eingabe: string): string | null {
  let s = eingabe.trim().toLowerCase().replace(/\s+/g, '')
  if (!s.startsWith('#')) s = `#${s}`
  if (/^#[0-9a-f]{3}$/.test(s)) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`
  return /^#[0-9a-f]{6}$/.test(s) ? s : null
}

type Rgb = [number, number, number]

function zuRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function zuHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((k) => Math.round(k).toString(16).padStart(2, '0')).join('')}`
}

/** Mischt die Farbe mit einer zweiten; anteil 0 = unverändert, 1 = ganz die zweite. */
function mische(hex: string, mit: Rgb, anteil: number): string {
  const f = zuRgb(hex)
  return zuHex([0, 1, 2].map((i) => f[i] + (mit[i] - f[i]) * anteil) as Rgb)
}

/** Kontrastverhältnis zu Weiß nach WCAG, zwischen 1 und 21. */
export function kontrastZuWeiss(hex: string): number {
  const [r, g, b] = zuRgb(hex).map((k) => {
    const c = k / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return 1.05 / (l + 0.05)
}

/**
 * Die Abstufungen, die das Stylesheet braucht. Die Anteile sind so gewählt,
 * dass aus dem Standardblau fast die bisherigen Töne werden. Ohne eigene Farbe
 * wird ohnehin nichts gesetzt, dann gelten genau die Werte im Stylesheet.
 */
export function farbstufen(hex: string) {
  return {
    '--blau': hex,
    '--blau-dunkel': mische(hex, [0, 0, 0], 0.25),
    '--blau-hell': mische(hex, [255, 255, 255], 0.1),
    '--blau-zart': mische(hex, [255, 255, 255], 0.9),
  }
}

/** Setzt die Farbe für die ganze Seite; null entfernt sie wieder (Stylesheet gilt). */
function wendeFarbeAn(farbe: string | null) {
  if (typeof document === 'undefined') return
  const wurzel = document.documentElement
  const stufen = farbstufen(farbe ?? STANDARDFARBE)
  for (const [name, wert] of Object.entries(stufen)) {
    if (farbe) wurzel.style.setProperty(name, wert)
    else wurzel.style.removeProperty(name)
  }
  // Die Statusleiste des Handys färbt sich mit
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', farbe ?? STANDARDFARBE)
}
