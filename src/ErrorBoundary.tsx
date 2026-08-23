import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/** Faengt Render-Fehler ab, damit statt einer weissen Seite eine Meldung erscheint. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unerwarteter Fehler in der App:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="auth">
        <div className="auth__card">
          <h1>Es ist ein Fehler aufgetreten</h1>
          <p className="alert alert--error">{this.state.error.message}</p>
          <button className="btn" onClick={() => location.reload()}>
            Seite neu laden
          </button>
        </div>
      </div>
    )
  }
}
