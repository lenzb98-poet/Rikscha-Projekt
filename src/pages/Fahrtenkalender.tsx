import { useCallback, useEffect, useMemo, useState } from 'react'
import { listRides, watchRides, ZUSTAND_TEXT, type Fahrt, type Zustand } from '../lib/fahrten'
import { toGermanError } from '../lib/errors'
import { FahrtKarte } from '../components/FahrtKarte'

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const ZUSTAENDE: Zustand[] = ['offen', 'besetzt', 'nachtragen', 'abgeschlossen', 'abgesagt']

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
  const [gewaehlt, setGewaehlt] = useState<Fahrt | null>(null)

  const laden = useCallback(() => {
    listRides('alle')
      .then(setFahrten)
      .catch((err) => setError(toGermanError(err)))
  }, [])

  useEffect(() => {
    laden()
    return watchRides(laden)
  }, [laden])

  // Fahrten nach Tag gruppieren
  const proTag = useMemo(() => {
    const map = new Map<string, Fahrt[]>()
    for (const f of fahrten ?? []) {
      const key = tagesSchluessel(new Date(f.starts_at))
      map.set(key, [...(map.get(key) ?? []), f])
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
          <p className="muted">Alle Fahrten im Überblick</p>
        </div>
      </div>

      {error && <p className="alert alert--error">{error}</p>}

      <div className="kal__legende">
        {ZUSTAENDE.map((z) => (
          <span key={z} className="kal__legendeneintrag">
            <span className={`punkt punkt--${z}`} /> {ZUSTAND_TEXT[z]}
          </span>
        ))}
      </div>

      <div className="card">
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
                {eintraege.map((f) => (
                  <button
                    key={f.id}
                    className={`kal__eintrag kal__eintrag--${f.zustand}`}
                    onClick={() => setGewaehlt(f)}
                    title={`${f.location} – ${ZUSTAND_TEXT[f.zustand]}`}
                  >
                    {new Date(f.starts_at).toLocaleTimeString('de-DE', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    {f.location}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {gewaehlt && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setGewaehlt(null)
          }}
        >
          <div className="overlay__card">
            <h3>Fahrt</h3>
            <FahrtKarte fahrt={gewaehlt} />
            <div className="overlay__actions" style={{ marginTop: 16 }}>
              <button className="btn btn--ghost" onClick={() => setGewaehlt(null)}>
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
