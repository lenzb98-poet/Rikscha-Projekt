import { useEffect, useState } from 'react'
import {
  listRikschas,
  loescheRikscha,
  setzeRikschaAktiv,
  speichereRikscha,
  type Rikscha,
} from '../lib/rikschas'
import { formatiereKomma, formatiereZahl } from '../lib/fahrten'
import { toGermanError } from '../lib/errors'

/**
 * Die Rikschas der Organisation pflegen: anlegen, umbenennen, stilllegen,
 * löschen.
 *
 * Stilllegen ist der gewöhnliche Weg, eine Rikscha außer Dienst zu nehmen -
 * sie verschwindet aus der Auswahl, ihre alten Einträge bleiben, und es lässt
 * sich jederzeit umkehren.
 *
 * Löschen ist endgültig und verlangt drei Bestätigungen: erst die
 * Unterweisung mit den echten Zahlen dieser Rikscha lesen und abhaken, dann
 * den Namen eintippen, zuletzt ausdrücklich endgültig löschen. Den Namen
 * prüft zusätzlich die Datenbank.
 */
type Loeschen = { id: string; schritt: 1 | 2 | 3; verstanden: boolean; name: string }

const datum = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function RikschaVerwaltung() {
  const [rikschas, setRikschas] = useState<Rikscha[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)
  /** Die id der Rikscha im Bearbeitungsmodus, 'neu' für eine neue. */
  const [offen, setOffen] = useState<string | null>(null)
  const [entwurf, setEntwurf] = useState('')
  const [loeschen, setLoeschen] = useState<Loeschen | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listRikschas()
      .then(setRikschas)
      .catch((err) => setError(toGermanError(err)))
  }, [])

  function meldungenWeg() {
    setError(null)
    setHinweis(null)
  }

  function beginne(r: Rikscha | null) {
    meldungenWeg()
    setLoeschen(null)
    setOffen(r ? r.id : 'neu')
    setEntwurf(r ? r.name : '')
  }

  function abbrechen() {
    setOffen(null)
    setEntwurf('')
  }

  /** Führt eine Änderung aus, lädt die Liste neu und meldet das Ergebnis. */
  async function ausfuehren(aktion: () => Promise<string>) {
    setBusy(true)
    meldungenWeg()
    try {
      const meldung = await aktion()
      setRikschas(await listRikschas())
      setHinweis(meldung)
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(false)
    }
  }

  function speichern(e: React.FormEvent) {
    e.preventDefault()
    const neu = offen === 'neu'
    void ausfuehren(async () => {
      const name = await speichereRikscha({ id: neu ? undefined : (offen ?? undefined), name: entwurf })
      abbrechen()
      return neu ? `„${name}“ ist angelegt und steht zur Auswahl.` : `„${name}“ gespeichert.`
    })
  }

  function aktivSetzen(r: Rikscha, aktiv: boolean) {
    setLoeschen(null)
    void ausfuehren(async () => {
      await setzeRikschaAktiv(r.id, aktiv)
      return aktiv
        ? `„${r.name}“ ist wieder im Dienst.`
        : `„${r.name}“ ist stillgelegt. Die bisherigen Einträge bleiben erhalten.`
    })
  }

  function endgueltigLoeschen(r: Rikscha, bestaetigung: string) {
    void ausfuehren(async () => {
      const anzahl = await loescheRikscha(r.id, bestaetigung)
      setLoeschen(null)
      return anzahl === 0
        ? `„${r.name}“ wurde gelöscht.`
        : `„${r.name}“ wurde gelöscht. ${formatiereZahl(anzahl)} ${
            anzahl === 1 ? 'Eintrag steht' : 'Einträge stehen'
          } im Fahrtenbuch jetzt unter „gelöscht“.`
    })
  }

  function formular() {
    return (
      <form className="vorlage__form" onSubmit={speichern}>
        <label className="field">
          <span className="field__label">Name der Rikscha</span>
          <input
            value={entwurf}
            onChange={(e) => setEntwurf(e.target.value)}
            maxLength={40}
            required
            autoFocus
          />
        </label>
        <div className="vorlage__knoepfe">
          <button className="btn btn--ghost" type="button" onClick={abbrechen} disabled={busy}>
            Abbrechen
          </button>
          <button className="btn" type="submit" disabled={busy || entwurf.trim() === ''}>
            {busy ? 'Speichere …' : 'Speichern'}
          </button>
        </div>
      </form>
    )
  }

  function loeschDialog(r: Rikscha, l: Loeschen) {
    const nameStimmt = l.name.trim() === r.name
    return (
      <div className="loeschen" role="group" aria-label={`${r.name} löschen`}>
        <p className="loeschen__schritt">Bestätigung {l.schritt} von 3</p>

        {l.schritt === 1 && (
          <>
            <h4 className="loeschen__titel">Was passiert, wenn du „{r.name}“ löschst?</h4>
            <ul className="loeschen__folgen">
              <li>
                „{r.name}“ verschwindet aus der Auswahl beim Nachtragen und als Spalte aus dem
                Fahrtenbuch.
              </li>
              {r.eintraege > 0 ? (
                <>
                  <li>
                    <strong>
                      {formatiereZahl(r.eintraege)}{' '}
                      {r.eintraege === 1 ? 'Eintrag' : 'Einträge'} im Fahrtenbuch
                    </strong>{' '}
                    ({formatiereKomma(r.km)} km
                    {r.letzte_fahrt && `, zuletzt am ${datum(r.letzte_fahrt)}`}){' '}
                    {r.eintraege === 1 ? 'verliert' : 'verlieren'} die Angabe, dass sie mit
                    „{r.name}“ gefahren wurden. Sie stehen danach unter „gelöscht“.
                  </li>
                  <li>
                    Kilometer, Dauer und Fahrgäste dieser Einträge bleiben erhalten und zählen
                    weiter in allen Summen. Niemand muss etwas nachtragen.
                  </li>
                  <li>
                    Wie viel mit „{r.name}“ gefahren wurde, lässt sich danach nicht mehr
                    auswerten.
                  </li>
                </>
              ) : (
                <li>Im Fahrtenbuch ist „{r.name}“ bisher nirgends eingetragen.</li>
              )}
              <li>
                <strong>Das lässt sich nicht rückgängig machen</strong> – auch eine neue Rikscha
                mit demselben Namen bekommt die alten Einträge nicht zurück.
              </li>
            </ul>

            {r.aktiv && (
              <p className="loeschen__tipp">
                Soll „{r.name}“ nur nicht mehr gefahren werden? Dann reicht{' '}
                <strong>Stilllegen</strong>: Sie verschwindet aus der Auswahl, alles Bisherige
                bleibt, und es lässt sich jederzeit umkehren.{' '}
                <button
                  type="button"
                  className="btn btn--link"
                  onClick={() => aktivSetzen(r, false)}
                  disabled={busy}
                >
                  Stattdessen stilllegen
                </button>
              </p>
            )}

            <label className="check check--schlank" htmlFor={`verstanden-${r.id}`}>
              <input
                id={`verstanden-${r.id}`}
                type="checkbox"
                checked={l.verstanden}
                onChange={(e) => setLoeschen({ ...l, verstanden: e.target.checked })}
              />
              <span>
                <strong>Ich habe gelesen, was das Löschen bewirkt.</strong>
              </span>
            </label>
          </>
        )}

        {l.schritt === 2 && (
          <label className="field" htmlFor={`name-${r.id}`}>
            <span className="field__label">
              Zur Bestätigung den Namen eintippen: <strong>{r.name}</strong>
            </span>
            <div className="field__wrap">
              <input
                id={`name-${r.id}`}
                value={l.name}
                onChange={(e) => setLoeschen({ ...l, name: e.target.value })}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                autoFocus
              />
            </div>
          </label>
        )}

        {l.schritt === 3 && (
          <p className="loeschen__letzte">
            Letzte Bestätigung: „{r.name}“ jetzt <strong>endgültig</strong> löschen?
          </p>
        )}

        <div className="vorlage__knoepfe loeschen__knoepfe">
          <button className="btn btn--ghost" onClick={() => setLoeschen(null)} disabled={busy}>
            Abbrechen
          </button>
          {l.schritt === 1 && (
            <button
              className="btn btn--ghost btn--gefahr"
              onClick={() => setLoeschen({ ...l, schritt: 2 })}
              disabled={!l.verstanden}
            >
              Weiter
            </button>
          )}
          {l.schritt === 2 && (
            <button
              className="btn btn--ghost btn--gefahr"
              onClick={() => setLoeschen({ ...l, schritt: 3 })}
              disabled={!nameStimmt}
            >
              Weiter
            </button>
          )}
          {l.schritt === 3 && (
            <button
              className="btn btn--danger"
              onClick={() => endgueltigLoeschen(r, l.name)}
              disabled={busy}
            >
              {busy ? 'Lösche …' : 'Endgültig löschen'}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <section className="card">
      <h3>Rikschas</h3>
      <p className="muted card__text">
        Stehen beim Nachtragen einer Fahrt zur Auswahl und bilden die Spalten im Fahrtenbuch.
        Eine Rikscha, die nicht mehr gefahren wird, am besten <strong>stilllegen</strong> – ihre
        bisherigen Einträge bleiben dann erhalten.
      </p>

      {hinweis && <p className="alert alert--ok">{hinweis}</p>}
      {error && <p className="alert alert--error">{error}</p>}

      {!rikschas && !error && <p className="muted">Lade Rikschas …</p>}
      {rikschas?.length === 0 && <p className="muted">Noch keine Rikscha angelegt.</p>}

      <ul className="vorlagen">
        {rikschas?.map((r) => (
          <li key={r.id} className={r.aktiv ? 'vorlage' : 'vorlage vorlage--still'}>
            {offen === r.id ? (
              formular()
            ) : (
              <>
                <div className="vorlage__text">
                  <strong>
                    {r.name}
                    {!r.aktiv && <span className="rikscha__still">stillgelegt</span>}
                  </strong>
                  <span className="muted">
                    {r.eintraege === 0
                      ? 'Noch keine Einträge'
                      : `${formatiereZahl(r.eintraege)} ${
                          r.eintraege === 1 ? 'Eintrag' : 'Einträge'
                        } · ${formatiereKomma(r.km)} km`}
                  </span>
                </div>

                {loeschen?.id === r.id ? (
                  loeschDialog(r, loeschen)
                ) : (
                  <div className="vorlage__knoepfe">
                    <button className="btn btn--ghost" onClick={() => beginne(r)} disabled={busy}>
                      Bearbeiten
                    </button>
                    <button
                      className="btn btn--ghost"
                      onClick={() => aktivSetzen(r, !r.aktiv)}
                      disabled={busy}
                    >
                      {r.aktiv ? 'Stilllegen' : 'Wieder in Dienst'}
                    </button>
                    <button
                      className="btn btn--ghost btn--gefahr"
                      onClick={() => {
                        meldungenWeg()
                        setOffen(null)
                        setLoeschen({ id: r.id, schritt: 1, verstanden: false, name: '' })
                      }}
                      disabled={busy}
                    >
                      Löschen
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {offen === 'neu' ? (
        <div className="vorlage vorlage--neu">{formular()}</div>
      ) : (
        rikschas && (
          <button className="btn" onClick={() => beginne(null)} disabled={busy}>
            Rikscha hinzufügen
          </button>
        )
      )}
    </section>
  )
}
