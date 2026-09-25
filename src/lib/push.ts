import { supabase } from './supabase'

/**
 * Push-Mitteilungen auf diesem Gerät ein- und ausschalten.
 *
 * Das Gerät meldet sich beim Push-Dienst seines Browsers an (Apple, Google,
 * Mozilla) und hinterlegt die Anschrift in der Datenbank (push_abos). Nach
 * einer Fahrt, bei der noch Angaben fehlen, und bei neuen Chat-Nachrichten
 * schickt die Edge Function push-erinnerung dorthin eine Nachricht;
 * public/sw.js zeigt sie an. Was ein Gerät bekommt, steht in push_abos
 * (fahrt, chat).
 */
export type PushZustand =
  /** Browser kann keine Push-Nachrichten */
  | 'nicht-moeglich'
  /** iPhone im Safari-Tab: geht nur als App vom Startbildschirm */
  | 'iphone-startbildschirm'
  /** Mitteilungen für die Seite blockiert */
  | 'verweigert'
  | 'aus'
  | 'an'

const SW = `${import.meta.env.BASE_URL}sw.js`

function istIPhone(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

function alsApp(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  )
}

function technischMoeglich(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

async function registrierung(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration(SW)) ?? navigator.serviceWorker.register(SW)
}

function schluesselZuBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>
}

/**
 * Firefox für Android zeigt Mitteilungen an, reicht das Antippen aber nicht an
 * die Seite weiter (bekannter Fehler in Firefox, Bugzilla 1880000 und Fenix
 * #18663/#24139): Es öffnet sich nur Firefox, nicht die App und nicht der Chat.
 * Beheben lässt sich das von der Seite aus nicht - die App weist nur darauf hin.
 */
export function istFirefoxAndroid(): boolean {
  const ua = navigator.userAgent
  return /Android/.test(ua) && /Firefox\//.test(ua)
}

export async function pushZustand(): Promise<PushZustand> {
  if (istIPhone() && !alsApp()) return 'iphone-startbildschirm'
  if (!technischMoeglich()) return 'nicht-moeglich'
  if (Notification.permission === 'denied') return 'verweigert'
  const abo = await (await registrierung()).pushManager.getSubscription()
  if (!abo || Notification.permission !== 'granted') return 'aus'
  // Das Gerät ist angemeldet - aber auch für diese Person?
  const { data } = await supabase.rpc('push_abo_status', { p_endpoint: abo.endpoint })
  return data === true ? 'an' : 'aus'
}

/** Muss direkt aus einem Tipp heraus aufgerufen werden - sonst fragt das Handy nicht nach. */
export async function pushEinschalten(): Promise<void> {
  const erlaubnis = await Notification.requestPermission()
  if (erlaubnis !== 'granted') throw new Error('Ohne deine Erlaubnis kann die App keine Mitteilungen schicken.')

  const { data: schluessel, error } = await supabase.rpc('push_vapid_schluessel')
  if (error) throw error
  if (!schluessel) throw new Error('Mitteilungen sind auf dem Server noch nicht eingerichtet.')

  const reg = await registrierung()
  await navigator.serviceWorker.ready
  let abo = await reg.pushManager.getSubscription()
  if (!abo) {
    abo = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: schluesselZuBytes(schluessel as string),
    })
  }
  const json = abo.toJSON()
  const { error: fehler } = await supabase.rpc('push_abo_speichern', {
    p_endpoint: abo.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_geraet: navigator.userAgent,
  })
  if (fehler) throw fehler
}

export async function pushAusschalten(): Promise<void> {
  const abo = await (await registrierung()).pushManager.getSubscription()
  if (!abo) return
  await supabase.rpc('push_abo_loeschen', { p_endpoint: abo.endpoint })
  await abo.unsubscribe()
}

/** Was dieses Gerät bekommt: Erinnerung nach der Fahrt, neue Chat-Nachrichten. */
export type PushOptionen = { fahrt: boolean; chat: boolean }

export async function pushOptionen(): Promise<PushOptionen | null> {
  const abo = await (await registrierung()).pushManager.getSubscription()
  if (!abo) return null
  const { data, error } = await supabase.rpc('push_abo_optionen', { p_endpoint: abo.endpoint })
  if (error) throw error
  return (data as PushOptionen | null) ?? null
}

export async function pushOptionSetzen(neu: Partial<PushOptionen>): Promise<void> {
  const abo = await (await registrierung()).pushManager.getSubscription()
  if (!abo) return
  const { error } = await supabase.rpc('push_abo_setzen', {
    p_endpoint: abo.endpoint,
    p_fahrt: neu.fahrt ?? null,
    p_chat: neu.chat ?? null,
  })
  if (error) throw error
}

/** Schickt eine Probenachricht an alle eigenen Geräte. */
export async function pushTesten(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('push-erinnerung', { body: { test: true } })
  if (error) {
    // Die Funktion liefert bei Fehlern einen deutschen Text mit
    const antwort = (error as { context?: Response }).context
    const text = antwort ? await antwort.json().catch(() => null) : null
    throw new Error(text?.fehler ?? 'Die Probenachricht ließ sich nicht senden.')
  }
  if (!data || (data as { gesendet?: number }).gesendet === 0) {
    throw new Error('Der Push-Dienst hat die Nachricht nicht angenommen. Bitte Mitteilungen aus- und wieder einschalten.')
  }
}
