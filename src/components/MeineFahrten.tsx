import { useState } from 'react'
import { rideAddNote, rideSignoff, formatiereTermin, type Fahrt } from '../lib/fahrten'
import { toGermanError } from '../lib/errors'

/**
 * Meldung ganz oben auf der Startseite: zu welchen Fahrten die angemeldete
 * Person eingetragen ist. Dort lässt sich auch etwas mitteilen oder absagen.
 */
type Props = {
  /** Alle Fahrten; gefiltert wird hier. null heißt: noch nicht geladen. */
  alle: Fahrt[] | null
  /** Nach einer Änderung neu laden. */
  onAktualisiert: () => void
}

export function MeineFahrten({ alle, onAktualisiert }: Props) {
  const [offenesFeld, setOffenesFeld] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const fahrten = (alle ?? []).filter(
    (f) => f.bin_dabei && f.zustand !== 'abgeschlossen' && f.zustand !== 'abgesagt',
  )

  if (fahrten.length === 0) return null

  function feldOeffnen(id: string) {
    setOffenesFeld((offen) => (offen === id ? null : id))
    setText('')
    setError(null)
  }

  async function mitteilen(f: Fahrt) {
    if (!text.trim()) return
    setError(null)
    setBusy(true)
    try {
      await rideAddNote(f.id, text)
      setText('')
      setOffenesFeld(null)
      setHinweis('Deine Mitteilung ist bei der Koordination angekommen.')
      onAktualisiert()
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(false)
    }
  }

  async function absagen(f: Fahrt) {
    setError(null)
    setBusy(true)
    try {
      await rideSignoff(f.id, text)
      setText('')
      setOffenesFeld(null)
      setHinweis(`Du bist für die Fahrt am ${formatiereTermin(f.starts_at)} abgemeldet.`)
      onAktualisiert()
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="meine">
      <h3>
        {fahrten.length === 1
          ? 'Du bist zu einer Fahrt angemeldet'
          : `Du bist zu ${fahrten.length} Fahrten angemeldet`}
      </h3>

      {hinweis && <p className="alert alert--ok">{hinweis}</p>}

      {fahrten.map((f) => (
        <div key={f.id} className="meine__fahrt">
          <div className="meine__kopf">
            <div>
              <div className="fahrt__termin">{formatiereTermin(f.starts_at)}</div>
              <div className="fahrt__ort">{f.location}</div>
              {f.piloten.length > 1 && (
                <div className="muted meine__mit">
                  Gemeinsam mit {f.piloten.map((p) => p.name).join(', ')}
                </div>
              )}
            </div>
            <span className={`chip chip--${f.zustand}`}>
              {f.zustand === 'besetzt' ? 'Zugesagt' : 'Offen'}
            </span>
          </div>

          {offenesFeld === f.id ? (
            <div className="meine__feld">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                maxLength={1000}
                autoFocus
                placeholder="Was möchtest du der Koordination mitteilen? Zum Beispiel, dass du doch nicht kannst."
              />
              {error && <p className="alert alert--error">{error}</p>}
              <div className="meine__knoepfe">
                <button className="btn btn--ghost" onClick={() => feldOeffnen(f.id)} disabled={busy}>
                  Abbrechen
                </button>
                <button className="btn" onClick={() => mitteilen(f)} disabled={busy || !text.trim()}>
                  Mitteilen
                </button>
                <button className="btn btn--danger" onClick={() => absagen(f)} disabled={busy}>
                  Absagen
                </button>
              </div>
              <span className="hint">
                „Absagen“ trägt dich aus der Fahrt aus. Steht etwas im Feld, wird es als
                Mitteilung mitgeschickt.
              </span>
            </div>
          ) : (
            <button className="btn btn--ghost" onClick={() => feldOeffnen(f.id)}>
              Mitteilen oder absagen
            </button>
          )}
        </div>
      ))}
    </section>
  )
}
