import { useEffect, useState } from 'react'
import { appNameSetzen, NAME_MAX, STANDARDNAME, useAppName } from '../lib/erscheinungsbild'
import { toGermanError } from '../lib/errors'

/**
 * Den Namen der App festlegen: die Überschrift auf der Anmeldeseite und der
 * Titel im Browser-Tab. Ohne eigenen Namen steht dort „Rikscha-Fahrten“.
 */
export function AppNameEinstellung() {
  const gespeichert = useAppName()
  const aktuell = gespeichert ?? STANDARDNAME
  const [eingabe, setEingabe] = useState(aktuell)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)

  // Kommt der gespeicherte Stand erst nach dem Öffnen an, ihn übernehmen
  useEffect(() => setEingabe(aktuell), [aktuell])

  const bereinigt = eingabe.trim().replace(/\s+/g, ' ')
  const geaendert = bereinigt !== '' && bereinigt !== aktuell

  async function speichern(neu: string | null, meldung: string) {
    setBusy(true)
    setError(null)
    setHinweis(null)
    try {
      await appNameSetzen(neu)
      setHinweis(meldung)
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h3>Name der App</h3>
      <p className="muted card__text">
        Steht als Überschrift auf der Anmeldeseite und im Titel des Browser-Tabs.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (geaendert) void speichern(bereinigt, `Der Name „${bereinigt}“ ist gespeichert.`)
        }}
      >
        <label className="field" htmlFor="app-name">
          <span className="field__label">Name</span>
          <div className="field__wrap">
            <input
              id="app-name"
              type="text"
              value={eingabe}
              onChange={(e) => setEingabe(e.target.value)}
              maxLength={NAME_MAX}
              placeholder={STANDARDNAME}
              disabled={busy}
            />
          </div>
          <span className="hint appname__zaehler">
            {bereinigt.length} von {NAME_MAX} Zeichen
          </span>
        </label>

        {hinweis && <p className="alert alert--ok">{hinweis}</p>}
        {error && <p className="alert alert--error">{error}</p>}

        <div className="logo-knoepfe appname__knoepfe">
          <button className="btn" type="submit" disabled={busy || !geaendert}>
            {busy ? 'Speichere …' : 'Name speichern'}
          </button>
          {gespeichert && (
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => speichern(null, `Der Name ist wieder „${STANDARDNAME}“.`)}
              disabled={busy}
            >
              „{STANDARDNAME}“ verwenden
            </button>
          )}
        </div>
      </form>
    </section>
  )
}
