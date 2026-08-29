import React, { FormEvent, useState } from 'react'
import type { LocationFormData } from '../../model/types'

interface LocationStepProps {
  data: LocationFormData
  onChange: (payload: Partial<LocationFormData>) => void
  onNext: () => void
}

const CITY_PRESETS = [
  { name: 'Batumi', label: 'Батуми', lon: 41.6367, lat: 41.6434 },
  { name: 'Tbilisi', label: 'Тбилиси', lon: 44.7865, lat: 41.7151 },
  { name: 'Kutaisi', label: 'Кутаиси', lon: 42.7058, lat: 42.2662 },
]

export function LocationStep({ data, onChange, onNext }: LocationStepProps) {
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setValidationError(null)

    if (!data.city.trim()) {
      setValidationError('Укажите город объекта')
      return
    }

    if (!data.address.trim()) {
      setValidationError('Укажите точный адрес (улицу и номер дома)')
      return
    }

    onNext()
  }

  const handlePresetSelect = (preset: typeof CITY_PRESETS[0]) => {
    onChange({
      city: preset.name,
      geo: {
        type: 'Point',
        coordinates: [preset.lon, preset.lat],
      },
    })
  }

  return (
    <section className="wizard-step wizard-step--location" data-testid="wizard-step-location" aria-labelledby="location-heading">
      <div className="wizard-step__header">
        <h2 id="location-heading">Шаг 1: Адрес и местоположение на карте</h2>
        <p className="wizard-step__subtitle">
          Укажите город, улицу и координаты объекта для точного отображения в поиске маркетплейса
        </p>
      </div>

      {validationError && (
        <div className="wizard-alert wizard-alert--error" role="alert">
          <span>{validationError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="wizard-form" noValidate>
        <div className="wizard-field">
          <label>Быстрый выбор города</label>
          <div className="wizard-chips-group" role="group" aria-label="Города">
            {CITY_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className={`wizard-chip ${data.city.toLowerCase() === preset.name.toLowerCase() ? 'is-active' : ''}`}
                onClick={() => handlePresetSelect(preset)}
                data-testid={`city-preset-${preset.name.toLowerCase()}`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="wizard-form-grid">
          <div className="wizard-field">
            <label htmlFor="loc-city">Город *</label>
            <input
              id="loc-city"
              type="text"
              value={data.city}
              onChange={(e) => onChange({ city: e.target.value })}
              placeholder="Например, Batumi"
              required
              data-testid="location-input-city"
            />
          </div>

          <div className="wizard-field">
            <label htmlFor="loc-country">Страна</label>
            <input
              id="loc-country"
              type="text"
              value={data.country}
              onChange={(e) => onChange({ country: e.target.value })}
              placeholder="Georgia"
              data-testid="location-input-country"
            />
          </div>
        </div>

        <div className="wizard-field">
          <label htmlFor="loc-address">Улица и номер дома *</label>
          <input
            id="loc-address"
            type="text"
            value={data.address}
            onChange={(e) => onChange({ address: e.target.value })}
            placeholder="Например, ул. Руставели 15"
            required
            data-testid="location-input-address"
          />
        </div>

        {/* Map Point Picker Widget */}
        <div className="wizard-field" data-testid="map-point-picker">
          <label id="map-coordinates-label">Точные координаты (Долгота и Широта)</label>
          <div className="wizard-map-picker">
            <div className="wizard-map-picker__preview" aria-hidden="true">
              <span className="wizard-map-picker__pin">📍</span>
              <span className="wizard-map-picker__coords">
                {data.geo.coordinates[1].toFixed(4)}, {data.geo.coordinates[0].toFixed(4)}
              </span>
            </div>
            <div className="wizard-form-grid">
              <div>
                <label htmlFor="loc-lon" className="wizard-field-sub">Долгота (Longitude)</label>
                <input
                  id="loc-lon"
                  type="number"
                  step="0.0001"
                  value={data.geo.coordinates[0]}
                  onChange={(e) =>
                    onChange({
                      geo: {
                        type: 'Point',
                        coordinates: [parseFloat(e.target.value) || 0, data.geo.coordinates[1]],
                      },
                    })
                  }
                  data-testid="location-input-lon"
                />
              </div>
              <div>
                <label htmlFor="loc-lat" className="wizard-field-sub">Широта (Latitude)</label>
                <input
                  id="loc-lat"
                  type="number"
                  step="0.0001"
                  value={data.geo.coordinates[1]}
                  onChange={(e) =>
                    onChange({
                      geo: {
                        type: 'Point',
                        coordinates: [data.geo.coordinates[0], parseFloat(e.target.value) || 0],
                      },
                    })
                  }
                  data-testid="location-input-lat"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="wizard-actions">
          <button
            type="submit"
            className="wizard-btn wizard-btn--primary"
            data-testid="location-next-btn"
          >
            Далее: Характеристики →
          </button>
        </div>
      </form>
    </section>
  )
}
