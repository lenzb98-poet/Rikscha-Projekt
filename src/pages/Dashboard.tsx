import { useState } from 'react'
import type { AppUser } from '../lib/useAuth'
import { Logo } from '../components/Marke'
import { TeamVerwaltung } from './TeamVerwaltung'
import { Chat } from './Chat'

type Props = {
  profile: AppUser | null
  onSignOut: () => void
}

const ROLLEN: Record<AppUser['role'], string> = {
  admin: 'Administration',
  koordinator: 'Koordination',
  fahrer: 'Fahrer:in',
}

type Ansicht = 'start' | 'team' | 'chat'

export function Dashboard({ profile, onSignOut }: Props) {
  const [ansicht, setAnsicht] = useState<Ansicht>('start')

  const istAdmin = profile?.role === 'admin'

  return (
    <div className="app">
      <header className="topbar">
        <Logo className="topbar__logo" />
        <button className="btn btn--ghost" onClick={onSignOut}>
          Abmelden
        </button>
      </header>

      <main className="content">
        {ansicht === 'team' && istAdmin ? (
          <TeamVerwaltung onZurueck={() => setAnsicht('start')} />
        ) : ansicht === 'chat' ? (
          <Chat onZurueck={() => setAnsicht('start')} istAdmin={istAdmin} />
        ) : (
          <>
            <h2>Hallo {profile?.full_name ?? 'zusammen'}!</h2>
            {profile && <p className="muted">Angemeldet als {ROLLEN[profile.role]}</p>}

            {istAdmin && (
              <section className="card">
                <h3>Fahrer verwalten</h3>
                <p className="muted card__text">
                  Personen freischalten, Angaben ändern, Zugänge sperren oder Einträge
                  entfernen.
                </p>
                <button className="btn" onClick={() => setAnsicht('team')}>
                  Fahrer verwalten
                </button>
              </section>
            )}

            <section className="card">
              <h3>Chat</h3>
              <p className="muted card__text">
                Nachrichten an alle Fahrer:innen und die Koordination.
              </p>
              <button className="btn" onClick={() => setAnsicht('chat')}>
                Chat öffnen
              </button>
            </section>

            <section className="card">
              <h3>Nächste Schritte</h3>
              <ul className="todo">
                <li>Fahrten anlegen und Fahrer:innen zuordnen</li>
                <li>Verfügbarkeiten der Fahrer:innen pflegen</li>
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
