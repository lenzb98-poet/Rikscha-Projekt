import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './ErrorBoundary'
import { showFatalError, markAppMounted } from './lib/fatalError'
import './styles.css'

// Der Service Worker fragt beim Antippen einer Mitteilung, ob dieses Fenster
// die installierte App ist (public/sw.js). Nur dann holt er es nach vorn -
// ein Browser-Tab öffnete auf dem Handy den Browser statt der App.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    if (e.data?.rikschaFrage !== 'app?' || !e.ports[0]) return
    const app =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true
    e.ports[0].postMessage({ app })
  })
  navigator.serviceWorker.startMessages?.()
  // Einen neuen Service Worker gleich beim Start holen, nicht erst irgendwann
  navigator.serviceWorker
    .getRegistration()
    .then((reg) => reg?.update())
    .catch(() => {})
}

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
