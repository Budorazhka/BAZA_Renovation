import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

type Coordinates = [number, number]
type MapLibreMap = InstanceType<typeof maplibregl.Map>
type MapLibreMarker = InstanceType<typeof maplibregl.Marker>

interface PublishingMapPickerProps {
  coordinates: Coordinates
  onChange: (coordinates: Coordinates) => void
}
function isValidCoordinates(coordinates: Coordinates): boolean {
  const [lng, lat] = coordinates
  return Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90
}

/**
 * Real MapLibre picker for the publisher flow. The marker represents the
 * owner's chosen point; it is not a selection of an existing public listing.
 * The style URL is deliberately environment-provided, matching the catalogue
 * map and avoiding an unapproved public OSM tile fallback.
 */
export function PublishingMapPicker({ coordinates, onChange }: PublishingMapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<MapLibreMarker | null>(null)
  const coordinatesRef = useRef(coordinates)
  const onChangeRef = useRef(onChange)
  const [mapError, setMapError] = useState<string | null>(null)
  const styleUrl = import.meta.env.VITE_MAP_STYLE_URL?.trim()

  coordinatesRef.current = coordinates
  onChangeRef.current = onChange

  useEffect(() => {
    if (!styleUrl || !containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: coordinatesRef.current,
      zoom: 15,
    })
    const markerElement = document.createElement('div')
    markerElement.className = 'publishing-map-picker__marker'
    markerElement.setAttribute('aria-hidden', 'true')
    const marker = new maplibregl.Marker({ element: markerElement, draggable: true })
      .setLngLat(coordinatesRef.current)
      .addTo(map)

    mapRef.current = map
    markerRef.current = marker

    const updateCoordinates = (next: Coordinates) => {
      if (!isValidCoordinates(next)) return
      marker.setLngLat(next)
      onChangeRef.current(next)
    }

    map.on('click', (event) => updateCoordinates([event.lngLat.lng, event.lngLat.lat]))
    marker.on('dragend', () => {
      const point = marker.getLngLat()
      updateCoordinates([point.lng, point.lat])
    })
    map.on('error', () => setMapError('Не удалось загрузить слой карты. Проверьте VITE_MAP_STYLE_URL.'))

    return () => {
      marker.remove()
      markerRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [styleUrl])

  useEffect(() => {
    if (isValidCoordinates(coordinates)) markerRef.current?.setLngLat(coordinates)
  }, [coordinates])

  if (!styleUrl) {
    return (
      <div className="publishing-map-picker publishing-map-picker--unconfigured" role="status" data-testid="publishing-map-unconfigured">
        <strong>Карта пока не подключена</strong>
        <span>Задайте VITE_MAP_STYLE_URL для OSM-compatible провайдера в окружении marketplace-web.</span>
      </div>
    )
  }

  return (
    <div className="publishing-map-picker" data-testid="publishing-map-picker">
      <div ref={containerRef} className="publishing-map-picker__canvas" aria-label="Карта выбора точки объекта" />
      {mapError ? <p className="publishing-map-picker__error" role="alert">{mapError}</p> : null}
      <p className="publishing-map-picker__hint">Кликните по карте или перетащите метку на точку объекта.</p>
    </div>
  )
}
