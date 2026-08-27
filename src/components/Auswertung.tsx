import { useEffect, useState } from 'react'
import {
  alsStunden,
  formatiereKomma,
  formatiereZahl,
  rikschaStatistik,
  werteAusGesamt,
  type Fahrt,
  type RikschaStatistik,
  type Uebernahme,
} from '../lib/fahrten'

/**
 * Summe aller nachgetragenen Angaben, ganz am Ende der Startseite.
 *
 * Bewusst kein Diagramm: Es sind drei Gesamtwerte ohne Verlauf, dafür sind
 * Kennzahlen die passende Form.
 */
type Props = {
  alle: Fahrt[] | null
  /** Zahlen aus der Zeit vor dieser App; zählen mit. */
  uebernahmen: Uebernahme[]
}

export function Auswertung({ alle, uebernahmen }: Props) {
  const [proRikscha, setProRikscha] = useState<RikschaStatistik[]>([])

  useEffect(() => {
    rikschaStatistik()
      .then(setProRikscha)
      .catch(() => setProRikscha([]))
  }, [alle])

  if (!alle) return null

  const summe = werteAusGesamt(alle, uebernahmen)

  return (
    <section className="auswertung">
      <h3>Bisher zusammengekommen</h3>

      <div className="kennzahlen">
        <div className="kennzahl">
          <span className="kennzahl__wert">{formatiereKomma(summe.km)}</span>
          <span className="kennzahl__einheit">Kilometer</span>
        </div>

        <div className="kennzahl">
          <span className="kennzahl__wert">{formatiereZahl(summe.minuten)}</span>
          <span className="kennzahl__einheit">Minuten</span>
          {alsStunden(summe.minuten) && (
            <span className="kennzahl__zusatz">{alsStunden(summe.minuten)}</span>
          )}
        </div>

        <div className="kennzahl">
          <span className="kennzahl__wert">{formatiereZahl(summe.personen)}</span>
          <span className="kennzahl__einheit">
            {summe.personen === 1 ? 'Fahrgast' : 'Fahrgäste'}
          </span>
        </div>
      </div>

      {proRikscha.length > 0 && (
        <div className="rikschas">
          <h4>Nach Rikscha</h4>
          <ul className="rikschas__liste">
            {proRikscha.map((r) => (
              <li key={r.rikscha} className="rikschas__zeile">
                <span className="rikschas__name">{r.rikscha}</span>
                <span className="rikschas__werte">
                  {formatiereKomma(Number(r.km))} km · {formatiereZahl(r.minuten)} Min. ·{' '}
                  {formatiereZahl(r.personen)} {r.personen === 1 ? 'Fahrgast' : 'Fahrgäste'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="auswertung__fuss muted">
        {summe.fahrten === 0 && uebernahmen.length === 0
          ? 'Sobald nach einer Fahrt Angaben eingetragen sind, erscheinen sie hier.'
          : [
              summe.fahrten > 0 &&
                `${formatiereZahl(summe.fahrten)} ${
                  summe.fahrten === 1 ? 'Fahrt' : 'Fahrten'
                } mit eingetragenen Angaben`,
              uebernahmen.length > 0 &&
                `${formatiereZahl(uebernahmen.length)} ${
                  uebernahmen.length === 1 ? 'Übernahme' : 'Übernahmen'
                } aus der bisherigen Statistik`,
            ]
              .filter(Boolean)
              .join(' und ') + '.'}
      </p>
    </section>
  )
}
