import { useEffect, useState } from 'react'
import { listUsers, raeumeBildspeicherAuf, type Rolle, type TeamMember } from '../lib/supabase'
import { toGermanError } from '../lib/errors'

/**
 * Die Verwaltungsseite: alles, was die Leitung betrifft, an einer Stelle.
 *
 * Bewusst keine neuen Einstellungen in der Datenbank - die Seite fasst
 * zusammen, was es schon gibt: den Stand der Zugänge, wer was darf und die
 * Wartungsaufgaben, die sonst nirgends sichtbar sind.
 *
 * Nur für die Administration: die Koordination darf zwar fast dasselbe, diese
 * Seite bleibt aber der Administration vorbehalten.
 */
type Props = {
  onZurueck: () => void
}

const ROLLENNAME: Record<Rolle, string> = {
  admin: 'Administration',
  koordinator: 'Koordination',
  fahrer: 'Fahrer:innen',
}

const RECHTE: { was: string; wer: string }[] = [
  { was: 'Fahrten anlegen, ändern, absagen', wer: 'Administration, Koordination' },
  { was: 'Fahrtenbuch und Statistik einsehen, Angaben nachtragen', wer: 'Administration, Koordination' },
  { was: 'Personen anlegen, Angaben ändern, Zugänge sperren', wer: 'Administration, Koordination' },
  { was: 'Passwörter zurücksetzen', wer: 'Administration, Koordination' },
  { was: 'Zugänge der Administration löschen', wer: 'nur Administration' },
  { was: 'Die Rolle „Administration“ vergeben und entziehen', wer: 'nur Administration' },
  { was: 'Sich für Fahrten eintragen, Angaben zur eigenen Fahrt nachtragen', wer: 'alle' },
  { was: 'Pilot/-innen Liste ansehen, Chat lesen und schreiben', wer: 'alle' },
]

export function AdminEinstellungen({ onZurueck }: Props) {
  const [leute, setLeute] = useState<TeamMember[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [raeumtAuf, setRaeumtAuf] = useState(false)

  useEffect(() => {
    listUsers()
      .then(setLeute)
      .catch((err) => setError(toGermanError(err)))
  }, [])

  const zaehle = (pruefung: (m: TeamMember) => boolean) =>
    leute === null ? '–' : String(leute.filter(pruefung).length)

  async function aufraeumen() {
    setRaeumtAuf(true)
    setHinweis(null)
    setError(null)
    try {
      const anzahl = await raeumeBildspeicherAuf()
      setHinweis(
        anzahl === 0
          ? 'Der Bildspeicher ist bereits aufgeräumt.'
          : `${anzahl} ${anzahl === 1 ? 'Bild' : 'Bilder'} endgültig entfernt.`,
      )
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setRaeumtAuf(false)
    }
  }

  return (
    <>
      <button className="btn btn--zurueck" onClick={onZurueck}>
        ← Zurück zur Übersicht
      </button>

      <div className="seite__kopf">
        <div>
          <h2>Admin Einstellungen</h2>
          <p className="muted">Nur für die Administration.</p>
        </div>
      </div>

      {hinweis && <p className="alert alert--ok">{hinweis}</p>}
      {error && <p className="alert alert--error">{error}</p>}

      <section className="card">
        <h3>Zugänge</h3>
        <div className="kennzahlen">
          <div className="kennzahl">
            <span className="kennzahl__wert">{zaehle((m) => m.is_active)}</span>
            <span className="kennzahl__einheit">aktiv</span>
          </div>
          <div className="kennzahl">
            <span className="kennzahl__wert">{zaehle((m) => !m.is_active)}</span>
            <span className="kennzahl__einheit">gesperrt</span>
          </div>
          <div className="kennzahl">
            <span className="kennzahl__wert">{zaehle((m) => m.hat_passwort !== true)}</span>
            <span className="kennzahl__einheit">ohne Passwort</span>
            <span className="kennzahl__zusatz">noch nie angemeldet</span>
          </div>
        </div>

        <ul className="liste">
          {(['admin', 'koordinator', 'fahrer'] as Rolle[]).map((r) => (
            <li key={r}>
              {ROLLENNAME[r]}: <strong>{zaehle((m) => m.role === r)}</strong>
            </li>
          ))}
        </ul>

        <p className="muted card__text">
          Geändert wird in der Pilot/-innen Liste auf der Übersicht.
        </p>
      </section>

      <section className="card">
        <h3>Wer darf was?</h3>
        <ul className="rechte">
          {RECHTE.map((r) => (
            <li key={r.was}>
              <span>{r.was}</span>
              <span className="muted">{r.wer}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3>Wartung</h3>
        <p className="muted card__text">
          Gelöschte Chat-Bilder verschwinden sofort aus dem Verlauf, die Datei im Speicher wird
          erst danach entfernt. Das geschieht normalerweise von selbst; hier lässt es sich
          anstoßen, falls einmal etwas liegen geblieben ist.
        </p>
        <button className="btn btn--ghost" onClick={aufraeumen} disabled={raeumtAuf}>
          {raeumtAuf ? 'Räume auf …' : 'Bildspeicher aufräumen'}
        </button>
      </section>
    </>
  )
}
