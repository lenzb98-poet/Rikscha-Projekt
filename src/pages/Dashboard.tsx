import { useState } from 'react'
import type { AppUser } from '../lib/useAuth'
import type { TeamMember } from '../lib/supabase'
import { AddUserDialog } from '../components/AddUserDialog'
import { EditUserDialog } from '../components/EditUserDialog'
import { TeamList } from '../components/TeamList'
import { Logo } from '../components/Marke'

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
  const [addOffen, setAddOffen] = useState(false)
  const [bearbeitet, setBearbeitet] = useState<TeamMember | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const istAdmin = profile?.role === 'admin'

  function aktualisiert(text: string) {
    setHinweis(text)
    setVersion((v) => v + 1)
  }

  return (
    <div className="app">
      <header className="topbar">
        <Logo className="topbar__logo" />
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
            <div className="card__head">
              <h3>Team verwalten</h3>
              <button className="btn" onClick={() => setAddOffen(true)}>
                Fahrer hinzufügen
              </button>
            </div>
            <TeamList version={version} onEdit={setBearbeitet} />
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

      {addOffen && (
        <AddUserDialog
          onClose={() => setAddOffen(false)}
          onCreated={(name, alsAdmin) => {
            setAddOffen(false)
            aktualisiert(
              `${name} wurde hinzugefügt${alsAdmin ? ' – mit Administratorrechten' : ''}. ` +
                'Die Anmeldung erfolgt mit diesem Namen.',
            )
          }}
        />
      )}

      {bearbeitet && (
        <EditUserDialog
          member={bearbeitet}
          onClose={() => setBearbeitet(null)}
          onSaved={(m) => {
            setBearbeitet(null)
            aktualisiert(
              m.is_active
                ? `${m.full_name} wurde gespeichert.`
                : `${m.full_name} wurde deaktiviert und kann sich nicht mehr anmelden.`,
            )
          }}
          onDeleted={(name) => {
            setBearbeitet(null)
            aktualisiert(`${name} wurde gelöscht.`)
          }}
        />
      )}
    </div>
  )
}
