import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { RadelnLogo } from './Marke'

/**
 * Die Kurzanleitung als Video: was Pilotinnen und Piloten in der App tun.
 *
 * Beim ersten Login öffnet sie sich von selbst; danach steht ganz unten auf
 * der Startseite ein Knopf dafür. Ob jemand das Video schon gesehen hat,
 * steht in der Datenbank (app_users.tutorial_gesehen_am) und gilt damit auf
 * allen Geräten - wer am Handy geschlossen hat, bekommt es am Rechner nicht
 * noch einmal ungefragt.
 *
 * Das Video liegt unter public/tutorial und wird mit der App ausgeliefert -
 * als MP4 und als WebM, der Browser nimmt das erste, das er abspielen kann.
 */
// MP4 (H.264) spielen praktisch alle Handys; WebM ist der Ersatz für Browser ohne H.264
const VIDEO_MP4 = `${import.meta.env.BASE_URL}tutorial/erste-schritte.mp4`
const VIDEO_WEBM = `${import.meta.env.BASE_URL}tutorial/erste-schritte.webm`
const VORSCHAU = `${import.meta.env.BASE_URL}tutorial/erste-schritte.jpg`

/** Merkt sich, dass das Video gesehen wurde. Scheitert es, kommt es beim nächsten Mal wieder - kein Beinbruch. */
async function alsGesehenMerken(): Promise<void> {
  const { error } = await supabase.rpc('tutorial_gesehen')
  if (error) console.warn('Kurzanleitung nicht als gesehen gespeichert:', error.message)
}

type Props = {
  /** Beim ersten Login: begrüßt statt nur zu erklären. */
  willkommen: boolean
  onClose: () => void
}

export function KurzanleitungDialog({ willkommen, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null)

  function schliessen() {
    video.current?.pause()
    void alsGesehenMerken()
    onClose()
  }

  // Mit der Escape-Taste schließen, wie andere Dialoge auch
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') schliessen()
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [])

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="anleitung-titel"
      onClick={(e) => {
        if (e.target === e.currentTarget) schliessen()
      }}
    >
      <div className="overlay__card anleitung">
        <div className="einrichten__kopf">
          <RadelnLogo className="einrichten__logo" />
          <div>
            <h3 id="anleitung-titel">{willkommen ? 'Willkommen bei den Rikscha-Fahrten!' : 'Kurzanleitung'}</h3>
            <p className="muted einrichten__unter">
              In knapp fünf Minuten zeigt dir das Video alles, was du als Pilotin oder Pilot
              brauchst.
            </p>
          </div>
        </div>

        <video
          ref={video}
          className="anleitung__video"
          poster={VORSCHAU}
          controls
          playsInline
          preload="metadata"
        >
          <source src={VIDEO_MP4} type="video/mp4" />
          <source src={VIDEO_WEBM} type="video/webm" />
          Dein Browser kann das Video leider nicht abspielen.
        </video>

        {willkommen && (
          <p className="hint anleitung__hinweis">
            Du kannst das Video jederzeit wieder ansehen – ganz unten auf der Startseite.
          </p>
        )}

        <div className="overlay__actions">
          <button className="btn" onClick={schliessen}>
            {willkommen ? 'Los geht’s' : 'Schließen'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Der Knopf ganz unten auf der Startseite. */
export function KurzanleitungKnopf() {
  const [offen, setOffen] = useState(false)
  return (
    <>
      <div className="einrichten">
        <button className="btn btn--ghost" onClick={() => setOffen(true)}>
          🎬 Kurzanleitung ansehen
        </button>
      </div>
      {offen && <KurzanleitungDialog willkommen={false} onClose={() => setOffen(false)} />}
    </>
  )
}
