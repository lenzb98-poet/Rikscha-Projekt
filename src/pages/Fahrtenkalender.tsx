import { useCallback, useEffect, useMemo, useState } from 'react'
import { listRides, watchRides, ZUSTAND_TEXT, type Fahrt, type Platz } from '../lib/fahrten'
import { toGermanError } from '../lib/errors'
import { PlatzDialog } from '../components/PlatzDialog'

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

/** Tagesschlüssel in Ortszeit, damit die Zuordnung nicht über die Zeitzone kippt. */
function tagesSchluessel(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function Fahrtenkalender({ onZurueck }: { onZurueck: () => void }) {
  const [fahrten, setFahrten] = useState<Fahrt[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [monat, setMonat] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  // Im Kalender steht jeder Rikscha-Platz für sich
  const [gewaehlt, setGewaehlt] = useState<{ fahrt: Fahrt; platz: Platz } | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)

  const laden = useCallback(() => {
    listRides('alle')
      .then(setFahrten)
      .catch((err) => setError(toGermanError(err)))
  }, [])

  useEffect(() => {
    laden()
    return watchRides(laden)
  }, [laden])

  // Nach Tag gruppieren – ein Eintrag je Rikscha-Platz, nicht je Fahrt
  const proTag = useMemo(() => {
    const map = new Map<string, { fahrt: Fahrt; platz: Platz }[]>()
    for (const f of fahrten ?? []) {
      const key = tagesSchluessel(new Date(f.starts_at))
      const eintraege = f.plaetze.map((platz) => ({ fahrt: f, platz }))
      map.set(key, [...(map.get(key) ?? []), ...eintraege])
    }
    return map
  }, [fahrten])

  // Raster von Montag der ersten Woche bis Sonntag der letzten
  const tage = useMemo(() => {
    const erster = new Date(monat.getFullYear(), monat.getMonth(), 1)
    const start = new Date(erster)
    // getDay(): 0 = Sonntag, wir wollen Montag als Wochenanfang
    start.setDate(erster.getDate() - ((erster.getDay() + 6) % 7))

    const liste: Date[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      liste.push(d)
    }
    return liste
  }, [monat])

  const heute = tagesSchluessel(new Date())

  function verschiebe(schritte: number) {
    setMonat((m) => new Date(m.getFullYear(), m.getMonth() + schritte, 1))
  }

  return (
    <>
      <button className="btn btn--zurueck" onClick={onZurueck}>
        ← Zurück zur Übersicht
      </button>

      <div className="seite__kopf">
        <div>
          <h2>Fahrtenkalender</h2>
          <p className="muted">
            Jede Rikscha steht einzeln. Auf einen freien Platz tippen, um ihn zu übernehmen.
          </p>
        </div>
      </div>

      {hinweis && <p className="alert alert--ok">{hinweis}</p>}
      {error && <p className="alert alert--error">{error}</p>}

      <div className="kal__legende">
        <span className="kal__legendeneintrag">
          <span className="punkt punkt--offen" /> Freier Platz
        </span>
        <span className="kal__legendeneintrag">
          <span className="punkt punkt--besetzt" /> Vergeben
        </span>
        <span className="kal__legendeneintrag">
          <span className="punkt punkt--abgeschlossen" /> Abgeschlossen
        </span>
        <span className="kal__legendeneintrag">
          <span className="punkt punkt--abgesagt" /> Abgesagt
        </span>
      </div>

      <div className="card card--kalender">
        <div className="kal__kopf">
          <button className="btn btn--ghost" onClick={() => verschiebe(-1)} aria-label="Voriger Monat">
            ‹
          </button>
          <strong>
            {monat.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
          </strong>
          <button className="btn btn--ghost" onClick={() => verschiebe(1)} aria-label="Nächster Monat">
            ›
          </button>
        </div>

        <div className="kal__raster">
          {WOCHENTAGE.map((w) => (
            <div key={w} className="kal__wochentag">
              {w}
            </div>
          ))}

          {tage.map((d) => {
            const key = tagesSchluessel(d)
            const imMonat = d.getMonth() === monat.getMonth()
            const eintraege = proTag.get(key) ?? []

            return (
              <div
                key={key}
                className={[
                  'kal__tag',
                  imMonat ? '' : 'kal__tag--fremd',
                  key === heute ? 'kal__tag--heute' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="kal__zahl">{d.getDate()}</span>
                {eintraege.map(({ fahrt, platz }) => {
                  // Ein freier Platz einer geplanten Fahrt lädt zum Buchen ein
                  const frei = platz.pilot_id === null && fahrt.zustand !== 'abgesagt'
                  const art = frei ? 'offen' : fahrt.zustand === 'offen' ? 'besetzt' : fahrt.zustand

                  return (
                    <button
                      key={platz.id}
                      className={[
                        'kal__eintrag',
                        `kal__eintrag--${art}`,
                        platz.ist_meiner ? 'kal__eintrag--meiner' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setGewaehlt({ fahrt, platz })}
                      title={
                        `${fahrt.location} · Fahrer ${platz.position} von ${fahrt.plaetze.length} · ` +
                        (platz.pilot_name ?? 'frei') +
                        ` · ${ZUSTAND_TEXT[fahrt.zustand]}`
                      }
                    >
                      <span className="kal__zeit">
                        {new Date(fahrt.starts_at).toLocaleTimeString('de-DE', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {/* Am Handy bleibt nur die Nummer: für den Namen ist die
                          Spalte zu schmal, er steht im Fenster dahinter. */}
                      <span className="kal__nummer">F{platz.position}</span>
                      <span className="kal__wer">{platz.pilot_name ?? 'frei'}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {gewaehlt && (
        <PlatzDialog
          fahrt={gewaehlt.fahrt}
          platz={gewaehlt.platz}
          onClose={() => setGewaehlt(null)}
          onGebucht={(text) => {
            setGewaehlt(null)
            setHinweis(text)
            laden()
          }}
        />
      )}
    </>
  )
}
