import React, { FormEvent, useState } from 'react'
import type { LocationFormData } from '../../model/types'
import { PublishingMapPicker } from '../PublishingMapPicker'
import { AddressAutocomplete, type AddressSuggestion } from '../AddressAutocomplete'
import { useI18n } from '../../../../i18n'

interface LocationStepProps {
  data: LocationFormData
  onChange: (payload: Partial<LocationFormData>) => void
  onNext: () => void
}

const CITY_PRESETS = [
  { name: 'Batumi', labelKey: 'header.cityBatumi', lon: 41.6367, lat: 41.6434 },
  { name: 'Tbilisi', labelKey: 'header.cityTbilisi', lon: 44.7865, lat: 41.7151 },
  { name: 'Kutaisi', labelKey: 'locationStep.cityKutaisi', lon: 42.7058, lat: 42.2662 },
]

export function LocationStep({ data, onChange, onNext }: LocationStepProps) {
  const { t } = useI18n()
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleAddressSelect = (suggestion: AddressSuggestion) => {
    onChange({
      address: suggestion.formattedAddress,
      ...(suggestion.city ? { city: suggestion.city } : {}),
      ...(suggestion.country ? { country: suggestion.country } : {}),
      geo: {
        type: 'Point',
        coordinates: suggestion.coordinates,
      },
    })
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setValidationError(null)

    if (!data.city.trim()) {
      setValidationError(t('locationStep.errorCity'))
      return
    }

    if (!data.address.trim()) {
      setValidationError(t('locationStep.errorAddress'))
      return
    }

    const [longitude, latitude] = data.geo.coordinates
    if (
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90
    ) {
      setValidationError(t('locationStep.errorPoint'))
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
        <h2 id="location-heading">{t('locationStep.heading')}</h2>
        <p className="wizard-step__subtitle">{t('locationStep.subtitle')}</p>
      </div>

      {validationError && (
        <div className="wizard-alert wizard-alert--error" role="alert">
          <span>{validationError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="wizard-form" noValidate>
        <div className="wizard-field">
          <label>{t('locationStep.quickCityLabel')}</label>
          <div className="wizard-chips-group" role="group" aria-label={t('locationStep.citiesAria')}>
            {CITY_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className={`wizard-chip ${data.city.toLowerCase() === preset.name.toLowerCase() ? 'is-active' : ''}`}
                onClick={() => handlePresetSelect(preset)}
                data-testid={`city-preset-${preset.name.toLowerCase()}`}
              >
                {t(preset.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="wizard-form-grid">
          <div className="wizard-field">
            <label htmlFor="loc-city">{t('locationStep.cityLabel')}</label>
            <input
              id="loc-city"
              type="text"
              value={data.city}
              onChange={(e) => onChange({ city: e.target.value })}
              placeholder={t('locationStep.cityPlaceholder')}
              required
              data-testid="location-input-city"
            />
          </div>

          <div className="wizard-field">
            <label htmlFor="loc-country">{t('locationStep.countryLabel')}</label>
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
          <label htmlFor="loc-address">{t('locationStep.addressLabel')}</label>
          <AddressAutocomplete
            value={data.address}
            cityContext={data.city}
            onChange={(address) => onChange({ address })}
            onSelect={handleAddressSelect}
            required
            dataTestId="location-input-address"
          />
        </div>

        {/* Real MapLibre point picker; public catalogue markers are not ownership selectors. */}
        <div className="wizard-field" data-testid="map-point-picker">
          <label id="map-coordinates-label">{t('locationStep.coordinatesLabel')}</label>
          <PublishingMapPicker
            coordinates={data.geo.coordinates}
            onChange={(coordinates) => onChange({ geo: { type: 'Point', coordinates } })}
          />
          <div className="wizard-map-picker">
            <div className="wizard-form-grid">
              <div>
                <label htmlFor="loc-lon" className="wizard-field-sub">{t('locationStep.longitudeLabel')}</label>
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
                <label htmlFor="loc-lat" className="wizard-field-sub">{t('locationStep.latitudeLabel')}</label>
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
            {t('locationStep.next')}
          </button>
        </div>
      </form>
    </section>
  )
}
