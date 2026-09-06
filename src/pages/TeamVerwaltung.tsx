import { useEffect, useState } from 'react'
import { hatPasswort, listUsers, type Rolle, type TeamMember } from '../lib/supabase'
import { toGermanError } from '../lib/errors'
import { AddUserDialog } from '../components/AddUserDialog'
import { EditUserDialog } from '../components/EditUserDialog'

const ROLLEN_TEXT: Record<Rolle, string> = {
  admin: 'Administration',
  koordinator: 'Koordination',
  fahrer: 'Fahrer:in',
}

type Props = {
  onZurueck: () => void
  /** Koordination und Administration dürfen ändern, alle anderen nur sehen. */
  darfVerwalten: boolean
  /** Zugänge der Administration löscht nur die Administration. */
  istAdmin: boolean
}

export function TeamVerwaltung({ onZurueck, darfVerwalten, istAdmin }: Props) {
  const [members, setMembers] = useState<TeamMember[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [addOffen, setAddOffen] = useState(false)
  const [bearbeitet, setBearbeitet] = useState<TeamMember | null>(null)
  const [version, setVersion] = useState(0)

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

  function aktualisiert(text: string) {
    setHinweis(text)
    setVersion((v) => v + 1)
  }

  const aktive = members?.filter((m) => m.is_active).length ?? 0

  return (
    <>
      <button className="btn btn--zurueck" onClick={onZurueck}>
        ← Zurück zur Übersicht
      </button>

      <div className="seite__kopf">
        <div>
          <h2>Pilot/-innen Liste</h2>
          {members && (
            <p className="muted">
              {darfVerwalten
                ? `${members.length} ${members.length === 1 ? 'Eintrag' : 'Einträge'}, davon ${aktive} freigeschaltet`
                : `${members.length} ${members.length === 1 ? 'Person' : 'Personen'}`}
            </p>
          )}
        </div>
        {darfVerwalten && (
          <button className="btn" onClick={() => setAddOffen(true)}>
            Person hinzufügen
          </button>
        )}
      </div>

      {hinweis && <p className="alert alert--ok">{hinweis}</p>}
      {error && <p className="alert alert--error">{error}</p>}

      {!members && !error && <p className="muted">Lade Liste …</p>}

      {members && members.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            {darfVerwalten
              ? 'Noch keine Einträge vorhanden. Über „Person hinzufügen“ legst du die erste an.'
              : 'Noch sind keine Pilot:innen eingetragen.'}
          </p>
        </div>
      )}

      {members && members.length > 0 && (
        <div className="card">
          <ul className="team">
            {members.map((m) => (
              <li key={m.id} className={m.is_active ? 'team__row' : 'team__row team__row--inaktiv'}>
                <div className="team__info">
                  <span className="team__name">{m.full_name}</span>
                  <span className="team__meta">
                    {ROLLEN_TEXT[m.role]}
                    {!m.is_active && <span className="badge">Deaktiviert</span>}
                    {/* Wer noch kein Passwort hat, geht nur die Verwaltung
                        etwas an – Fahrer:innen bekommen den Stand gar nicht
                        erst geliefert. */}
                    {darfVerwalten && !hatPasswort(m) && (
                      <span className="badge badge--neutral">Kein Passwort</span>
                    )}
                  </span>
                  {(m.phone || m.contact_email) && (
                    <span className="team__kontakt">
                      {[m.phone, m.contact_email].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </div>
                {darfVerwalten && (
                  <button className="btn btn--ghost" onClick={() => setBearbeitet(m)}>
                    Bearbeiten
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {addOffen && (
        <AddUserDialog
          onClose={() => setAddOffen(false)}
          onCreated={(m) => {
            setAddOffen(false)
            aktualisiert(`${m.full_name} wurde hinzugefügt und kann sich jetzt anmelden.`)
          }}
        />
      )}

      {bearbeitet && (
        <EditUserDialog
          member={bearbeitet}
          istAdmin={istAdmin}
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
          onZurueckgesetzt={(name) => {
            setBearbeitet(null)
            aktualisiert(
              `Das Passwort von ${name} wurde zurückgesetzt. ` +
                'Beim nächsten Anmelden wird ein neues festgelegt.',
            )
          }}
        />
      )}
    </>
  )
}
