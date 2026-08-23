import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './ErrorBoundary'
import { showFatalError, markAppMounted } from './lib/fatalError'
import './styles.css'

try {
  const container = document.getElementById('root')
  if (!container) throw new Error('Das Element #root fehlt im HTML.')

  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  )

  // Sagt der Start-Diagnose in index.html Bescheid, dass die App laeuft.
  markAppMounted()
} catch (error) {
  showFatalError('E-MOUNT', error)
}
