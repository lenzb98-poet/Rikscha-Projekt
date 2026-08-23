import { useState } from 'react'
import type { AppUser } from '../lib/useAuth'
import { AddUserDialog } from '../components/AddUserDialog'

type Props = {
  profile: AppUser | null
  onSignOut: () => void
}

const ROLLEN: Record<AppUser['role'], string> = {
  admin: 'Administration',
  koordinator: 'Koordination',
  fahrer: 'Fahrer:in',
}

export function Dashboard({ profile, onSignOut }: Props) {
  const [dialogOffen, setDialogOffen] = useState(false)
  const [hinweis, setHinweis] = useState<string | null>(null)

  const istAdmin = profile?.role === 'admin'

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
        <h2>Hallo {profile?.full_name ?? 'zusammen'}!</h2>
        {profile && <p className="muted">Angemeldet als {ROLLEN[profile.role]}</p>}

        {hinweis && <p className="alert alert--ok">{hinweis}</p>}

        {istAdmin && (
          <section className="card">
            <h3>Team verwalten</h3>
            <p className="muted card__text">
              Neue Fahrer:innen freischalten. Sie melden sich anschließend mit ihrem Namen an
              und vergeben dabei selbst ein Passwort.
            </p>
            <button className="btn" onClick={() => setDialogOffen(true)}>
              Fahrer hinzufügen
            </button>
          </section>
        )}

        <section className="card">
          <h3>Nächste Schritte</h3>
          <ul className="todo">
            <li>Fahrten anlegen und Fahrer:innen zuordnen</li>
            <li>Verfügbarkeiten der Fahrer:innen pflegen</li>
            <li>Chat zwischen Koordination und Fahrer:innen</li>
          </ul>
        </section>
      </main>

      {dialogOffen && (
        <AddUserDialog
          onClose={() => setDialogOffen(false)}
          onCreated={(name, alsAdmin) => {
            setDialogOffen(false)
            setHinweis(
              `${name} wurde hinzugefügt${alsAdmin ? ' – mit Administratorrechten' : ''}. ` +
                'Die Anmeldung erfolgt mit diesem Namen.',
            )
          }}
        />
      )}
    </div>
  )
}
