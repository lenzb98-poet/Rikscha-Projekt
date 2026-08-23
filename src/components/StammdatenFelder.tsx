import type { Rolle, Stammdaten } from '../lib/supabase'

const ROLLEN: { wert: Rolle; text: string }[] = [
  { wert: 'fahrer', text: 'Fahrer:in' },
  { wert: 'koordinator', text: 'Koordination' },
  { wert: 'admin', text: 'Administration' },
]

type Props = {
  /** Eindeutiges Präfix für die Feld-IDs, da beide Dialoge dieselben Felder nutzen. */
  praefix: string
  werte: Stammdaten
  onChange: (werte: Stammdaten) => void
  autoFocus?: boolean
}

/** Die Stammdatenfelder, gemeinsam genutzt von Anlegen und Bearbeiten. */
export function StammdatenFelder({ praefix, werte, onChange, autoFocus }: Props) {
  function setze<K extends keyof Stammdaten>(feld: K, wert: Stammdaten[K]) {
    onChange({ ...werte, [feld]: wert })
  }

  return (
    <>
      <label className="field" htmlFor={`${praefix}-name`}>
        <span className="field__label">Vor- und Nachname</span>
        <div className="field__wrap">
          <input
            id={`${praefix}-name`}
            type="text"
            value={werte.fullName}
            autoCapitalize="words"
            placeholder="z. B. Maria Müller"
            autoFocus={autoFocus}
            onChange={(e) => setze('fullName', e.target.value)}
            required
          />
        </div>
        <span className="hint">Dieser Name ist gleichzeitig der Anmeldename.</span>
      </label>

      <label className="field" htmlFor={`${praefix}-role`}>
        <span className="field__label">Rolle</span>
        <div className="field__wrap">
          <select
            id={`${praefix}-role`}
            value={werte.role}
            onChange={(e) => setze('role', e.target.value as Rolle)}
          >
            {ROLLEN.map((r) => (
              <option key={r.wert} value={r.wert}>
                {r.text}
              </option>
            ))}
          </select>
        </div>
      </label>

      <label className="field" htmlFor={`${praefix}-phone`}>
        <span className="field__label">
          Telefon <span className="field__optional">optional</span>
        </span>
        <div className="field__wrap">
          <input
            id={`${praefix}-phone`}
            type="tel"
            value={werte.phone}
            placeholder="z. B. 0170 1234567"
            onChange={(e) => setze('phone', e.target.value)}
          />
        </div>
      </label>

      <label className="field" htmlFor={`${praefix}-mail`}>
        <span className="field__label">
          E-Mail <span className="field__optional">optional</span>
        </span>
        <div className="field__wrap">
          <input
            id={`${praefix}-mail`}
            type="email"
            value={werte.contactEmail}
            placeholder="z. B. maria@example.de"
            onChange={(e) => setze('contactEmail', e.target.value)}
          />
        </div>
        <span className="hint">Nur zur Kontaktaufnahme – die Anmeldung läuft über den Namen.</span>
      </label>
    </>
  )
}

export const LEERE_STAMMDATEN: Stammdaten = {
  fullName: '',
  role: 'fahrer',
  phone: '',
  contactEmail: '',
}
