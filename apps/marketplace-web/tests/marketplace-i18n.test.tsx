/** @vitest-environment jsdom */

import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { en, I18nProvider, ka, LANGUAGE_STORAGE_KEY, ru, useI18n } from '../src/i18n'
import { Header } from '../src/components/Header'
import { ListingCard } from '../src/components/ListingCard'
import type { PublicListingCard } from '../src/types/marketplace'

function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...collectKeys(value as Record<string, unknown>, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys.sort()
}

function ConsumerComponent() {
  const { language, setLanguage, t } = useI18n()
  return (
    <div>
      <span data-testid="current-lang">{language}</span>
      <span data-testid="nav-new">{t('nav.newConstructions')}</span>
      <span data-testid="rooms-count">{t('card.rooms', { count: 3 })}</span>
      <button type="button" data-testid="btn-en" onClick={() => setLanguage('en')}>
        Switch to EN
      </button>
      <button type="button" data-testid="btn-ka" onClick={() => setLanguage('ka')}>
        Switch to KA
      </button>
      <button type="button" data-testid="btn-ru" onClick={() => setLanguage('ru')}>
        Switch to RU
      </button>
    </div>
  )
}

describe('Marketplace i18n & Localization', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it('maintains 100% key parity across ru, en, and ka dictionaries', () => {
    const ruKeys = collectKeys(ru)
    const enKeys = collectKeys(en)
    const kaKeys = collectKeys(ka)

    expect(enKeys).toEqual(ruKeys)
    expect(kaKeys).toEqual(ruKeys)
  })

  it('translates keys and interpolates parameters correctly', () => {
    render(
      <I18nProvider>
        <ConsumerComponent />
      </I18nProvider>,
    )

    expect(screen.getByTestId('current-lang').textContent).toBe('ru')
    expect(screen.getByTestId('nav-new').textContent).toBe('Новостройки')
    expect(screen.getByTestId('rooms-count').textContent).toBe('3 комн.')
  })

  it('switches languages and persists choice in localStorage', () => {
    render(
      <I18nProvider>
        <ConsumerComponent />
      </I18nProvider>,
    )

    // Switch to EN
    fireEvent.click(screen.getByTestId('btn-en'))
    expect(screen.getByTestId('current-lang').textContent).toBe('en')
    expect(screen.getByTestId('nav-new').textContent).toBe('New Developments')
    expect(screen.getByTestId('rooms-count').textContent).toBe('3 rooms')
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en')

    // Switch to KA
    fireEvent.click(screen.getByTestId('btn-ka'))
    expect(screen.getByTestId('current-lang').textContent).toBe('ka')
    expect(screen.getByTestId('nav-new').textContent).toBe('ახალმშენებლობები')
    expect(screen.getByTestId('rooms-count').textContent).toBe('3 ოთახი')
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('ka')

    // Switch back to RU
    fireEvent.click(screen.getByTestId('btn-ru'))
    expect(screen.getByTestId('current-lang').textContent).toBe('ru')
    expect(screen.getByTestId('nav-new').textContent).toBe('Новостройки')
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('ru')
  })

  it('Header integrates with I18nProvider and switches language via dropdown', () => {
    render(
      <MemoryRouter>
        <I18nProvider>
          <Header />
        </I18nProvider>
      </MemoryRouter>,
    )

    expect(screen.getByText('Новостройки')).not.toBeNull()
    expect(screen.getByText('+ Разместить')).not.toBeNull()

    // Open language menu
    const langBtn = screen.getByRole('button', { name: /выбрать язык/i })
    fireEvent.click(langBtn)

    // Select EN
    const enOption = screen.getByRole('menuitem', { name: /EN \(English\)/i })
    fireEvent.click(enOption)

    expect(screen.getByText('New Developments')).not.toBeNull()
    expect(screen.getByText('+ Post listing')).not.toBeNull()
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en')

    // Open language menu again
    const enLangBtn = screen.getByRole('button', { name: /select language/i })
    fireEvent.click(enLangBtn)

    // Select KA
    const kaOption = screen.getByRole('menuitem', { name: /KA \(ქართული\)/i })
    fireEvent.click(kaOption)

    expect(screen.getByText('ახალმშენებლობები')).not.toBeNull()
    expect(screen.getByText('+ განთავსება')).not.toBeNull()
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('ka')
  })

  it('renders MLS badge on ListingCard when isMls is true', () => {
    const listingWithMls: PublicListingCard = {
      slug: 'listing-mls-1',
      dealType: 'sale',
      propertyType: 'apartment',
      isVerified: true,
      isMls: true,
      price: { amountMinorUnits: 7500000, currency: 'USD' },
    }

    render(
      <MemoryRouter>
        <I18nProvider>
          <ListingCard item={listingWithMls} />
        </I18nProvider>
      </MemoryRouter>,
    )

    const mlsBadge = screen.getByTestId('badge-mls')
    expect(mlsBadge).not.toBeNull()
    expect(mlsBadge.textContent?.trim()).toBe('MLS')
    // Класс переименован 12.09.2026 вместе с пересборкой карточки по узлу
    // `card/квартира во вторичке` (`3428:55856`); проверяется то же самое —
    // что бейдж отрисован как бейдж карточки, а не как произвольный текст.
    expect(mlsBadge.className).toContain('listing-card__pill')
  })

  it('does not render MLS badge on ListingCard when isMls is false or undefined', () => {
    const standardListing: PublicListingCard = {
      slug: 'listing-standard-1',
      dealType: 'sale',
      propertyType: 'apartment',
      isVerified: false,
      price: { amountMinorUnits: 5000000, currency: 'USD' },
    }

    render(
      <MemoryRouter>
        <I18nProvider>
          <ListingCard item={standardListing} />
        </I18nProvider>
      </MemoryRouter>,
    )

    expect(screen.queryByTestId('badge-mls')).toBeNull()
  })
})
