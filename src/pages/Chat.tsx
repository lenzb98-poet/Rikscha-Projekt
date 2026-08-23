import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteMessage,
  listMessages,
  sendMessage,
  watchMessages,
  type ChatNachricht,
} from '../lib/supabase'
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

export function Chat({ onZurueck, istAdmin }: { onZurueck: () => void; istAdmin: boolean }) {
  const [nachrichten, setNachrichten] = useState<ChatNachricht[] | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const endeRef = useRef<HTMLDivElement>(null)

  const laden = useCallback(() => {
    listMessages()
      // Die Datenbank liefert die neuesten zuerst, angezeigt wird chronologisch
      .then((rows) => setNachrichten([...rows].reverse()))
      .catch((err) => setError(toGermanError(err)))
  }, [])

  useEffect(() => {
    laden()
    return watchMessages(laden)
  }, [laden])

  // Beim Öffnen und bei neuen Nachrichten ans Ende springen
  useEffect(() => {
    endeRef.current?.scrollIntoView({ block: 'end' })
  }, [nachrichten?.length])

  async function handleSenden(e: React.FormEvent) {
    e.preventDefault()
    const inhalt = text.trim()
    if (!inhalt) return
    setError(null)
    setBusy(true)
    try {
      await sendMessage(inhalt)
      setText('')
      laden()
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
      <button className="btn btn--zurueck" onClick={onZurueck}>
        ← Zurück zur Übersicht
      </button>

      <div className="seite__kopf">
        <div>
          <h2>Chat</h2>
          <p className="muted">Für alle freigeschalteten Fahrer:innen und die Koordination</p>
        </div>
      </div>

      {error && <p className="alert alert--error">{error}</p>}

      <div className="chat">
        <div className="chat__verlauf">
          {!nachrichten && <p className="muted">Lade Nachrichten …</p>}

          {nachrichten?.length === 0 && (
            <p className="muted chat__leer">
              Noch keine Nachrichten. Schreib die erste!
            </p>
          )}

          {nachrichten?.map((n) => {
            const datum = new Date(n.created_at)
            const tag = tagesTitel(datum)
            const neuerTag = tag !== letzterTag
            letzterTag = tag

            return (
              <div key={n.id}>
                {neuerTag && <div className="chat__tag">{tag}</div>}
                <div className={n.ist_eigene ? 'blase blase--eigen' : 'blase'}>
                  {!n.ist_eigene && <div className="blase__autor">{n.author_name}</div>}
                  <div className="blase__text">{n.body}</div>
                  <div className="blase__fuss">
                    <span>{uhrzeit(datum)}</span>
                    {(n.ist_eigene || istAdmin) && (
                      <button
                        className="blase__loeschen"
                        onClick={() => handleLoeschen(n)}
                        aria-label="Nachricht löschen"
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
          <div ref={endeRef} />
        </div>

        <form className="chat__eingabe" onSubmit={handleSenden}>
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
          <button className="btn" type="submit" disabled={busy || !text.trim()}>
            {busy ? '…' : 'Senden'}
          </button>
        </form>
      </div>
    </>
  )
}
