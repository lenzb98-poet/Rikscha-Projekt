import { useState } from 'react'
import { useAuth } from './lib/useAuth'
import { useOrganisation } from './lib/organisation'
import { Login } from './pages/Login'
import { OrganisationWahl } from './pages/OrganisationWahl'
import { Dashboard } from './pages/Dashboard'

export default function App() {
  const { session, profile, loading, signOut } = useAuth()
  const organisation = useOrganisation()
  // Ein Link mit ?org=… führt immer über die Auswahl, auch wenn schon eine
  // andere Organisation gemerkt ist - die Auswahl übernimmt dann die aus dem Link.
  const [ausLink, setAusLink] = useState(() =>
    new URLSearchParams(window.location.search).has('org'),
  )

  if (loading) {
    return (
      <div className="auth">
        <p style={{ color: '#fff' }}>Einen Moment …</p>
      </div>
    )
  }

  if (!session) {
    // Vor der Anmeldung: erst die Organisation, dann ihre Anmeldung
    if (!organisation || ausLink) return <OrganisationWahl onGewaehlt={() => setAusLink(false)} />
    return <Login />
  }

  return <Dashboard profile={profile} onSignOut={() => void signOut()} />
}
