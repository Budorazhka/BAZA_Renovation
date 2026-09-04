import { useEffect } from 'react'
import type { PublicDevelopmentCard, PublicListingCard } from '../types/marketplace'
import { listingPrice, listingTitle, listingAddress, developmentTitle, developmentAddress } from '../lib/format'

export interface SeoConfig {
  title?: string
  description?: string
  canonicalUrl?: string
  imageUrl?: string
  jsonLd?: Record<string, unknown>
  /**
   * Закрыть страницу от индексации.
   *
   * Нужно страницам, адресованным одному человеку: персональная подборка
   * содержит имя клиента и заметки агента, ей нечего делать в поиске.
   */
  noindex?: boolean
}

const DEFAULT_TITLE = 'BAZA.sale · каталог объектов недвижимости'
const DEFAULT_DESCRIPTION = 'Проверенные новостройки, вторичная недвижимость и аренда без комиссии и посредников.'

function setMetaTag(name: string, content: string, attribute: 'name' | 'property' = 'name') {
  if (typeof document === 'undefined') return
  let element = document.querySelector(`meta[${attribute}="${name}"]`) as HTMLMetaElement | null
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, name)
    document.head.appendChild(element)
  }
  element.content = content
}

function removeMetaTag(name: string, attribute: 'name' | 'property' = 'name') {
  if (typeof document === 'undefined') return
  const element = document.querySelector(`meta[${attribute}="${name}"]`)
  if (element && element.parentNode) {
    element.parentNode.removeChild(element)
  }
}

function setCanonical(url: string) {
  if (typeof document === 'undefined') return
  let element = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
  if (!element) {
    element = document.createElement('link')
    element.rel = 'canonical'
    document.head.appendChild(element)
  }
  element.href = url
}

function removeCanonical() {
  if (typeof document === 'undefined') return
  const element = document.querySelector('link[rel="canonical"]')
  if (element && element.parentNode) {
    element.parentNode.removeChild(element)
  }
}

function setJsonLd(data: Record<string, unknown> | undefined) {
  if (typeof document === 'undefined') return
  const SCRIPT_ID = 'baza-seo-jsonld'
  let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null

  if (!data) {
    if (script && script.parentNode) {
      script.parentNode.removeChild(script)
    }
    return
  }

  if (!script) {
    script = document.createElement('script')
    script.id = SCRIPT_ID
    script.type = 'application/ld+json'
    document.head.appendChild(script)
  }

  script.textContent = JSON.stringify(data)
}

export function useSeoMetadata(config: SeoConfig) {
  useEffect(() => {
    if (typeof document === 'undefined') return

    const title = config.title ? `${config.title} — BAZA.sale` : DEFAULT_TITLE
    const description = config.description?.trim() || DEFAULT_DESCRIPTION
    const canonical =
      config.canonicalUrl || (typeof window !== 'undefined' ? window.location.href.split('?')[0] : '')

    document.title = title
    setMetaTag('description', description)
    setMetaTag('robots', config.noindex ? 'noindex, nofollow' : 'index, follow')
    setMetaTag('og:title', title, 'property')
    setMetaTag('og:description', description, 'property')
    if (config.imageUrl) {
      setMetaTag('og:image', config.imageUrl, 'property')
    }
    if (canonical) {
      setCanonical(canonical)
      setMetaTag('og:url', canonical, 'property')
    }

    setJsonLd(config.jsonLd)

    return () => {
      document.title = DEFAULT_TITLE
      setMetaTag('description', DEFAULT_DESCRIPTION)
      removeMetaTag('og:title', 'property')
      removeMetaTag('og:description', 'property')
      removeMetaTag('og:image', 'property')
      removeMetaTag('og:url', 'property')
      removeCanonical()
      setJsonLd(undefined)
    }
  }, [config.title, config.description, config.canonicalUrl, config.imageUrl, config.jsonLd])
}

/**
 * Builds safe, non-disclosure JSON-LD for a secondary/rent listing.
 * Strict whitelist: only public price, address, image URLs and description.
 * Storage keys, organization IDs, source IDs and internal phone numbers are never included.
 */
export function buildListingJsonLd(item: PublicListingCard, origin = ''): Record<string, unknown> {
  const images = (item.media || []).map((m) => m.url).filter(Boolean)
  const title = item.seo?.title?.trim() || listingTitle(item)
  const address = listingAddress(item)
  const description = item.seo?.description?.trim() || `${title} по адресу ${address}`
  const url = item.slug ? `${origin}/listings/${item.slug}` : undefined

  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: title,
    description,
    ...(url ? { url } : {}),
    ...(images.length > 0 ? { image: images } : {}),
    offers: {
      '@type': 'Offer',
      price: item.price?.amountMinorUnits != null ? (item.price.amountMinorUnits / 100).toFixed(2) : '0.00',
      priceCurrency: item.price?.currency || 'USD',
      availability: 'https://schema.org/InStock',
    },
    address: {
      '@type': 'PostalAddress',
      addressLocality: item.location?.city,
      addressCountry: item.location?.country,
      streetAddress: item.location?.address,
    },
  }
}

/**
 * Builds safe, non-disclosure JSON-LD for a residential development.
 */
export function buildDevelopmentJsonLd(item: PublicDevelopmentCard, origin = ''): Record<string, unknown> {
  const title = developmentTitle(item)
  const address = developmentAddress(item)
  const description = item.description?.trim() || `Жилой комплекс ${title} в городе ${item.location?.city || ''}`
  const url = item.slug ? `${origin}/developments/${item.slug}` : undefined

  return {
    '@context': 'https://schema.org',
    '@type': 'ApartmentComplex',
    name: title,
    description,
    ...(url ? { url } : {}),
    address: {
      '@type': 'PostalAddress',
      addressLocality: item.location?.city,
      addressCountry: item.location?.country,
      streetAddress: item.location?.address,
    },
  }
}
