import { useState } from 'react'
import { createUser, type Stammdaten, type TeamMember } from '../lib/supabase'
import { toGermanError } from '../lib/errors'
import { StammdatenFelder, LEERE_STAMMDATEN } from './StammdatenFelder'

type Props = {
  onClose: () => void
  onCreated: (member: TeamMember) => void
}

export function AddUserDialog({ onClose, onCreated }: Props) {
  const [werte, setWerte] = useState<Stammdaten>(LEERE_STAMMDATEN)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      onCreated(await createUser(werte))
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
        <h3 id="add-user-title">Person hinzufügen</h3>
        <p className="muted overlay__intro">
          Beim ersten Anmelden legt die Person selbst ihr Passwort fest.
        </p>

        <form onSubmit={handleSubmit} className="auth__form">
          <StammdatenFelder praefix="add" werte={werte} onChange={setWerte} autoFocus />

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
