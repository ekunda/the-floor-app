/**
 * ErrorBoundary — łapie błędy renderowania React i wyświetla fallback UI.
 *
 * Bez ErrorBoundary każdy uncaught error w render() crasha całą aplikację
 * i użytkownik widzi białą stronę bez żadnej informacji.
 *
 * Użycie:
 *   <ErrorBoundary>
 *     <NajebanyKomponent />
 *   </ErrorBoundary>
 *
 * ErrorBoundary musi być klasowym komponentem — hooki nie mają odpowiednika
 * componentDidCatch (limitacja Reacta do wersji 19).
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorFallback } from './ErrorFallback'

interface Props {
  children: ReactNode
  /** Opcjonalny fallback — domyślnie wyświetla generyczny komunikat */
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error:    Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // W produkcji można tu podpiąć Sentry / inny error tracker
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    if (this.props.fallback) return this.props.fallback

    return <ErrorFallback error={this.state.error} onReset={this.handleReset} />
  }
}
