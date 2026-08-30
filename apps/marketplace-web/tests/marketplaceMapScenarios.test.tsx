/** @vitest-environment jsdom */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, waitFor, fireEvent, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { PublicDevelopmentCard, PublicListingCard } from '../src/types/marketplace'

const { MockMap, MockMarker, MockBounds, mockState } = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void

  const mockState = {
    lastInstance: null as MockMap | null,
  }

  class MockBounds {
    constructor(
      private west = 41.6,
      private south = 41.6,
      private east = 41.7,
      private north = 41.7,
    ) {}

    extend() { return this }
    getCenter() { return { lng: (this.west + this.east) / 2, lat: (this.south + this.north) / 2 } }
    getWest() { return this.west }
    getSouth() { return this.south }
    getEast() { return this.east }
    getNorth() { return this.north }
  }

  class MockMap {
    readonly container: HTMLElement
    readonly handlers = new Map<string, Handler[]>()
    private ready = false
    private center = { lng: 41.64, lat: 41.64 }
    private bounds = new MockBounds()
    public removeCalled = false

    constructor(options: { container: HTMLElement; style: string }) {
      if (options.style === 'malformed-throw-style') {
        throw new Error('Malformed style URL syntax')
      }
      this.container = options.container
      mockState.lastInstance = this
    }

    on(event: string, handler: Handler) {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler])
      if (event === 'idle') {
        queueMicrotask(() => {
          this.ready = true
          handler()
        })
      }
      return this
    }

    trigger(event: string, ...args: unknown[]) {
      const list = this.handlers.get(event) ?? []
      for (const h of list) h(...args)
    }

    addControl() { return this }
    getCenter() { return this.center }
    getBounds() { return this.bounds }
    isStyleLoaded() { return this.ready }
    fitBounds() { return this }
    remove() {
      this.removeCalled = true
      this.handlers.clear()
    }
  }

  class MockMarker {
    private element: HTMLElement
    public removeCalled = false

    constructor(options: { element: HTMLElement }) {
      this.element = options.element
    }

    setLngLat() { return this }
    addTo(map: MockMap) {
      map.container.append(this.element)
      return this
    }
    remove() {
      this.removeCalled = true
      this.element.remove()
    }
  }

  return { MockMap, MockMarker, MockBounds, mockState }
})

vi.mock('maplibre-gl', () => ({
  default: {
    Map: MockMap,
    Marker: MockMarker,
    NavigationControl: class {},
    LngLatBounds: MockBounds,
  },
}))

import { MarketplaceMap } from '../src/components/MarketplaceMap'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  mockState.lastInstance = null
})

const sampleDevelopments: PublicDevelopmentCard[] = [
  {
    slug: 'batumi-palace',
    name: 'Batumi Palace',
    classType: 'Комфорт',
    completionDate: '2026-10-01',
    location: {
      city: 'Батуми',
      address: 'ул. Багратиони, 120',
      geo: { type: 'Point', coordinates: [41.63, 41.63] },
    },
  },
  {
    slug: 'horizon-towers',
    name: 'Horizon Towers',
    classType: 'Премиум',
    completionDate: '2027-06-01',
    location: {
      city: 'Батуми',
      address: 'пр. Шерифа Химшиашвили, 45',
      geo: { type: 'Point', coordinates: [41.65, 41.65] },
    },
  },
]

const sampleListings: PublicListingCard[] = [
  {
    slug: 'sunny-flat-batumi',
    dealType: 'sale',
    propertyType: 'apartment',
    price: { amountMinorUnits: 8500000, currency: 'USD' },
    characteristics: { rooms: 2, area: 55, floor: 8, totalFloors: 16 },
    location: {
      city: 'Батуми',
      address: 'ул. Горгиладзе, 50',
      geo: { type: 'Point', coordinates: [41.64, 41.64] },
    },
    media: [{ role: 'cover', url: 'https://cdn.example.com/cover1.jpg', position: 0 }],
  },
]

describe('MarketplaceMap User Scenarios & Edge Cases', () => {
  it('renders unconfigured placeholder when VITE_MAP_STYLE_URL is missing', () => {
    vi.stubEnv('VITE_MAP_STYLE_URL', '')
    render(
      <MemoryRouter>
        <MarketplaceMap items={sampleDevelopments} />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('marketplace-map-unconfigured')).toBeDefined()
    expect(screen.getByText('Карта пока не подключена')).toBeDefined()
    expect(screen.getByText(/Объектов с координатами в текущей выборке: 2/)).toBeDefined()
  })

  it('renders unconfigured placeholder when VITE_MAP_STYLE_URL is REPLACE_ME_* placeholder', () => {
    vi.stubEnv('VITE_MAP_STYLE_URL', 'REPLACE_ME_OSM_COMPATIBLE_STYLE_URL')
    render(
      <MemoryRouter>
        <MarketplaceMap items={sampleDevelopments} />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('marketplace-map-unconfigured')).toBeDefined()
  })

  it('handles malformed style URL throwing synchronously in Map constructor', () => {
    vi.stubEnv('VITE_MAP_STYLE_URL', 'malformed-throw-style')
    render(
      <MemoryRouter>
        <MarketplaceMap items={sampleDevelopments} />
      </MemoryRouter>,
    )

    expect(screen.queryByTestId('marketplace-map-unconfigured')).toBeNull()
  })

  it('handles asynchronous map error events gracefully', async () => {
    vi.stubEnv('VITE_MAP_STYLE_URL', 'https://tiles.example.com/style.json')
    render(
      <MemoryRouter>
        <MarketplaceMap items={sampleDevelopments} />
      </MemoryRouter>,
    )

    await waitFor(() => expect(mockState.lastInstance).not.toBeNull())

    act(() => {
      mockState.lastInstance?.trigger('error', { error: new Error('Network tile error') })
    })

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain('Не удалось загрузить слой карты')
    })
  })

  it('renders notice when items list has zero objects with coordinates', async () => {
    vi.stubEnv('VITE_MAP_STYLE_URL', 'https://tiles.example.com/style.json')
    render(
      <MemoryRouter>
        <MarketplaceMap items={[{ slug: 'no-geo', name: 'Объект без координат' }]} />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Нет объектов с точными координатами в текущей выборке')).toBeDefined()
    })
  })

  it('renders interactive markers for valid objects without duplicates', async () => {
    vi.stubEnv('VITE_MAP_STYLE_URL', 'https://tiles.example.com/style.json')
    const { rerender } = render(
      <MemoryRouter>
        <MarketplaceMap items={sampleDevelopments} />
      </MemoryRouter>,
    )

    await waitFor(() => {
      const markers = document.querySelectorAll('.marketplace-map__marker')
      expect(markers.length).toBe(2)
      expect(markers[0]!.getAttribute('aria-label')).toBeDefined()
    })

    // Rerender with same items does not duplicate markers
    rerender(
      <MemoryRouter>
        <MarketplaceMap items={sampleDevelopments} />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(document.querySelectorAll('.marketplace-map__marker').length).toBe(2)
    })
  })

  it('opens preview card on marker click and allows navigation to development detail', async () => {
    vi.stubEnv('VITE_MAP_STYLE_URL', 'https://tiles.example.com/style.json')
    const onSelect = vi.fn()

    render(
      <MemoryRouter>
        <MarketplaceMap items={sampleDevelopments} onSelect={onSelect} />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(document.querySelectorAll('.marketplace-map__marker').length).toBe(2)
    })

    const firstMarker = document.querySelectorAll('.marketplace-map__marker')[0] as HTMLElement
    fireEvent.click(firstMarker)

    expect(onSelect).toHaveBeenCalledWith(sampleDevelopments[0])

    await waitFor(() => {
      const preview = screen.getByTestId('marketplace-map-preview')
      expect(preview).toBeDefined()
      expect(preview.textContent).toContain('Batumi Palace')
      expect(preview.textContent).toContain('Батуми, ул. Багратиони, 120')
      expect(preview.textContent).toContain('ЖК · Комфорт')
    })

    const link = screen.getByRole('link', { name: /Перейти: Batumi Palace/i })
    expect(link.getAttribute('href')).toBe('/developments/batumi-palace')

    // Close preview card with close button
    const closeBtn = screen.getByRole('button', { name: /Закрыть карточку/i })
    fireEvent.click(closeBtn)

    await waitFor(() => {
      expect(screen.queryByTestId('marketplace-map-preview')).toBeNull()
    })
  })

  it('renders listing preview card with price, characteristics chips, and cover image', async () => {
    vi.stubEnv('VITE_MAP_STYLE_URL', 'https://tiles.example.com/style.json')
    render(
      <MemoryRouter>
        <MarketplaceMap items={sampleListings} />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(document.querySelectorAll('.marketplace-map__marker').length).toBe(1)
    })

    const marker = document.querySelector('.marketplace-map__marker') as HTMLElement
    fireEvent.click(marker)

    await waitFor(() => {
      const preview = screen.getByTestId('marketplace-map-preview')
      expect(preview.textContent).toContain('2-комн. квартира, 55 м²')
      expect(preview.textContent).toMatch(/\$85[\s\u00A0]000/)
      expect(preview.textContent).toContain('2 комн.')
      expect(preview.textContent).toContain('55 м²')
      expect(preview.textContent).toContain('8 / 16 эт.')
    })

    const link = screen.getByRole('link', { name: /Перейти: 2-комн. квартира/i })
    expect(link.getAttribute('href')).toBe('/listings/sunny-flat-batumi')
  })

  it('supports keyboard navigation: Enter to open preview, Escape to close', async () => {
    vi.stubEnv('VITE_MAP_STYLE_URL', 'https://tiles.example.com/style.json')
    render(
      <MemoryRouter>
        <MarketplaceMap items={sampleDevelopments} />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(document.querySelectorAll('.marketplace-map__marker').length).toBe(2)
    })

    const marker = document.querySelectorAll('.marketplace-map__marker')[0] as HTMLElement
    fireEvent.keyDown(marker, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByTestId('marketplace-map-preview')).toBeDefined()
    })

    // Escape closes preview
    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByTestId('marketplace-map-preview')).toBeNull()
    })
  })

  it('debounces viewport bounds change on user interaction and ignores programmatic fits', async () => {
    vi.useFakeTimers()
    vi.stubEnv('VITE_MAP_STYLE_URL', 'https://tiles.example.com/style.json')
    const onBoundsChange = vi.fn()

    render(
      <MemoryRouter>
        <MarketplaceMap items={sampleDevelopments} onBoundsChange={onBoundsChange} />
      </MemoryRouter>,
    )

    // Programmatic move (no originalEvent) does not trigger onBoundsChange
    mockState.lastInstance?.trigger('moveend', {})
    act(() => { vi.advanceTimersByTime(500) })
    expect(onBoundsChange).not.toHaveBeenCalled()

    // User move (with originalEvent) debounces and fires after 300ms
    mockState.lastInstance?.trigger('moveend', { originalEvent: new MouseEvent('mouseup') })
    expect(onBoundsChange).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(300) })
    expect(onBoundsChange).toHaveBeenCalledTimes(1)
    expect(onBoundsChange).toHaveBeenCalledWith({
      minLng: 41.6,
      minLat: 41.6,
      maxLng: 41.7,
      maxLat: 41.7,
    })

    vi.useRealTimers()
  })

  it('cleans up MapLibre instance and markers on unmount', async () => {
    vi.stubEnv('VITE_MAP_STYLE_URL', 'https://tiles.example.com/style.json')
    const { unmount } = render(
      <MemoryRouter>
        <MarketplaceMap items={sampleDevelopments} />
      </MemoryRouter>,
    )

    await waitFor(() => expect(mockState.lastInstance).not.toBeNull())
    const instance = mockState.lastInstance!

    unmount()

    expect(instance.removeCalled).toBe(true)
  })
})
