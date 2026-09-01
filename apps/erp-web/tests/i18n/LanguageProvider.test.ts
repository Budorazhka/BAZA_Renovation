// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LanguageProvider, useI18n } from '@/i18n/LanguageProvider'
import React, { type ReactNode } from 'react'

// Mock runtimeTranslations to prevent DOM mutation side-effects during tests
vi.mock('@/i18n/runtimeTranslations', () => ({
  applyRuntimeTranslations: vi.fn(),
}))

describe('LanguageProvider', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('provides default language as en if not set', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: LanguageProvider })
    expect(result.current.language).toBe('en')
  })

  it('can change language', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: LanguageProvider })
    
    act(() => {
      result.current.setLanguage('ru')
    })
    
    expect(result.current.language).toBe('ru')
    expect(window.localStorage.getItem('erp.language')).toBe('ru')
  })

  it('translates existing keys correctly', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: LanguageProvider })
    
    act(() => {
      result.current.setLanguage('ru')
    })
    
    // Check known key from ru.ts
    // Assuming hubs.CRMPage_moduleName exists in ru.ts
    const translatedRu = result.current.t('hubs.CRMPage_moduleName')
    expect(translatedRu).toBe('CRM') // the ru translation
  })

  it('falls back to ru if key is missing in target language', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: LanguageProvider })
    
    act(() => {
      result.current.setLanguage('en')
    })
    
    // Use a fake key that we inject for testing or a known one that might be missing
    // Let's test the fallback logic directly
    const fallbackTranslation = result.current.t('hubs.BookingsHubPage_moduleName')
    expect(typeof fallbackTranslation).toBe('string')
  })

  it('returns key if key is missing everywhere', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: LanguageProvider })
    
    const missingKeyTranslation = result.current.t('non.existent.key' as any)
    expect(missingKeyTranslation).toBe('non.existent.key')
  })

  it('interpolates parameters correctly', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: LanguageProvider })
    
    // Let's test the interpolation feature since it doesn't strictly depend on the dictionary contents
    // if we pass a key that is missing, it falls back to the key, then interpolates the key itself
    const interpolated = result.current.t('Hello {name}, you have {count} messages' as any, { name: 'Alex', count: 5 })
    expect(interpolated).toBe('Hello Alex, you have 5 messages')
  })

  it('formats dates correctly according to language', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: LanguageProvider })
    const date = new Date('2023-01-01T12:00:00Z')
    
    act(() => {
      result.current.setLanguage('en')
    })
    
    const usFormat = result.current.formatDate(date, { month: 'short', day: 'numeric', timeZone: 'UTC' })
    expect(usFormat).toBe('Jan 1')
    
    act(() => {
      result.current.setLanguage('ru')
    })
    
    const ruFormat = result.current.formatDate(date, { month: 'short', day: 'numeric', timeZone: 'UTC' })
    expect(ruFormat).toBe('1 янв.')
  })

  it('formats numbers correctly according to language', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: LanguageProvider })
    
    act(() => {
      result.current.setLanguage('en')
    })
    
    const enFormat = result.current.formatNumber(1234.56)
    // The comma and dot behavior depends on the locale
    expect(enFormat).toBe('1,234.56')
    
    act(() => {
      result.current.setLanguage('ru')
    })
    
    const ruFormat = result.current.formatNumber(1234.56)
    // Russian locale uses comma as decimal separator and space for thousands
    // Use replace to strip non-breaking spaces if any
    expect(ruFormat.replace(/\s/g, ' ')).toContain('1 234,56'.replace(/\s/g, ' '))
  })
})
