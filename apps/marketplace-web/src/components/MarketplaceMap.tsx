import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  getMarketplaceMapPoints,
  getMapItemTitle,
  getMapItemAddress,
  getMapItemPriceOrDate,
  getMapItemBadge,
  getMapItemCoverUrl,
  getMapItemLink,
  isDevelopmentCard,
  isListingCard,
  mapItemLabel,
  type MarketplaceMapItem,
  type MarketplaceMapPoint,
} from '../lib/map-data'
import { resolveMapStyleUrl } from '../lib/map-config'
import type { BoundingBox, PublicListingCard } from '../types/marketplace'

type MapLibreMap = InstanceType<typeof maplibregl.Map>
type MapLibreMarker = InstanceType<typeof maplibregl.Marker>

export interface MarketplaceMapProps {
  items: MarketplaceMapItem[]
  onBoundsChange?: (bbox: BoundingBox) => void
  onSelect?: (item: MarketplaceMapItem) => void
  selectedSlug?: string
}

const DEFAULT_CENTER: [number, number] = [41.64, 41.64]

function boundsFor(items: MarketplaceMapPoint[]) {
  if (items.length === 0) return undefined
  const bounds = new maplibregl.LngLatBounds(items[0]!.coordinates, items[0]!.coordinates)
  for (const entry of items.slice(1)) bounds.extend(entry.coordinates)
  return bounds
}

function toBoundingBox(map: MapLibreMap): BoundingBox {
  const bounds = map.getBounds()
  return {
    minLng: bounds.getWest(),
    minLat: bounds.getSouth(),
    maxLng: bounds.getEast(),
    maxLat: bounds.getNorth(),
  }
}

function MapPreviewCard({
  item,
  onClose,
  onNavigate,
}: {
  item: MarketplaceMapItem
  onClose: () => void
  onNavigate?: (item: MarketplaceMapItem) => void
}) {
  const [imgError, setImgError] = useState(false)
  const title = getMapItemTitle(item)
  const address = getMapItemAddress(item)
  const priceOrDate = getMapItemPriceOrDate(item)
  const badge = getMapItemBadge(item)
  const coverUrl = getMapItemCoverUrl(item)
  const link = getMapItemLink(item)
  const isDev = isDevelopmentCard(item)
  const listingItem = isListingCard(item) ? (item as PublicListingCard) : null

  return (
    <div
      className="marketplace-map__preview-card"
      role="dialog"
      aria-label={`Информация: ${title}`}
      data-testid="marketplace-map-preview"
    >
      <button
        type="button"
        className="marketplace-map__preview-close"
        onClick={onClose}
        aria-label="Закрыть карточку"
      >
        ✕
      </button>

      <div className="marketplace-map__preview-media">
        {coverUrl && !imgError ? (
          <img
            src={coverUrl}
            alt={title}
            className="marketplace-map__preview-img"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="marketplace-map__preview-placeholder" aria-hidden="true">
            <span className="marketplace-map__preview-tower" />
          </div>
        )}
      </div>

      <div className="marketplace-map__preview-body">
        <div className="marketplace-map__preview-meta">
          <span className="marketplace-map__preview-badge">{badge}</span>
        </div>
        <h3 className="marketplace-map__preview-title">{title}</h3>
        {priceOrDate ? <p className="marketplace-map__preview-price">{priceOrDate}</p> : null}
        <p className="marketplace-map__preview-address">{address}</p>

        {listingItem?.characteristics ? (
          <div className="marketplace-map__preview-chips" aria-label="Характеристики">
            {listingItem.characteristics.rooms ? (
              <span className="marketplace-map__preview-chip">
                {listingItem.characteristics.rooms} комн.
              </span>
            ) : null}
            {listingItem.characteristics.area ? (
              <span className="marketplace-map__preview-chip">
                {listingItem.characteristics.area} м²
              </span>
            ) : null}
            {listingItem.characteristics.floor ? (
              <span className="marketplace-map__preview-chip">
                {listingItem.characteristics.floor}
                {listingItem.characteristics.totalFloors
                  ? ` / ${listingItem.characteristics.totalFloors}`
                  : ''}{' '}
                эт.
              </span>
            ) : null}
          </div>
        ) : null}

        {link ? (
          <Link
            to={link}
            className="marketplace-map__preview-link"
            onClick={() => onNavigate?.(item)}
            aria-label={`Перейти: ${title}`}
          >
            {isDev ? 'Смотреть ЖК' : 'Смотреть объявление'} <span aria-hidden="true">→</span>
          </Link>
        ) : null}
      </div>
    </div>
  )
}

interface MarkerRecord {
  marker: MapLibreMarker
  element: HTMLButtonElement
  item: MarketplaceMapItem
}

/**
 * MapLibre is intentionally configured through an environment-provided
 * style URL. The URL must point to an OSM-compatible provider approved for
 * production; the public OSM tile server is not used as a CDN fallback.
 */
export function MarketplaceMap({
  items,
  onBoundsChange,
  onSelect,
  selectedSlug,
}: MarketplaceMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<MarkerRecord[]>([])
  const itemsRef = useRef(items)
  const onBoundsChangeRef = useRef(onBoundsChange)
  const onSelectRef = useRef(onSelect)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectedItem, setSelectedItem] = useState<MarketplaceMapItem | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const styleUrl = resolveMapStyleUrl(import.meta.env.VITE_MAP_STYLE_URL)

  itemsRef.current = items
  onBoundsChangeRef.current = onBoundsChange
  onSelectRef.current = onSelect

  // Keep selectedItem in sync if selectedSlug is passed from outside
  useEffect(() => {
    if (selectedSlug) {
      const match = items.find((i) => i.slug === selectedSlug)
      if (match) setSelectedItem(match)
    }
  }, [selectedSlug, items])

  // Escape key closes the open preview card
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedItem) {
        setSelectedItem(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedItem])

  useEffect(() => {
    if (!styleUrl || !containerRef.current) return

    let mapInstance: MapLibreMap | null = null
    try {
      mapInstance = new maplibregl.Map({
        container: containerRef.current,
        style: styleUrl,
        center: DEFAULT_CENTER,
        zoom: 10,
      })
    } catch {
      setMapError('Не удалось инициализировать карту. Проверьте VITE_MAP_STYLE_URL.')
      return
    }

    const map = mapInstance
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    const syncMarkers = () => {
      for (const { marker } of markersRef.current) marker.remove()
      markersRef.current = []

      const points = getMarketplaceMapPoints(itemsRef.current)
      for (const { item, index, coordinates } of points) {
        const element = document.createElement('button')
        element.type = 'button'
        element.className = 'marketplace-map__marker'
        element.setAttribute('aria-label', mapItemLabel(item, index))
        element.tabIndex = 0

        const handleSelect = (e?: Event) => {
          e?.stopPropagation()
          setSelectedItem(item)
          onSelectRef.current?.(item)
        }

        element.addEventListener('click', handleSelect)
        element.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleSelect(e)
          }
        })

        const marker = new maplibregl.Marker({ element, anchor: 'bottom' })
          .setLngLat(coordinates)
          .addTo(map)

        markersRef.current.push({ marker, element, item })
      }

      const bounds = boundsFor(points)
      const center = map.getCenter()
      const target = bounds?.getCenter()
      if (
        bounds &&
        target &&
        (Math.abs(center.lng - target.lng) > 0.00001 || Math.abs(center.lat - target.lat) > 0.00001)
      ) {
        map.fitBounds(bounds, { padding: 64, maxZoom: 14, duration: 0 })
      }
    }

    let didSyncInitialMarkers = false
    const handleReady = () => {
      if (didSyncInitialMarkers) return
      didSyncInitialMarkers = true
      setMapError(null)
      syncMarkers()
    }

    const handleError = () =>
      setMapError('Не удалось загрузить слой карты. Проверьте VITE_MAP_STYLE_URL.')

    map.on('load', handleReady)
    // Some style providers (and browser runtimes) reach an idle, style-ready
    // state without dispatching the initial load event. Idle is the safe
    // fallback: it runs after the style is usable and only syncs once.
    map.on('idle', handleReady)
    // Marker placement only needs the map container and projection, so do not
    // hide real geo points behind a slow style/worker bootstrap.
    queueMicrotask(handleReady)
    map.on('error', handleError)

    map.on('click', () => {
      // Clicking map canvas background dismisses the active preview
      setSelectedItem(null)
    })

    map.on('moveend', (event) => {
      // Ignore programmatic fitBounds; only user viewport changes update bounds
      if ((event as { originalEvent?: Event }).originalEvent) {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current)
        }
        debounceTimerRef.current = setTimeout(() => {
          onBoundsChangeRef.current?.(toBoundingBox(map))
        }, 300)
      }
    })

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      for (const { marker } of markersRef.current) marker.remove()
      markersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [styleUrl])

  useEffect(() => {
    // Marker updates do not recreate the map or reset a user's viewport.
    if (!mapRef.current || !mapRef.current.isStyleLoaded()) return
    const map = mapRef.current
    for (const { marker } of markersRef.current) marker.remove()
    markersRef.current = []

    for (const { item, index, coordinates } of getMarketplaceMapPoints(items)) {
      const element = document.createElement('button')
      element.type = 'button'
      element.className = `marketplace-map__marker${selectedItem?.slug === item.slug ? ' marketplace-map__marker--active' : ''}`
      element.setAttribute('aria-label', mapItemLabel(item, index))
      element.setAttribute('aria-pressed', String(selectedItem?.slug === item.slug))
      element.tabIndex = 0

      const handleSelect = (e?: Event) => {
        e?.stopPropagation()
        setSelectedItem(item)
        onSelectRef.current?.(item)
      }

      element.addEventListener('click', handleSelect)
      element.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleSelect(e)
        }
      })

      const marker = new maplibregl.Marker({ element, anchor: 'bottom' })
        .setLngLat(coordinates)
        .addTo(map)

      markersRef.current.push({ marker, element, item })
    }

    if (selectedItem && !items.some((i) => i.slug === selectedItem.slug)) {
      setSelectedItem(null)
    }
  }, [items, selectedItem])

  if (!styleUrl) {
    return (
      <div
        className="marketplace-map marketplace-map--unconfigured"
        role="status"
        data-testid="marketplace-map-unconfigured"
      >
        <strong>Карта пока не подключена</strong>
        <span>Задайте VITE_MAP_STYLE_URL для OSM-compatible провайдера в окружении marketplace-web.</span>
        <small>Объектов с координатами в текущей выборке: {getMarketplaceMapPoints(items).length}</small>
      </div>
    )
  }

  const validPointsCount = getMarketplaceMapPoints(items).length

  return (
    <div className="marketplace-map" aria-label="Карта объектов" data-testid="marketplace-map">
      <div ref={containerRef} className="marketplace-map__canvas" />
      {validPointsCount === 0 && !mapError ? (
        <div className="marketplace-map__notice" role="status" aria-live="polite">
          Нет объектов с точными координатами в текущей выборке
        </div>
      ) : null}
      {selectedItem ? (
        <MapPreviewCard
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onNavigate={onSelect}
        />
      ) : null}
      {mapError ? (
        <p className="marketplace-map__error" role="alert">
          {mapError}
        </p>
      ) : null}
    </div>
  )
}
