import { useEffect, useState } from 'react'
import {
  akzentfarbeSetzen,
  farbstufen,
  kontrastZuWeiss,
  MIN_KONTRAST,
  normalisiereFarbe,
  STANDARDFARBE,
  useAkzentfarbe,
} from '../lib/erscheinungsbild'
import { toGermanError } from '../lib/errors'

/**
 * Die Akzentfarbe der Organisation wählen.
 *
 * Die Vorschau zeigt die Farbe, bevor sie gespeichert wird - nur in diesem
 * Kasten, der Rest der Seite wechselt erst beim Speichern. Weiße Schrift muss
 * auf der Farbe lesbar bleiben; zu helle Farben lassen sich nicht speichern.
 */
export function AkzentfarbeEinstellung() {
  const gespeichert = useAkzentfarbe()
  const aktuell = gespeichert ?? STANDARDFARBE
  const [eingabe, setEingabe] = useState(aktuell)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)

  // Kommt der gespeicherte Stand erst nach dem Öffnen an, ihn übernehmen
  useEffect(() => setEingabe(aktuell), [aktuell])

  const farbe = normalisiereFarbe(eingabe)
  const kontrast = farbe ? kontrastZuWeiss(farbe) : null
  const lesbar = kontrast !== null && kontrast >= MIN_KONTRAST
  const geaendert = farbe !== null && farbe !== aktuell

  async function speichern(neu: string | null, meldung: string) {
    setBusy(true)
    setError(null)
    setHinweis(null)
    try {
      await akzentfarbeSetzen(neu)
      setHinweis(meldung)
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h3>Akzentfarbe</h3>
      <p className="muted card__text">
        Färbt die Leiste, die Anmeldeseite, Knöpfe und Überschriften. Die Farben für den Zustand
        einer Fahrt (offen, besetzt, abgesagt) bleiben immer gleich.
      </p>

      <div className="farbwahl">
        <input
          type="color"
          className="farbwahl__rad"
          aria-label="Farbe wählen"
          value={farbe ?? aktuell}
          onChange={(e) => setEingabe(e.target.value)}
          disabled={busy}
        />
        <label className="field farbwahl__code" htmlFor="akzentfarbe">
          <span className="field__label">Farbcode</span>
          <div className="field__wrap">
            <input
              id="akzentfarbe"
              type="text"
              value={eingabe}
              onChange={(e) => setEingabe(e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              placeholder="#245892"
              disabled={busy}
            />
          </div>
        </label>
      </div>

      {farbe ? (
        <div className="farbvorschau" style={farbstufen(farbe) as React.CSSProperties}>
          <div className="farbvorschau__leiste">Leiste</div>
          <div className="farbvorschau__inhalt">
            <strong className="farbvorschau__titel">Überschrift</strong>
            <span className="btn farbvorschau__knopf">Knopf</span>
          </div>
        </div>
      ) : (
        <p className="alert alert--warn">Bitte einen Farbcode wie #245892 eingeben.</p>
      )}

      {kontrast !== null && (
        <p className={lesbar ? 'hint farbkontrast' : 'alert alert--error'}>
          Kontrast zu weißer Schrift: {kontrast.toFixed(1).replace('.', ',')} : 1
          {lesbar
            ? ' – gut lesbar.'
            : ` – zu hell, mindestens ${String(MIN_KONTRAST).replace('.', ',')} : 1 nötig. Bitte eine dunklere Farbe wählen.`}
        </p>
      )}

      {hinweis && <p className="alert alert--ok">{hinweis}</p>}
      {error && <p className="alert alert--error">{error}</p>}

      <div className="logo-knoepfe farbwahl__knoepfe">
        <button
          className="btn"
          onClick={() => farbe && speichern(farbe, 'Die neue Akzentfarbe ist gespeichert.')}
          disabled={busy || !geaendert || !lesbar}
        >
          {busy ? 'Speichere …' : 'Farbe speichern'}
        </button>
        {gespeichert && (
          <button
            className="btn btn--ghost"
            onClick={() => speichern(null, 'Das Standardblau ist wiederhergestellt.')}
            disabled={busy}
          >
            Standardfarbe verwenden
          </button>
        )}
      </div>
    </section>
  )
}
