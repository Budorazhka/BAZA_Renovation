/** @vitest-environment jsdom */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { useSeoMetadata, buildListingJsonLd, buildDevelopmentJsonLd } from '../src/hooks/useSeoMetadata'
import type { PublicListingCard, PublicDevelopmentCard } from '../src/types/marketplace'

describe('SEO Metadata & JSON-LD Acceptance', () => {
  beforeEach(() => {
    document.title = 'Default Title'
    const existing = document.getElementById('baza-seo-jsonld')
    if (existing) existing.remove()
  })

  afterEach(() => {
    cleanup()
    const existing = document.getElementById('baza-seo-jsonld')
    if (existing) existing.remove()
  })

  it('updates document.title, description meta tag, canonical link, and JSON-LD script', () => {
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'RealEstateListing',
      name: 'Уютная квартира у моря',
    }

    const { unmount } = renderHook(() =>
      useSeoMetadata({
        title: 'Уютная квартира у моря',
        description: 'Прекрасная квартира с видом на Черное море в Батуми',
        canonicalUrl: 'https://baza.sale/listings/seaside-apt',
        imageUrl: 'https://baza.sale/media/cover.jpg',
        jsonLd,
      }),
    )

    expect(document.title).toBe('Уютная квартира у моря — BAZA.sale')

    const metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement
    expect(metaDesc?.content).toBe('Прекрасная квартира с видом на Черное море в Батуми')

    const ogTitle = document.querySelector('meta[property="og:title"]') as HTMLMetaElement
    expect(ogTitle?.content).toBe('Уютная квартира у моря — BAZA.sale')

    const ogImage = document.querySelector('meta[property="og:image"]') as HTMLMetaElement
    expect(ogImage?.content).toBe('https://baza.sale/media/cover.jpg')

    const canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement
    expect(canonical?.href).toBe('https://baza.sale/listings/seaside-apt')

    const script = document.getElementById('baza-seo-jsonld')
    expect(script).not.toBeNull()
    expect(JSON.parse(script!.textContent!)).toEqual(jsonLd)

    // Unmount restores defaults and cleans up
    unmount()
    expect(document.title).toBe('BAZA.sale · каталог объектов недвижимости')
    expect(document.getElementById('baza-seo-jsonld')).toBeNull()
    // The canonical link must not be left pointing at the departed page —
    // a page that sets no canonical of its own must not inherit a stale one.
    expect(document.querySelector('link[rel="canonical"]')).toBeNull()
  })

  it('does not leak a stale canonical URL into a page that navigates away without setting its own', () => {
    // Reproduces: user visits a listing detail page (sets a canonical), then
    // navigates to the catalogue root, which never calls useSeoMetadata.
    const { unmount } = renderHook(() =>
      useSeoMetadata({
        title: 'Уютная квартира у моря',
        canonicalUrl: 'https://baza.sale/listings/seaside-apt',
      }),
    )
    expect((document.querySelector('link[rel="canonical"]') as HTMLLinkElement)?.href).toBe(
      'https://baza.sale/listings/seaside-apt',
    )

    unmount()

    // No canonical tag should remain claiming the departed listing's URL.
    expect(document.querySelector('link[rel="canonical"]')).toBeNull()
  })

  it('buildListingJsonLd adheres to strict public whitelist and NEVER discloses internal fields', () => {
    const item: PublicListingCard = {
      id: 'listing-123',
      slug: 'batumi-flat-77',
      dealType: 'sale',
      propertyType: 'apartment',
      price: {
        amountMinorUnits: 8500000,
        currency: 'USD',
      },
      location: {
        country: 'Georgia',
        city: 'Batumi',
        address: 'Khimshiashvili 15',
      },
      seo: {
        title: '2-комн. квартира в Батуми',
        description: 'Отличный вид на море',
      },
      media: [
        { id: 'm1', url: 'https://cdn.baza.sale/photo1.jpg', role: 'cover', sortOrder: 0 },
        { id: 'm2', url: 'https://cdn.baza.sale/photo2.jpg', role: 'gallery', sortOrder: 1 },
      ],
    }

    const structuredData = buildListingJsonLd(item, 'https://baza.sale')

    expect(structuredData['@type']).toBe('RealEstateListing')
    expect(structuredData.name).toBe('2-комн. квартира в Батуми')
    expect(structuredData.description).toBe('Отличный вид на море')
    expect(structuredData.url).toBe('https://baza.sale/listings/batumi-flat-77')
    expect(structuredData.image).toEqual([
      'https://cdn.baza.sale/photo1.jpg',
      'https://cdn.baza.sale/photo2.jpg',
    ])
    expect(structuredData.offers).toEqual({
      '@type': 'Offer',
      price: '85000.00',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    })

    // Strict non-disclosure check
    const serialized = JSON.stringify(structuredData)
    expect(serialized).not.toContain('organizationId')
    expect(structuredData).not.toHaveProperty('organizationId')
    expect(structuredData).not.toHaveProperty('sourceId')
    expect(structuredData).not.toHaveProperty('identityId')
    expect(structuredData).not.toHaveProperty('storageKey')
    expect(structuredData).not.toHaveProperty('contactPhone')
  })
})
