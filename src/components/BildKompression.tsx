import { useEffect, useRef, useState } from 'react'
import { bildKompressionSetzen, speicherStand } from '../lib/betreiber'
import {
  bildKompressionVergessen,
  formatiereGroesse,
  MAX_KANTE,
  QUALITAET,
  verkleinereBild,
  type Kompression,
} from '../lib/bilder'
import { toGermanError } from '../lib/errors'

/** Drei Stufen zum schnellen Wählen; alles dazwischen über die Regler. */
const STUFEN: { name: string; text: string; wert: Kompression }[] = [
  { name: 'Stark', text: 'kleine Dateien, für den Chat meist genug', wert: { maxKante: 1280, qualitaet: 70 } },
  { name: 'Ausgewogen', text: 'Vorgabe', wert: { maxKante: MAX_KANTE, qualitaet: QUALITAET } },
  { name: 'Gering', text: 'schärfer, aber deutlich größer', wert: { maxKante: 2048, qualitaet: 88 } },
]
const KANTEN = [960, 1280, 1600, 2048, 2560, 3200, 4096]

type Probe = { url: string; vorher: number; nachher: number; breite: number; hoehe: number }

/**
 * Wie stark Chat-Bilder beim Hochladen verkleinert werden - für alle
 * Organisationen. Gilt nur für neue Bilder; was schon im Chat liegt, bleibt.
 *
 * Mit einem Probefoto lässt sich vor dem Speichern sehen, wie groß ein Bild
 * mit den gewählten Werten würde und wie es dann aussieht. Das Foto verlässt
 * dabei das Gerät nicht.
 */
export function BildKompression() {
  const [gespeichert, setGespeichert] = useState<Kompression | null>(null)
  const [wert, setWert] = useState<Kompression>({ maxKante: MAX_KANTE, qualitaet: QUALITAET })
  const [schnitt, setSchnitt] = useState<{ bytes: number; anzahl: number } | null>(null)
  const [foto, setFoto] = useState<File | null>(null)
  const [probe, setProbe] = useState<Probe | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)

  useEffect(() => {
    speicherStand()
      .then((s) => {
        const k = { maxKante: s.bild_max_kante, qualitaet: s.bild_qualitaet }
        setGespeichert(k)
        setWert(k)
        setSchnitt({ bytes: s.bild_schnitt_bytes, anzahl: s.bild_schnitt_anzahl })
      })
      .catch((err) => setError(toGermanError(err)))
  }, [])

  // Probefoto mit den gerade gewählten Werten verkleinern. Die vorige Vorschau
  // wird erst freigegeben, wenn die neue da ist - sonst blitzt sie leer auf.
  const vorschauUrl = useRef<string | null>(null)
  useEffect(() => {
    if (!foto) return
    let aktuell = true
    const zeit = setTimeout(async () => {
      try {
        const b = await verkleinereBild(foto, wert)
        if (!aktuell) return
        const url = URL.createObjectURL(b.datei)
        if (vorschauUrl.current) URL.revokeObjectURL(vorschauUrl.current)
        vorschauUrl.current = url
        setProbe({ url, vorher: foto.size, nachher: b.datei.size, breite: b.breite, hoehe: b.hoehe })
      } catch (err) {
        if (aktuell) setError(err instanceof Error ? err.message : toGermanError(err))
      }
    }, 250)
    return () => {
      aktuell = false
      clearTimeout(zeit)
    }
  }, [foto, wert])
  useEffect(() => () => {
    if (vorschauUrl.current) URL.revokeObjectURL(vorschauUrl.current)
  }, [])

  const stufe = STUFEN.find((s) => s.wert.maxKante === wert.maxKante && s.wert.qualitaet === wert.qualitaet)
  const geaendert =
    gespeichert !== null &&
    (gespeichert.maxKante !== wert.maxKante || gespeichert.qualitaet !== wert.qualitaet)

  async function speichern() {
    setBusy(true)
    setError(null)
    setHinweis(null)
    try {
      await bildKompressionSetzen(wert.maxKante, wert.qualitaet)
      bildKompressionVergessen()
      setGespeichert(wert)
      setHinweis('Gespeichert. Gilt ab sofort für neue Bilder in allen Organisationen.')
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card kompression">
      <h3>Bildkompression</h3>
      <p className="muted card__text">
        Wie stark Chat-Bilder beim Hochladen verkleinert werden – für alle Organisationen. Gilt
        nur für neue Bilder; was schon im Chat liegt, bleibt, wie es ist.
      </p>

      {!gespeichert && !error && <p className="muted">Lade Einstellung …</p>}

      {gespeichert && (
        <>
          <div className="kompression__stufen" role="radiogroup" aria-label="Stufe">
            {STUFEN.map((s) => (
              <button
                key={s.name}
                type="button"
                role="radio"
                aria-checked={stufe === s}
                className={stufe === s ? 'kompression__stufe kompression__stufe--an' : 'kompression__stufe'}
                onClick={() => setWert(s.wert)}
                disabled={busy}
              >
                <strong>{s.name}</strong>
                <span>
                  {s.wert.maxKante} px · {s.wert.qualitaet} %
                </span>
                <span className="kompression__stufe-text">{s.text}</span>
              </button>
            ))}
          </div>

          <div className="kompression__regler">
            <label className="field" htmlFor="kompression-kante">
              <span className="field__label">Längste Kante</span>
              <div className="field__wrap">
                <select
                  id="kompression-kante"
                  value={wert.maxKante}
                  onChange={(e) => setWert({ ...wert, maxKante: Number(e.target.value) })}
                  disabled={busy}
                >
                  {[...new Set([...KANTEN, wert.maxKante])]
                    .sort((a, b) => a - b)
                    .map((k) => (
                      <option key={k} value={k}>
                        {k} Pixel
                      </option>
                    ))}
                </select>
              </div>
            </label>
            <label className="field" htmlFor="kompression-qualitaet">
              <span className="field__label">
                Qualität <strong>{wert.qualitaet} %</strong>
              </span>
              <input
                id="kompression-qualitaet"
                className="kompression__schieber"
                type="range"
                min={30}
                max={95}
                step={1}
                value={wert.qualitaet}
                onChange={(e) => setWert({ ...wert, qualitaet: Number(e.target.value) })}
                disabled={busy}
              />
              <span className="kompression__skala" aria-hidden="true">
                <span>kleiner</span>
                <span>schärfer</span>
              </span>
            </label>
          </div>

          {schnitt && schnitt.anzahl > 0 && (
            <p className="hint kompression__hinweis">
              Die letzten {schnitt.anzahl} Chat-Bilder sind im Schnitt{' '}
              <strong>{formatiereGroesse(schnitt.bytes)}</strong> groß (mit den Werten, die beim
              Hochladen galten).
            </p>
          )}

          <div className="kompression__probe">
            <label className="btn btn--ghost kompression__probe-knopf">
              {foto ? 'Anderes Probefoto wählen' : 'Mit einem Probefoto ausprobieren'}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  setError(null)
                  setProbe(null)
                  setFoto(e.target.files?.[0] ?? null)
                }}
              />
            </label>
            {probe && (
              <figure className="kompression__vorschau">
                <img src={probe.url} alt="So würde das Probefoto im Chat gespeichert" />
                <figcaption>
                  <strong>{formatiereGroesse(probe.nachher)}</strong> statt{' '}
                  {formatiereGroesse(probe.vorher)} · {probe.breite} × {probe.hoehe} Pixel
                  <span className="muted">
                    {' '}
                    · das Foto bleibt auf diesem Gerät
                  </span>
                </figcaption>
              </figure>
            )}
          </div>

          {hinweis && <p className="alert alert--ok">{hinweis}</p>}

          <div className="logo-knoepfe kompression__knoepfe">
            <button className="btn" type="button" onClick={speichern} disabled={busy || !geaendert}>
              {busy ? 'Speichere …' : 'Kompression speichern'}
            </button>
            {geaendert && (
              <button className="btn btn--link" type="button" onClick={() => setWert(gespeichert)} disabled={busy}>
                Zurücksetzen
              </button>
            )}
          </div>
        </>
      )}

      {error && <p className="alert alert--error">{error}</p>}
    </section>
  )
}
