import { useState } from 'react'
import {
  berichtVollstaendig,
  fehlendeAngaben,
  formatiereFrist,
  rideReport,
  formatiereTermin,
  verbleibendeFrist,
  type Bericht,
  type Fahrt,
} from '../lib/fahrten'
import { toGermanError } from '../lib/errors'

type Props = {
  fahrt: Fahrt
  onClose: () => void
  onGespeichert: (text: string) => void
}

/** Kilometer, Dauer und Fahrgäste nach einer Fahrt nachtragen. */
export function BerichtDialog({ fahrt, onClose, onGespeichert }: Props) {
  // Bereits eingetragene Angaben vorbelegen, damit sich ergänzen und
  // korrigieren lässt, ohne sie neu eintippen zu müssen
  const [werte, setWerte] = useState<Bericht>({
    km: fahrt.report_km !== null ? String(fahrt.report_km).replace('.', ',') : '',
    minuten: fahrt.report_minutes !== null ? String(fahrt.report_minutes) : '',
    personen: fahrt.report_passengers !== null ? String(fahrt.report_passengers) : '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function setze<K extends keyof Bericht>(feld: K, wert: string) {
    setWerte((w) => ({ ...w, [feld]: wert }))
  }

  const gefuellt = [werte.km, werte.minuten, werte.personen].filter((w) => w.trim() !== '')
  const mindestensEine = gefuellt.length > 0
  const alleDrei = gefuellt.length === 3
  const fehlt = fehlendeAngaben(fahrt)
  const restzeit = verbleibendeFrist(fahrt.report_deadline)

  // Komma und Punkt sind beide erlaubt
  const alsZahl = (w: string) => Number(w.trim().replace(',', '.'))
  const kmUngueltig =
    werte.km.trim() !== '' && (isNaN(alsZahl(werte.km)) || alsZahl(werte.km) < 0 || alsZahl(werte.km) > 500)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await rideReport(fahrt.id, werte)
      onGespeichert(
        alleDrei
          ? `Danke! Die Fahrt am ${formatiereTermin(fahrt.starts_at)} ist abgeschlossen.`
          : 'Angaben gespeichert. Sobald Kilometer, Dauer und Fahrgäste eingetragen sind, ' +
            'gilt die Fahrt als abgeschlossen.',
      )
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
      aria-labelledby="bericht-titel"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="overlay__card">
        <h3 id="bericht-titel">Angaben zur Fahrt</h3>
        <p className="muted overlay__intro">
          {formatiereTermin(fahrt.starts_at)} · {fahrt.location}
          <br />
          Es genügt, einzelne Angaben zu machen – die übrigen können später folgen.
          Abgeschlossen ist die Fahrt, sobald alle drei eingetragen sind.
        </p>

        <p className={restzeit ? 'frist' : 'frist frist--abgelaufen'}>
          {restzeit ? (
            <>
              Dafür bleiben noch <strong>{restzeit}</strong> Zeit – bis{' '}
              {formatiereFrist(fahrt.report_deadline)}. Danach gilt die Fahrt auch ohne
              Angaben als abgeschlossen.
            </>
          ) : (
            <>
              Die Frist bis {formatiereFrist(fahrt.report_deadline)} ist vorbei, die Fahrt
              gilt als abgeschlossen. Nachtragen kannst du die Angaben trotzdem noch.
            </>
          )}
        </p>

        {fahrt.report_at && !berichtVollstaendig(fahrt) && (
          <p className="alert alert--warn">
            Es {fehlt.length === 1 ? 'fehlt noch' : 'fehlen noch'}: {fehlt.join(', ')}.
          </p>
        )}

        <form onSubmit={handleSubmit} className="auth__form">
          <label className="field" htmlFor="bericht-km">
            <span className="field__label">
              Gefahrene Kilometer <span className="field__optional">optional</span>
            </span>
            <div className="field__wrap">
              {/* Bewusst kein type="number": dort verwirft der Browser das
                  Komma, das hierzulande für Nachkommastellen getippt wird. */}
              <input
                id="bericht-km"
                type="text"
                inputMode="decimal"
                value={werte.km}
                placeholder="z. B. 8,5"
                autoFocus
                onChange={(e) => setze('km', e.target.value.replace(/[^0-9.,]/g, ''))}
              />
              <span className="field__einheit">km</span>
            </div>
          </label>

          <label className="field" htmlFor="bericht-dauer">
            <span className="field__label">
              Dauer <span className="field__optional">optional</span>
            </span>
            <div className="field__wrap">
              <input
                id="bericht-dauer"
                type="number"
                inputMode="numeric"
                min={0}
                max={1440}
                value={werte.minuten}
                placeholder="z. B. 75"
                onChange={(e) => setze('minuten', e.target.value)}
              />
              <span className="field__einheit">Minuten</span>
            </div>
          </label>

          <label className="field" htmlFor="bericht-personen">
            <span className="field__label">
              Mitgenommene Fahrgäste <span className="field__optional">optional</span>
            </span>
            <div className="field__wrap">
              <input
                id="bericht-personen"
                type="number"
                inputMode="numeric"
                min={0}
                max={20}
                value={werte.personen}
                placeholder="z. B. 2"
                onChange={(e) => setze('personen', e.target.value)}
              />
            </div>
          </label>

          {kmUngueltig && (
            <p className="alert alert--error">
              Bitte die Kilometer als Zahl zwischen 0 und 500 angeben, zum Beispiel 8,5.
            </p>
          )}

          {error && <p className="alert alert--error">{error}</p>}

          <div className="overlay__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
              Später
            </button>
            <button type="submit" className="btn" disabled={busy || !mindestensEine || kmUngueltig}>
              {busy ? 'Speichere …' : alleDrei ? 'Fahrt abschließen' : 'Angaben speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
