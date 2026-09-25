// Service Worker der Rikscha-App - nur für Push-Nachrichten.
//
// Er zeigt die Erinnerung "Wie war die Fahrt?" und neue Chat-Nachrichten an,
// auch wenn die App gerade geschlossen ist, und öffnet sie beim Antippen. Einen Offline-Zwischenspeicher
// gibt es bewusst nicht: Die App soll immer den neuesten Stand laden.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let daten = {}
  try {
    daten = event.data ? event.data.json() : {}
  } catch {
    daten = { text: event.data ? event.data.text() : '' }
  }
  const symbol = new URL('icons/icon-192.png', self.registration.scope).href
  const optionen = {
    body: daten.text || '',
    icon: symbol,
    badge: symbol,
    lang: 'de',
    data: { url: daten.url || './' },
  }
  // Chat: eine neue Mitteilung ersetzt die vorige, statt sich zu stapeln
  if (daten.thema === 'chat') {
    optionen.tag = 'chat'
    optionen.renotify = true
  }
  event.waitUntil(self.registration.showNotification(daten.titel || 'Rikscha-Fahrten', optionen))
})

// Antippen: die App öffnen - bei einer Chat-Mitteilung gleich im Chat.
//
// Ein offenes Fenster wird nur nach vorn geholt, wenn es die installierte App
// ist. Ein Browser-Tab mit der Seite zählt nicht: Holte man ihn nach vorn,
// öffnete Android den Browser statt der App. Welches Fenster die App ist, weiß
// nur das Fenster selbst - deshalb fragt der Service Worker nach (Antwort aus
// src/main.tsx). Sonst öffnet er die Adresse neu; Android gibt sie an die
// installierte App weiter, am Rechner öffnet sich ein Tab.
//
// Jeder Schritt hat einen Ersatz: Scheitert das Nach-vorn-Holen, etwa weil
// Android die App im Hintergrund schon beendet hat, öffnet er neu.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const ziel = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href
  const ansicht = new URL(ziel).searchParams.get('ansicht')
  event.waitUntil(oeffnen(ziel, ansicht))
})

async function oeffnen(ziel, ansicht) {
  const fenster = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter((f) =>
    f.url.startsWith(self.registration.scope),
  )

  // 1. Die installierte App ist schon offen: nach vorn holen
  for (const f of fenster) {
    if (!(await istApp(f))) continue
    try {
      const vorn = await f.focus()
      if (ansicht) (vorn || f).postMessage({ rikschaAnsicht: ansicht })
      return
    } catch {
      // weiter mit dem nächsten Weg
    }
  }

  // 2. Neu öffnen - auf dem Handy in der App, am Rechner als Tab
  try {
    if (await self.clients.openWindow(ziel)) return
  } catch {
    // weiter mit dem nächsten Weg
  }

  // 3. Notfalls ein offener Browser-Tab mit der Seite
  for (const f of fenster) {
    try {
      const vorn = await f.focus()
      if (ansicht) (vorn || f).postMessage({ rikschaAnsicht: ansicht })
      return
    } catch {
      // nächstes Fenster
    }
  }
}

/** Fragt ein Fenster, ob es die installierte App ist. Keine Antwort gilt als Nein. */
function istApp(fenster) {
  return new Promise((antwort) => {
    const kanal = new MessageChannel()
    const zeit = setTimeout(() => antwort(false), 400)
    kanal.port1.onmessage = (e) => {
      clearTimeout(zeit)
      antwort(Boolean(e.data && e.data.app))
    }
    try {
      fenster.postMessage({ rikschaFrage: 'app?' }, [kanal.port2])
    } catch {
      clearTimeout(zeit)
      antwort(false)
    }
  })
}
