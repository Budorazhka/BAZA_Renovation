import 'maplibre-gl/dist/maplibre-gl.css'
import maplibregl from 'maplibre-gl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MapPin, Search, X, Pencil, Trash2 } from 'lucide-react'
import { useI18n } from "@/i18n";

/* ─── Environment Variables ────────────────────────────────── */
// const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY
// const STYLE_URL = import.meta.env.VITE_MAP_STYLE_URL?.replace('${VITE_MAPTILER_KEY}', MAPTILER_KEY)

const STYLE_URL = 'https://api.maptiler.com/maps/streets-v2/style.json?key=en6NJwkot3tUa0Z2O9v9'


/* ─── Drawing Constants ───────────────────────────────────── */
const DRAW_SOURCE_ID = 'draw-source'
const DRAW_POINTS_LAYER_ID = 'draw-points-layer'
const DRAW_LINE_LAYER_ID = 'draw-line-layer'
const DRAW_POLYGON_LAYER_ID = 'draw-polygon-layer'

/* ─── Nominatim types ─────────────────────────────────────── */
interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
  boundingbox?: string[]
}

/* ─── Props ───────────────────────────────────────────────── */
interface Props {
  initialAddress?: string
  initialPolygon?: [number, number][]
  referencePolygon?: [number, number][]
  initialCity?: string
  initialCountry?: string
  initialCenter?: [number, number]
  onConfirm: (address: string, polygon?: [number, number][], center?: [number, number]) => void
  onClose: () => void
}

/* ─── Default view: Batumi ────────────────────────────────── */
const DEFAULT_LAT = 41.6168
const DEFAULT_LNG = 41.6367
const DEFAULT_ZOOM = 13

const REFERENCE_SOURCE_ID = 'reference-source'
const REFERENCE_LAYER_ID = 'reference-layer'
const REFERENCE_OUTLINE_ID = 'reference-outline'

export function MapPickerModal({ 
  initialAddress, 
  initialPolygon, 
  referencePolygon,
  initialCity,
  initialCountry,
  initialCenter,
  onConfirm, 
  onClose 
}: Props) {
    const { t } = useI18n();
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)

  const [selectedAddress, setSelectedAddress] = useState(initialAddress ?? '')
  const [selectedCenter, setSelectedCenter] = useState<[number, number] | undefined>(initialCenter)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [userLocation, setUserLocation] = useState<{ lat: number, lon: number } | null>(null)
  const [detectedCity, setDetectedCity] = useState<string | null>(null)
  const [showLocationPrompt, setShowLocationPrompt] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const isDrawingRef = useRef(isDrawing)
  const [drawPoints, setDrawPoints] = useState<[number, number][]>(initialPolygon ?? [])
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync ref with state
  useEffect(() => {
    isDrawingRef.current = isDrawing
  }, [isDrawing])

  /* ── Get location via IP + Geolocation API ── */
  useEffect(() => {
    // 1. Try IP-based location first (fast, no permissions needed)
    fetch('https://ipapi.co/json/')
      .then(res => res.json())
      .then(data => {
        if (data.latitude && data.longitude) {
          const loc = { lat: data.latitude, lon: data.longitude }
          setUserLocation(loc)
          setDetectedCity(data.city)
          
          // Only show prompt if no initial address is set
          if (!initialAddress) {
            setShowLocationPrompt(true)
          }
        }
      })
      .catch(() => {/* ignore ipapi errors */})

    // 2. Try high-accuracy browser geolocation
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude }
          setUserLocation(loc)
          // Reverse geocode to get city name for high-accuracy loc
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${loc.lat}&lon=${loc.lon}&format=json&accept-language=ru`)
            .then(r => r.json())
            .then(data => {
              const city = data.address.city || data.address.town || data.address.village
              if (city) setDetectedCity(city)
            })
        },
        () => {/* ignore */}
      )
    }
  }, [initialAddress])

  /* ── helper to draw reference polygon ── */
  const updateReferencePolygon = useCallback(() => {
    const map = mapRef.current
    if (!map || !referencePolygon || referencePolygon.length < 3) return

    if (!map.getSource(REFERENCE_SOURCE_ID)) {
      map.addSource(REFERENCE_SOURCE_ID, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [[...referencePolygon, referencePolygon[0]]]
          }
        }
      })

      // Подкладываем под слои рисования: редактируемый полигон всегда поверх контура ЖК.
      const beforeId = map.getLayer(DRAW_POLYGON_LAYER_ID) ? DRAW_POLYGON_LAYER_ID : undefined

      map.addLayer({
        id: REFERENCE_LAYER_ID,
        type: 'fill',
        source: REFERENCE_SOURCE_ID,
        paint: {
          'fill-color': '#f97316', // orange-500 — контур родительского ЖК, только для контекста
          'fill-opacity': 0.12
        }
      }, beforeId)

      map.addLayer({
        id: REFERENCE_OUTLINE_ID,
        type: 'line',
        source: REFERENCE_SOURCE_ID,
        paint: {
          'line-color': '#f97316',
          'line-width': 2,
          'line-dasharray': [3, 2]
        }
      }, beforeId)
    } else {
      const source = map.getSource(REFERENCE_SOURCE_ID) as maplibregl.GeoJSONSource
      source.setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [[...referencePolygon, referencePolygon[0]]]
        }
      })
    }
  }, [referencePolygon])

  /* ── helper to draw/clear boundary ── */
  const updateAreaHighlight = useCallback((bbox?: string[]) => {
    const map = mapRef.current
    if (!map) return

    const sourceId = 'area-highlight'
    const layerId = 'area-highlight-fill'
    const outlineId = 'area-highlight-outline'

    // Remove existing
    if (map.getLayer(layerId)) map.removeLayer(layerId)
    if (map.getLayer(outlineId)) map.removeLayer(outlineId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)

    if (!bbox || bbox.length !== 4) return

    const [latMin, latMax, lonMin, lonMax] = bbox.map(parseFloat)
    
    const geojson: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [lonMin, latMin],
          [lonMax, latMin],
          [lonMax, latMax],
          [lonMin, latMax],
          [lonMin, latMin]
        ]]
      }
    }

    map.addSource(sourceId, {
      type: 'geojson',
      data: geojson
    })

    map.addLayer({
      id: layerId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': '#c9a84c',
        'fill-opacity': 0.15
      }
    })

    map.addLayer({
      id: outlineId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#c9a84c',
        'line-width': 2,
        'line-dasharray': [2, 1]
      }
    })
  }, [])

  /* ── initialize drawing layers ── */
  const initializeDrawingLayers = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    if (map.getSource(DRAW_SOURCE_ID)) return

    map.addSource(DRAW_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    })

    map.addLayer({
      id: DRAW_POLYGON_LAYER_ID,
      type: 'fill',
      source: DRAW_SOURCE_ID,
      paint: {
        'fill-color': '#c9a84c',
        'fill-opacity': 0.25
      }
    })

    map.addLayer({
      id: DRAW_LINE_LAYER_ID,
      type: 'line',
      source: DRAW_SOURCE_ID,
      paint: {
        'line-color': '#c9a84c',
        'line-width': 3
      }
    })

    map.addLayer({
      id: DRAW_POINTS_LAYER_ID,
      type: 'circle',
      source: DRAW_SOURCE_ID,
      paint: {
        'circle-radius': 5,
        'circle-color': '#c9a84c',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#0a1f12'
      }
    })
  }, [])

  /* ── update drawing ── */
  // Ref — чтобы обработчик map.on('load') видел актуальные точки, а не снимок
  // первого рендера (source на момент маунта ещё не существует, и эффект по
  // drawPoints отрабатывает вхолостую — начальный полигон без этого не рисуется).
  const drawPointsRef = useRef(drawPoints)
  useEffect(() => {
    drawPointsRef.current = drawPoints
  }, [drawPoints])

  const syncDrawLayers = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    const source = map.getSource(DRAW_SOURCE_ID) as maplibregl.GeoJSONSource
    if (!source) return

    const points = drawPointsRef.current
    const features: GeoJSON.Feature[] = []

    if (points.length > 0) {
      // Points
      points.forEach((p, i) => {
        features.push({
          type: 'Feature',
          properties: { id: i },
          geometry: { type: 'Point', coordinates: p }
        })
      })

      // Line
      if (points.length >= 2) {
        features.push({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: points }
        })
      }

      // Polygon (closed)
      if (points.length >= 3) {
        features.push({
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [[...points, points[0]]] }
        })
      }
    }

    source.setData({ type: 'FeatureCollection', features })
  }, [])

  useEffect(() => {
    syncDrawLayers()
  }, [drawPoints, syncDrawLayers])

  /* ── place marker + reverse geocode ── */
  const placeMarker = useCallback((lat: number, lng: number, skipGeocode = false) => {
    const map = mapRef.current
    if (!map) return

    // If drawing, don't place marker
    if (isDrawingRef.current) return

    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat])
    } else {
      // Create a custom element for the marker to match project style
      const el = document.createElement('div')
      el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
        <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24S24 21 24 12C24 5.373 18.627 0 12 0z"
          fill="#c9a84c" stroke="#0a1f12" stroke-width="1.5"/>
        <circle cx="12" cy="12" r="5" fill="#0a1f12"/>
      </svg>`
      
      markerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map)
    }

    setSelectedCenter([lng, lat])

    if (skipGeocode) return

    setIsGeocoding(true)
    fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ru`,
      { headers: { 'Accept-Language': 'ru' } },
    )
      .then((r) => r.json())
      .then((data: { display_name?: string; boundingbox?: string[] }) => {
        if (data.display_name) setSelectedAddress(data.display_name)
        updateAreaHighlight(data.boundingbox)
      })
      .catch(() => {
        setSelectedAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`)
        updateAreaHighlight(undefined)
      })
      .finally(() => setIsGeocoding(false))
  }, [updateAreaHighlight])

  /* ── init map ── */
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    // const map = new maplibregl.Map({
    //   container: mapContainerRef.current,
    //   style: STYLE_URL || 'https://demotiles.maplibre.org/style.json',
    //   center: [DEFAULT_LNG, DEFAULT_LAT],
    //   zoom: DEFAULT_ZOOM,
    // })

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: STYLE_URL,
      center: [DEFAULT_LNG, DEFAULT_LAT],
      zoom: DEFAULT_ZOOM,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')

    map.on('load', () => {
      initializeDrawingLayers()
      updateReferencePolygon()
      // Начальный полигон (initialPolygon → drawPoints) рисуем здесь явно:
      // эффект по drawPoints уже отработал до создания source и сам не повторится.
      syncDrawLayers()

      // If we have an initial center, place marker there
      if (initialCenter) {
        placeMarker(initialCenter[1], initialCenter[0], true)
        map.setCenter(initialCenter)
        map.setZoom(15)
      } else if (initialPolygon && initialPolygon.length > 0) {
        const lons = initialPolygon.map(p => p[0]);
        const lats = initialPolygon.map(p => p[1]);
        const bounds: maplibregl.LngLatBoundsLike = [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)]
        ];
        map.fitBounds(bounds, { padding: 50, maxZoom: 16 });
      } else if (referencePolygon && referencePolygon.length > 0) {
        const lons = referencePolygon.map(p => p[0]);
        const lats = referencePolygon.map(p => p[1]);
        const bounds: maplibregl.LngLatBoundsLike = [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)]
        ];
        map.fitBounds(bounds, { padding: 50, maxZoom: 16 });
      } else if (initialAddress) {
        // We have address but no center, try to find it
        fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(initialAddress)}&format=json&limit=1&accept-language=ru`)
          .then(r => r.json())
          .then(results => {
            if (results && results[0]) {
              const lat = parseFloat(results[0].lat)
              const lng = parseFloat(results[0].lon)
              placeMarker(lat, lng, true)
              map.setCenter([lng, lat])
              map.setZoom(15)
            }
          })
      } else if (initialCity || initialCountry) {
        // No address/center, but we have city/country
        const query = [initialCity, initialCountry].filter(Boolean).join(', ')
        fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&accept-language=ru`)
          .then(r => r.json())
          .then(results => {
            if (results && results[0]) {
              const lat = parseFloat(results[0].lat)
              const lng = parseFloat(results[0].lon)
              map.setCenter([lng, lat])
              map.setZoom(12)
            }
          })
      }
    })

    map.on('click', (e) => {
      if (isDrawingRef.current) {
        setDrawPoints(prev => [...prev, [e.lngLat.lng, e.lngLat.lat]])
      } else {
        placeMarker(e.lngLat.lat, e.lngLat.lng)
      }
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [placeMarker, initializeDrawingLayers])

  /* ── center on user location when available ── */
  useEffect(() => {
    if (mapRef.current && userLocation && !initialAddress && !initialPolygon && !referencePolygon && !markerRef.current) {
      mapRef.current.setCenter([userLocation.lon, userLocation.lat])
      mapRef.current.setZoom(DEFAULT_ZOOM)
    }
  }, [userLocation, initialAddress, initialPolygon, referencePolygon])

  /* ── update reference polygon when prop changes ── */
  useEffect(() => {
    if (mapRef.current && mapRef.current.isStyleLoaded()) {
      updateReferencePolygon()
    }
  }, [referencePolygon, updateReferencePolygon])

  /* ── search ── */
  function handleSearchInput(value: string) {
    setSearchQuery(value)
    setSearchResults([])
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    if (!value.trim()) return

    searchTimeoutRef.current = setTimeout(() => {
      setIsSearching(true)
      let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(value)}&format=json&limit=5&accept-language=ru`
      
      if (userLocation) {
        const delta = 0.5
        const viewbox = `${userLocation.lon - delta},${userLocation.lat + delta},${userLocation.lon + delta},${userLocation.lat - delta}`
        url += `&viewbox=${viewbox}`
      }

      fetch(url)
        .then((r) => r.json())
        .then((results: NominatimResult[]) => setSearchResults(results))
        .catch(() => setSearchResults([]))
        .finally(() => setIsSearching(false))
    }, 500)
  }

  function selectSearchResult(result: NominatimResult) {
    const lat = parseFloat(result.lat)
    const lng = parseFloat(result.lon)
    setSelectedAddress(result.display_name)
    setSearchQuery(result.display_name)
    setSearchResults([])
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 15 })
    placeMarker(lat, lng, true)
    updateAreaHighlight(result.boundingbox)
  }

  const confirmLocation = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.flyTo({ center: [userLocation.lon, userLocation.lat], zoom: 13 })
    }
    setShowLocationPrompt(false)
  }

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/75 p-4">
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[rgba(242,207,141,0.2)] bg-[#1a1510] shadow-2xl"
        style={{ height: 'min(90vh, 640px)' }}
      >
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-[rgba(242,207,141,0.15)] px-5 py-4">
          <div className="flex items-center gap-2">
            <MapPin size={17} className="text-[#c9a84c]" />
            <h2 className="text-sm font-normal text-[#fcecc8]">{t('ui.mapPickerModal.выбрать_на_карте')}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[rgba(242,207,141,0.5)] hover:bg-[rgba(242,207,141,0.1)] hover:text-[#fcecc8]"
          >
            <X size={16} />
          </button>
        </header>

        {/* Location Confirmation Toast/Prompt */}
        {showLocationPrompt && detectedCity && (
          <div className="mx-4 mt-3 flex items-center justify-between rounded-xl border border-[#c9a84c]/30 bg-[#c9a84c]/10 px-4 py-2.5 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2 text-xs text-[#fcecc8]">
              <MapPin size={14} className="text-[#c9a84c]" />
              <span>{t('ui.mapPickerModal.вы_находитесь_в_г')}<b>{detectedCity}</b>?</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowLocationPrompt(false)}
                className="rounded-lg px-2.5 py-1 text-[10px] uppercase tracking-wider text-[rgba(242,207,141,0.6)] hover:bg-white/5"
              >
                {t('ui.mapPickerModal.нет')}</button>
              <button
                type="button"
                onClick={confirmLocation}
                className="rounded-lg bg-[#c9a84c] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#0a1f12] hover:bg-[#e2c97e]"
              >
                {t('ui.mapPickerModal.да')}</button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative shrink-0 px-4 py-3">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[rgba(242,207,141,0.45)]"
            />
            <input
              value={searchQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
              placeholder={t('ui.mapPickerModal.поиск_адреса_или_кли')}
              className="h-10 w-full rounded-xl border border-[rgba(242,207,141,0.25)] bg-[rgba(0,0,0,0.4)] pl-9 pr-3 text-sm text-[#fcecc8] placeholder:text-[rgba(242,207,141,0.35)] outline-none focus:border-[rgba(242,207,141,0.5)]"
            />
            {isSearching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[rgba(242,207,141,0.5)]">
                …
              </span>
            )}
          </div>

          {/* Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute left-4 right-4 top-full z-10 mt-1 overflow-hidden rounded-xl border border-[rgba(242,207,141,0.2)] bg-[#1a1510] shadow-xl">
              {searchResults.map((r) => (
                <button
                  key={r.place_id}
                  type="button"
                  onClick={() => selectSearchResult(r)}
                  className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-xs text-[rgba(242,207,141,0.8)] hover:bg-[rgba(242,207,141,0.08)] hover:text-[#fcecc8] border-b border-[rgba(242,207,141,0.08)] last:border-0"
                >
                  <MapPin size={12} className="mt-0.5 shrink-0 text-[#c9a84c]" />
                  <span className="line-clamp-2">{r.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Map */}
        <div className="relative min-h-0 flex-1">
          <div ref={mapContainerRef} className="h-full w-full" />
          
          {/* Drawing Controls */}
          <div className="absolute left-4 top-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setIsDrawing(!isDrawing)}
              title={isDrawing ? "Завершить рисование" : "Рисовать площадь ЖК"}
              className={`flex h-10 w-10 items-center justify-center rounded-xl border shadow-lg transition-all ${
                isDrawing 
                  ? 'bg-[#c9a84c] border-[#c9a84c] text-[#0a1f12]' 
                  : 'bg-[#1a1510] border-[rgba(242,207,141,0.2)] text-[#fcecc8] hover:bg-[rgba(242,207,141,0.1)]'
              }`}
            >
              <Pencil size={20} />
            </button>
            
            {drawPoints.length > 0 && (
              <button
                type="button"
                onClick={() => setDrawPoints([])}
                title={t('ui.mapPickerModal.очистить_площадь')}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(242,207,141,0.2)] bg-[#1a1510] text-[rgba(242,207,141,0.6)] hover:bg-[rgba(242,207,141,0.1)] hover:text-[#fcecc8] shadow-lg transition-all"
              >
                <Trash2 size={20} />
              </button>
            )}
          </div>

          {isDrawing && (
            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-xs text-[#fcecc8] backdrop-blur-sm border border-[rgba(242,207,141,0.2)]">
              {t('ui.mapPickerModal.кликайте_по_карте_чт')}</div>
          )}
        </div>

        {/* Footer */}
        <footer className="shrink-0 border-t border-[rgba(242,207,141,0.15)] bg-[rgba(0,0,0,0.2)] px-5 py-4">
          {selectedAddress ? (
            <p className="mb-3 flex items-start gap-1.5 text-xs text-[rgba(242,207,141,0.75)]">
              <MapPin size={13} className="mt-0.5 shrink-0 text-[#c9a84c]" />
              <span className="line-clamp-2">
                {isGeocoding ? 'Определяем адрес…' : selectedAddress}
              </span>
            </p>
          ) : (
            <p className="mb-3 text-xs text-[rgba(242,207,141,0.4)]">
              {t('ui.mapPickerModal.кликните_по_карте_ил')}</p>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-[rgba(242,207,141,0.7)] hover:text-[#fcecc8]"
            >
              {t('ui.mapPickerModal.отмена')}</button>
            <button
              type="button"
              disabled={!selectedAddress || isGeocoding}
              onClick={() => { onConfirm(selectedAddress, drawPoints.length >= 3 ? drawPoints : undefined, selectedCenter); onClose() }}
              className="rounded-xl bg-[#c9a84c] px-5 py-2 text-sm font-medium text-[#0a1f12] hover:bg-[#e2c97e] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('ui.mapPickerModal.подтвердить')}</button>
          </div>
        </footer>
      </div>
    </div>
  )
}
