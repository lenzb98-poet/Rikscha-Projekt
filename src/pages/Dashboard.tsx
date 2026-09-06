import type { AppUser } from '../lib/useAuth'
import { useFahrten } from '../lib/fahrten'
import { useUngelesen } from '../lib/chatGelesen'
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
import { Fahrtenbuch } from './Fahrtenbuch'
import { AdminEinstellungen } from './AdminEinstellungen'

type Props = {
  profile: AppUser | null
  onSignOut: () => void
}

const ROLLEN: Record<AppUser['role'], string> = {
  admin: 'Administration',
  koordinator: 'Koordination',
  fahrer: 'Fahrer:in',
}

type Ansicht =
  | 'start'
  | 'offene'
  | 'kalender'
  | 'fahrten-verwalten'
  | 'fahrtenbuch'
  | 'team'
  | 'chat'
  | 'admin'

/** "3 offene Fahrten", "1 offene Fahrt", "Zurzeit keine" */
function anzahlText(anzahl: number | null, einzahl: string, mehrzahl: string): string {
  if (anzahl === null) return '\u00a0'
  if (anzahl === 0) return 'Zurzeit keine'
  return `${anzahl} ${anzahl === 1 ? einzahl : mehrzahl}`
}

export function Dashboard({ profile, onSignOut }: Props) {
  const [ansicht, setAnsicht] = useAnsicht<Ansicht>('start')
  // Koordination und Administration sind gleichgestellt. Einzige Ausnahme:
  // Zugänge der Administration löschen darf nur die Administration - dafür
  // wird istAdmin noch gebraucht.
  const istAdmin = profile?.role === 'admin'
  const darfVerwalten = istAdmin || profile?.role === 'koordinator'
  const zurueck = () => setAnsicht('start')

  const { fahrten, uebernahmen, laden } = useFahrten()
  const offene = fahrten?.filter((f) => f.zustand === 'offen').length ?? null
  // Die Ansicht als Anlass: zurück aus dem Chat wird sofort neu gezählt
  const ungelesen = useUngelesen(Boolean(profile), ansicht)

  function inhalt() {
    switch (ansicht) {
      case 'offene':
        return <Fahrten onZurueck={zurueck} />
      case 'kalender':
        return <Fahrtenkalender onZurueck={zurueck} />
      case 'fahrten-verwalten':
        return darfVerwalten ? <FahrtenVerwaltung onZurueck={zurueck} /> : null
      case 'fahrtenbuch':
        return darfVerwalten ? <Fahrtenbuch onZurueck={zurueck} /> : null
      case 'team':
        return (
          <TeamVerwaltung
            onZurueck={zurueck}
            darfVerwalten={darfVerwalten}
            istAdmin={istAdmin}
          />
        )
      case 'admin':
        return istAdmin ? <AdminEinstellungen onZurueck={zurueck} /> : null
      case 'chat':
        return <Chat onZurueck={zurueck} darfVerwalten={darfVerwalten} />
      default:
        return (
          <>
            <div className="seite__kopf">
              <div>
                <h2>Hallo {profile?.full_name ?? 'zusammen'}!</h2>
                {profile && <p className="muted">Angemeldet als {ROLLEN[profile.role]}</p>}
              </div>
              {/* Nur die Administration - Koordination und Fahrer:innen
                  sehen den Knopf nicht und kommen auch nicht in die Ansicht. */}
              {istAdmin && (
                <button
                  className="btn btn--ghost kopf__knopf"
                  onClick={() => setAnsicht('admin')}
                >
                  Admin Einstellungen
                </button>
              )}
            </div>

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
                  <button className="btn" onClick={() => setAnsicht('kalender')}>
                    Fahrtenkalender
                  </button>
                </div>

                {darfVerwalten && (
                  <div className="knopfblock">
                    <button
                      className="btn btn--ghost"
                      onClick={() => setAnsicht('fahrten-verwalten')}
                    >
                      Fahrten verwalten
                    </button>
                  </div>
                )}

                {darfVerwalten && (
                  <div className="knopfblock">
                    <button className="btn btn--ghost" onClick={() => setAnsicht('fahrtenbuch')}>
                      Fahrtenbuch / Statistik
                    </button>
                  </div>
                )}

                <div className="knopfblock knopfblock--breit">
                  <button className="btn btn--chat" onClick={() => setAnsicht('chat')}>
                    Piloten Chat
                    {ungelesen > 0 && (
                      <span
                        className="abzeichen"
                        aria-label={`${ungelesen} ungelesene ${
                          ungelesen === 1 ? 'Nachricht' : 'Nachrichten'
                        }`}
                      >
                        {ungelesen > 99 ? '99+' : ungelesen}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </section>

            <section className="card">
              <h3>Pilot/-innen Liste</h3>
              <p className="muted card__text">
                {darfVerwalten
                  ? 'Wer fährt mit? Personen freischalten, Angaben ändern, Zugänge sperren oder Einträge entfernen.'
                  : 'Wer fährt mit? Namen und Kontaktdaten aller Pilot:innen.'}
              </p>
              <button className="btn" onClick={() => setAnsicht('team')}>
                Pilot/-innen Liste
              </button>
            </section>

            <Auswertung alle={fahrten} uebernahmen={uebernahmen} />

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

      {/* Das Fahrtenbuch ist breit; dort darf der Inhalt mehr Platz nutzen. */}
      <main className={ansicht === 'fahrtenbuch' ? 'content content--breit' : 'content'}>
        {inhalt()}
      </main>
    </div>
  )
}
