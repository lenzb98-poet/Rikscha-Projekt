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

// Antippen: ein offenes Fenster der App nach vorn holen, sonst die App öffnen.
// Gehört die Mitteilung zum Chat (?ansicht=chat), springt die App dorthin.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const ziel = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href
  event.waitUntil(
    (async () => {
      const fenster = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const f of fenster) {
        if (f.url.startsWith(self.registration.scope) && 'focus' in f) {
          await f.focus()
          const ansicht = new URL(ziel).searchParams.get('ansicht')
          if (ansicht) f.postMessage({ rikschaAnsicht: ansicht })
          return
        }
      }
      await self.clients.openWindow(ziel)
    })(),
  )
})
