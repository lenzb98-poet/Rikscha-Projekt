import { useState } from 'react'

type Props = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  autoFocus?: boolean
}

export function PasswordField({ id, label, value, onChange, autoComplete, autoFocus }: Props) {
  const [visible, setVisible] = useState(false)
  return (
    <label className="field" htmlFor={id}>
      <span className="field__label">{label}</span>
      <div className="field__wrap">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          required
        />
        <button
          type="button"
          className="field__toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Passwort verbergen' : 'Passwort anzeigen'}
        >
          {visible ? 'Verbergen' : 'Anzeigen'}
        </button>
      </div>
    </label>
  )
}

/** Mindestanforderungen an ein neues Passwort. */
export function validatePassword(password: string, repeat: string): string | null {
  if (password.length < 8) return 'Das Passwort muss mindestens 8 Zeichen lang sein.'
  if (!/[A-Za-zÄÖÜäöüß]/.test(password)) return 'Das Passwort muss mindestens einen Buchstaben enthalten.'
  if (!/[0-9]/.test(password)) return 'Das Passwort muss mindestens eine Zahl enthalten.'
  if (password !== repeat) return 'Die beiden Passwörter stimmen nicht überein.'
  return null
}
