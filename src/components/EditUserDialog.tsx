import { useState } from 'react'
import { deleteUser, updateUser, type Rolle, type TeamMember } from '../lib/supabase'
import { toGermanError } from '../lib/errors'

type Props = {
  member: TeamMember
  onClose: () => void
  onSaved: (member: TeamMember) => void
  onDeleted: (name: string) => void
}

const ROLLEN: { wert: Rolle; text: string }[] = [
  { wert: 'fahrer', text: 'Fahrer:in' },
  { wert: 'koordinator', text: 'Koordination' },
  { wert: 'admin', text: 'Administration' },
]

export function EditUserDialog({ member, onClose, onSaved, onDeleted }: Props) {
  const [name, setName] = useState(member.full_name)
  const [rolle, setRolle] = useState<Rolle>(member.role)
  const [aktiv, setAktiv] = useState(member.is_active)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Löschen ist endgültig, deshalb erst nach einer Rückfrage
  const [loeschenBestaetigen, setLoeschenBestaetigen] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      onSaved(await updateUser(member.id, name, rolle, aktiv))
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setError(null)
    setBusy(true)
    try {
      onDeleted(await deleteUser(member.id))
    } catch (err) {
      setError(toGermanError(err))
      setLoeschenBestaetigen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-user-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="overlay__card">
        {loeschenBestaetigen ? (
          <>
            <h3 id="edit-user-title">Wirklich löschen?</h3>
            <p className="overlay__intro">
              <strong>{member.full_name}</strong> wird endgültig entfernt, zusammen mit dem
              Anmeldekonto. Das lässt sich nicht rückgängig machen.
            </p>
            <p className="alert alert--warn">
              Soll die Person nur keinen Zugang mehr haben, ist „Zugang freigeschaltet"
              abzuwählen die bessere Wahl – der Eintrag bleibt dann erhalten.
            </p>

            {error && <p className="alert alert--error">{error}</p>}

            <div className="overlay__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setLoeschenBestaetigen(false)}
                disabled={busy}
              >
                Abbrechen
              </button>
              <button type="button" className="btn btn--danger" onClick={handleDelete} disabled={busy}>
                {busy ? 'Lösche …' : 'Endgültig löschen'}
              </button>
            </div>
          </>
        ) : (
          <>
        <h3 id="edit-user-title">Eintrag bearbeiten</h3>
        <p className="muted overlay__intro">
          Eine Namensänderung ändert den Anmeldenamen. Ein bereits gesetztes Passwort bleibt
          gültig.
        </p>

        <form onSubmit={handleSubmit} className="auth__form">
          <label className="field" htmlFor="edit-name">
            <span className="field__label">Vor- und Nachname</span>
            <div className="field__wrap">
              <input
                id="edit-name"
                type="text"
                value={name}
                autoCapitalize="words"
                autoFocus
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          </label>

          <label className="field" htmlFor="edit-role">
            <span className="field__label">Rolle</span>
            <div className="field__wrap">
              <select
                id="edit-role"
                value={rolle}
                onChange={(e) => setRolle(e.target.value as Rolle)}
              >
                {ROLLEN.map((r) => (
                  <option key={r.wert} value={r.wert}>
                    {r.text}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <label className="check" htmlFor="edit-active">
            <input
              id="edit-active"
              type="checkbox"
              checked={aktiv}
              onChange={(e) => setAktiv(e.target.checked)}
            />
            <span>
              <strong>Zugang freigeschaltet</strong>
              <span className="check__hint">
                Ohne Freischaltung ist keine Anmeldung möglich. Der Eintrag bleibt erhalten.
              </span>
            </span>
          </label>

          {error && <p className="alert alert--error">{error}</p>}

          <div className="overlay__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
              Abbrechen
            </button>
            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'Speichere …' : 'Speichern'}
            </button>
          </div>
        </form>

        <div className="danger">
          <button
            type="button"
            className="btn btn--linkdanger"
            onClick={() => {
              setError(null)
              setLoeschenBestaetigen(true)
            }}
          >
            Eintrag löschen
          </button>
        </div>
          </>
        )}
      </div>
    </div>
  )
}
