import { useState } from 'react'
import {
  fehlendeAngaben,
  formatiereFrist,
  minutenAlsStunden,
  formatiereTermin,
  platzVollstaendig,
  slotReport,
  verbleibendeFrist,
  RIKSCHAS,
  type Bericht,
  type Fahrt,
  type Platz,
  type RikschaName,
} from '../lib/fahrten'
import { toGermanError } from '../lib/errors'

type Props = {
  fahrt: Fahrt
  /** Der eigene Rikscha-Platz, für den nachgetragen wird. */
  platz: Platz
  onClose: () => void
  onGespeichert: (text: string) => void
}

/** Kilometer, Dauer, Fahrgäste und Rikscha für den eigenen Platz nachtragen. */
export function BerichtDialog({ fahrt, platz, onClose, onGespeichert }: Props) {
  // Bereits Eingetragenes vorbelegen, damit sich ergänzen und korrigieren lässt
  const [werte, setWerte] = useState<Bericht>({
    km: platz.report_km !== null ? String(platz.report_km).replace('.', ',') : '',
    stunden: minutenAlsStunden(platz.report_minutes),
    personen: platz.report_passengers !== null ? String(platz.report_passengers) : '',
    rikscha: platz.rikscha ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function setze<K extends keyof Bericht>(feld: K, wert: Bericht[K]) {
    setWerte((w) => ({ ...w, [feld]: wert }))
  }

  const gefuellt = [werte.km, werte.stunden, werte.personen, werte.rikscha].filter(
    (w) => w.trim() !== '',
  )
  const mindestensEine = gefuellt.length > 0
  const alleVier = gefuellt.length === 4
  const fehlt = fehlendeAngaben(platz)
  const restzeit = verbleibendeFrist(fahrt.report_deadline)

  const alsZahl = (w: string) => Number(w.trim().replace(',', '.'))
  const kmUngueltig =
    werte.km.trim() !== '' &&
    (isNaN(alsZahl(werte.km)) || alsZahl(werte.km) < 0 || alsZahl(werte.km) > 500)
  const stundenUngueltig =
    werte.stunden.trim() !== '' &&
    (isNaN(alsZahl(werte.stunden)) || alsZahl(werte.stunden) < 0 || alsZahl(werte.stunden) > 24)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await slotReport(platz.id, werte)
      onGespeichert(
        alleVier
          ? `Danke! Deine Angaben zu Rikscha ${platz.position} sind vollständig.`
          : 'Angaben gespeichert. Vollständig ist es mit Kilometern, Dauer, Fahrgästen ' +
            'und der Rikscha.',
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
        <h3 id="bericht-titel">Deine Angaben zur Fahrt</h3>
        <p className="muted overlay__intro">
          {formatiereTermin(fahrt.starts_at)} · {fahrt.location}
          <br />
          Rikscha-Platz {platz.position} von {fahrt.plaetze.length} – du trägst nur für
          deinen eigenen Platz ein.
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

        {platz.report_at && !platzVollstaendig(platz) && (
          <p className="alert alert--warn">
            Es {fehlt.length === 1 ? 'fehlt noch' : 'fehlen noch'}: {fehlt.join(', ')}.
          </p>
        )}

        <form onSubmit={handleSubmit} className="auth__form">
          <label className="field" htmlFor="bericht-rikscha">
            <span className="field__label">Gefahrene Rikscha</span>
            <div className="field__wrap">
              <select
                id="bericht-rikscha"
                value={werte.rikscha}
                onChange={(e) => setze('rikscha', e.target.value as RikschaName | '')}
              >
                <option value="">Bitte auswählen</option>
                {RIKSCHAS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </label>

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
              Fahrzeit <span className="field__optional">optional</span>
            </span>
            <div className="field__wrap">
              {/* Wie im Fahrtenbuch in Stunden, deshalb Komma statt Zahlenfeld */}
              <input
                id="bericht-dauer"
                type="text"
                inputMode="decimal"
                value={werte.stunden}
                placeholder="z. B. 2,5"
                onChange={(e) => setze('stunden', e.target.value.replace(/[^0-9.,]/g, ''))}
              />
              <span className="field__einheit">Stunden</span>
            </div>
            <span className="hint">Halbe Stunden als Komma, etwa 2,5 für zweieinhalb.</span>
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

          {stundenUngueltig && (
            <p className="alert alert--error">
              Bitte die Fahrzeit als Stunden zwischen 0 und 24 angeben, zum Beispiel 2,5.
            </p>
          )}

          {error && <p className="alert alert--error">{error}</p>}

          <div className="overlay__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
              Später
            </button>
            <button
              type="submit"
              className="btn"
              disabled={busy || !mindestensEine || kmUngueltig || stundenUngueltig}
            >
              {busy ? 'Speichere …' : alleVier ? 'Fahrt abschließen' : 'Angaben speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
