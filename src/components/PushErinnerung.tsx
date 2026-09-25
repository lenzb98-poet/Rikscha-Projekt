import { useEffect, useState } from 'react'
import {
  pushAusschalten,
  pushEinschalten,
  pushOptionen,
  pushOptionSetzen,
  pushTesten,
  pushZustand,
  type PushOptionen,
  type PushZustand,
} from '../lib/push'
import { toGermanError } from '../lib/errors'

/**
 * "Mitteilungen aufs Handy" auf der Startseite: einschalten, wählen was kommt
 * (Erinnerung nach der Fahrt, neue Chat-Nachrichten), testen, ausschalten.
 * Gilt je Gerät - wer Handy und Rechner nutzt, schaltet beide einzeln ein.
 */
export function PushErinnerung() {
  const [zustand, setZustand] = useState<PushZustand | null>(null)
  const [busy, setBusy] = useState(false)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [optionen, setOptionen] = useState<PushOptionen | null>(null)

  useEffect(() => {
    pushZustand()
      .then(setZustand)
      .catch(() => setZustand('nicht-moeglich'))
  }, [])

  useEffect(() => {
    if (zustand !== 'an') return
    pushOptionen()
      .then(setOptionen)
      .catch(() => setOptionen(null))
  }, [zustand])

  async function umschalten(neu: Partial<PushOptionen>) {
    if (!optionen) return
    const vorher = optionen
    setOptionen({ ...optionen, ...neu })
    setError(null)
    setHinweis(null)
    try {
      await pushOptionSetzen(neu)
    } catch (err) {
      setOptionen(vorher)
      setError(toGermanError(err))
    }
  }

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
      <h3>🔔 Mitteilungen aufs Handy</h3>
      <p className="muted card__text">
        Die App meldet sich kurz, wenn nach einer Fahrt noch deine Angaben fehlen oder im Chat
        etwas Neues steht.
      </p>

      {zustand === 'an' && (
        <>
          <p className="erinnerung__status">✓ Auf diesem Gerät eingeschaltet</p>
          {optionen && (
            <div className="erinnerung__wahl">
              <label className="check check--schlank">
                <input
                  type="checkbox"
                  checked={optionen.fahrt}
                  onChange={(e) => umschalten({ fahrt: e.target.checked })}
                />
                <span>
                  <strong>Erinnerung nach der Fahrt</strong>
                  <span className="check__hint">45 Minuten nach Fahrtbeginn, falls noch Angaben fehlen</span>
                </span>
              </label>
              <label className="check check--schlank">
                <input
                  type="checkbox"
                  checked={optionen.chat}
                  onChange={(e) => umschalten({ chat: e.target.checked })}
                />
                <span>
                  <strong>Neue Chat-Nachrichten</strong>
                  <span className="check__hint">Wer geschrieben hat und der Anfang der Nachricht</span>
                </span>
              </label>
            </div>
          )}
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
              onClick={() => ausfuehren(pushAusschalten, 'Mitteilungen sind auf diesem Gerät ausgeschaltet.')}
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
          {busy ? 'Einen Moment …' : 'Mitteilungen einschalten'}
        </button>
      )}

      {zustand === 'verweigert' && (
        <p className="hint erinnerung__hinweis">
          Mitteilungen für diese Seite sind blockiert. Erlaube sie in den Einstellungen deines
          Browsers oder Handys, dann kannst du die Mitteilungen hier einschalten.
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
          Dieser Browser kann leider keine Mitteilungen empfangen.
        </p>
      )}

      {hinweis && <p className="alert alert--ok">{hinweis}</p>}
      {error && <p className="alert alert--error">{error}</p>}
    </section>
  )
}
