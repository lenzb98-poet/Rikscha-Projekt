import type { AppUser } from '../lib/useAuth'
import { useFahrten } from '../lib/fahrten'
import { useAnsicht } from '../lib/useAnsicht'
import { Logo, RadelnLogo } from '../components/Marke'
import { MeineFahrten } from '../components/MeineFahrten'
import { AppEinrichten } from '../components/AppEinrichten'
import { Auswertung } from '../components/Auswertung'
import { TeamVerwaltung } from './TeamVerwaltung'
import { Chat } from './Chat'
import { Fahrten } from './Fahrten'
import { Fahrtenkalender } from './Fahrtenkalender'
import { FahrtenVerwaltung } from './FahrtenVerwaltung'

type Props = {
  profile: AppUser | null
  onSignOut: () => void
}

const ROLLEN: Record<AppUser['role'], string> = {
  admin: 'Administration',
  koordinator: 'Koordination',
  fahrer: 'Fahrer:in',
}

type Ansicht = 'start' | 'offene' | 'kommende' | 'kalender' | 'fahrten-verwalten' | 'team'

/** "3 offene Fahrten", "1 kommende Fahrt", "Zurzeit keine" */
function anzahlText(anzahl: number | null, einzahl: string, mehrzahl: string): string {
  if (anzahl === null) return '\u00a0'
  if (anzahl === 0) return 'Zurzeit keine'
  return `${anzahl} ${anzahl === 1 ? einzahl : mehrzahl}`
}

export function Dashboard({ profile, onSignOut }: Props) {
  const [ansicht, setAnsicht] = useAnsicht<Ansicht>('start')
  const istAdmin = profile?.role === 'admin'
  const zurueck = () => setAnsicht('start')

  const { fahrten, laden } = useFahrten()
  const offene = fahrten?.filter((f) => f.zustand === 'offen').length ?? null
  const kommende = fahrten?.filter((f) => f.zustand === 'besetzt').length ?? null

  function inhalt() {
    switch (ansicht) {
      case 'offene':
        return <Fahrten bereich="offen" onZurueck={zurueck} />
      case 'kommende':
        return <Fahrten bereich="kommend" onZurueck={zurueck} />
      case 'kalender':
        return <Fahrtenkalender onZurueck={zurueck} />
      case 'fahrten-verwalten':
        return istAdmin ? <FahrtenVerwaltung onZurueck={zurueck} /> : null
      case 'team':
        return istAdmin ? <TeamVerwaltung onZurueck={zurueck} /> : null
      default:
        return (
          <>
            <h2>Hallo {profile?.full_name ?? 'zusammen'}!</h2>
            {profile && <p className="muted">Angemeldet als {ROLLEN[profile.role]}</p>}

            <MeineFahrten alle={fahrten} onAktualisiert={laden} />

            <section className="card">
              <h3>Fahrten</h3>
              <div className="knopfreihe">
                <div className="knopfblock">
                  <button className="btn" onClick={() => setAnsicht('offene')}>
                    Offene Fahrten
                  </button>
                  <span className="knopfblock__zahl">
                    {anzahlText(offene, 'offene Fahrt', 'offene Fahrten')}
                  </span>
                </div>

                <div className="knopfblock">
                  <button className="btn" onClick={() => setAnsicht('kommende')}>
                    Kommende Fahrten
                  </button>
                  <span className="knopfblock__zahl">
                    {anzahlText(kommende, 'kommende Fahrt', 'kommende Fahrten')}
                  </span>
                </div>

                <div className="knopfblock">
                  <button className="btn" onClick={() => setAnsicht('kalender')}>
                    Fahrtenkalender
                  </button>
                </div>

                {istAdmin && (
                  <div className="knopfblock">
                    <button
                      className="btn btn--ghost"
                      onClick={() => setAnsicht('fahrten-verwalten')}
                    >
                      Fahrten verwalten
                    </button>
                  </div>
                )}
              </div>
            </section>

            <section className="abschnitt">
              <h3>Chat</h3>
              <p className="muted card__text">
                Nachrichten an alle Fahrer:innen und die Koordination.
              </p>
              <Chat istAdmin={istAdmin} />
            </section>

            {istAdmin && (
              <section className="card">
                <h3>Fahrer verwalten</h3>
                <p className="muted card__text">
                  Personen freischalten, Angaben ändern, Zugänge sperren oder Einträge entfernen.
                </p>
                <button className="btn" onClick={() => setAnsicht('team')}>
                  Fahrer verwalten
                </button>
              </section>
            )}

            <Auswertung alle={fahrten} />

            <AppEinrichten />
          </>
        )
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__marken">
          <Logo className="topbar__logo" />
          <RadelnLogo className="topbar__radeln" />
        </div>
        <button className="btn btn--ghost" onClick={onSignOut}>
          Abmelden
        </button>
      </header>

      <main className="content">{inhalt()}</main>
    </div>
  )
}
