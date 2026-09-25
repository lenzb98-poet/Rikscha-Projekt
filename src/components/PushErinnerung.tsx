import { useEffect, useState } from 'react'
import { pushAusschalten, pushEinschalten, pushTesten, pushZustand, type PushZustand } from '../lib/push'
import { toGermanError } from '../lib/errors'

/**
 * "Erinnerung nach der Fahrt" auf der Startseite: einschalten, testen,
 * ausschalten. Gilt je Gerät - wer Handy und Rechner nutzt, schaltet beide
 * einzeln ein.
 */
export function PushErinnerung() {
  const [zustand, setZustand] = useState<PushZustand | null>(null)
  const [busy, setBusy] = useState(false)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    pushZustand()
      .then(setZustand)
      .catch(() => setZustand('nicht-moeglich'))
  }, [])

  async function ausfuehren(aktion: () => Promise<void>, erfolg: string) {
    setBusy(true)
    setError(null)
    setHinweis(null)
    try {
      await aktion()
      setHinweis(erfolg)
    } catch (err) {
      if (err instanceof DOMException) {
        // Kommt vom Browser selbst, meist auf Englisch
        setError(
          'Die Anmeldung für Mitteilungen hat nicht geklappt. Bitte erlaube Mitteilungen für diese Seite und versuche es noch einmal.',
        )
      } else {
        setError(err instanceof Error && !('code' in err) ? err.message : toGermanError(err))
      }
    } finally {
      setZustand(await pushZustand().catch(() => 'nicht-moeglich' as const))
      setBusy(false)
    }
  }

  if (zustand === null) return null

  return (
    <section className="card erinnerung">
      <h3>🔔 Erinnerung nach der Fahrt</h3>
      <p className="muted card__text">
        Fehlen nach einer Fahrt noch deine Angaben, schickt dir die App eine kurze Nachricht aufs
        Handy.
      </p>

      {zustand === 'an' && (
        <>
          <p className="erinnerung__status">✓ Auf diesem Gerät eingeschaltet</p>
          <div className="erinnerung__knoepfe">
            <button
              className="btn btn--ghost"
              disabled={busy}
              onClick={() => ausfuehren(pushTesten, 'Die Probenachricht ist unterwegs – sie sollte gleich erscheinen.')}
            >
              {busy ? 'Einen Moment …' : 'Probenachricht senden'}
            </button>
            <button
              className="btn btn--link"
              disabled={busy}
              onClick={() => ausfuehren(pushAusschalten, 'Erinnerungen sind auf diesem Gerät ausgeschaltet.')}
            >
              Ausschalten
            </button>
          </div>
        </>
      )}

      {zustand === 'aus' && (
        <button
          className="btn"
          disabled={busy}
          onClick={() => ausfuehren(pushEinschalten, 'Eingeschaltet! Du kannst jetzt eine Probenachricht senden.')}
        >
          {busy ? 'Einen Moment …' : 'Erinnerungen einschalten'}
        </button>
      )}

      {zustand === 'verweigert' && (
        <p className="hint erinnerung__hinweis">
          Mitteilungen für diese Seite sind blockiert. Erlaube sie in den Einstellungen deines
          Browsers oder Handys, dann kannst du die Erinnerungen hier einschalten.
        </p>
      )}

      {zustand === 'iphone-startbildschirm' && (
        <p className="hint erinnerung__hinweis">
          Auf dem iPhone geht das nur, wenn die App auf dem Startbildschirm liegt – tippe dazu
          ganz unten auf „App auf dem Handy einrichten“ und öffne die App danach von dort.
        </p>
      )}

      {zustand === 'nicht-moeglich' && (
        <p className="hint erinnerung__hinweis">
          Dieser Browser kann leider keine Erinnerungen empfangen.
        </p>
      )}

      {hinweis && <p className="alert alert--ok">{hinweis}</p>}
      {error && <p className="alert alert--error">{error}</p>}
    </section>
  )
}
