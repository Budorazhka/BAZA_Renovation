import React, { useState, useEffect, useRef, useCallback } from 'react'
import { MapPin, Search, Loader2 } from 'lucide-react'

interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
}

interface AddressSearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function AddressSearchInput({
  value,
  onChange,
  placeholder = "Введите адрес...",
  className = ""
}: AddressSearchInputProps) {
  const [inputValue, setInputValue] = useState(value)
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [userLocation, setUserLocation] = useState<{ lat: number, lon: number } | null>(null)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync with prop value
  useEffect(() => {
    setInputValue(value)
  }, [value])

  // Get user location for biasing search results
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => {/* ignore errors */}
      )
    }
  }, [])

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchSuggestions = useCallback((query: string) => {
    if (!query.trim()) {
      setSuggestions([])
      setIsOpen(false)
      return
    }

    setIsLoading(true)
    
    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=ru`
    
    // Bias results towards user location if available
    if (userLocation) {
      // Create a small bounding box around user (approx 50km)
      const delta = 0.5 
      const viewbox = `${userLocation.lon - delta},${userLocation.lat + delta},${userLocation.lon + delta},${userLocation.lat - delta}`
      url += `&viewbox=${viewbox}`
    }

    fetch(url)
      .then(res => res.json())
      .then((data: NominatimResult[]) => {
        setSuggestions(data)
        setIsOpen(data.length > 0)
      })
      .catch(err => {
        console.error("Nominatim error:", err)
        setSuggestions([])
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [userLocation])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value
    setInputValue(newVal)
    onChange(newVal)

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    
    timeoutRef.current = setTimeout(() => {
      fetchSuggestions(newVal)
    }, 400)
  }

  const handleSelectSuggestion = (suggestion: NominatimResult) => {
    setInputValue(suggestion.display_name)
    onChange(suggestion.display_name)
    setIsOpen(false)
    setSuggestions([])
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true)
          }}
          placeholder={placeholder}
          className="flex h-10 w-full rounded-md border border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.2)] px-3 py-2 text-[16px] text-[#fcecc8] placeholder:text-[rgba(242,207,141,0.3)] focus:border-[rgba(242,207,141,0.4)] focus:outline-none focus:ring-1 focus:ring-[rgba(242,207,141,0.4)] disabled:cursor-not-allowed disabled:opacity-50 transition-all pr-10"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {isLoading ? (
            <Loader2 size={16} className="animate-spin text-[rgba(242,207,141,0.5)]" />
          ) : (
            <Search size={16} className="text-[rgba(242,207,141,0.4)]" />
          )}
        </div>
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-[110] mt-1 w-full overflow-hidden rounded-md border border-[rgba(242,207,141,0.2)] bg-[#1a1510] shadow-xl">
          <ul className="max-h-60 overflow-auto py-1">
            {suggestions.map((s) => (
              <li key={s.place_id}>
                <button
                  type="button"
                  onClick={() => handleSelectSuggestion(s)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-[rgba(242,207,141,0.8)] hover:bg-[rgba(242,207,141,0.1)] hover:text-[#fcecc8] transition-colors border-b border-[rgba(242,207,141,0.05)] last:border-0"
                >
                  <MapPin size={14} className="mt-1 shrink-0 text-[#c9a84c]" />
                  <span className="line-clamp-2">{s.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
