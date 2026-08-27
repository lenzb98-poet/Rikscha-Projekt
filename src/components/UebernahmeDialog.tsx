import { useState } from 'react'
import { saveUebernahme, type Uebernahme, type UebernahmeEingabe } from '../lib/fahrten'
import { toGermanError } from '../lib/errors'

type Props = {
  /** Fehlt beim Anlegen einer neuen Übernahme. */
  eintrag?: Uebernahme
  onClose: () => void
  onGespeichert: (text: string) => void
}

/** Bisherige Gesamtzahlen aus der alten Statistik übernehmen. */
export function UebernahmeDialog({ eintrag, onClose, onGespeichert }: Props) {
  const [werte, setWerte] = useState<UebernahmeEingabe>({
    bezeichnung: eintrag?.bezeichnung ?? '',
    km: eintrag ? String(eintrag.km).replace('.', ',') : '',
    minuten: eintrag ? String(eintrag.minuten) : '',
    personen: eintrag ? String(eintrag.personen) : '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function setze<K extends keyof UebernahmeEingabe>(feld: K, wert: string) {
    setWerte((w) => ({ ...w, [feld]: wert }))
  }

  const hatWert = [werte.km, werte.minuten, werte.personen].some((w) => w.trim() !== '')
  const bereit = werte.bezeichnung.trim().length >= 2 && hatWert

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await saveUebernahme(eintrag?.id ?? null, werte)
      onGespeichert(
        eintrag ? 'Die Übernahme wurde gespeichert.' : 'Die bisherigen Zahlen wurden übernommen.',
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
      aria-labelledby="uebernahme-titel"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="overlay__card">
        <h3 id="uebernahme-titel">
          {eintrag ? 'Übernahme bearbeiten' : 'Bisherige Zahlen übernehmen'}
        </h3>
        <p className="muted overlay__intro">
          Trage hier ein, was vor dieser App zusammengekommen ist – als eine
          zusammengefasste Zeile. Die Werte zählen in der Auswertung mit.
        </p>

        <form onSubmit={handleSubmit} className="auth__form">
          <label className="field" htmlFor="ue-bezeichnung">
            <span className="field__label">Bezeichnung</span>
            <div className="field__wrap">
              <input
                id="ue-bezeichnung"
                type="text"
                value={werte.bezeichnung}
                placeholder="z. B. Übernahme aus Excel bis Ende 2025"
                autoFocus
                onChange={(e) => setze('bezeichnung', e.target.value)}
                required
              />
            </div>
            <span className="hint">Damit später klar ist, woher die Zahlen stammen.</span>
          </label>

          <label className="field" htmlFor="ue-km">
            <span className="field__label">Kilometer insgesamt</span>
            <div className="field__wrap">
              <input
                id="ue-km"
                type="text"
                inputMode="decimal"
                value={werte.km}
                placeholder="z. B. 4820,5"
                onChange={(e) => setze('km', e.target.value.replace(/[^0-9.,]/g, ''))}
              />
              <span className="field__einheit">km</span>
            </div>
          </label>

          <label className="field" htmlFor="ue-minuten">
            <span className="field__label">Minuten insgesamt</span>
            <div className="field__wrap">
              <input
                id="ue-minuten"
                type="number"
                inputMode="numeric"
                min={0}
                value={werte.minuten}
                placeholder="z. B. 39600"
                onChange={(e) => setze('minuten', e.target.value)}
              />
              <span className="field__einheit">Minuten</span>
            </div>
          </label>

          <label className="field" htmlFor="ue-personen">
            <span className="field__label">Fahrgäste insgesamt</span>
            <div className="field__wrap">
              <input
                id="ue-personen"
                type="number"
                inputMode="numeric"
                min={0}
                value={werte.personen}
                placeholder="z. B. 1240"
                onChange={(e) => setze('personen', e.target.value)}
              />
            </div>
          </label>

          {error && <p className="alert alert--error">{error}</p>}

          <div className="overlay__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
              Abbrechen
            </button>
            <button type="submit" className="btn" disabled={busy || !bereit}>
              {busy ? 'Speichere …' : eintrag ? 'Speichern' : 'Übernehmen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
