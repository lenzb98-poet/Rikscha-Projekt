import { useEffect, useState } from 'react'
import { listHeime, loescheHeim, speichereHeim, type Heim } from '../lib/heime'
import { toGermanError } from '../lib/errors'

/**
 * Die Vorlagen der Seniorenheime pflegen.
 *
 * Beim Anlegen einer Fahrt trägt ein Tipp auf so eine Vorlage Anschrift und
 * Telefonnummer ein. Was hier steht, steht dort zur Auswahl.
 *
 * Bearbeitet wird immer nur ein Eintrag: So ist klar, was gerade offen ist,
 * und ein versehentlich geänderter zweiter Eintrag kann nicht mitgehen.
 */
type Entwurf = { name: string; anschrift: string; telefon: string }

const LEER: Entwurf = { name: '', anschrift: '', telefon: '' }

export function HeimVorlagen() {
  const [heime, setHeime] = useState<Heim[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)
  /** Die id des Eintrags im Bearbeitungsmodus, 'neu' für den neuen Eintrag. */
  const [offen, setOffen] = useState<string | null>(null)
  const [entwurf, setEntwurf] = useState<Entwurf>(LEER)
  const [busy, setBusy] = useState(false)
  const [loeschen, setLoeschen] = useState<string | null>(null)

  useEffect(() => {
    listHeime()
      .then(setHeime)
      .catch((err) => setError(toGermanError(err)))
  }, [])

  function beginne(h: Heim | null) {
    setError(null)
    setHinweis(null)
    setLoeschen(null)
    if (h === null) {
      setOffen('neu')
      setEntwurf(LEER)
    } else {
      setOffen(h.id)
      setEntwurf({ name: h.name, anschrift: h.anschrift, telefon: h.telefon })
    }
  }

  function abbrechen() {
    setOffen(null)
    setEntwurf(LEER)
  }

  async function speichern(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const gespeichert = await speichereHeim({
        id: offen === 'neu' ? undefined : (offen ?? undefined),
        ...entwurf,
      })
      setHeime(await listHeime())
      setHinweis(
        offen === 'neu'
          ? `„${gespeichert.name}“ steht jetzt als Vorlage bereit.`
          : `„${gespeichert.name}“ gespeichert.`,
      )
      abbrechen()
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(false)
    }
  }

  async function entfernen(id: string) {
    setBusy(true)
    setError(null)
    try {
      const name = await loescheHeim(id)
      setHeime(await listHeime())
      setHinweis(`„${name}“ entfernt.`)
      setLoeschen(null)
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(false)
    }
  }

  function felder() {
    return (
      <form className="vorlage__form" onSubmit={speichern}>
        <label className="field">
          <span className="field__label">Name des Hauses</span>
          <input
            value={entwurf.name}
            onChange={(e) => setEntwurf({ ...entwurf, name: e.target.value })}
            maxLength={120}
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span className="field__label">
            Anschrift <span className="field__optional">steht später im Feld „Wo“</span>
          </span>
          <input
            value={entwurf.anschrift}
            onChange={(e) => setEntwurf({ ...entwurf, anschrift: e.target.value })}
            maxLength={200}
            placeholder="Straße Hausnummer, PLZ Ort"
          />
        </label>
        <label className="field">
          <span className="field__label">
            Telefon <span className="field__optional">kommt in den Infotext</span>
          </span>
          <input
            value={entwurf.telefon}
            onChange={(e) => setEntwurf({ ...entwurf, telefon: e.target.value })}
            maxLength={60}
            inputMode="tel"
          />
        </label>
        <div className="vorlage__knoepfe">
          <button className="btn btn--ghost" type="button" onClick={abbrechen} disabled={busy}>
            Abbrechen
          </button>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Speichere …' : 'Speichern'}
          </button>
        </div>
      </form>
    )
  }

  return (
    <section className="card">
      <h3>Vorlagen: Seniorenheime</h3>
      <p className="muted card__text">
        Beim Anlegen einer Fahrt lässt sich ein Haus antippen – Anschrift und Telefonnummer
        werden dann von selbst eingetragen. Änderungen hier gelten sofort für alle.
      </p>

      {hinweis && <p className="alert alert--ok">{hinweis}</p>}
      {error && <p className="alert alert--error">{error}</p>}

      {!heime && !error && <p className="muted">Lade Vorlagen …</p>}

      <ul className="vorlagen">
        {heime?.map((h) => (
          <li key={h.id} className="vorlage">
            {offen === h.id ? (
              felder()
            ) : (
              <>
                <div className="vorlage__text">
                  <strong>{h.name}</strong>
                  {h.anschrift && <span className="muted">{h.anschrift}</span>}
                  {h.telefon && <span className="muted">Tel. {h.telefon}</span>}
                </div>
                {loeschen === h.id ? (
                  <div className="vorlage__knoepfe">
                    <span className="muted">Wirklich entfernen?</span>
                    <button
                      className="btn btn--ghost btn--gefahr"
                      onClick={() => entfernen(h.id)}
                      disabled={busy}
                    >
                      Ja, entfernen
                    </button>
                    <button className="btn btn--ghost" onClick={() => setLoeschen(null)}>
                      Abbrechen
                    </button>
                  </div>
                ) : (
                  <div className="vorlage__knoepfe">
                    <button className="btn btn--ghost" onClick={() => beginne(h)}>
                      Bearbeiten
                    </button>
                    <button
                      className="btn btn--ghost btn--gefahr"
                      onClick={() => {
                        setLoeschen(h.id)
                        setOffen(null)
                      }}
                    >
                      Entfernen
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {offen === 'neu' ? (
        <div className="vorlage vorlage--neu">{felder()}</div>
      ) : (
        heime && (
          <button className="btn" onClick={() => beginne(null)}>
            Haus hinzufügen
          </button>
        )
      )}
    </section>
  )
}
