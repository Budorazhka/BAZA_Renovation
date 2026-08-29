/** @vitest-environment jsdom */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'

type Handler = (...args: unknown[]) => void

class FakeMap {
  readonly container: HTMLElement
  readonly handlers = new Map<string, Handler[]>()
  private ready = false

  constructor(options: { container: HTMLElement }) {
    this.container = options.container
  }

  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler])
    if (event === 'idle') queueMicrotask(() => { this.ready = true; handler() })
    return this
  }

  addControl() { return this }
  getCenter() { return { lng: 41.64, lat: 41.64 } }
  getBounds() { return new FakeBounds() }
  isStyleLoaded() { return this.ready }
  fitBounds() { return this }
  remove() {}
}

class FakeBounds {
  extend() { return this }
  getCenter() { return { lng: 41.64, lat: 41.64 } }
  getWest() { return 41.6 }
  getSouth() { return 41.6 }
  getEast() { return 41.7 }
  getNorth() { return 41.7 }
}

class FakeMarker {
  constructor(private readonly options: { element: HTMLElement }) {}
  setLngLat() { return this }
  addTo(map: FakeMap) {
    map.container.append(this.options.element)
    return this
  }
  remove() {}
}

vi.mock('maplibre-gl', () => ({
  default: { Map: FakeMap, Marker: FakeMarker, NavigationControl: class {}, LngLatBounds: FakeBounds },
}))

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('MarketplaceMap runtime readiness', () => {
  it('syncs real geo markers when the provider emits idle without load', async () => {
    vi.stubEnv('VITE_MAP_STYLE_URL', 'inline-test-style')
    const { MarketplaceMap } = await import('../src/components/MarketplaceMap')

    render(
      <MarketplaceMap
        items={[
          { slug: 'dev-1', name: 'ЖК 1', location: { geo: { type: 'Point', coordinates: [41.64, 41.62] } } },
        ]}
      />,
    )

    await waitFor(() => {
      expect(document.querySelectorAll('.marketplace-map__marker')).toHaveLength(1)
    })
  })
})
