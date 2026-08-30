import { Component, type ErrorInfo, type ReactNode } from 'react'

interface RouteErrorBoundaryProps {
  children: ReactNode
}

interface RouteErrorBoundaryState {
  error: Error | null
}

/** Keeps a single broken route from taking down the whole marketplace shell. */
export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the production surface useful while retaining a diagnostic trail.
    console.error('Marketplace route render failed', error, info.componentStack)
  }

  private reset = () => {
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="route-error-boundary" role="alert" aria-labelledby="route-error-heading">
        <div className="route-error-boundary__card">
          <p className="route-error-boundary__eyebrow">BAZA.sale</p>
          <h1 id="route-error-heading">Страница временно недоступна</h1>
          <p>Попробуйте обновить этот экран. Если ошибка повторится, вернитесь в каталог.</p>
          <div className="route-error-boundary__actions">
            <button type="button" onClick={this.reset}>Повторить</button>
            <a href="/">Вернуться в каталог</a>
          </div>
        </div>
      </main>
    )
  }
}
