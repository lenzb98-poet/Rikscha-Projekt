import { useEffect, useState } from 'react'
import { RadelnLogo } from '../components/Marke'
import {
  kuerzelAusLink,
  listOrganisationen,
  waehleOrganisation,
  type Organisation,
} from '../lib/organisation'
import { isSupabaseConfigured } from '../lib/supabase'
import { toGermanError } from '../lib/errors'

/**
 * Die Auswahl vor der Anmeldung: oben das Logo des Projekts „Radeln ohne
 * Alter“, darunter die Organisationen. Ein Tipp auf eine führt zu ihrer
 * Anmeldung.
 *
 * Kommt man über einen Link mit ?org=kürzel, wird die Organisation gleich
 * gewählt und die Liste übersprungen.
 */
export function OrganisationWahl({ onGewaehlt }: { onGewaehlt: () => void }) {
  const [liste, setListe] = useState<Organisation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)

  useEffect(() => {
    listOrganisationen()
      .then((alle) => {
        const kuerzel = kuerzelAusLink()
        if (kuerzel) {
          const treffer = alle.find((o) => o.kuerzel === kuerzel)
          if (treffer) {
            waehle(treffer)
            return
          }
          setHinweis(`Die Organisation „${kuerzel}“ aus dem Link gibt es nicht. Bitte wähle aus der Liste.`)
        }
        setListe(alle)
      })
      .catch((err) => setError(toGermanError(err)))
    // Nur beim ersten Anzeigen
  }, [])

  function waehle(o: Organisation) {
    waehleOrganisation(o)
    onGewaehlt()
  }

  return (
    <div className="auth">
      <div className="auth__inner">
        <RadelnLogo className="orgwahl__logo" />

        <div className="auth__card">
          <header className="auth__header">
            <h1>Rikscha-Fahrten</h1>
            <p className="auth__sub">Wähle deine Organisation</p>
          </header>

          {!isSupabaseConfigured && (
            <p className="alert alert--warn">
              Supabase ist noch nicht konfiguriert. Bitte <code>.env</code> nach dem Vorbild von{' '}
              <code>.env.example</code> anlegen.
            </p>
          )}

          {hinweis && <p className="alert alert--warn orgwahl__hinweis">{hinweis}</p>}
          {error && <p className="alert alert--error">{error}</p>}
          {!liste && !error && <p className="muted orgwahl__lade">Lade Organisationen …</p>}

          {liste && liste.length === 0 && (
            <p className="muted">Noch keine Organisation eingerichtet.</p>
          )}

          {liste && liste.length > 0 && (
            <ul className="orgwahl">
              {liste.map((o) => (
                <li key={o.id}>
                  <button className="orgwahl__eintrag" onClick={() => waehle(o)}>
                    <span>{o.name}</span>
                    <span className="orgwahl__pfeil" aria-hidden="true">
                      →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
