import { useAuth } from './lib/useAuth'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'

export default function App() {
  const { session, profile, loading, signOut } = useAuth()

  if (loading) {
    return (
      <div className="auth">
        <p className="muted">Einen Moment …</p>
      </div>
    )
  }

  if (!session) return <Login />

  return (
    <Dashboard
      profile={profile}
      email={session.user.email ?? ''}
      onSignOut={() => void signOut()}
    />
  )
}
