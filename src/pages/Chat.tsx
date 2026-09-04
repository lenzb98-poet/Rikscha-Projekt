import { useCallback, useEffect, useRef, useState } from 'react'
import {
  bildAdressen,
  deleteMessage,
  ladeBildHoch,
  listMessages,
  raeumeBildspeicherAuf,
  sendMessage,
  watchMessages,
  type ChatNachricht,
} from '../lib/supabase'
import { verkleinereBild, formatiereGroesse } from '../lib/bilder'
import { merkeGesehen } from '../lib/chatGelesen'
import { toGermanError } from '../lib/errors'

/** "Heute", "Gestern" oder das Datum – als Trenner zwischen den Tagen. */
function tagesTitel(datum: Date): string {
  const heute = new Date()
  const gestern = new Date()
  gestern.setDate(heute.getDate() - 1)
  const gleich = (a: Date, b: Date) => a.toDateString() === b.toDateString()

  if (gleich(datum, heute)) return 'Heute'
  if (gleich(datum, gestern)) return 'Gestern'
  return datum.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
}

const uhrzeit = (d: Date) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

type Auswahl = { datei: Blob; vorschau: string; breite: number; hoehe: number }

type Props = {
  istAdmin: boolean
  /** Fehlt, wenn der Chat direkt auf der Startseite steht. */
  onZurueck?: () => void
}

export function Chat({ onZurueck, istAdmin }: Props) {
  const [nachrichten, setNachrichten] = useState<ChatNachricht[] | null>(null)
  const [adressen, setAdressen] = useState<Record<string, string>>({})
  const [text, setText] = useState('')
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null)
  const [grossesBild, setGrossesBild] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const dateiRef = useRef<HTMLInputElement>(null)
  const verlaufRef = useRef<HTMLDivElement>(null)

  const laden = useCallback(() => {
    listMessages()
      // Die Datenbank liefert die neuesten zuerst, angezeigt wird chronologisch
      .then(async (rows) => {
        const chronologisch = [...rows].reverse()
        setNachrichten(chronologisch)

        // Was hier steht, gilt als gelesen. Maßgeblich ist der Zeitstempel
        // der Datenbank, nicht die Uhr des Geräts – sonst zählte eine
        // falsch gehende Uhr Nachrichten doppelt oder gar nicht.
        const neueste = chronologisch[chronologisch.length - 1]
        if (neueste) merkeGesehen(neueste.created_at)

        const pfade = chronologisch.map((n) => n.image_path).filter((p): p is string => !!p)
        if (pfade.length > 0) {
          setAdressen(await bildAdressen(pfade).catch(() => ({})))
        }
      })
      .catch((err) => setError(toGermanError(err)))
  }, [])

  useEffect(() => {
    laden()
    return watchMessages(laden)
  }, [laden])

  // Beim Öffnen und bei neuen Nachrichten ans Ende des Verlaufs springen.
  // Bewusst nur den Verlauf scrollen: steht der Chat auf der Startseite,
  // würde scrollIntoView die ganze Seite nach unten ziehen.
  useEffect(() => {
    const el = verlaufRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [nachrichten?.length])

  // Vorschaubild wieder freigeben
  useEffect(() => {
    return () => {
      if (auswahl) URL.revokeObjectURL(auswahl.vorschau)
    }
  }, [auswahl])

  async function handleDatei(e: React.ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0]
    e.target.value = '' // damit dieselbe Datei erneut gewählt werden kann
    if (!datei) return

    setError(null)
    try {
      const { datei: klein, breite, hoehe } = await verkleinereBild(datei)
      setAuswahl({ datei: klein, vorschau: URL.createObjectURL(klein), breite, hoehe })
    } catch (err) {
      setError(toGermanError(err))
    }
  }

  function verwerfeAuswahl() {
    if (auswahl) URL.revokeObjectURL(auswahl.vorschau)
    setAuswahl(null)
  }

  async function handleSenden(e: React.FormEvent) {
    e.preventDefault()
    const inhalt = text.trim()
    if (!inhalt && !auswahl) return

    setError(null)
    setBusy(true)
    try {
      let pfad: string | null = null
      if (auswahl) {
        pfad = await ladeBildHoch(auswahl.datei)
      }

      await sendMessage({
        body: inhalt,
        imagePath: pfad,
        imageSize: auswahl?.datei.size ?? null,
        imageWidth: auswahl?.breite ?? null,
        imageHeight: auswahl?.hoehe ?? null,
      })

      setText('')
      verwerfeAuswahl()
      laden()

      // Nach jedem Bild prüfen, ob die Speichergrenze überschritten ist
      if (pfad) {
        raeumeBildspeicherAuf()
          .then((weg) => {
            if (weg > 0) laden()
          })
          .catch(() => {
            // Beim nächsten Hochladen wird es erneut versucht
          })
      }
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleLoeschen(n: ChatNachricht) {
    if (!confirm(`Nachricht von ${n.author_name} löschen?`)) return
    try {
      await deleteMessage(n.id)
      laden()
    } catch (err) {
      setError(toGermanError(err))
    }
  }

  let letzterTag = ''

  return (
    <>
      {onZurueck && (
        <>
          <button className="btn btn--zurueck" onClick={onZurueck}>
            ← Zurück zur Übersicht
          </button>

          <div className="seite__kopf">
            <div>
              <h2>Piloten Chat</h2>
              <p className="muted">Für alle freigeschalteten Pilot:innen und die Koordination</p>
            </div>
          </div>
        </>
      )}

      {error && <p className="alert alert--error">{error}</p>}

      <div className="chat">
        <div className="chat__verlauf" ref={verlaufRef}>
          {!nachrichten && <p className="muted">Lade Nachrichten …</p>}

          {nachrichten?.length === 0 && (
            <p className="muted chat__leer">Noch keine Nachrichten. Schreib die erste!</p>
          )}

          {nachrichten?.map((n) => {
            const datum = new Date(n.created_at)
            const tag = tagesTitel(datum)
            const neuerTag = tag !== letzterTag
            letzterTag = tag
            const adresse = n.image_path ? adressen[n.image_path] : undefined

            return (
              <div key={n.id}>
                {neuerTag && <div className="chat__tag">{tag}</div>}
                <div
                  className={[
                    'blase',
                    n.ist_eigene ? 'blase--eigen' : '',
                    n.image_path ? 'blase--bild' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {!n.ist_eigene && <div className="blase__autor">{n.author_name}</div>}

                  {n.image_removed && (
                    <div className="blase__entfernt">
                      Bild wurde entfernt, um Speicherplatz freizugeben
                    </div>
                  )}

                  {n.image_path && (
                    <button
                      type="button"
                      className="blase__bildknopf"
                      onClick={() => adresse && setGrossesBild(adresse)}
                      disabled={!adresse}
                      style={{
                        aspectRatio:
                          n.image_width && n.image_height
                            ? `${n.image_width} / ${n.image_height}`
                            : undefined,
                      }}
                    >
                      {adresse ? (
                        <img src={adresse} alt="Bild in der Nachricht" loading="lazy" />
                      ) : (
                        <span className="blase__bildladen">Bild wird geladen …</span>
                      )}
                    </button>
                  )}

                  {n.body && <div className="blase__text">{n.body}</div>}

                  <div className="blase__fuss">
                    <span>{uhrzeit(datum)}</span>
                    {(n.ist_eigene || istAdmin) && (
                      <button
                        className="blase__loeschen"
                        onClick={() => handleLoeschen(n)}
                        title="Nachricht löschen"
                      >
                        Löschen
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {auswahl && (
          <div className="chat__vorschau">
            <img src={auswahl.vorschau} alt="Ausgewähltes Bild" />
            <div className="chat__vorschau-text">
              <strong>Bild bereit zum Senden</strong>
              <span className="muted">
                {auswahl.breite} × {auswahl.hoehe} Pixel, {formatiereGroesse(auswahl.datei.size)}
              </span>
            </div>
            <button type="button" className="btn btn--ghost" onClick={verwerfeAuswahl}>
              Entfernen
            </button>
          </div>
        )}

        <form className="chat__eingabe" onSubmit={handleSenden}>
          <input
            ref={dateiRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleDatei}
          />
          <button
            type="button"
            className="btn btn--ghost chat__bildknopf"
            onClick={() => dateiRef.current?.click()}
            title="Bild auswählen"
            aria-label="Bild auswählen"
            disabled={busy}
          >
            📷
          </button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Nachricht schreiben …"
            rows={2}
            maxLength={2000}
            onKeyDown={(e) => {
              // Enter sendet, Umschalt+Enter macht einen Zeilenumbruch
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSenden(e)
              }
            }}
          />
          <button
            className="btn chat__senden"
            type="submit"
            disabled={busy || (!text.trim() && !auswahl)}
          >
            {busy ? '…' : 'Senden'}
          </button>
        </form>
      </div>

      {grossesBild && (
        <div className="lightbox" onClick={() => setGrossesBild(null)} role="dialog" aria-modal="true">
          <img src={grossesBild} alt="Bild in voller Größe" />
          <button className="lightbox__zu" aria-label="Schließen">
            ✕
          </button>
        </div>
      )}
    </>
  )
}
