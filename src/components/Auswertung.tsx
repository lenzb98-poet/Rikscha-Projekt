import {
  alsStunden,
  formatiereKomma,
  formatiereZahl,
  werteAus,
  type Fahrt,
} from '../lib/fahrten'

/**
 * Summe aller nachgetragenen Angaben, ganz am Ende der Startseite.
 *
 * Bewusst kein Diagramm: Es sind drei Gesamtwerte ohne Verlauf, dafür sind
 * Kennzahlen die passende Form.
 */
export function Auswertung({ alle }: { alle: Fahrt[] | null }) {
  if (!alle) return null

  const summe = werteAus(alle)

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

      <p className="auswertung__fuss muted">
        {summe.fahrten === 0
          ? 'Sobald nach einer Fahrt Angaben eingetragen sind, erscheinen sie hier.'
          : `Aus ${formatiereZahl(summe.fahrten)} ${
              summe.fahrten === 1 ? 'Fahrt' : 'Fahrten'
            } mit eingetragenen Angaben.`}
      </p>
    </section>
  )
}
