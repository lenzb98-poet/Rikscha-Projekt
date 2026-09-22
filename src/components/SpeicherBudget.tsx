import { useEffect, useState } from 'react'
import { MB, speicherBudgetSetzen, speicherStand, type SpeicherStand } from '../lib/betreiber'
import { raeumeBildspeicherAuf } from '../lib/supabase'
import { formatiereGroesse } from '../lib/bilder'
import { formatiereZahl } from '../lib/fahrten'
import { toGermanError } from '../lib/errors'

/**
 * Das Speicher-Budget aller Organisationen zusammen.
 *
 * Der Balken zeigt, wie sich das Gesamtbudget aufteilt: übrige Daten
 * (Datenbank und Logos), Chat-Bilder und was frei ist. Für Bilder gilt stets
 * die kleinere Grenze - der eingestellte Bildspeicher oder das, was nach den
 * übrigen Daten vom Gesamtbudget bleibt. Geräumt wird nach FIFO: das älteste
 * Bild aller Organisationen zuerst.
 */
export function SpeicherBudget() {
  const [stand, setStand] = useState<SpeicherStand | null>(null)
  const [gesamt, setGesamt] = useState('')
  const [bilder, setBilder] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)

  async function laden() {
    const s = await speicherStand()
    setStand(s)
    setGesamt(String(Math.round(s.gesamt_budget / MB)))
    setBilder(String(Math.round(s.bilder_budget / MB)))
    return s
  }

  useEffect(() => {
    laden().catch((err) => setError(toGermanError(err)))
  }, [])

  const gesamtMb = Number(gesamt)
  const bilderMb = Number(bilder)
  const eingabeGueltig =
    gesamt.trim() !== '' &&
    bilder.trim() !== '' &&
    Number.isFinite(gesamtMb) &&
    Number.isFinite(bilderMb) &&
    gesamtMb >= 100 &&
    bilderMb >= 0 &&
    bilderMb <= gesamtMb
  const geaendert =
    stand !== null &&
    (Math.round(gesamtMb) !== Math.round(stand.gesamt_budget / MB) ||
      Math.round(bilderMb) !== Math.round(stand.bilder_budget / MB))

  // Was nach dem Speichern für Bilder gälte - und ob dafür Bilder weichen müssten
  const neueGrenze =
    stand && eingabeGueltig
      ? Math.max(0, Math.min(bilderMb * MB, gesamtMb * MB - stand.daten_bytes))
      : null
  const zuRaeumen = stand && neueGrenze !== null ? Math.max(0, stand.bilder_bytes - neueGrenze) : 0

  async function aufraeumen(meldungVorne: string) {
    const entfernt = await raeumeBildspeicherAuf()
    await laden()
    setHinweis(
      entfernt > 0
        ? `${meldungVorne}${formatiereZahl(entfernt)} ${entfernt === 1 ? 'Bild' : 'Bilder'} aus dem Speicher entfernt.`
        : `${meldungVorne}Kein Bild musste weichen.`,
    )
  }

  async function speichern(e: React.FormEvent) {
    e.preventDefault()
    if (!eingabeGueltig) return
    if (
      zuRaeumen > 0 &&
      !confirm(
        `Mit dieser Grenze müssen etwa ${formatiereGroesse(zuRaeumen)} Chat-Bilder weichen - ` +
          'die ältesten aller Organisationen zuerst. Die Nachrichten bleiben, die Bilder sind ' +
          'danach weg. Fortfahren?',
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    setHinweis(null)
    try {
      await speicherBudgetSetzen(gesamtMb, bilderMb)
      await aufraeumen('Gespeichert. ')
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(false)
    }
  }

  async function jetztAufraeumen() {
    setBusy(true)
    setError(null)
    setHinweis(null)
    try {
      await aufraeumen('')
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(false)
    }
  }

  // Anteile am Gesamtbudget für den Balken
  const anteil = (bytes: number) =>
    stand && stand.gesamt_budget > 0 ? Math.min(100, (bytes / stand.gesamt_budget) * 100) : 0
  const frei = stand ? Math.max(0, stand.gesamt_budget - stand.daten_bytes - stand.bilder_bytes) : 0
  const grenzeDurchRest = stand !== null && stand.bilder_grenze < stand.bilder_budget

  return (
    <section className="card">
      <h3>Speicher-Budget</h3>
      <p className="muted card__text">
        Gilt für alle Organisationen zusammen. Brauchen die übrigen Daten mehr Platz oder ist der
        Bildspeicher voll, verschwinden die ältesten Chat-Bilder zuerst – egal aus welcher
        Organisation. Die Nachrichten bleiben stehen.
      </p>

      {!stand && !error && <p className="muted">Lade Speicherstand …</p>}

      {stand && (
        <>
          <div
            className="budget__balken"
            role="img"
            aria-label={`Übrige Daten ${formatiereGroesse(stand.daten_bytes)}, Chat-Bilder ${formatiereGroesse(stand.bilder_bytes)}, frei ${formatiereGroesse(frei)} von ${formatiereGroesse(stand.gesamt_budget)}`}
          >
            <span className="budget__teil budget__teil--daten" style={{ width: `${anteil(stand.daten_bytes)}%` }} />
            <span className="budget__teil budget__teil--bilder" style={{ width: `${anteil(stand.bilder_bytes)}%` }} />
            {/* Wo die Grenze für Bilder liegt, gezählt ab dem Ende der übrigen Daten */}
            <span
              className="budget__grenze"
              style={{ left: `${anteil(stand.daten_bytes + stand.bilder_grenze)}%` }}
              title="Grenze für Chat-Bilder"
            />
          </div>

          <ul className="budget__legende">
            <li>
              <span className="budget__punkt budget__punkt--daten" aria-hidden="true" />
              Übrige Daten <strong>{formatiereGroesse(stand.daten_bytes)}</strong>
              <span className="muted"> (Datenbank und Logos)</span>
            </li>
            <li>
              <span className="budget__punkt budget__punkt--bilder" aria-hidden="true" />
              Chat-Bilder <strong>{formatiereGroesse(stand.bilder_bytes)}</strong>
              <span className="muted"> von höchstens {formatiereGroesse(stand.bilder_grenze)}</span>
            </li>
            <li>
              <span className="budget__punkt" aria-hidden="true" />
              Frei <strong>{formatiereGroesse(frei)}</strong>
              <span className="muted"> von {formatiereGroesse(stand.gesamt_budget)}</span>
            </li>
          </ul>

          {grenzeDurchRest && (
            <p className="hint budget__erklaerung">
              Für Bilder gilt gerade der Rest des Gesamtbudgets, nicht der eingestellte
              Bildspeicher – die übrigen Daten brauchen den Platz.
            </p>
          )}

          {stand.ausstehend > 0 && (
            <p className="alert alert--warn budget__ausstehend">
              {stand.ausstehend} geräumte {stand.ausstehend === 1 ? 'Datei liegt' : 'Dateien liegen'}{' '}
              noch im Speicher. Das erledigt die App beim nächsten Start von selbst, oder hier:{' '}
              <button type="button" className="btn btn--link" onClick={jetztAufraeumen} disabled={busy}>
                Jetzt aufräumen
              </button>
            </p>
          )}
        </>
      )}

      {hinweis && <p className="alert alert--ok">{hinweis}</p>}
      {error && <p className="alert alert--error">{error}</p>}

      {stand && (
        <form className="budget__form" onSubmit={speichern}>
          <div className="budget__felder">
            <label className="field" htmlFor="budget-gesamt">
              <span className="field__label">Gesamtbudget (MB)</span>
              <div className="field__wrap">
                <input
                  id="budget-gesamt"
                  type="number"
                  inputMode="numeric"
                  min={100}
                  step={1}
                  value={gesamt}
                  onChange={(e) => setGesamt(e.target.value)}
                  disabled={busy}
                />
              </div>
            </label>
            <label className="field" htmlFor="budget-bilder">
              <span className="field__label">Davon höchstens für Bilder (MB)</span>
              <div className="field__wrap">
                <input
                  id="budget-bilder"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={bilder}
                  onChange={(e) => setBilder(e.target.value)}
                  disabled={busy}
                />
              </div>
            </label>
          </div>

          {!eingabeGueltig && (
            <p className="hint budget__erklaerung">
              Gesamtbudget mindestens 100 MB; der Bildspeicher darf nicht größer sein.
            </p>
          )}
          {eingabeGueltig && geaendert && zuRaeumen > 0 && (
            <p className="alert alert--warn">
              Mit diesen Werten müssen etwa {formatiereGroesse(zuRaeumen)} Chat-Bilder weichen.
            </p>
          )}

          <div className="logo-knoepfe budget__knoepfe">
            <button className="btn" type="submit" disabled={busy || !eingabeGueltig || !geaendert}>
              {busy ? 'Speichere …' : 'Budget speichern'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
