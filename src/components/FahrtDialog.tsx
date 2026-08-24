import { useEffect, useState } from 'react'
import {
  createRide,
  deleteRide,
  fuerEingabefeld,
  listPilots,
  setPilot,
  updateRide,
  type Fahrt,
  type FahrtEingabe,
  type Pilot,
  type RideStatus,
} from '../lib/fahrten'
import { toGermanError } from '../lib/errors'

type Props = {
  /** Fehlt beim Anlegen einer neuen Fahrt. */
  fahrt?: Fahrt
  onClose: () => void
  onGespeichert: (text: string) => void
}

const STATUS: { wert: RideStatus; text: string }[] = [
  { wert: 'geplant', text: 'Geplant' },
  { wert: 'abgeschlossen', text: 'Abgeschlossen' },
  { wert: 'abgesagt', text: 'Abgesagt' },
]

/** Vorschlag beim Anlegen: morgen um 14 Uhr. */
function morgenNachmittag(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(14, 0, 0, 0)
  return fuerEingabefeld(d.toISOString())
}

export function FahrtDialog({ fahrt, onClose, onGespeichert }: Props) {
  const [werte, setWerte] = useState<FahrtEingabe>({
    startsAt: fahrt ? fuerEingabefeld(fahrt.starts_at) : morgenNachmittag(),
    location: fahrt?.location ?? '',
    info: fahrt?.info ?? '',
    pilotsNeeded: fahrt?.pilots_needed ?? 1,
    status: fahrt?.status ?? 'geplant',
  })
  const [alle, setAlle] = useState<Pilot[]>([])
  const [dabei, setDabei] = useState<Set<string>>(
    () => new Set((fahrt?.piloten ?? []).map((p) => p.id)),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loeschenBestaetigen, setLoeschenBestaetigen] = useState(false)

  // Auswahlliste nur beim Bearbeiten – beim Anlegen gibt es die Fahrt noch nicht
  useEffect(() => {
    if (!fahrt) return
    listPilots()
      .then(setAlle)
      .catch(() => setAlle([]))
  }, [fahrt])

  function setze<K extends keyof FahrtEingabe>(feld: K, wert: FahrtEingabe[K]) {
    setWerte((w) => ({ ...w, [feld]: wert }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (fahrt) {
        await updateRide(fahrt.id, werte)
        onGespeichert('Die Fahrt wurde gespeichert.')
      } else {
        await createRide(werte)
        onGespeichert('Die Fahrt wurde angelegt und steht jetzt unter „Offene Fahrten“.')
      }
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleLoeschen() {
    if (!fahrt) return
    setBusy(true)
    try {
      await deleteRide(fahrt.id)
      onGespeichert('Die Fahrt wurde gelöscht.')
    } catch (err) {
      setError(toGermanError(err))
      setLoeschenBestaetigen(false)
    } finally {
      setBusy(false)
    }
  }

  async function schaltePilot(p: Pilot) {
    if (!fahrt) return
    const neu = !dabei.has(p.id)
    try {
      await setPilot(fahrt.id, p.id, neu)
      setDabei((s) => {
        const kopie = new Set(s)
        if (neu) kopie.add(p.id)
        else kopie.delete(p.id)
        return kopie
      })
    } catch (err) {
      setError(toGermanError(err))
    }
  }

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fahrt-titel"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="overlay__card">
        {loeschenBestaetigen ? (
          <>
            <h3 id="fahrt-titel">Fahrt wirklich löschen?</h3>
            <p className="overlay__intro">
              Die Fahrt und alle Anmeldungen dazu werden endgültig entfernt.
            </p>
            <p className="alert alert--warn">
              Soll die Fahrt nur nicht stattfinden, setze sie besser auf „Abgesagt“ – dann
              bleibt sie im Kalender sichtbar.
            </p>
            {error && <p className="alert alert--error">{error}</p>}
            <div className="overlay__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setLoeschenBestaetigen(false)}
                disabled={busy}
              >
                Abbrechen
              </button>
              <button type="button" className="btn btn--danger" onClick={handleLoeschen} disabled={busy}>
                {busy ? 'Lösche …' : 'Endgültig löschen'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 id="fahrt-titel">{fahrt ? 'Fahrt bearbeiten' : 'Fahrt hinzufügen'}</h3>
            <p className="muted overlay__intro">
              {fahrt
                ? 'Angaben ändern oder Pilot:innen selbst zuordnen.'
                : 'Nach dem Anlegen können sich Pilot:innen selbst eintragen.'}
            </p>

            <form onSubmit={handleSubmit} className="auth__form">
              <label className="field" htmlFor="fahrt-termin">
                <span className="field__label">Termin</span>
                <div className="field__wrap">
                  <input
                    id="fahrt-termin"
                    type="datetime-local"
                    value={werte.startsAt}
                    onChange={(e) => setze('startsAt', e.target.value)}
                    required
                  />
                </div>
              </label>

              <label className="field" htmlFor="fahrt-ort">
                <span className="field__label">Wo</span>
                <div className="field__wrap">
                  <input
                    id="fahrt-ort"
                    type="text"
                    value={werte.location}
                    placeholder="z. B. Seniorenheim Melle, Haupteingang"
                    onChange={(e) => setze('location', e.target.value)}
                    required
                  />
                </div>
              </label>

              <label className="field" htmlFor="fahrt-info">
                <span className="field__label">
                  Infotext <span className="field__optional">optional</span>
                </span>
                <div className="field__wrap">
                  <textarea
                    id="fahrt-info"
                    value={werte.info}
                    rows={3}
                    maxLength={2000}
                    placeholder="Was ist geplant, worauf ist zu achten?"
                    onChange={(e) => setze('info', e.target.value)}
                  />
                </div>
              </label>

              <label className="field" htmlFor="fahrt-anzahl">
                <span className="field__label">Benötigte Pilot:innen</span>
                <div className="field__wrap">
                  <input
                    id="fahrt-anzahl"
                    type="number"
                    min={1}
                    max={20}
                    value={werte.pilotsNeeded}
                    onChange={(e) => setze('pilotsNeeded', Number(e.target.value))}
                    required
                  />
                </div>
                <span className="hint">
                  Sobald so viele eingetragen sind, wandert die Fahrt zu „Kommende Fahrten“.
                </span>
              </label>

              {fahrt && (
                <>
                  <label className="field" htmlFor="fahrt-status">
                    <span className="field__label">Status</span>
                    <div className="field__wrap">
                      <select
                        id="fahrt-status"
                        value={werte.status}
                        onChange={(e) => setze('status', e.target.value as RideStatus)}
                      >
                        {STATUS.map((s) => (
                          <option key={s.wert} value={s.wert}>
                            {s.text}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>

                  <div className="field">
                    <span className="field__label">Pilot:innen zuordnen</span>
                    <div className="pilotwahl">
                      {alle.length === 0 && <span className="muted">Lade Liste …</span>}
                      {alle.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className={dabei.has(p.id) ? 'pilotchip pilotchip--an' : 'pilotchip'}
                          onClick={() => schaltePilot(p)}
                        >
                          {dabei.has(p.id) ? '✓ ' : '+ '}
                          {p.name}
                        </button>
                      ))}
                    </div>
                    <span className="hint">
                      {dabei.size} von {werte.pilotsNeeded} eingetragen. Änderungen wirken sofort.
                    </span>
                  </div>
                </>
              )}

              {error && <p className="alert alert--error">{error}</p>}

              <div className="overlay__actions">
                <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
                  Abbrechen
                </button>
                <button type="submit" className="btn" disabled={busy}>
                  {busy ? 'Speichere …' : fahrt ? 'Speichern' : 'Fahrt anlegen'}
                </button>
              </div>
            </form>

            {fahrt && (
              <div className="danger">
                <button
                  type="button"
                  className="btn btn--linkdanger"
                  onClick={() => {
                    setError(null)
                    setLoeschenBestaetigen(true)
                  }}
                >
                  Fahrt löschen
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
