import { useCallback, useEffect, useState } from 'react'
import {
  RIKSCHAS,
  deleteUebernahme,
  formatiereKomma,
  formatiereZahl,
  listRides,
  listUebernahmen,
  minutenAlsStunden,
  slotReport,
  watchRides,
  werteAusGesamt,
  type Fahrt,
  type Platz,
  type Uebernahme,
} from '../lib/fahrten'
import { toGermanError } from '../lib/errors'
import { UebernahmeDialog } from '../components/UebernahmeDialog'

const datum = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Minuten als Stunden mit Komma, wie im bisherigen Fahrtenbuch (2,5 statt 150). */
function alsStundenZahl(minuten: number | null): string {
  if (minuten === null) return ''
  return formatiereKomma(Math.round((minuten / 60) * 100) / 100)
}

/** Eine Zeile der Tabelle: ein Rikscha-Platz einer Fahrt. */
type Zeile = { fahrt: Fahrt; platz: Platz | null }

type Werte = { km: string; stunden: string; personen: string; bemerkung: string }

function werteVon(p: Platz | null): Werte {
  return {
    km: p?.report_km !== null && p?.report_km !== undefined ? formatiereKomma(p.report_km) : '',
    stunden: minutenAlsStunden(p?.report_minutes ?? null),
    personen: p?.report_passengers !== null && p?.report_passengers !== undefined
      ? String(p.report_passengers)
      : '',
    bemerkung: p?.report_bemerkung ?? '',
  }
}

/**
 * Eine editierbare Zahlen-/Text-Zelle. Speichert erst beim Verlassen des
 * Felds, damit nicht bei jedem Tastendruck ein Netzwerk-Aufruf losgeht.
 * Neu gemountet (per key von außen), sobald sich der gespeicherte Wert
 * anderswo geändert hat – während man selbst tippt, bleibt sie unberührt.
 */
function Zelle({
  wert,
  breit,
  platzhalter,
  onSpeichern,
}: {
  wert: string
  breit?: boolean
  platzhalter?: string
  onSpeichern: (neu: string) => void
}) {
  const [text, setText] = useState(wert)
  return (
    <input
      className={breit ? 'tab__eingabe tab__eingabe--lang' : 'tab__eingabe'}
      type="text"
      value={text}
      placeholder={platzhalter}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== wert) onSpeichern(text)
      }}
    />
  )
}

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

  async function speichern(slotId: string, werte: Werte, rikscha: Platz['rikscha']) {
    try {
      await slotReport(slotId, { ...werte, rikscha: rikscha ?? '' })
      laden()
    } catch (err) {
      setError(toGermanError(err))
    }
  }

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

  // Je belegtem Platz eine Zeile. Fahrten ohne eingetragene Person erscheinen
  // mit einer Zeile, damit sie im Buch nicht fehlen.
  const zeilen: Zeile[] = (fahrten ?? []).flatMap<Zeile>((fahrt) => {
    const belegt = fahrt.plaetze.filter((p) => p.pilot_id !== null)
    return belegt.length > 0
      ? belegt.map((platz) => ({ fahrt, platz }))
      : [{ fahrt, platz: null }]
  })

  return (
    <>
      <button className="btn btn--zurueck" onClick={onZurueck}>
        ← Zurück zur Übersicht
      </button>

      <div className="seite__kopf">
        <div>
          <h2>Fahrtenbuch und Statistik</h2>
          <p className="muted">Jede gefahrene Rikscha steht einzeln</p>
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
            <table className="tab tab--buch">
              <thead>
                <tr>
                  <th rowSpan={2} className="tab__fix">Nr.</th>
                  <th rowSpan={2}>Datum</th>
                  <th rowSpan={2}>Fahrer / Fahrerin</th>
                  <th colSpan={4} className="tab__gruppe">Rikscha</th>
                  <th rowSpan={2} className="tab__zahl">Passagiere</th>
                  <th rowSpan={2} className="tab__zahl">Gefahrene KM</th>
                  <th rowSpan={2} className="tab__zahl">Dauer / Zeit</th>
                  <th rowSpan={2}>Bemerkungen</th>
                </tr>
                <tr>
                  {RIKSCHAS.map((r) => (
                    <th key={r} className="tab__kreuz">
                      {r}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {/* Übernommene Zahlen stehen ganz oben, vor den einzelnen Fahrten */}
                {uebernahmen.map((u) => (
                  <tr key={u.id} className="tab__uebernahme">
                    <td className="tab__fix">–</td>
                    <td>–</td>
                    <td>{u.bezeichnung}</td>
                    {RIKSCHAS.map((r) => (
                      <td key={r} className="tab__kreuz" />
                    ))}
                    <td className="tab__zahl">{formatiereZahl(u.personen)}</td>
                    <td className="tab__zahl">{formatiereKomma(Number(u.km))}</td>
                    <td className="tab__zahl">{alsStundenZahl(u.minuten)}</td>
                    <td>
                      Aus der bisherigen Statistik
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
                  </tr>
                ))}

                {zeilen.map(({ fahrt, platz }, i) => {
                  // Ohne Eintrag den ersten Platz der Fahrt zum Nachtragen nutzen,
                  // damit sich auch unbesetzte Fahrten von Hand ergänzen lassen.
                  // Die Datenbank nimmt Angaben nur zu stattgefundenen, nicht
                  // abgesagten Fahrten an. Sonst bliebe hier ein Feld stehen,
                  // das sich ausfüllen lässt, aber nie speichern kann.
                  const nachtragbar =
                    new Date(fahrt.starts_at) < new Date() && fahrt.status !== 'abgesagt'
                  const ziel = nachtragbar ? (platz ?? fahrt.plaetze[0] ?? null) : null
                  const werte = werteVon(platz)
                  const zeilenSchluessel = `${platz?.id ?? fahrt.id}-${ziel?.report_at ?? ''}`

                  return (
                    <tr key={zeilenSchluessel}>
                      <td className="tab__fix">{i + 1}</td>
                      <td>{datum(fahrt.starts_at)}</td>
                      <td>{platz?.pilot_name ?? <span className="tab__leer">nicht besetzt</span>}</td>

                      {RIKSCHAS.map((r) => (
                        <td key={r} className="tab__kreuz">
                          {platz?.rikscha === r ? 'X' : ''}
                        </td>
                      ))}

                      <td className="tab__zahl">
                        {ziel ? (
                          <Zelle
                            wert={werte.personen}
                            onSpeichern={(neu) =>
                              speichern(ziel.id, { ...werte, personen: neu }, ziel.rikscha)
                            }
                          />
                        ) : (
                          werte.personen
                        )}
                      </td>
                      <td className="tab__zahl">
                        {ziel ? (
                          <Zelle
                            wert={werte.km}
                            onSpeichern={(neu) =>
                              speichern(ziel.id, { ...werte, km: neu }, ziel.rikscha)
                            }
                          />
                        ) : (
                          werte.km
                        )}
                      </td>
                      <td className="tab__zahl">
                        {ziel ? (
                          <Zelle
                            wert={werte.stunden}
                            onSpeichern={(neu) =>
                              speichern(ziel.id, { ...werte, stunden: neu }, ziel.rikscha)
                            }
                          />
                        ) : (
                          werte.stunden
                        )}
                      </td>
                      <td className="tab__lang">
                        {ziel ? (
                          <Zelle
                            breit
                            wert={werte.bemerkung}
                            platzhalter={[fahrt.location, fahrt.info].filter(Boolean).join(' · ')}
                            onSpeichern={(neu) =>
                              speichern(ziel.id, { ...werte, bemerkung: neu }, ziel.rikscha)
                            }
                          />
                        ) : (
                          werte.bemerkung || [fahrt.location, fahrt.info].filter(Boolean).join(' · ')
                        )}
                        {fahrt.zustand === 'abgesagt' && (
                          <span className="tab__markierung"> (abgesagt)</span>
                        )}
                      </td>
                    </tr>
                  )
                })}

                {zeilen.length === 0 && uebernahmen.length === 0 && (
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
                  <td colSpan={6}>
                    {formatiereZahl(zeilen.length)}{' '}
                    {zeilen.length === 1 ? 'Eintrag' : 'Einträge'}
                    {uebernahmen.length > 0 &&
                      ` und ${formatiereZahl(uebernahmen.length)} ${
                        uebernahmen.length === 1 ? 'Übernahme' : 'Übernahmen'
                      }`}
                  </td>
                  <td className="tab__zahl">{formatiereZahl(summe.personen)}</td>
                  <td className="tab__zahl">{formatiereKomma(summe.km)}</td>
                  <td className="tab__zahl">{alsStundenZahl(summe.minuten)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="hint tab__hinweis">
            Die Tabelle lässt sich zur Seite schieben, wenn nicht alle Spalten hineinpassen.
            Die Dauer steht in Stunden, wie im bisherigen Fahrtenbuch.
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
