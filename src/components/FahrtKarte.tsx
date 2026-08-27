import type { Fahrt } from '../lib/fahrten'
import { ZUSTAND_TEXT, formatiereBericht, formatiereTermin } from '../lib/fahrten'

type Props = {
  fahrt: Fahrt
  /** Zusätzliche Bedienelemente unterhalb der Angaben. */
  children?: React.ReactNode
  zeigeNotizen?: boolean
}

export function FahrtKarte({ fahrt, children, zeigeNotizen = true }: Props) {
  const frei = Math.max(0, fahrt.pilots_needed - fahrt.angemeldet)

  return (
    <article className={`fahrt fahrt--${fahrt.zustand}`}>
      <div className="fahrt__kopf">
        <div>
          <div className="fahrt__termin">{formatiereTermin(fahrt.starts_at)}</div>
          <div className="fahrt__ort">{fahrt.location}</div>
        </div>
        <span className={`chip chip--${fahrt.zustand}`}>{ZUSTAND_TEXT[fahrt.zustand]}</span>
      </div>

      {fahrt.info && <p className="fahrt__info">{fahrt.info}</p>}

      <div className="fahrt__piloten">
        <strong>
          {fahrt.angemeldet} von {fahrt.pilots_needed} Rikschas besetzt
        </strong>
        {fahrt.piloten.length > 0 ? (
          <span className="fahrt__namen">{fahrt.piloten.map((p) => p.name).join(', ')}</span>
        ) : (
          <span className="muted">Noch niemand eingetragen</span>
        )}
        {frei > 0 && fahrt.zustand === 'offen' && (
          <span className="muted">
            {frei === 1 ? 'Noch eine Rikscha frei' : `Noch ${frei} Rikschas frei`}
          </span>
        )}
      </div>

      {fahrt.report_at && (
        <div className="fahrt__bericht">
          <strong>Nach der Fahrt eingetragen</strong>
          <span>{formatiereBericht(fahrt)}</span>
          {fahrt.report_name && <span className="muted">von {fahrt.report_name}</span>}
        </div>
      )}

      {fahrt.zustand === 'nachtragen' && (
        <p className="fahrt__nachtrag">Angaben zur Fahrt fehlen noch.</p>
      )}

      {zeigeNotizen && fahrt.notizen.length > 0 && (
        <div className="fahrt__notizen">
          <strong>Mitteilungen</strong>
          {fahrt.notizen.map((n) => (
            <p key={n.id}>
              <span className="fahrt__notizname">{n.name}:</span> {n.body}
            </p>
          ))}
        </div>
      )}

      {children && <div className="fahrt__aktionen">{children}</div>}
    </article>
  )
}
