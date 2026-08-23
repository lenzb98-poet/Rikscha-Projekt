import { Component, type ErrorInfo, type ReactNode } from 'react'
import { showFatalError } from './lib/fatalError'

type Props = { children: ReactNode }
type State = { failed: boolean }

/**
 * Faengt Render-Fehler ab und reicht sie an die gemeinsame Fehleranzeige
 * weiter, damit ueberall dasselbe Format mit Fehlercode erscheint.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    showFatalError('E-RENDER', error, info.componentStack ?? undefined)
  }

  render() {
    // Die Fehleranzeige ersetzt den Inhalt von #root direkt,
    // deshalb wird hier im Fehlerfall nichts mehr gerendert.
    return this.state.failed ? null : this.props.children
  }
}
