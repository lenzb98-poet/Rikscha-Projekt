import { useState } from 'react'
import {
  deleteUser,
  hatPasswort,
  resetPassword,
  updateUser,
  type Stammdaten,
  type TeamMember,
} from '../lib/supabase'
import { toGermanError } from '../lib/errors'
import { StammdatenFelder } from './StammdatenFelder'

type Props = {
  member: TeamMember
  onClose: () => void
  onSaved: (member: TeamMember) => void
  onDeleted: (name: string) => void
  onZurueckgesetzt: (name: string) => void
}

export function EditUserDialog({ member, onClose, onSaved, onDeleted, onZurueckgesetzt }: Props) {
  const [werte, setWerte] = useState<Stammdaten>({
    fullName: member.full_name,
    role: member.role,
    phone: member.phone ?? '',
    contactEmail: member.contact_email ?? '',
  })
  const [aktiv, setAktiv] = useState(member.is_active)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Löschen ist endgültig, deshalb erst nach einer Rückfrage
  const [loeschenBestaetigen, setLoeschenBestaetigen] = useState(false)
  const [resetBestaetigen, setResetBestaetigen] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      onSaved(await updateUser(member.id, { ...werte, isActive: aktiv }))
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleReset() {
    setError(null)
    setBusy(true)
    try {
      onZurueckgesetzt(await resetPassword(member.id))
    } catch (err) {
      setError(toGermanError(err))
      setResetBestaetigen(false)
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
        {resetBestaetigen ? (
          <>
            <h3 id="edit-user-title">Passwort zurücksetzen?</h3>
            <p className="overlay__intro">
              Das bisherige Passwort von <strong>{member.full_name}</strong> wird ungültig.
              Beim nächsten Anmelden gibt die Person nur ihren Namen ein und legt dabei
              selbst ein neues fest – so wie beim ersten Mal.
            </p>
            <p className="alert alert--warn">
              Der Eintrag bleibt vollständig erhalten, ebenso alle Anmeldungen zu Fahrten.
            </p>

            {error && <p className="alert alert--error">{error}</p>}

            <div className="overlay__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setResetBestaetigen(false)}
                disabled={busy}
              >
                Abbrechen
              </button>
              <button type="button" className="btn" onClick={handleReset} disabled={busy}>
                {busy ? 'Setze zurück …' : 'Passwort zurücksetzen'}
              </button>
            </div>
          </>
        ) : loeschenBestaetigen ? (
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
              Eine Namensänderung ändert den Anmeldenamen. Ein bereits gesetztes Passwort
              bleibt gültig.
            </p>

            <form onSubmit={handleSubmit} className="auth__form">
              <StammdatenFelder praefix="edit" werte={werte} onChange={setWerte} autoFocus />

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
              <p className="danger__stand muted">
                {hatPasswort(member)
                  ? 'Passwort ist vergeben.'
                  : 'Noch kein Passwort vergeben – die Person legt es bei der ersten Anmeldung fest.'}
              </p>

              {hatPasswort(member) && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    setError(null)
                    setResetBestaetigen(true)
                  }}
                >
                  Passwort zurücksetzen
                </button>
              )}

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
