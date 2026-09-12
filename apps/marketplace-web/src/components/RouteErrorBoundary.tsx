import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useI18n } from '../i18n'

interface RouteErrorBoundaryProps {
  children: ReactNode
}

interface RouteErrorBoundaryState {
  error: Error | null
}

/**
 * Класс не может звать хуки напрямую, а `useI18n` нужен для перевода текста
 * ошибки — вынесена в отдельный функциональный компонент.
 */
function RouteErrorFallback({ onReset }: { onReset: () => void }) {
  const { t } = useI18n()
  return (
    <main className="route-error-boundary" role="alert" aria-labelledby="route-error-heading">
      <div className="route-error-boundary__card">
        <p className="route-error-boundary__eyebrow">BAZA.sale</p>
        <h1 id="route-error-heading">{t('routeError.title')}</h1>
        <p>{t('routeError.text')}</p>
        <div className="route-error-boundary__actions">
          <button type="button" onClick={onReset}>{t('routeError.retry')}</button>
          <a href="/">{t('common.backToCatalogue')}</a>
        </div>
      </div>
    </main>
  )
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
    return <RouteErrorFallback onReset={this.reset} />
  }
}
