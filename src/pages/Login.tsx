import { useState } from 'react'
import { checkLoginEmail, linkAuthAccount, supabase, isSupabaseConfigured } from '../lib/supabase'
import { toGermanError } from '../lib/errors'
import { PasswordField, validatePassword } from '../components/PasswordField'

type Step = 'email' | 'password' | 'create-password' | 'confirm-mail'

export function Login() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function reset() {
    setStep('email')
    setPassword('')
    setRepeat('')
    setError(null)
    setInfo(null)
  }

  /** Schritt 1: E-Mail in der Benutzertabelle suchen. */
  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      const check = await checkLoginEmail(email)
      if (!check.exists_in_whitelist) {
        setError(
          'Diese E-Mail-Adresse ist nicht hinterlegt. Bitte wende dich an die Koordination der Hospizinitiative Melle.',
        )
        return
      }
      if (!check.is_active) {
        setError('Dieser Zugang ist deaktiviert. Bitte wende dich an die Koordination.')
        return
      }
      setFullName(check.full_name)
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
    setError(null)
    setBusy(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
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
    setError(null)
    const problem = validatePassword(password, repeat)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      })
      if (signUpError) throw signUpError

      if (data.session) {
        // Konto ist sofort aktiv: Whitelist-Eintrag verknüpfen
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

        {step === 'email' && (
          <form onSubmit={handleEmailSubmit} className="auth__form">
            <p className="auth__intro">
              Bitte gib deine E-Mail-Adresse ein. Wir prüfen, ob du für die Rikscha-App
              freigeschaltet bist.
            </p>
            <label className="field" htmlFor="email">
              <span className="field__label">E-Mail-Adresse</span>
              <div className="field__wrap">
                <input
                  id="email"
                  type="email"
                  value={email}
                  autoComplete="username"
                  autoFocus
                  onChange={(e) => setEmail(e.target.value)}
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
              {fullName ? `Willkommen zurück, ${fullName}.` : 'Willkommen zurück.'} Bitte gib dein
              Passwort ein.
            </p>
            <p className="auth__email">{email}</p>
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
              Andere E-Mail-Adresse verwenden
            </button>
          </form>
        )}

        {step === 'create-password' && (
          <form onSubmit={handleCreatePassword} className="auth__form">
            <p className="auth__intro">
              {fullName ? `Hallo ${fullName}!` : 'Hallo!'} Das ist deine erste Anmeldung – bitte
              lege jetzt dein eigenes Passwort fest.
            </p>
            <p className="auth__email">{email}</p>
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
              Fast geschafft! Wir haben dir eine E-Mail an <strong>{email}</strong> geschickt.
              Bitte bestätige den Link darin, danach kannst du dich mit deinem neuen Passwort
              anmelden.
            </p>
            <button type="button" className="btn" onClick={reset}>
              Zur Anmeldung
            </button>
          </div>
        )}

        {error && <p className="alert alert--error">{error}</p>}
        {info && <p className="alert alert--ok">{info}</p>}
      </div>
    </div>
  )
}
