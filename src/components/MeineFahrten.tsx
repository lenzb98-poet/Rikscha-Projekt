import { useState } from 'react'
import {
  rideCancel,
  rideSignoff,
  formatiereTermin,
  GRUND_REGEN,
  type Fahrt,
} from '../lib/fahrten'
import { toGermanError } from '../lib/errors'
import { BerichtDialog } from './BerichtDialog'

type Props = {
  /** Alle Fahrten; gefiltert wird hier. null heißt: noch nicht geladen. */
  alle: Fahrt[] | null
  /** Nach einer Änderung neu laden. */
  onAktualisiert: () => void
}

/** Schritte beim Absagen – die ganze Fahrt braucht bewusst zwei Bestätigungen. */
type Schritt = 'wahl' | 'grund' | 'sicher'

/**
 * Meldung ganz oben auf der Startseite: zu welchen Fahrten die angemeldete
 * Person eingetragen ist. Von dort lässt sich absagen – entweder nur für sich
 * selbst oder, mit doppelter Rückfrage, die ganze Fahrt.
 */
export function MeineFahrten({ alle, onAktualisiert }: Props) {
  const [offen, setOffen] = useState<string | null>(null)
  const [schritt, setSchritt] = useState<Schritt>('wahl')
  const [andererGrund, setAndererGrund] = useState(false)
  const [grundText, setGrundText] = useState('')
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [bericht, setBericht] = useState<Fahrt | null>(null)

  const meine = (alle ?? []).filter((f) => f.bin_dabei)
  // Fahrten, die stattgefunden haben und auf die Angaben warten
  const nachzutragen = meine.filter((f) => f.zustand === 'nachtragen')
  const fahrten = meine.filter((f) => f.zustand === 'offen' || f.zustand === 'besetzt')

  // War es die letzte Fahrt, bleibt die Meldung noch für die Bestätigung
  // stehen. Sonst verschwände sie beim Absagen kommentarlos.
  if (fahrten.length === 0 && nachzutragen.length === 0 && !hinweis) return null

  function schliessen() {
    setOffen(null)
    setSchritt('wahl')
    setAndererGrund(false)
    setGrundText('')
    setError(null)
  }

  function oeffnen(id: string) {
    if (offen === id) return schliessen()
    setOffen(id)
    setSchritt('wahl')
    setAndererGrund(false)
    setGrundText('')
    setError(null)
    setHinweis(null)
  }

  const grund = andererGrund ? grundText.trim() : GRUND_REGEN

  async function nurIch(f: Fahrt) {
    setError(null)
    setBusy(true)
    try {
      await rideSignoff(f.id)
      schliessen()
      setHinweis(
        `Du bist für die Fahrt am ${formatiereTermin(f.starts_at)} abgemeldet. ` +
          'Die Fahrt selbst findet weiter statt.',
      )
      onAktualisiert()
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(false)
    }
  }

  async function ganzeFahrt(f: Fahrt) {
    setError(null)
    setBusy(true)
    try {
      await rideCancel(f.id, grund)
      schliessen()
      setHinweis(`Die Fahrt am ${formatiereTermin(f.starts_at)} wurde für alle abgesagt.`)
      onAktualisiert()
    } catch (err) {
      setError(toGermanError(err))
      setSchritt('grund')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {nachzutragen.length > 0 && (
        <section className="nachtrag">
          <h3>
            {nachzutragen.length === 1
              ? 'Eine Fahrt wartet auf deine Angaben'
              : `${nachzutragen.length} Fahrten warten auf deine Angaben`}
          </h3>
          <p className="nachtrag__text">
            Bitte trage nach, wie weit ihr gefahren seid, wie lange es gedauert hat und wie
            viele Fahrgäste dabei waren. Erst dann gilt die Fahrt als abgeschlossen.
          </p>

          {nachzutragen.map((f) => (
            <div key={f.id} className="nachtrag__fahrt">
              <div>
                <div className="fahrt__termin">{formatiereTermin(f.starts_at)}</div>
                <div className="fahrt__ort">{f.location}</div>
              </div>
              <button className="btn" onClick={() => setBericht(f)}>
                Angaben eintragen
              </button>
            </div>
          ))}
        </section>
      )}

      {bericht && (
        <BerichtDialog
          fahrt={bericht}
          onClose={() => setBericht(null)}
          onGespeichert={(text) => {
            setBericht(null)
            setHinweis(text)
            onAktualisiert()
          }}
        />
      )}

      {(fahrten.length > 0 || hinweis) && (
    <section className="meine">
      <h3>
        {fahrten.length === 0
          ? 'Absage übernommen'
          : fahrten.length === 1
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

          {offen !== f.id && (
            <button className="btn btn--ghost" onClick={() => oeffnen(f.id)}>
              Absagen
            </button>
          )}

          {offen === f.id && schritt === 'wahl' && (
            <div className="absage">
              <p className="absage__frage">Was möchtest du absagen?</p>

              <button className="absage__option" onClick={() => nurIch(f)} disabled={busy}>
                <strong>Für mich absagen</strong>
                <span>
                  Du wirst als Pilot:in ausgetragen. Die Fahrt findet weiter statt und wird
                  wieder als offen angezeigt.
                </span>
              </button>

              <button
                className="absage__option absage__option--warnung"
                onClick={() => setSchritt('grund')}
                disabled={busy}
              >
                <strong>Die Fahrt absagen</strong>
                <span>
                  Die gesamte Fahrt entfällt – auch für alle anderen Eingetragenen.
                </span>
              </button>

              {error && <p className="alert alert--error">{error}</p>}

              <button className="btn btn--link" onClick={schliessen} disabled={busy}>
                Abbrechen
              </button>
            </div>
          )}

          {offen === f.id && schritt === 'grund' && (
            <div className="absage">
              <p className="absage__frage">Warum entfällt die Fahrt?</p>

              <label className="absage__grund">
                <input
                  type="radio"
                  name={`grund-${f.id}`}
                  checked={!andererGrund}
                  onChange={() => setAndererGrund(false)}
                />
                <span>{GRUND_REGEN}</span>
              </label>

              <label className="absage__grund">
                <input
                  type="radio"
                  name={`grund-${f.id}`}
                  checked={andererGrund}
                  onChange={() => setAndererGrund(true)}
                />
                <span>Anderer Grund</span>
              </label>

              {andererGrund && (
                <textarea
                  value={grundText}
                  onChange={(e) => setGrundText(e.target.value)}
                  rows={2}
                  maxLength={500}
                  autoFocus
                  placeholder="Zum Beispiel: Die Rikscha ist defekt."
                />
              )}

              {error && <p className="alert alert--error">{error}</p>}

              <div className="meine__knoepfe">
                <button className="btn btn--ghost" onClick={schliessen} disabled={busy}>
                  Abbrechen
                </button>
                <button
                  className="btn btn--danger"
                  onClick={() => setSchritt('sicher')}
                  disabled={busy || !grund}
                >
                  Weiter
                </button>
              </div>
            </div>
          )}

          {offen === f.id && schritt === 'sicher' && (
            <div className="absage">
              <p className="alert alert--warn absage__warnung">
                <strong>Die Fahrt wird für alle abgesagt.</strong> Alle Eingetragenen verlieren
                diesen Termin. Rückgängig machen kann das nur die Koordination.
              </p>
              <p className="absage__grundtext">
                Grund: <strong>{grund}</strong>
              </p>

              {error && <p className="alert alert--error">{error}</p>}

              <div className="meine__knoepfe">
                <button
                  className="btn btn--ghost"
                  onClick={() => setSchritt('grund')}
                  disabled={busy}
                >
                  Zurück
                </button>
                <button className="btn btn--danger" onClick={() => ganzeFahrt(f)} disabled={busy}>
                  {busy ? 'Sage ab …' : 'Fahrt endgültig absagen'}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
      )}
    </>
  )
}
