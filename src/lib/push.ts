import { supabase } from './supabase'

/**
 * Push-Erinnerungen auf diesem Gerät ein- und ausschalten.
 *
 * Das Gerät meldet sich beim Push-Dienst seines Browsers an (Apple, Google,
 * Mozilla) und hinterlegt die Anschrift in der Datenbank (push_abos). Nach
 * einer Fahrt, bei der noch Angaben fehlen, schickt die Edge Function
 * push-erinnerung dorthin eine Nachricht; public/sw.js zeigt sie an.
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
  if (erlaubnis !== 'granted') throw new Error('Ohne deine Erlaubnis kann die App keine Erinnerungen schicken.')

  const { data: schluessel, error } = await supabase.rpc('push_vapid_schluessel')
  if (error) throw error
  if (!schluessel) throw new Error('Erinnerungen sind auf dem Server noch nicht eingerichtet.')

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
    throw new Error('Der Push-Dienst hat die Nachricht nicht angenommen. Bitte Erinnerungen aus- und wieder einschalten.')
  }
}
