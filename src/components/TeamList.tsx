import { useEffect, useState } from 'react'
import { listUsers, type Rolle, type TeamMember } from '../lib/supabase'
import { toGermanError } from '../lib/errors'

const ROLLEN_TEXT: Record<Rolle, string> = {
  admin: 'Administration',
  koordinator: 'Koordination',
  fahrer: 'Fahrer:in',
}

type Props = {
  /** Wird erhöht, wenn sich etwas geändert hat – löst ein Neuladen aus. */
  version: number
  onEdit: (member: TeamMember) => void
}

export function TeamList({ version, onEdit }: Props) {
  const [members, setMembers] = useState<TeamMember[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    listUsers()
      .then((rows) => {
        if (!cancelled) setMembers(rows)
      })
      .catch((err) => {
        if (!cancelled) setError(toGermanError(err))
      })
    return () => {
      cancelled = true
    }
  }, [version])

  if (error) return <p className="alert alert--error">{error}</p>
  if (!members) return <p className="muted">Lade Team …</p>
  if (members.length === 0) return <p className="muted">Noch keine Einträge vorhanden.</p>

  return (
    <ul className="team">
      {members.map((m) => (
        <li key={m.id} className={m.is_active ? 'team__row' : 'team__row team__row--inaktiv'}>
          <div className="team__info">
            <span className="team__name">{m.full_name}</span>
            <span className="team__meta">
              {ROLLEN_TEXT[m.role]}
              {!m.is_active && <span className="badge">Deaktiviert</span>}
            </span>
          </div>
          <button className="btn btn--ghost" onClick={() => onEdit(m)}>
            Bearbeiten
          </button>
        </li>
      ))}
    </ul>
  )
}
