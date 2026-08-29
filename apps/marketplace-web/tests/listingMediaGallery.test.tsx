/** @vitest-environment jsdom */
import React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ListingMediaGallery } from '../src/components/ListingMediaGallery'
import type { PublicMediaItem } from '../src/types/marketplace'

describe('ListingMediaGallery Component (MKT-004)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders empty placeholder when media is empty or undefined', () => {
    const { rerender } = render(<ListingMediaGallery media={[]} title="Квартира в Батуми" />)
    expect(screen.getByTestId('listing-gallery-empty')).toBeDefined()
    expect(screen.getByText('Фотографии объекта не загружены')).toBeDefined()

    rerender(<ListingMediaGallery media={undefined} title="Квартира в Батуми" />)
    expect(screen.getByTestId('listing-gallery-empty')).toBeDefined()
  })

  it('renders single photo without navigation buttons', () => {
    const media: PublicMediaItem[] = [
      { url: 'https://cdn.example.com/photo1.webp', role: 'cover', sortOrder: 0, alt: 'Вид на море' },
    ]
    render(<ListingMediaGallery media={media} title="Квартира в Батуми" />)

    const img = screen.getByTestId('gallery-active-image') as HTMLImageElement
    expect(img.src).toBe('https://cdn.example.com/photo1.webp')
    expect(img.alt).toBe('Вид на море')
    expect(screen.queryByTestId('gallery-prev-btn')).toBeNull()
    expect(screen.queryByTestId('gallery-next-btn')).toBeNull()
    expect(screen.queryByTestId('gallery-counter')).toBeNull()
  })

  it('renders multiple photos with navigation controls, counter and thumbnails', () => {
    const media: PublicMediaItem[] = [
      { url: 'https://cdn.example.com/photo1.webp', role: 'cover', sortOrder: 0, alt: 'Обложка' },
      { url: 'https://cdn.example.com/photo2.webp', role: 'gallery', sortOrder: 1, alt: 'Гостиная' },
      { url: 'https://cdn.example.com/photo3.webp', role: 'gallery', sortOrder: 2 },
    ]
    render(<ListingMediaGallery media={media} title="Квартира в Батуми" />)

    expect(screen.getByTestId('gallery-counter').textContent).toBe('1 / 3')
    expect(screen.getByTestId('gallery-prev-btn')).toBeDefined()
    expect(screen.getByTestId('gallery-next-btn')).toBeDefined()
    expect(screen.getByTestId('gallery-thumb-0')).toBeDefined()
    expect(screen.getByTestId('gallery-thumb-1')).toBeDefined()
    expect(screen.getByTestId('gallery-thumb-2')).toBeDefined()
  })

  it('navigates next and previous on button click', () => {
    const media: PublicMediaItem[] = [
      { url: 'https://cdn.example.com/photo1.webp', role: 'cover', sortOrder: 0 },
      { url: 'https://cdn.example.com/photo2.webp', role: 'gallery', sortOrder: 1 },
    ]
    render(<ListingMediaGallery media={media} title="Квартира" />)

    const nextBtn = screen.getByTestId('gallery-next-btn')
    const prevBtn = screen.getByTestId('gallery-prev-btn')

    // Initially on 1 / 2
    expect(screen.getByTestId('gallery-counter').textContent).toBe('1 / 2')
    expect((screen.getByTestId('gallery-active-image') as HTMLImageElement).src).toBe('https://cdn.example.com/photo1.webp')

    // Click next -> 2 / 2
    fireEvent.click(nextBtn)
    expect(screen.getByTestId('gallery-counter').textContent).toBe('2 / 2')
    expect((screen.getByTestId('gallery-active-image') as HTMLImageElement).src).toBe('https://cdn.example.com/photo2.webp')

    // Click next -> loops back to 1 / 2
    fireEvent.click(nextBtn)
    expect(screen.getByTestId('gallery-counter').textContent).toBe('1 / 2')

    // Click prev -> loops to 2 / 2
    fireEvent.click(prevBtn)
    expect(screen.getByTestId('gallery-counter').textContent).toBe('2 / 2')
  })

  it('selects photo on thumbnail click', () => {
    const media: PublicMediaItem[] = [
      { url: 'https://cdn.example.com/photo1.webp', role: 'cover', sortOrder: 0 },
      { url: 'https://cdn.example.com/photo2.webp', role: 'gallery', sortOrder: 1 },
      { url: 'https://cdn.example.com/photo3.webp', role: 'gallery', sortOrder: 2 },
    ]
    render(<ListingMediaGallery media={media} title="Квартира" />)

    fireEvent.click(screen.getByTestId('gallery-thumb-2'))
    expect(screen.getByTestId('gallery-counter').textContent).toBe('3 / 3')
    expect((screen.getByTestId('gallery-active-image') as HTMLImageElement).src).toBe('https://cdn.example.com/photo3.webp')
  })

  it('supports keyboard navigation with ArrowRight and ArrowLeft', () => {
    const media: PublicMediaItem[] = [
      { url: 'https://cdn.example.com/photo1.webp', role: 'cover', sortOrder: 0 },
      { url: 'https://cdn.example.com/photo2.webp', role: 'gallery', sortOrder: 1 },
    ]
    render(<ListingMediaGallery media={media} title="Квартира" />)

    const gallery = screen.getByTestId('listing-gallery')

    fireEvent.keyDown(gallery, { key: 'ArrowRight' })
    expect(screen.getByTestId('gallery-counter').textContent).toBe('2 / 2')

    fireEvent.keyDown(gallery, { key: 'ArrowLeft' })
    expect(screen.getByTestId('gallery-counter').textContent).toBe('1 / 2')
  })

  it('shows skeleton while loading and hides skeleton on image load', () => {
    const media: PublicMediaItem[] = [
      { url: 'https://cdn.example.com/photo1.webp', role: 'cover', sortOrder: 0 },
    ]
    render(<ListingMediaGallery media={media} title="Квартира" />)

    expect(screen.getByTestId('gallery-skeleton')).toBeDefined()

    const img = screen.getByTestId('gallery-active-image')
    fireEvent.load(img)

    expect(screen.queryByTestId('gallery-skeleton')).toBeNull()
  })

  it('shows broken image fallback when image loading fails', () => {
    const media: PublicMediaItem[] = [
      { url: 'https://cdn.example.com/broken.webp', role: 'cover', sortOrder: 0 },
    ]
    render(<ListingMediaGallery media={media} title="Квартира" />)

    const img = screen.getByTestId('gallery-active-image')
    fireEvent.error(img)

    expect(screen.getByTestId('gallery-broken')).toBeDefined()
    expect(screen.getByText('Не удалось загрузить изображение')).toBeDefined()
  })
})
