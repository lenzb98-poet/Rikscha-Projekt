import { useState } from 'react'
import { rideReport, formatiereTermin, type Bericht, type Fahrt } from '../lib/fahrten'
import { toGermanError } from '../lib/errors'

type Props = {
  fahrt: Fahrt
  onClose: () => void
  onGespeichert: (text: string) => void
}

/** Kilometer, Dauer und Fahrgäste nach einer Fahrt nachtragen. */
export function BerichtDialog({ fahrt, onClose, onGespeichert }: Props) {
  const [werte, setWerte] = useState<Bericht>({ km: '', minuten: '', personen: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function setze<K extends keyof Bericht>(feld: K, wert: string) {
    setWerte((w) => ({ ...w, [feld]: wert }))
  }

  const vollstaendig =
    werte.km.trim() !== '' && werte.minuten.trim() !== '' && werte.personen.trim() !== ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await rideReport(fahrt.id, werte)
      onGespeichert(`Danke! Die Fahrt am ${formatiereTermin(fahrt.starts_at)} ist abgeschlossen.`)
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
          Mit diesen Angaben gilt die Fahrt als abgeschlossen.
        </p>

        <form onSubmit={handleSubmit} className="auth__form">
          <label className="field" htmlFor="bericht-km">
            <span className="field__label">Gefahrene Kilometer</span>
            <div className="field__wrap">
              <input
                id="bericht-km"
                type="number"
                inputMode="decimal"
                step="0.1"
                min={0}
                max={500}
                value={werte.km}
                placeholder="z. B. 8,5"
                autoFocus
                onChange={(e) => setze('km', e.target.value)}
                required
              />
              <span className="field__einheit">km</span>
            </div>
          </label>

          <label className="field" htmlFor="bericht-dauer">
            <span className="field__label">Dauer</span>
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
                required
              />
              <span className="field__einheit">Minuten</span>
            </div>
          </label>

          <label className="field" htmlFor="bericht-personen">
            <span className="field__label">Mitgenommene Fahrgäste</span>
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
                required
              />
            </div>
          </label>

          {error && <p className="alert alert--error">{error}</p>}

          <div className="overlay__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
              Später
            </button>
            <button type="submit" className="btn" disabled={busy || !vollstaendig}>
              {busy ? 'Speichere …' : 'Fahrt abschließen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
