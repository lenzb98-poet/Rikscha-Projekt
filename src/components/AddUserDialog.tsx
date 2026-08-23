import { useState } from 'react'
import { createUser } from '../lib/supabase'
import { toGermanError } from '../lib/errors'

type Props = {
  onClose: () => void
  onCreated: (name: string, isAdmin: boolean) => void
}

export function AddUserDialog({ onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const created = await createUser(name, isAdmin)
      onCreated(created.full_name, created.role === 'admin')
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-user-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="overlay__card">
        <h3 id="add-user-title">Fahrer hinzufügen</h3>
        <p className="muted overlay__intro">
          Der Name ist gleichzeitig der Anmeldename. Beim ersten Anmelden legt die Person
          selbst ihr Passwort fest.
        </p>

        <form onSubmit={handleSubmit} className="auth__form">
          <label className="field" htmlFor="new-user-name">
            <span className="field__label">Vor- und Nachname</span>
            <div className="field__wrap">
              <input
                id="new-user-name"
                type="text"
                value={name}
                autoCapitalize="words"
                placeholder="z. B. Maria Müller"
                autoFocus
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          </label>

          <label className="check" htmlFor="new-user-admin">
            <input
              id="new-user-admin"
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
            />
            <span>
              <strong>Als Administrator anlegen</strong>
              <span className="check__hint">
                Administratoren sehen alle Einträge und können weitere Personen hinzufügen.
              </span>
            </span>
          </label>

          {error && <p className="alert alert--error">{error}</p>}

          <div className="overlay__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
              Abbrechen
            </button>
            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'Speichere …' : 'Hinzufügen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
