import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getMarketplaceMapPoints, type MarketplaceMapItem } from '../lib/map-data'
import type { BoundingBox } from '../types/marketplace'

type MapLibreMap = InstanceType<typeof maplibregl.Map>
type MapLibreMarker = InstanceType<typeof maplibregl.Marker>

interface MarketplaceMapProps {
  items: MarketplaceMapItem[]
  onBoundsChange?: (bbox: BoundingBox) => void
  onSelect?: (item: MarketplaceMapItem) => void
}

const DEFAULT_CENTER: [number, number] = [41.64, 41.64]

function boundsFor(items: ReturnType<typeof getMarketplaceMapPoints>) {
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

function mapItemLabel(item: MarketplaceMapItem, index: number): string {
  if ('name' in item && item.name) return item.name
  return item.location?.address || `Объект ${index + 1}`
}

/**
 * MapLibre is intentionally configured through an environment-provided
 * style URL. The URL must point to an OSM-compatible provider approved for
 * production; the public OSM tile server is not used as a CDN fallback.
 */
export function MarketplaceMap({ items, onBoundsChange, onSelect }: MarketplaceMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<MapLibreMarker[]>([])
  const itemsRef = useRef(items)
  const onBoundsChangeRef = useRef(onBoundsChange)
  const onSelectRef = useRef(onSelect)
  const [mapError, setMapError] = useState<string | null>(null)
  const styleUrl = import.meta.env.VITE_MAP_STYLE_URL?.trim()

  itemsRef.current = items
  onBoundsChangeRef.current = onBoundsChange
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!styleUrl || !containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: DEFAULT_CENTER,
      zoom: 10,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    const syncMarkers = () => {
      for (const marker of markersRef.current) marker.remove()
      markersRef.current = []

      const points = getMarketplaceMapPoints(itemsRef.current)
      for (const { item, index, coordinates } of points) {
        const element = document.createElement('button')
        element.type = 'button'
        element.className = 'marketplace-map__marker'
        element.setAttribute('aria-label', mapItemLabel(item, index))
        element.addEventListener('click', () => onSelectRef.current?.(item))
        markersRef.current.push(new maplibregl.Marker({ element, anchor: 'bottom' }).setLngLat(coordinates).addTo(map))
      }

      const bounds = boundsFor(points)
      const center = map.getCenter()
      const target = bounds?.getCenter()
      if (bounds && target && (Math.abs(center.lng - target.lng) > 0.00001 || Math.abs(center.lat - target.lat) > 0.00001)) {
        map.fitBounds(bounds, { padding: 64, maxZoom: 14, duration: 0 })
      }
    }

    const handleLoad = () => {
      setMapError(null)
      syncMarkers()
    }
    const handleError = () => setMapError('Не удалось загрузить слой карты. Проверьте VITE_MAP_STYLE_URL.')
    map.on('load', handleLoad)
    map.on('error', handleError)
    map.on('moveend', (event) => {
      // Ignore the initial programmatic fit; only user viewport changes
      // update the URL and trigger a new server-side bbox query.
      if ((event as { originalEvent?: Event }).originalEvent) onBoundsChangeRef.current?.(toBoundingBox(map))
    })

    return () => {
      for (const marker of markersRef.current) marker.remove()
      markersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [styleUrl])

  useEffect(() => {
    // Marker updates do not recreate the map or reset a user's viewport.
    if (!mapRef.current || !mapRef.current.isStyleLoaded()) return
    const map = mapRef.current
    for (const marker of markersRef.current) marker.remove()
    markersRef.current = []
    for (const { item, index, coordinates } of getMarketplaceMapPoints(items)) {
      const element = document.createElement('button')
      element.type = 'button'
      element.className = 'marketplace-map__marker'
      element.setAttribute('aria-label', mapItemLabel(item, index))
      element.addEventListener('click', () => onSelectRef.current?.(item))
      markersRef.current.push(new maplibregl.Marker({ element, anchor: 'bottom' }).setLngLat(coordinates).addTo(map))
    }
  }, [items])

  if (!styleUrl) {
    return (
      <div className="marketplace-map marketplace-map--unconfigured" role="status">
        <strong>Карта пока не подключена</strong>
        <span>Задайте VITE_MAP_STYLE_URL для OSM-compatible провайдера в окружении marketplace-web.</span>
        <small>Объектов с координатами в текущей выборке: {getMarketplaceMapPoints(items).length}</small>
      </div>
    )
  }

  return (
    <div className="marketplace-map" aria-label="Карта объектов">
      <div ref={containerRef} className="marketplace-map__canvas" />
      {mapError ? <p className="marketplace-map__error" role="alert">{mapError}</p> : null}
    </div>
  )
}
