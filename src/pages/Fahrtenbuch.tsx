import { useCallback, useEffect, useState } from 'react'
import {
  ZUSTAND_TEXT,
  deleteUebernahme,
  formatiereKomma,
  formatiereZahl,
  listRides,
  listUebernahmen,
  watchRides,
  werteAusGesamt,
  type Fahrt,
  type Uebernahme,
} from '../lib/fahrten'
import { toGermanError } from '../lib/errors'
import { UebernahmeDialog } from '../components/UebernahmeDialog'

const datum = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
const uhrzeit = (iso: string) =>
  new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

/** Zahl oder Strich, wenn nichts eingetragen ist. */
const wert = (n: number | null, formatiert = formatiereZahl) =>
  n === null ? <span className="tab__leer">–</span> : formatiert(n)

export function Fahrtenbuch({ onZurueck }: { onZurueck: () => void }) {
  const [fahrten, setFahrten] = useState<Fahrt[] | null>(null)
  const [uebernahmen, setUebernahmen] = useState<Uebernahme[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ offen: boolean; eintrag?: Uebernahme } | null>(null)

  const laden = useCallback(() => {
    listRides('alle')
      .then(setFahrten)
      .catch((err) => setError(toGermanError(err)))
    listUebernahmen()
      .then(setUebernahmen)
      .catch(() => setUebernahmen([]))
  }, [])

  useEffect(() => {
    laden()
    return watchRides(laden)
  }, [laden])

  async function entfernen(u: Uebernahme) {
    if (!confirm(`Übernahme „${u.bezeichnung}" entfernen?`)) return
    try {
      await deleteUebernahme(u.id)
      setHinweis('Die Übernahme wurde entfernt.')
      laden()
    } catch (err) {
      setError(toGermanError(err))
    }
  }

  const summe = werteAusGesamt(fahrten ?? [], uebernahmen)

  return (
    <>
      <button className="btn btn--zurueck" onClick={onZurueck}>
        ← Zurück zur Übersicht
      </button>

      <div className="seite__kopf">
        <div>
          <h2>Fahrtenbuch und Statistik</h2>
          <p className="muted">Alle Fahrten und die übernommenen Zahlen im Überblick</p>
        </div>
        <button className="btn" onClick={() => setDialog({ offen: true })}>
          Zahlen übernehmen
        </button>
      </div>

      {hinweis && <p className="alert alert--ok">{hinweis}</p>}
      {error && <p className="alert alert--error">{error}</p>}
      {!fahrten && !error && <p className="muted">Lade Fahrtenbuch …</p>}

      {fahrten && (
        <>
          <div className="tab__rahmen">
            <table className="tab">
              <thead>
                <tr>
                  <th className="tab__fix">Datum</th>
                  <th>Uhrzeit</th>
                  <th>Wo</th>
                  <th>Zustand</th>
                  <th>Pilot:innen</th>
                  <th className="tab__zahl">km</th>
                  <th className="tab__zahl">Minuten</th>
                  <th className="tab__zahl">Fahrgäste</th>
                  <th>Infotext</th>
                  <th>Mitteilungen</th>
                  <th>Nachgetragen von</th>
                </tr>
              </thead>

              <tbody>
                {/* Übernommene Zahlen stehen ganz oben, vor den einzelnen Fahrten */}
                {uebernahmen.map((u) => (
                  <tr key={u.id} className="tab__uebernahme">
                    <td className="tab__fix">Übernahme</td>
                    <td>–</td>
                    <td>{u.bezeichnung}</td>
                    <td>–</td>
                    <td>–</td>
                    <td className="tab__zahl">{formatiereKomma(Number(u.km))}</td>
                    <td className="tab__zahl">{formatiereZahl(u.minuten)}</td>
                    <td className="tab__zahl">{formatiereZahl(u.personen)}</td>
                    <td>Aus der bisherigen Statistik</td>
                    <td>
                      <button
                        className="tab__knopf"
                        onClick={() => setDialog({ offen: true, eintrag: u })}
                      >
                        Bearbeiten
                      </button>
                      <button className="tab__knopf tab__knopf--weg" onClick={() => entfernen(u)}>
                        Entfernen
                      </button>
                    </td>
                    <td>{u.erfasst_von ?? '–'}</td>
                  </tr>
                ))}

                {fahrten.map((f) => (
                  <tr key={f.id}>
                    <td className="tab__fix">{datum(f.starts_at)}</td>
                    <td>{uhrzeit(f.starts_at)}</td>
                    <td>{f.location}</td>
                    <td>
                      <span className={`chip chip--${f.zustand}`}>{ZUSTAND_TEXT[f.zustand]}</span>
                    </td>
                    <td>{f.piloten.map((p) => p.name).join(', ') || <span className="tab__leer">–</span>}</td>
                    <td className="tab__zahl">{wert(f.report_km, formatiereKomma)}</td>
                    <td className="tab__zahl">{wert(f.report_minutes)}</td>
                    <td className="tab__zahl">{wert(f.report_passengers)}</td>
                    <td className="tab__lang">{f.info || <span className="tab__leer">–</span>}</td>
                    <td className="tab__lang">
                      {f.notizen.length === 0 ? (
                        <span className="tab__leer">–</span>
                      ) : (
                        f.notizen.map((n) => `${n.name}: ${n.body}`).join(' | ')
                      )}
                    </td>
                    <td>{f.report_name ?? <span className="tab__leer">–</span>}</td>
                  </tr>
                ))}

                {fahrten.length === 0 && uebernahmen.length === 0 && (
                  <tr>
                    <td colSpan={11} className="tab__leerzeile">
                      Noch keine Fahrten und keine übernommenen Zahlen.
                    </td>
                  </tr>
                )}
              </tbody>

              <tfoot>
                <tr>
                  <td className="tab__fix">Summe</td>
                  <td colSpan={4}>
                    {formatiereZahl(fahrten.length)} Fahrten
                    {uebernahmen.length > 0 &&
                      ` und ${formatiereZahl(uebernahmen.length)} ${
                        uebernahmen.length === 1 ? 'Übernahme' : 'Übernahmen'
                      }`}
                  </td>
                  <td className="tab__zahl">{formatiereKomma(summe.km)}</td>
                  <td className="tab__zahl">{formatiereZahl(summe.minuten)}</td>
                  <td className="tab__zahl">{formatiereZahl(summe.personen)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="hint tab__hinweis">
            Die Tabelle lässt sich zur Seite schieben, wenn nicht alle Spalten hineinpassen.
          </p>
        </>
      )}

      {dialog?.offen && (
        <UebernahmeDialog
          eintrag={dialog.eintrag}
          onClose={() => setDialog(null)}
          onGespeichert={(text) => {
            setDialog(null)
            setHinweis(text)
            laden()
          }}
        />
      )}
    </>
  )
}
