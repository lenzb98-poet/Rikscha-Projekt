import { useCallback, useEffect, useState } from 'react'
import { listRides, watchRides, ZUSTAND_TEXT, type Fahrt, type Zustand } from '../lib/fahrten'
import { toGermanError } from '../lib/errors'
import { FahrtKarte } from '../components/FahrtKarte'
import { FahrtDialog } from '../components/FahrtDialog'

const FILTER: { wert: 'alle' | Zustand; text: string }[] = [
  { wert: 'alle', text: 'Alle' },
  { wert: 'offen', text: 'Offen' },
  { wert: 'besetzt', text: 'Zugesagt' },
  { wert: 'abgeschlossen', text: 'Abgeschlossen' },
  { wert: 'abgesagt', text: 'Abgesagt' },
]

export function FahrtenVerwaltung({ onZurueck }: { onZurueck: () => void }) {
  const [fahrten, setFahrten] = useState<Fahrt[] | null>(null)
  const [filter, setFilter] = useState<'alle' | Zustand>('alle')
  const [neu, setNeu] = useState(false)
  const [bearbeitet, setBearbeitet] = useState<Fahrt | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const laden = useCallback(() => {
    listRides('alle')
      .then(setFahrten)
      .catch((err) => setError(toGermanError(err)))
  }, [])

  useEffect(() => {
    laden()
    return watchRides(laden)
  }, [laden])

  function fertig(text: string) {
    setNeu(false)
    setBearbeitet(null)
    setHinweis(text)
    laden()
  }

  const sichtbar = fahrten?.filter((f) => filter === 'alle' || f.zustand === filter)

  return (
    <>
      <button className="btn btn--zurueck" onClick={onZurueck}>
        ← Zurück zur Übersicht
      </button>

      <div className="seite__kopf">
        <div>
          <h2>Fahrten verwalten</h2>
          {fahrten && (
            <p className="muted">
              {fahrten.length} {fahrten.length === 1 ? 'Fahrt' : 'Fahrten'} insgesamt
            </p>
          )}
        </div>
        <button className="btn" onClick={() => setNeu(true)}>
          Fahrt hinzufügen
        </button>
      </div>

      {hinweis && <p className="alert alert--ok">{hinweis}</p>}
      {error && <p className="alert alert--error">{error}</p>}

      <div className="filterleiste">
        {FILTER.map((f) => (
          <button
            key={f.wert}
            className={filter === f.wert ? 'filter filter--an' : 'filter'}
            onClick={() => setFilter(f.wert)}
          >
            {f.text}
            {fahrten && f.wert !== 'alle' && (
              <span className="filter__zahl">
                {fahrten.filter((x) => x.zustand === f.wert).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {!fahrten && !error && <p className="muted">Lade Fahrten …</p>}

      {sichtbar?.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            {filter === 'alle'
              ? 'Noch keine Fahrten angelegt. Über „Fahrt hinzufügen“ legst du die erste an.'
              : `Keine Fahrten mit dem Zustand „${ZUSTAND_TEXT[filter as Zustand]}“.`}
          </p>
        </div>
      )}

      <div className="fahrten">
        {sichtbar?.map((f) => (
          <FahrtKarte key={f.id} fahrt={f}>
            <button className="btn btn--ghost" onClick={() => setBearbeitet(f)}>
              Bearbeiten
            </button>
          </FahrtKarte>
        ))}
      </div>

      {neu && <FahrtDialog onClose={() => setNeu(false)} onGespeichert={fertig} />}
      {bearbeitet && (
        <FahrtDialog
          fahrt={bearbeitet}
          onClose={() => setBearbeitet(null)}
          onGespeichert={fertig}
        />
      )}
    </>
  )
}
