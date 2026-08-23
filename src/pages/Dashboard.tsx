import type { AppUser } from '../lib/useAuth'

type Props = {
  profile: AppUser | null
  email: string
  onSignOut: () => void
}

export function Dashboard({ profile, email, onSignOut }: Props) {
  return (
    <div className="app">
      <header className="topbar">
        <div>
          <strong>Rikscha-Fahrten</strong>
          <span className="topbar__sub">Hospizinitiative Melle</span>
        </div>
        <button className="btn btn--ghost" onClick={onSignOut}>
          Abmelden
        </button>
      </header>

      <main className="content">
        <h2>Hallo {profile?.full_name ?? email}!</h2>
        <p className="muted">
          Angemeldet als <strong>{email}</strong>
          {profile ? ` · Rolle: ${profile.role}` : ''}
        </p>

        <section className="card">
          <h3>Nächste Schritte</h3>
          <ul className="todo">
            <li>Fahrten anlegen und Fahrer:innen zuordnen</li>
            <li>Verfügbarkeiten der Fahrer:innen pflegen</li>
            <li>Chat zwischen Koordination und Fahrer:innen</li>
          </ul>
        </section>
      </main>
    </div>
  )
}
