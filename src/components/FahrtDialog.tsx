import { useEffect, useState } from 'react'
import {
  ZUSTAND_TEXT,
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
import { listHeime, heimOrt, infoMitTelefon, type Heim } from '../lib/heime'

type Props = {
  /** Fehlt beim Anlegen einer neuen Fahrt. */
  fahrt?: Fahrt
  onClose: () => void
  onGespeichert: (text: string) => void
}

/**
 * Gespeichert wird nur, was sich nicht ableiten lässt. "Automatisch" heißt:
 * Der Zustand ergibt sich aus Termin, Anmeldungen und nachgetragenen Angaben.
 * Früher stand hier "Geplant" – das verwirrte, weil im Feld weiter "Geplant"
 * stand, während die Fahrt längst als abgeschlossen angezeigt wurde.
 */
const STATUS: { wert: RideStatus; text: string }[] = [
  { wert: 'geplant', text: 'Automatisch (aus Termin und Angaben)' },
  { wert: 'abgeschlossen', text: 'Fest auf abgeschlossen' },
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
  /**
   * Die Anzahl als Text führen, nicht als Zahl.
   *
   * Als Zahl wurde ein geleertes Feld zu 0; tippte man danach eine 2, stand
   * dort "02". Umgewandelt wird deshalb erst beim Absenden.
   */
  const [anzahlText, setAnzahlText] = useState(String(fahrt?.pilots_needed ?? 1))
  const [alle, setAlle] = useState<Pilot[]>([])
  /** Die Vorlagen der Seniorenheime; gepflegt in den Admin Einstellungen. */
  const [heime, setHeime] = useState<Heim[]>([])
  /**
   * Ob die Namensliste ausgeklappt ist. Sie ist lang und meist gar nicht
   * nötig, weil sich Pilot:innen selbst eintragen - deshalb erst auf Wunsch.
   * Beim Bearbeiten offen, wenn bereits jemand zugeordnet ist.
   */
  const [zuordnen, setZuordnen] = useState((fahrt?.piloten ?? []).length > 0)
  const [dabei, setDabei] = useState<Set<string>>(
    () => new Set((fahrt?.piloten ?? []).map((p) => p.id)),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loeschenBestaetigen, setLoeschenBestaetigen] = useState(false)

  useEffect(() => {
    listPilots()
      .then(setAlle)
      .catch(() => setAlle([]))
    // Ohne Vorlagen lässt sich die Fahrt trotzdem anlegen - dann fehlt nur
    // die Abkürzung. Deshalb hier kein Fehler im Dialog.
    listHeime()
      .then(setHeime)
      .catch(() => setHeime([]))
  }, [])

  const anzahl = Number(anzahlText)
  const anzahlUngueltig = anzahlText === '' || !Number.isInteger(anzahl) || anzahl < 1 || anzahl > 20
  const zugeordnet = dabei.size
  // Mehr Personen als Rikschas gehen nicht: die Datenbank weist das ab,
  // also gar nicht erst anbieten.
  const plaetzeVoll = !anzahlUngueltig && zugeordnet >= anzahl

  function setze<K extends keyof FahrtEingabe>(feld: K, wert: FahrtEingabe[K]) {
    setWerte((w) => ({ ...w, [feld]: wert }))
  }

  /** Ort und Telefonnummer des Hauses in einem Schritt übernehmen. */
  function waehleHeim(h: Heim) {
    setWerte((w) => ({
      ...w,
      location: heimOrt(h),
      info: infoMitTelefon(w.info, h, heime),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (anzahlUngueltig) {
      setError('Bitte für die benötigten Pilot:innen eine Zahl zwischen 1 und 20 angeben.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      if (fahrt) {
        await updateRide(fahrt.id, { ...werte, pilotsNeeded: anzahl })
        onGespeichert('Die Fahrt wurde gespeichert.')
      } else {
        const neueId = await createRide({ ...werte, pilotsNeeded: anzahl })

        // Erst nach dem Anlegen gibt es die Fahrt, der die Plätze gehören.
        // Scheitert eine Zuordnung, bleibt die Fahrt trotzdem bestehen -
        // deshalb wird gesammelt gemeldet statt abgebrochen.
        const misslungen: string[] = []
        for (const p of alle.filter((p) => dabei.has(p.id))) {
          try {
            await setPilot(neueId, p.id, true)
          } catch {
            misslungen.push(p.name)
          }
        }

        onGespeichert(
          misslungen.length === 0
            ? zugeordnet === 0
              ? 'Die Fahrt wurde angelegt und steht jetzt unter „Offene Fahrten“.'
              : `Die Fahrt wurde angelegt, ${zugeordnet === 1 ? 'eine Person ist' : `${zugeordnet} Personen sind`} zugeordnet.`
            : `Die Fahrt wurde angelegt. Nicht zuordnen ließ sich: ${misslungen.join(', ')}.`,
        )
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

  function merke(id: string, neu: boolean) {
    setDabei((s) => {
      const kopie = new Set(s)
      if (neu) kopie.add(id)
      else kopie.delete(id)
      return kopie
    })
  }

  async function schaltePilot(p: Pilot) {
    const neu = !dabei.has(p.id)

    // Beim Anlegen gibt es die Fahrt noch nicht; gespeichert wird die
    // Auswahl dann erst beim Absenden.
    if (!fahrt) {
      merke(p.id, neu)
      return
    }

    try {
      await setPilot(fahrt.id, p.id, neu)
      merke(p.id, neu)
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
                : 'Wer schon feststeht, lässt sich gleich zuordnen; die übrigen Plätze bleiben offen.'}
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

              {heime.length > 0 && (
              <div className="field">
                <span className="field__label">
                  Seniorenheim <span className="field__optional">Vorlage</span>
                </span>
                <div className="heimwahl">
                  {heime.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      className={
                        werte.location === heimOrt(h) ? 'heimchip heimchip--an' : 'heimchip'
                      }
                      onClick={() => waehleHeim(h)}
                    >
                      {h.name}
                    </button>
                  ))}
                </div>
                <span className="hint">
                  Ein Tipp darauf trägt Anschrift und Telefonnummer ein. Beides lässt sich
                  danach noch ändern.
                </span>
              </div>
              )}

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
                  {/* type="text" statt "number": Das Zahlenfeld machte aus
                      einem geleerten Feld eine 0, sodass eine getippte 2 zu
                      "02" wurde. inputMode holt am Handy die Zifferntastatur. */}
                  <input
                    id="fahrt-anzahl"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={anzahlText}
                    onChange={(e) => setAnzahlText(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    required
                  />
                </div>
                <span className="hint">
                  Sobald so viele eingetragen sind, gilt die Fahrt als zugesagt und
                  verschwindet aus den offenen Fahrten.
                </span>
              </label>

              {fahrt && (
                <>
                  <label className="field" htmlFor="fahrt-status">
                    <span className="field__label">Status</span>
                    <span className="hint">
                      Zustand derzeit: <strong>{ZUSTAND_TEXT[fahrt.zustand]}</strong>
                    </span>
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

                </>
              )}

              <div className="field">
                <label className="check check--schlank" htmlFor="fahrt-zuordnen">
                  <input
                    id="fahrt-zuordnen"
                    type="checkbox"
                    checked={zuordnen}
                    onChange={(e) => {
                      setZuordnen(e.target.checked)
                      // Abgehakt heißt: niemanden zuordnen. Beim Bearbeiten
                      // bleiben bereits gespeicherte Zuordnungen bestehen -
                      // sie hier still zu lösen wäre eine böse Überraschung.
                      if (!e.target.checked && !fahrt) setDabei(new Set())
                    }}
                  />
                  <span>
                    <strong>Pilot:innen zuordnen</strong>
                    <span className="check__hint">
                      {zugeordnet > 0
                        ? `${zugeordnet} ${zugeordnet === 1 ? 'Person ist' : 'Personen sind'} zugeordnet.`
                        : 'Sonst tragen sich Pilot:innen selbst ein.'}
                    </span>
                  </span>
                </label>
              </div>

              {zuordnen && (
              <div className="field">
                <div className="pilotwahl">
                  {alle.length === 0 && <span className="muted">Lade Liste …</span>}
                  {alle.map((p) => {
                    const drin = dabei.has(p.id)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={drin ? 'pilotchip pilotchip--an' : 'pilotchip'}
                        onClick={() => schaltePilot(p)}
                        disabled={busy || (!drin && plaetzeVoll)}
                      >
                        {drin ? '✓ ' : '+ '}
                        {p.name}
                      </button>
                    )
                  })}
                </div>
                <span className="hint">
                  {zugeordnet} von {anzahlUngueltig ? '?' : anzahl} zugeordnet.{' '}
                  {plaetzeVoll
                    ? 'Für mehr Personen die Zahl der benötigten Pilot:innen erhöhen.'
                    : fahrt
                      ? 'Änderungen wirken sofort.'
                      : 'Die übrigen Plätze bleiben offen, dort tragen sich Pilot:innen selbst ein.'}
                </span>
              </div>
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
