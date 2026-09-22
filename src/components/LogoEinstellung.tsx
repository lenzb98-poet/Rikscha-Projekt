import { useRef, useState } from 'react'
import { Logo } from './Marke'
import { logoEntfernen, logoHochladen, pruefeLogo, useVereinslogo } from '../lib/erscheinungsbild'
import { toGermanError } from '../lib/errors'

/**
 * Das Logo der Organisation hochladen oder zum Standard zurückkehren.
 *
 * Die Vorschau steht auf derselben Akzentfarbe wie die Leiste und die Anmeldeseite,
 * damit gleich zu sehen ist, ob das Logo dort lesbar ist.
 */
export function LogoEinstellung() {
  const eigenes = useVereinslogo()
  const datei = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)

  async function gewaehlt(e: React.ChangeEvent<HTMLInputElement>) {
    const bild = e.target.files?.[0]
    // Zurücksetzen, damit dieselbe Datei erneut gewählt werden kann
    e.target.value = ''
    if (!bild) return

    setError(null)
    setHinweis(null)
    const problem = pruefeLogo(bild)
    if (problem) {
      setError(problem)
      return
    }

    setBusy(true)
    try {
      await logoHochladen(bild)
      setHinweis('Das neue Logo ist gespeichert.')
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(false)
    }
  }

  async function zuruecksetzen() {
    setError(null)
    setHinweis(null)
    setBusy(true)
    try {
      await logoEntfernen()
      setHinweis('Das Standard-Logo ist wiederhergestellt.')
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h3>Logo</h3>
      <p className="muted card__text">
        Erscheint oben links in der Leiste und auf der Anmeldeseite, jeweils auf der Akzentfarbe.
        Am besten eignet sich eine helle Fassung mit durchsichtigem Hintergrund (PNG), höchstens
        2 MB.
      </p>

      <div className="logo-vorschau">
        <Logo />
      </div>

      {hinweis && <p className="alert alert--ok">{hinweis}</p>}
      {error && <p className="alert alert--error">{error}</p>}

      <div className="logo-knoepfe">
        <input
          ref={datei}
          id="logo-datei"
          className="logo-datei"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={gewaehlt}
          disabled={busy}
        />
        <button className="btn" onClick={() => datei.current?.click()} disabled={busy}>
          {busy ? 'Speichere …' : eigenes ? 'Anderes Logo hochladen' : 'Logo hochladen'}
        </button>
        {eigenes && (
          <button className="btn btn--ghost" onClick={zuruecksetzen} disabled={busy}>
            Standard-Logo verwenden
          </button>
        )}
      </div>
    </section>
  )
}
