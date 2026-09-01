import React from 'react'
import { useI18n } from "@/i18n";

interface RuntimeErrorBoundaryProps {
  children: React.ReactNode
}

interface RuntimeErrorBoundaryState {
  hasError: boolean
  message: string
}

export class RuntimeErrorBoundary extends React.Component<
  RuntimeErrorBoundaryProps,
  RuntimeErrorBoundaryState
> {
  state: RuntimeErrorBoundaryState = {
    hasError: false,
    message: '',
  }

  static getDerivedStateFromError(error: Error): RuntimeErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Unknown runtime error',
    }
  }

  componentDidCatch(error: Error) {
    console.error('RuntimeErrorBoundary caught error:', error)
  }

  render() {
    if (this.state.hasError) {
      return <RuntimeErrorContent message={this.state.message} />
    }

    return this.props.children
  }
}

function RuntimeErrorContent({ message }: { message: string }) {
  const { t } = useI18n()
  return (
    <div className="m-6 rounded-lg border border-rose-300 bg-rose-50 p-4 text-rose-900">
      <p className="text-sm font-normal">{t('common.runtimeErrorBoundary.ошибка_рендера_стран')}</p>
      <p className="mt-2 text-xs">{message}</p>
    </div>
  )
}
