import { useState } from 'react'
import { checkLoginName, linkAuthAccount, supabase, isSupabaseConfigured } from '../lib/supabase'
import { toGermanError } from '../lib/errors'
import { PasswordField, validatePassword } from '../components/PasswordField'

type Step = 'name' | 'password' | 'create-password' | 'confirm-mail'

export function Login() {
  const [step, setStep] = useState<Step>('name')
  const [name, setName] = useState('')
  const [fullName, setFullName] = useState<string | null>(null)
  // Technische Kennung fuer Supabase Auth - wird nie angezeigt.
  const [loginEmail, setLoginEmail] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function reset() {
    setStep('name')
    setPassword('')
    setRepeat('')
    setError(null)
  }

  /** Schritt 1: Namen in der Benutzertabelle suchen. */
  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const check = await checkLoginName(name)
      if (!check.found || !check.login_email) {
        setError(
          'Dieser Name ist nicht hinterlegt. Bitte achte auf die genaue Schreibweise oder wende dich an die Koordination der Hospizinitiative Melle.',
        )
        return
      }
      if (!check.is_active) {
        setError('Dieser Zugang ist deaktiviert. Bitte wende dich an die Koordination.')
        return
      }
      setFullName(check.full_name)
      setLoginEmail(check.login_email)
      setStep(check.has_account ? 'password' : 'create-password')
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(false)
    }
  }

  /** Schritt 2a: Anmeldung mit vorhandenem Passwort. */
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    if (!loginEmail) return
    setError(null)
    setBusy(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      })
      if (signInError) throw signInError
      await linkAuthAccount()
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(false)
    }
  }

  /** Schritt 2b: Erstanmeldung – eigenes Passwort vergeben. */
  async function handleCreatePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!loginEmail) return
    setError(null)
    const problem = validatePassword(password, repeat)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: loginEmail,
        password,
      })
      if (signUpError) throw signUpError

      if (data.session) {
        await linkAuthAccount()
      } else {
        // Projekt verlangt eine E-Mail-Bestätigung
        setStep('confirm-mail')
      }
    } catch (err) {
      setError(toGermanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <header className="auth__header">
          <div className="auth__logo" aria-hidden="true">🚲</div>
          <h1>Rikscha-Fahrten</h1>
          <p className="auth__sub">Hospizinitiative Melle</p>
        </header>

        {!isSupabaseConfigured && (
          <p className="alert alert--warn">
            Supabase ist noch nicht konfiguriert. Bitte <code>.env</code> nach dem Vorbild von{' '}
            <code>.env.example</code> anlegen.
          </p>
        )}

        {step === 'name' && (
          <form onSubmit={handleNameSubmit} className="auth__form">
            <p className="auth__intro">
              Bitte gib deinen vollständigen Namen ein. Wir prüfen, ob du für die Rikscha-App
              freigeschaltet bist.
            </p>
            <label className="field" htmlFor="name">
              <span className="field__label">Vor- und Nachname</span>
              <div className="field__wrap">
                <input
                  id="name"
                  type="text"
                  value={name}
                  autoComplete="name"
                  autoCapitalize="words"
                  placeholder="z. B. Lenz Becker"
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </label>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Prüfe …' : 'Weiter'}
            </button>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={handleSignIn} className="auth__form">
            <p className="auth__intro">
              Willkommen zurück! Bitte gib dein Passwort ein.
            </p>
            <p className="auth__email">{fullName}</p>
            <PasswordField
              id="password"
              label="Passwort"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              autoFocus
            />
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Melde an …' : 'Anmelden'}
            </button>
            <button type="button" className="btn btn--link" onClick={reset}>
              Anderer Name
            </button>
          </form>
        )}

        {step === 'create-password' && (
          <form onSubmit={handleCreatePassword} className="auth__form">
            <p className="auth__intro">
              Hallo {fullName}! Das ist deine erste Anmeldung – bitte lege jetzt dein eigenes
              Passwort fest.
            </p>
            <PasswordField
              id="new-password"
              label="Neues Passwort"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              autoFocus
            />
            <PasswordField
              id="repeat-password"
              label="Passwort wiederholen"
              value={repeat}
              onChange={setRepeat}
              autoComplete="new-password"
            />
            <p className="hint">Mindestens 8 Zeichen, mit mindestens einem Buchstaben und einer Zahl.</p>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Speichere …' : 'Passwort festlegen und anmelden'}
            </button>
            <button type="button" className="btn btn--link" onClick={reset}>
              Zurück
            </button>
          </form>
        )}

        {step === 'confirm-mail' && (
          <div className="auth__form">
            <p className="alert alert--ok">
              Dein Konto wurde angelegt. In den Supabase-Einstellungen ist die E-Mail-Bestätigung
              noch aktiv – bitte lasse sie von der Koordination deaktivieren, danach kannst du dich
              direkt anmelden.
            </p>
            <button type="button" className="btn" onClick={reset}>
              Zur Anmeldung
            </button>
          </div>
        )}

        {error && <p className="alert alert--error">{error}</p>}
      </div>
    </div>
  )
}
