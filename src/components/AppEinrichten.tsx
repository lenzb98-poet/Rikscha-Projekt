import { useState } from 'react'
import { RadelnLogo } from './Marke'

type System = 'ios' | 'android' | 'desktop'

/** Welches Gerät sitzt davor? Bestimmt nur, welche Anleitung zuerst kommt. */
function erkenneSystem(): System {
  const ua = navigator.userAgent
  // iPadOS meldet sich seit Version 13 als Mac; der Touchscreen verrät es
  const istIPad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  if (/iPhone|iPad|iPod/.test(ua) || istIPad) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

/** Läuft die Seite bereits als App vom Startbildschirm? */
function laeuftAlsApp(): boolean {
  const alsApp = window.matchMedia?.('(display-mode: standalone)').matches
  // Safari auf dem iPhone nutzt eine eigene Kennzeichnung
  const iosApp = (navigator as { standalone?: boolean }).standalone === true
  return Boolean(alsApp || iosApp)
}

type Anleitung = { titel: string; schritte: string[]; hinweis?: string }

const ANLEITUNG: Record<Exclude<System, 'desktop'>, Anleitung> = {
  ios: {
    titel: 'iPhone und iPad',
    schritte: [
      'Diese Seite in <strong>Safari</strong> öffnen.',
      'Unten (auf dem iPad oben) auf das <strong>Teilen-Symbol</strong> tippen – das Quadrat mit dem Pfeil nach oben.',
      'In der Liste nach unten wischen und <strong>„Zum Home-Bildschirm“</strong> wählen.',
      'Oben rechts auf <strong>„Hinzufügen“</strong> tippen.',
    ],
    hinweis:
      'Auf dem iPhone klappt das am zuverlässigsten mit Safari. Nutzt du sonst ' +
      'einen anderen Browser, öffne die Seite für diesen einen Schritt in Safari.',
  },
  android: {
    titel: 'Android',
    schritte: [
      'Diese Seite in deinem Browser öffnen – <strong>Chrome</strong>, <strong>Samsung Internet</strong>, <strong>Firefox</strong>, <strong>Edge</strong> oder <strong>Opera</strong>.',
      'Das <strong>Menü</strong> öffnen: bei Chrome, Firefox und Opera die <strong>drei Punkte</strong>, bei Samsung Internet und Edge die <strong>drei Striche</strong>. Je nach Browser sitzt es oben rechts oder unten.',
      'Den Eintrag mit <strong>„installieren“</strong> oder <strong>„Startbildschirm“</strong> wählen – er heißt je nach Browser „App installieren“, „Zum Startbildschirm hinzufügen“ oder „Seite hinzufügen zu“.',
      'Bestätigen, fertig.',
    ],
    hinweis:
      'Alle gängigen Android-Browser können das. Nur die Beschriftung und die ' +
      'Stelle des Menüs sind etwas anders – der Weg ist überall derselbe.',
  },
}

export function AppEinrichten() {
  const [offen, setOffen] = useState(false)
  const system = erkenneSystem()

  // Schon als App gestartet? Dann ist hier nichts mehr zu tun.
  if (laeuftAlsApp()) return null

  // Passende Anleitung zuerst
  const reihenfolge: Exclude<System, 'desktop'>[] =
    system === 'android' ? ['android', 'ios'] : ['ios', 'android']

  return (
    <>
      <div className="einrichten">
        <button className="btn btn--ghost" onClick={() => setOffen(true)}>
          📲 App auf dem Handy einrichten
        </button>
      </div>

      {offen && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="einrichten-titel"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOffen(false)
          }}
        >
          <div className="overlay__card">
            <div className="einrichten__kopf">
              <RadelnLogo className="einrichten__logo" />
              <div>
                <h3 id="einrichten-titel">App einrichten</h3>
                <p className="muted einrichten__unter">
                  Die Seite lässt sich wie eine App auf dem Startbildschirm ablegen – mit
                  eigenem Symbol und ohne Adressleiste.
                </p>
              </div>
            </div>

            {system === 'desktop' && (
              <p className="alert alert--warn">
                Du bist gerade am Rechner. Öffne diese Seite auf dem Handy, um die App dort
                einzurichten.
              </p>
            )}

            {reihenfolge.map((s, i) => (
              <section key={s} className="einrichten__block">
                <h4>
                  {ANLEITUNG[s].titel}
                  {s === system && <span className="einrichten__marke">dein Gerät</span>}
                </h4>
                <ol className="einrichten__schritte">
                  {ANLEITUNG[s].schritte.map((schritt, n) => (
                    <li key={n} dangerouslySetInnerHTML={{ __html: schritt }} />
                  ))}
                </ol>
                {ANLEITUNG[s].hinweis && (
                  <p className="hint einrichten__browser">{ANLEITUNG[s].hinweis}</p>
                )}
                {i === 0 && reihenfolge.length > 1 && <hr className="einrichten__trenner" />}
              </section>
            ))}

            <p className="hint einrichten__hinweis">
              Zum Anmelden ist weiterhin eine Internetverbindung nötig.
            </p>

            <div className="overlay__actions">
              <button className="btn" onClick={() => setOffen(false)}>
                Verstanden
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
