/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const fakes = vi.hoisted(() => {
  class FakeMap {
    static last: FakeMap | undefined
    readonly handlers = new Map<string, (...args: any[]) => void>()

    constructor(readonly options: { container: HTMLElement; style: string; center: [number, number]; zoom: number }) {
      FakeMap.last = this
    }

    on(event: string, handler: (...args: any[]) => void) {
      this.handlers.set(event, handler)
      return this
    }

    addControl() {
      return this
    }

    remove() {}
  }

  class FakeMarker {
    static last: FakeMarker | undefined
    readonly handlers = new Map<string, (...args: any[]) => void>()
    private lngLat: { lng: number; lat: number } = { lng: 41.6367, lat: 41.6434 }

    constructor(readonly options: { element: HTMLElement; draggable?: boolean }) {
      FakeMarker.last = this
    }

    setLngLat([lng, lat]: [number, number]) {
      this.lngLat = { lng, lat }
      return this
    }

    getLngLat() {
      return this.lngLat
    }

    addTo() {
      return this
    }

    on(event: string, handler: (...args: any[]) => void) {
      this.handlers.set(event, handler)
      return this
    }

    remove() {}
  }

  class FakeNavigationControl {}

  return { FakeMap, FakeMarker, FakeNavigationControl }
})

vi.mock('maplibre-gl', () => ({
  default: {
    Map: fakes.FakeMap,
    Marker: fakes.FakeMarker,
    NavigationControl: fakes.FakeNavigationControl,
  },
}))

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('PublishingMapPicker', () => {
  it('shows an explicit setup state when no approved map style is configured', async () => {
    const { PublishingMapPicker } = await import('../src/features/publishing/components/PublishingMapPicker')

    render(<PublishingMapPicker coordinates={[41.6367, 41.6434]} onChange={vi.fn()} />)

    expect(screen.getByTestId('publishing-map-unconfigured').textContent).toContain('VITE_MAP_STYLE_URL')
  })

  it('propagates a map click and draggable marker position as [lng, lat]', async () => {
    vi.stubEnv('VITE_MAP_STYLE_URL', 'inline-test-style')
    const { PublishingMapPicker } = await import('../src/features/publishing/components/PublishingMapPicker')
    const onChange = vi.fn()

    render(<PublishingMapPicker coordinates={[41.6367, 41.6434]} onChange={onChange} />)

    await waitFor(() => expect(fakes.FakeMap.last).toBeDefined())
    fakes.FakeMap.last?.handlers.get('click')?.({ lngLat: { lng: 42.1, lat: 41.7 } })
    expect(onChange).toHaveBeenLastCalledWith([42.1, 41.7])

    fakes.FakeMarker.last?.setLngLat([42.2, 41.8])
    fakes.FakeMarker.last?.handlers.get('dragend')?.()
    expect(onChange).toHaveBeenLastCalledWith([42.2, 41.8])
  })
})
