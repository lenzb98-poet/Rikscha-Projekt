import { useEffect, useState } from 'react'
import {
  anmeldeLink,
  listOrganisationenBetreiber,
  orgAktivSetzen,
  orgAnlegen,
  orgLoeschen,
  orgSpeichern,
  type OrgUebersicht,
} from '../lib/betreiber'
import { formatiereGroesse } from '../lib/bilder'
import { formatiereZahl } from '../lib/fahrten'
import { toGermanError } from '../lib/errors'

/**
 * Die Betreiber Einstellungen: alle Organisationen, die die App nutzen.
 *
 * Anlegen (mit erster Administration), bearbeiten, stilllegen, löschen und
 * ein grober Blick auf den Speicher. Die eigene Organisation lässt sich weder
 * stilllegen noch löschen - sonst sperrte sich der Betreiber selbst aus.
 *
 * Löschen entfernt eine Organisation mit allem, was ihr gehört, und verlangt
 * deshalb drei Bestätigungen wie das Löschen einer Rikscha.
 */
type Loeschen = { id: string; schritt: 1 | 2 | 3; verstanden: boolean; name: string }
type Entwurf = { name: string; kuerzel: string }

const datum = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function BetreiberEinstellungen({ onZurueck }: { onZurueck: () => void }) {
  const [orgs, setOrgs] = useState<OrgUebersicht[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [neu, setNeu] = useState<{ name: string; admin: string } | null>(null)
  const [bearbeiten, setBearbeiten] = useState<{ id: string } & Entwurf | null>(null)
  const [loeschen, setLoeschen] = useState<Loeschen | null>(null)
  const [kopiert, setKopiert] = useState<string | null>(null)

  useEffect(() => {
    listOrganisationenBetreiber()
      .then(setOrgs)
      .catch((err) => setError(toGermanError(err)))
  }, [])

  function meldungenWeg() {
    setError(null)
    setHinweis(null)
  }

  /** Führt eine Änderung aus, lädt die Liste neu und meldet das Ergebnis. */
  async function ausfuehren(aktion: () => Promise<string>) {
    setBusy(true)
    meldungenWeg()
    try {
      const meldung = await aktion()
      setOrgs(await listOrganisationenBetreiber())
      setHinweis(meldung)
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(false)
    }
  }

  function anlegen(e: React.FormEvent) {
    e.preventDefault()
    if (!neu) return
    void ausfuehren(async () => {
      const o = await orgAnlegen(neu.name, neu.admin)
      const admin = neu.admin.trim()
      setNeu(null)
      return `„${o.name}“ ist angelegt, mit ${admin} als erster Administration. Anmeldelink: ${anmeldeLink(o.kuerzel)}`
    })
  }

  function speichern(e: React.FormEvent) {
    e.preventDefault()
    if (!bearbeiten) return
    void ausfuehren(async () => {
      await orgSpeichern(bearbeiten.id, bearbeiten.name, bearbeiten.kuerzel)
      setBearbeiten(null)
      return `„${bearbeiten.name.trim()}“ gespeichert.`
    })
  }

  function aktivSetzen(o: OrgUebersicht, aktiv: boolean) {
    setLoeschen(null)
    void ausfuehren(async () => {
      await orgAktivSetzen(o.id, aktiv)
      return aktiv
        ? `„${o.name}“ ist wieder aktiv und steht in der Auswahl vor der Anmeldung.`
        : `„${o.name}“ ist stillgelegt: nicht mehr in der Auswahl, keine Anmeldung möglich. Die Daten bleiben erhalten.`
    })
  }

  function endgueltigLoeschen(o: OrgUebersicht, bestaetigung: string) {
    void ausfuehren(async () => {
      const personen = await orgLoeschen(o.id, bestaetigung)
      setLoeschen(null)
      return `„${o.name}“ wurde mit allen Daten gelöscht (${formatiereZahl(personen)} ${
        personen === 1 ? 'Person' : 'Personen'
      }).`
    })
  }

  async function kopieren(o: OrgUebersicht) {
    try {
      await navigator.clipboard.writeText(anmeldeLink(o.kuerzel))
      setKopiert(o.id)
      setTimeout(() => setKopiert((k) => (k === o.id ? null : k)), 2000)
    } catch {
      setError('Der Link ließ sich nicht kopieren. Bitte von Hand markieren.')
    }
  }

  const gesamt = (orgs ?? []).reduce((s, o) => s + o.daten_bytes + o.bilder_bytes, 0)

  function loeschDialog(o: OrgUebersicht, l: Loeschen) {
    const nameStimmt = l.name.trim() === o.name
    return (
      <div className="loeschen" role="group" aria-label={`${o.name} löschen`}>
        <p className="loeschen__schritt">Bestätigung {l.schritt} von 3</p>

        {l.schritt === 1 && (
          <>
            <h4 className="loeschen__titel">Was passiert, wenn du „{o.name}“ löschst?</h4>
            <ul className="loeschen__folgen">
              <li>
                <strong>Alle Daten der Organisation werden gelöscht:</strong>{' '}
                {formatiereZahl(o.personen)} {o.personen === 1 ? 'Person' : 'Personen'} samt
                Anmeldekonten, {formatiereZahl(o.fahrten)}{' '}
                {o.fahrten === 1 ? 'Fahrt' : 'Fahrten'} mit Fahrtenbuch,{' '}
                {formatiereZahl(o.nachrichten)} Chat-Nachrichten, Rikschas, Heime und übernommene
                Zahlen.
              </li>
              <li>Niemand aus dieser Organisation kann sich danach mehr anmelden.</li>
              <li>Sie verschwindet aus der Auswahl vor der Anmeldung.</li>
              <li>
                <strong>Das lässt sich nicht rückgängig machen.</strong>
              </li>
            </ul>

            {o.aktiv && (
              <p className="loeschen__tipp">
                Soll die Organisation nur vorübergehend nicht genutzt werden? Dann reicht{' '}
                <strong>Stilllegen</strong>: keine Anmeldung mehr, aber alle Daten bleiben, und es
                lässt sich jederzeit umkehren.{' '}
                <button
                  type="button"
                  className="btn btn--link"
                  onClick={() => aktivSetzen(o, false)}
                  disabled={busy}
                >
                  Stattdessen stilllegen
                </button>
              </p>
            )}

            <label className="check check--schlank" htmlFor={`org-verstanden-${o.id}`}>
              <input
                id={`org-verstanden-${o.id}`}
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
          <label className="field" htmlFor={`org-name-${o.id}`}>
            <span className="field__label">
              Zur Bestätigung den Namen eintippen: <strong>{o.name}</strong>
            </span>
            <div className="field__wrap">
              <input
                id={`org-name-${o.id}`}
                value={l.name}
                onChange={(e) => setLoeschen({ ...l, name: e.target.value })}
                autoComplete="off"
                spellCheck={false}
                autoFocus
              />
            </div>
          </label>
        )}

        {l.schritt === 3 && (
          <p className="loeschen__letzte">
            Letzte Bestätigung: „{o.name}“ mit allen Daten jetzt <strong>endgültig</strong> löschen?
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
              onClick={() => endgueltigLoeschen(o, l.name)}
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
    <>
      <button className="btn btn--zurueck" onClick={onZurueck}>
        ← Zurück zu den Admin Einstellungen
      </button>

      <div className="seite__kopf">
        <div>
          <h2>Betreiber Einstellungen</h2>
          <p className="muted">Alle Organisationen, die die App nutzen.</p>
        </div>
      </div>

      {hinweis && <p className="alert alert--ok betreiber__hinweis">{hinweis}</p>}
      {error && <p className="alert alert--error">{error}</p>}

      <section className="card">
        <div className="card__head">
          <h3>Organisationen</h3>
          {orgs && (
            <span className="muted betreiber__gesamt">
              {formatiereZahl(orgs.length)} {orgs.length === 1 ? 'Organisation' : 'Organisationen'} ·
              zusammen etwa {formatiereGroesse(gesamt)}
            </span>
          )}
        </div>

        <p className="alert alert--warn betreiber__sperre">
          Die Daten der Organisationen sind noch nicht voneinander getrennt. Bis dahin kann sich
          nur die Stammorganisation anmelden; neue Organisationen lassen sich schon anlegen und
          vorbereiten.
        </p>

        {!orgs && !error && <p className="muted">Lade Organisationen …</p>}

        <ul className="vorlagen">
          {orgs?.map((o) => {
            const speicher = o.daten_bytes + o.bilder_bytes
            const anteil = gesamt > 0 ? Math.max(2, Math.round((speicher / gesamt) * 100)) : 0
            return (
              <li key={o.id} className={o.aktiv ? 'vorlage org' : 'vorlage org vorlage--still'}>
                {bearbeiten?.id === o.id ? (
                  <form className="vorlage__form" onSubmit={speichern}>
                    <label className="field">
                      <span className="field__label">Name der Organisation</span>
                      <input
                        value={bearbeiten.name}
                        onChange={(e) => setBearbeiten({ ...bearbeiten, name: e.target.value })}
                        maxLength={80}
                        required
                        autoFocus
                      />
                    </label>
                    <label className="field">
                      <span className="field__label">
                        Kürzel <span className="field__optional">für den Anmeldelink ?org=…</span>
                      </span>
                      <input
                        value={bearbeiten.kuerzel}
                        onChange={(e) => setBearbeiten({ ...bearbeiten, kuerzel: e.target.value })}
                        maxLength={30}
                        pattern="[a-z0-9\-]{2,30}"
                        title="Kleinbuchstaben, Ziffern und Bindestriche, 2 bis 30 Zeichen"
                        required
                      />
                    </label>
                    <div className="vorlage__knoepfe">
                      <button
                        className="btn btn--ghost"
                        type="button"
                        onClick={() => setBearbeiten(null)}
                        disabled={busy}
                      >
                        Abbrechen
                      </button>
                      <button className="btn" type="submit" disabled={busy}>
                        {busy ? 'Speichere …' : 'Speichern'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="vorlage__text org__text">
                      <strong>
                        {o.name}
                        {o.stamm && <span className="org__marke">eigene</span>}
                        {!o.aktiv && <span className="rikscha__still">stillgelegt</span>}
                      </strong>
                      <span className="muted">
                        Administration: {o.administration ?? 'keine aktive'} · seit {datum(o.created_at)}
                      </span>
                      <span className="muted">
                        {formatiereZahl(o.personen)} {o.personen === 1 ? 'Person' : 'Personen'} ·{' '}
                        {formatiereZahl(o.fahrten)} {o.fahrten === 1 ? 'Fahrt' : 'Fahrten'} ·{' '}
                        {formatiereZahl(o.nachrichten)}{' '}
                        {o.nachrichten === 1 ? 'Nachricht' : 'Nachrichten'}
                      </span>
                      <span className="org__speicher">
                        <span className="org__balken" aria-hidden="true">
                          <span style={{ width: `${anteil}%` }} />
                        </span>
                        <span className="muted">
                          Speicher etwa {formatiereGroesse(speicher)} (Daten{' '}
                          {formatiereGroesse(o.daten_bytes)}, Bilder {formatiereGroesse(o.bilder_bytes)})
                        </span>
                      </span>
                      <span className="org__link">
                        <code>?org={o.kuerzel}</code>
                        <button type="button" className="btn btn--link" onClick={() => kopieren(o)}>
                          {kopiert === o.id ? 'Kopiert ✓' : 'Anmeldelink kopieren'}
                        </button>
                      </span>
                    </div>

                    {loeschen?.id === o.id ? (
                      loeschDialog(o, loeschen)
                    ) : (
                      <div className="vorlage__knoepfe">
                        <button
                          className="btn btn--ghost"
                          onClick={() => {
                            meldungenWeg()
                            setLoeschen(null)
                            setBearbeiten({ id: o.id, name: o.name, kuerzel: o.kuerzel })
                          }}
                          disabled={busy}
                        >
                          Bearbeiten
                        </button>
                        {!o.stamm && (
                          <>
                            <button
                              className="btn btn--ghost"
                              onClick={() => aktivSetzen(o, !o.aktiv)}
                              disabled={busy}
                            >
                              {o.aktiv ? 'Stilllegen' : 'Wieder aktivieren'}
                            </button>
                            <button
                              className="btn btn--ghost btn--gefahr"
                              onClick={() => {
                                meldungenWeg()
                                setBearbeiten(null)
                                setLoeschen({ id: o.id, schritt: 1, verstanden: false, name: '' })
                              }}
                              disabled={busy}
                            >
                              Löschen
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>

        {neu ? (
          <form className="vorlage vorlage--neu vorlage__form" onSubmit={anlegen}>
            <h4 className="org__neu-titel">Neue Organisation</h4>
            <label className="field">
              <span className="field__label">Name der Organisation</span>
              <input
                value={neu.name}
                onChange={(e) => setNeu({ ...neu, name: e.target.value })}
                maxLength={80}
                placeholder="z. B. Rikscha-Verein Musterstadt e.V."
                required
                autoFocus
              />
            </label>
            <label className="field">
              <span className="field__label">Erster Admin und Benutzer</span>
              <input
                value={neu.admin}
                onChange={(e) => setNeu({ ...neu, admin: e.target.value })}
                maxLength={80}
                placeholder="Vor- und Nachname"
                autoComplete="off"
                required
              />
              <span className="hint org__hinweis">
                Meldet sich mit diesem Namen an und vergibt beim ersten Mal selbst ein Passwort.
                Weitere Personen legt sie danach selbst an.
              </span>
            </label>
            <div className="vorlage__knoepfe">
              <button className="btn btn--ghost" type="button" onClick={() => setNeu(null)} disabled={busy}>
                Abbrechen
              </button>
              <button
                className="btn"
                type="submit"
                disabled={busy || neu.name.trim() === '' || neu.admin.trim().length < 3}
              >
                {busy ? 'Lege an …' : 'Organisation anlegen'}
              </button>
            </div>
          </form>
        ) : (
          orgs && (
            <button
              className="btn"
              onClick={() => {
                meldungenWeg()
                setBearbeiten(null)
                setLoeschen(null)
                setNeu({ name: '', admin: '' })
              }}
              disabled={busy}
            >
              Organisation hinzufügen
            </button>
          )
        )}
      </section>
    </>
  )
}
