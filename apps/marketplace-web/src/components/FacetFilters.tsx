import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import type { ListingDealType, ListingPropertyType } from '../types/marketplace'

export interface FacetFiltersProps {
  tabParam?: string
  cityParam?: string
  dealTypeParam?: string
  propertyTypeParam?: string
  commercialSubtypeParam?: string
  sortParam?: string
  isMapView?: boolean
  onFilterChange: (filters: {
    city?: string
    dealType?: string
    propertyType?: string
    commercialSubtype?: string
    sort?: string
  }) => void
  onClearFilters: () => void
  viewUrl: (view: 'list' | 'map') => string
}

/**
 * FacetFilters Component (Figma: ComponentSet filter 4747:75832 / drawer 4747:75824)
 * Implements 8 Figma filter variants across categories:
 * - Поиск по ЖК ПЕРВИЧКА (4747:75827)
 * - Поиск по ВТОРИЧКЕ: Квартиры (4747:75828), Дома (4747:75829), Участки (4747:75824)
 * - Аренда долгосрочная (4747:75826) / посуточная (4747:75831)
 * - Поиск по Коммерции (4747:75830)
 */
export function FacetFilters({
  tabParam,
  cityParam = '',
  dealTypeParam,
  propertyTypeParam,
  commercialSubtypeParam,
  sortParam = 'newest',
  isMapView = false,
  onFilterChange,
  onClearFilters,
  viewUrl,
}: FacetFiltersProps) {
  const [localCity, setLocalCity] = useState(cityParam)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  React.useEffect(() => {
    setLocalCity(cityParam)
  }, [cityParam])

  const isDev = tabParam !== 'listings'
  const hasActiveFilters = Boolean(cityParam || dealTypeParam || propertyTypeParam || commercialSubtypeParam)

  const handleCitySubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onFilterChange({ city: localCity.trim() || undefined })
  }

  const dealTypes: Array<[ListingDealType | undefined, string]> = [
    [undefined, 'Все типы сделок'],
    ['sale', 'Купить'],
    ['rent_long', 'Снять длительно'],
    ['rent_short', 'Посуточно'],
  ]

  const propertyTypes: Array<[ListingPropertyType | undefined, string]> = [
    [undefined, 'Все объекты'],
    ['apartment', 'Квартиры'],
    ['house', 'Дома и виллы'],
    ['commercial', 'Коммерческая'],
    ['land', 'Участки'],
  ]

  const commercialSubtypes: Array<[string | undefined, string]> = [
    [undefined, 'Вся коммерция'],
    ['office', 'Офис'],
    ['retail', 'Торговая площадь'],
    ['warehouse', 'Склад'],
    ['business', 'Готовый бизнес'],
    ['free_purpose', 'Свободное назначение'],
  ]

  return (
    <section className="figma-filters" aria-label="Фильтры каталога">
      <div className="figma-filters__container">
        {/* Top Controls Bar */}
        <div className="figma-filters__bar">
          {/* City search form with semantic search role (rendered on listings/secondary tab) */}
          {!isDev && (
            <form className="city-form figma-filters__search-form" role="search" onSubmit={handleCitySubmit} aria-label="Поиск по городу">
              <label htmlFor="city" className="visually-hidden">Город</label>
              <svg
                className="figma-filters__search-icon"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                id="city"
                name="city"
                type="search"
                autoComplete="address-level2"
                className="figma-filters__search-input"
                value={localCity}
                onChange={(e) => setLocalCity(e.target.value)}
                placeholder="Город"
                aria-label="Город"
              />
              <button type="submit" className="figma-filters__search-submit" aria-label="Найти объекты в городе">
                Найти
              </button>
            </form>
          )}

          {/* Right Controls: Sort, View Toggle, Clear */}
          <div className="figma-filters__controls-group">
            <label className="sort-control figma-filters__sort" aria-label="Сортировка объектов">
              <span className="visually-hidden">Сортировка объектов</span>
              <select
                className="figma-filters__sort-select"
                value={isDev ? 'newest' : sortParam}
                onChange={(e) => onFilterChange({ sort: e.target.value })}
              >
                <option value="newest">Сначала новые</option>
                {!isDev && <option value="price_asc">Сначала дешевле</option>}
                {!isDev && <option value="price_desc">Сначала дороже</option>}
                {!isDev && <option value="area_asc">Меньше площадь</option>}
                {!isDev && <option value="area_desc">Больше площадь</option>}
              </select>
            </label>

            <div className="view-toggle figma-filters__view-toggle" role="group" aria-label="Вид каталога">
              <Link
                className={`view-toggle__link figma-filters__view-btn${!isMapView ? ' is-active' : ''}`}
                to={viewUrl('list')}
              >
                Список
              </Link>
              <Link
                className={`view-toggle__link figma-filters__view-btn${isMapView ? ' is-active' : ''}`}
                to={viewUrl('map')}
              >
                Карта
              </Link>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                className="clear-filter clear-filter--compact figma-filters__clear-btn"
                onClick={onClearFilters}
              >
                Сбросить
              </button>
            )}
          </div>
        </div>

        {/* Facet Chips for Listings (Deal Type & Property Type) */}
        {!isDev && (
          <details id="catalogue-filters" className="filters-drawer" open>
            <summary>Фильтры и тип объекта</summary>
            <div className="catalogue-filters-panel" aria-label="Фильтры объявлений">
              <div className="catalogue-subfilters figma-filters__chips-row" role="group" aria-label="Тип сделки">
                {dealTypes.map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    className={`filter-chip figma-filter-chip${dealTypeParam === value ? ' is-active' : ''}`}
                    onClick={() => onFilterChange({ dealType: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="catalogue-subfilters figma-filters__chips-row" role="group" aria-label="Тип недвижимости">
                {propertyTypes.map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    className={`filter-chip figma-filter-chip${propertyTypeParam === value ? ' is-active' : ''}`}
                    onClick={() => onFilterChange({ propertyType: value, commercialSubtype: undefined })}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {propertyTypeParam === 'commercial' && (
                <div className="catalogue-subfilters figma-filters__chips-row" role="group" aria-label="Формат коммерции">
                  {commercialSubtypes.map(([value, label]) => (
                    <button
                      key={label}
                      type="button"
                      className={`filter-chip figma-filter-chip${commercialSubtypeParam === value ? ' is-active' : ''}`}
                      onClick={() => onFilterChange({ commercialSubtype: value })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </details>
        )}

        {/* Facet Chips for Primary Developments (Figma 4747:75827) */}
        {isDev && (
          <div className="figma-filters__chips-row" role="group" aria-label="Фильтры новостроек">
            <span className="figma-filter-chip is-active">Все новостройки</span>
            <button
              type="button"
              className="figma-filter-chip"
              onClick={() => onFilterChange({ city: 'Тбилиси' })}
            >
              Тбилиси
            </button>
            <button
              type="button"
              className="figma-filter-chip"
              onClick={() => onFilterChange({ city: 'Батуми' })}
            >
              Батуми
            </button>
          </div>
        )}
      </div>

      {/* Mobile Drawer (Figma 4747:75824) */}
      {mobileDrawerOpen && (
        <div className="figma-drawer-overlay" role="dialog" aria-modal="true" aria-label="Все фильтры">
          <div className="figma-drawer">
            <div className="figma-drawer__header">
              <h2 className="figma-drawer__title">Фильтры</h2>
              <button
                type="button"
                className="figma-drawer__close"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="Закрыть фильтры"
              >
                ×
              </button>
            </div>
            <div className="figma-drawer__content">
              <div className="figma-drawer__section">
                <h3 className="figma-drawer__section-title">Город</h3>
                <input
                  type="text"
                  className="figma-filters__search-input"
                  value={localCity}
                  onChange={(e) => setLocalCity(e.target.value)}
                  placeholder="Любой город"
                />
              </div>
            </div>
            <div className="figma-drawer__footer">
              <button
                type="button"
                className="figma-drawer__btn-reset"
                onClick={() => {
                  onClearFilters()
                  setLocalCity('')
                  setMobileDrawerOpen(false)
                }}
              >
                Сбросить
              </button>
              <button
                type="button"
                className="figma-drawer__btn-apply"
                onClick={() => {
                  onFilterChange({ city: localCity.trim() || undefined })
                  setMobileDrawerOpen(false)
                }}
              >
                Применить
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
