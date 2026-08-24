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

const ANLEITUNG: Record<Exclude<System, 'desktop'>, { titel: string; schritte: string[] }> = {
  ios: {
    titel: 'iPhone und iPad',
    schritte: [
      'Diese Seite in <strong>Safari</strong> öffnen.',
      'Unten (auf dem iPad oben) auf das <strong>Teilen-Symbol</strong> tippen – das Quadrat mit dem Pfeil nach oben.',
      'In der Liste nach unten wischen und <strong>„Zum Home-Bildschirm“</strong> wählen.',
      'Oben rechts auf <strong>„Hinzufügen“</strong> tippen.',
    ],
  },
  android: {
    titel: 'Android',
    schritte: [
      'Diese Seite in <strong>Chrome</strong> öffnen.',
      'Oben rechts auf das <strong>Menü</strong> tippen – die drei Punkte.',
      '<strong>„App installieren“</strong> wählen. Steht das nicht da, <strong>„Zum Startbildschirm hinzufügen“</strong> nehmen.',
      'Mit <strong>„Installieren“</strong> bestätigen.',
    ],
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
