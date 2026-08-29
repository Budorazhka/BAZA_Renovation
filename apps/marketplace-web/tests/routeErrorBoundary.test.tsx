/** @vitest-environment jsdom */

import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RouteErrorBoundary } from '../src/components/RouteErrorBoundary'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('RouteErrorBoundary', () => {
  it('shows an accessible recovery surface for render failures', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const boundaryRef = React.createRef<RouteErrorBoundary>()

    render(
      <RouteErrorBoundary ref={boundaryRef}>
        <p>Рабочий маршрут</p>
      </RouteErrorBoundary>,
    )
    act(() => boundaryRef.current?.setState({ error: new Error('render exploded') }))

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Страница временно недоступна' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Вернуться в каталог' }).getAttribute('href')).toBe('/')
  })

  it('resets the boundary when the user retries', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const boundaryRef = React.createRef<RouteErrorBoundary>()

    render(
      <RouteErrorBoundary ref={boundaryRef}>
        <p>Маршрут восстановлен</p>
      </RouteErrorBoundary>,
    )
    act(() => boundaryRef.current?.setState({ error: new Error('one-time render failure') }))

    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(screen.getByText('Маршрут восстановлен')).toBeTruthy()
  })
})
