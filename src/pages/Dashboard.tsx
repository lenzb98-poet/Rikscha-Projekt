import { useState } from 'react'
import type { AppUser } from '../lib/useAuth'
import { Logo } from '../components/Marke'
import { MeineFahrten } from '../components/MeineFahrten'
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

type Ansicht =
  | 'start'
  | 'offene'
  | 'kommende'
  | 'kalender'
  | 'fahrten-verwalten'
  | 'team'
  | 'chat'

export function Dashboard({ profile, onSignOut }: Props) {
  const [ansicht, setAnsicht] = useState<Ansicht>('start')
  const istAdmin = profile?.role === 'admin'
  const zurueck = () => setAnsicht('start')

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
      case 'chat':
        return <Chat onZurueck={zurueck} istAdmin={istAdmin} />
      default:
        return (
          <>
            <h2>Hallo {profile?.full_name ?? 'zusammen'}!</h2>
            {profile && <p className="muted">Angemeldet als {ROLLEN[profile.role]}</p>}

            <MeineFahrten />

            <section className="card">
              <h3>Fahrten</h3>
              <div className="knopfreihe">
                <button className="btn" onClick={() => setAnsicht('offene')}>
                  Offene Fahrten
                </button>
                <button className="btn" onClick={() => setAnsicht('kommende')}>
                  Kommende Fahrten
                </button>
                <button className="btn" onClick={() => setAnsicht('kalender')}>
                  Fahrtenkalender
                </button>
                {istAdmin && (
                  <button className="btn btn--ghost" onClick={() => setAnsicht('fahrten-verwalten')}>
                    Fahrten verwalten
                  </button>
                )}
              </div>
            </section>

            <section className="card">
              <h3>Chat</h3>
              <p className="muted card__text">
                Nachrichten an alle Fahrer:innen und die Koordination.
              </p>
              <button className="btn" onClick={() => setAnsicht('chat')}>
                Chat öffnen
              </button>
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
          </>
        )
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <Logo className="topbar__logo" />
        <button className="btn btn--ghost" onClick={onSignOut}>
          Abmelden
        </button>
      </header>

      <main className="content">{inhalt()}</main>
    </div>
  )
}
