import { useState } from 'react'
import {
  bookSlot,
  formatiereTermin,
  releaseSlot,
  type Fahrt,
  type Platz,
} from '../lib/fahrten'
import { toGermanError } from '../lib/errors'

type Props = {
  fahrt: Fahrt
  platz: Platz
  onClose: () => void
  onGebucht: (text: string) => void
}

/** Einen einzelnen Rikscha-Platz buchen oder wieder freigeben. */
export function PlatzDialog({ fahrt, platz, onClose, onGebucht }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const vergeben = platz.pilot_id !== null
  const schonDabei = fahrt.plaetze.some((p) => p.ist_meiner)
  const vorbei = new Date(fahrt.starts_at) < new Date()
  const abgesagt = fahrt.status === 'abgesagt'

  async function handeln(aktion: 'buchen' | 'freigeben') {
    setError(null)
    setBusy(true)
    try {
      if (aktion === 'buchen') {
        await bookSlot(platz.id)
        onGebucht(
          `Du bist als Pilot:in für Rikscha ${platz.position} eingetragen – ` +
            `${formatiereTermin(fahrt.starts_at)}.`,
        )
      } else {
        await releaseSlot(platz.id)
        onGebucht(`Rikscha ${platz.position} ist wieder frei.`)
      }
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="platz-titel"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="overlay__card">
        <h3 id="platz-titel">Rikscha {platz.position}</h3>
        <p className="muted overlay__intro">
          {formatiereTermin(fahrt.starts_at)}
          <br />
          {fahrt.location}
        </p>

        {fahrt.info && <p className="platz__info">{fahrt.info}</p>}

        <div className="platz__stand">
          <strong>
            Rikscha {platz.position} von {fahrt.plaetze.length}
          </strong>
          <span>
            {platz.ist_meiner
              ? 'Du bist hier eingetragen.'
              : vergeben
                ? `Vergeben an ${platz.pilot_name}.`
                : 'Dieser Platz ist frei.'}
          </span>
        </div>

        {fahrt.plaetze.length > 1 && (
          <ul className="platz__liste">
            {fahrt.plaetze.map((p) => (
              <li key={p.id} className={p.id === platz.id ? 'platz__zeile platz__zeile--aktiv' : 'platz__zeile'}>
                <span>Rikscha {p.position}</span>
                <span className={p.pilot_id ? '' : 'muted'}>
                  {p.pilot_name ?? 'frei'}
                  {p.ist_meiner && ' (du)'}
                </span>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="alert alert--error">{error}</p>}

        {abgesagt && <p className="alert alert--warn">Diese Fahrt wurde abgesagt.</p>}
        {!abgesagt && vorbei && (
          <p className="alert alert--warn">Diese Fahrt liegt in der Vergangenheit.</p>
        )}
        {!abgesagt && !vorbei && !vergeben && schonDabei && (
          <p className="alert alert--warn">
            Du bist für diese Fahrt schon auf einer anderen Rikscha eingetragen.
          </p>
        )}

        <div className="overlay__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Schließen
          </button>

          {platz.ist_meiner ? (
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => handeln('freigeben')}
              disabled={busy}
            >
              {busy ? 'Gebe frei …' : 'Platz freigeben'}
            </button>
          ) : (
            !vergeben &&
            !vorbei &&
            !abgesagt &&
            !schonDabei && (
              <button
                type="button"
                className="btn"
                onClick={() => handeln('buchen')}
                disabled={busy}
              >
                {busy ? 'Trage ein …' : 'Diesen Platz übernehmen'}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}
