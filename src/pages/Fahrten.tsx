import { useCallback, useEffect, useState } from 'react'
import { listRides, rideSignoff, rideSignup, watchRides, type Fahrt } from '../lib/fahrten'
import { toGermanError } from '../lib/errors'
import { FahrtKarte } from '../components/FahrtKarte'

type Props = {
  onZurueck: () => void
}

export function Fahrten({ onZurueck }: Props) {
  const [fahrten, setFahrten] = useState<Fahrt[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const laden = useCallback(() => {
    listRides('offen')
      .then(setFahrten)
      .catch((err) => setError(toGermanError(err)))
  }, [])

  useEffect(() => {
    laden()
    return watchRides(laden)
  }, [laden])

  async function melden(f: Fahrt) {
    setError(null)
    setBusy(f.id)
    try {
      await rideSignup(f.id)
      laden()
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(null)
    }
  }

  async function abmelden(f: Fahrt) {
    setError(null)
    setBusy(f.id)
    try {
      await rideSignoff(f.id)
      laden()
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <button className="btn btn--zurueck" onClick={onZurueck}>
        ← Zurück zur Übersicht
      </button>

      <div className="seite__kopf">
        <div>
          <h2>Offene Fahrten</h2>
          <p className="muted">Fahrten, für die noch Pilot:innen gesucht werden</p>
        </div>
      </div>

      {error && <p className="alert alert--error">{error}</p>}
      {!fahrten && !error && <p className="muted">Lade Fahrten …</p>}

      {fahrten?.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Zurzeit sind keine Fahrten offen. Sobald die Koordination eine neue anlegt,
            erscheint sie hier.
          </p>
        </div>
      )}

      <div className="fahrten">
        {fahrten?.map((f) => (
          <FahrtKarte key={f.id} fahrt={f}>
            {f.bin_dabei ? (
              <>
                <span className="fahrt__dabei">Du bist als Pilot:in eingetragen</span>
                <button
                  className="btn btn--ghost btn--gefahr"
                  onClick={() => abmelden(f)}
                  disabled={busy === f.id}
                >
                  Platz freigeben
                </button>
              </>
            ) : (
              <button className="btn" onClick={() => melden(f)} disabled={busy === f.id}>
                {busy === f.id ? 'Trage ein …' : 'Als Pilot:in melden'}
              </button>
            )}
          </FahrtKarte>
        ))}
      </div>
    </>
  )
}
