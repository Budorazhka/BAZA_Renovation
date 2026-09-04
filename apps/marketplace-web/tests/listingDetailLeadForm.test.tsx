/** @vitest-environment jsdom */
import React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ListingContactForm, extractUtmParams } from '../src/components/ListingContactForm'
import { marketplaceApi, MarketplaceApiError } from '../src/api/marketplace-api'

describe('ListingContactForm Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('extractUtmParams parses UTM query params properly', () => {
    expect(extractUtmParams('')).toBeUndefined()
    expect(extractUtmParams('?city=Batumi')).toBeUndefined()
    expect(extractUtmParams('?utm_source=google&utm_campaign=summer&city=Batumi')).toEqual({
      utm_source: 'google',
      utm_campaign: 'summer',
    })
  })

  it('renders input fields and submit button in idle state', () => {
    render(<ListingContactForm slug="batumi-sea-flat" />)

    // Заголовок даёт секция-обёртка детальной страницы, а не сама форма:
    // собственный h3 был вторым заголовком с тем же текстом. Проверяем
    // поясняющий текст формы, который остался её частью.
    expect(screen.getByText(/Оставьте номер телефона/)).toBeDefined()
    expect(screen.getByLabelText(/Телефон/i)).toBeDefined()
    expect(screen.getByLabelText(/Ваше имя/i)).toBeDefined()
    const submitBtn = screen.getByRole('button', { name: /Показать телефон/i }) as HTMLButtonElement
    expect(submitBtn).toBeDefined()
    expect(submitBtn.disabled).toBe(true) // disabled because phone is empty
  })

  it('enables submit button when phone is entered', () => {
    render(<ListingContactForm slug="batumi-sea-flat" />)

    const phoneInput = screen.getByLabelText(/Телефон/i)
    fireEvent.change(phoneInput, { target: { value: '+995 555 12 34 56' } })

    const submitBtn = screen.getByRole('button', { name: /Показать телефон/i }) as HTMLButtonElement
    expect(submitBtn.disabled).toBe(false)
  })

  it('submits form, shows loading state, and transitions to success with revealed phone', async () => {
    const revealSpy = vi.spyOn(marketplaceApi, 'revealListingContact').mockResolvedValueOnce({
      phone: '+995 599 11 22 33',
      leadId: 'lead-created-1',
    })

    render(<ListingContactForm slug="batumi-sea-flat" />)

    const phoneInput = screen.getByLabelText(/Телефон/i)
    const nameInput = screen.getByLabelText(/Ваше имя/i)
    fireEvent.change(phoneInput, { target: { value: '+995 555 12 34 56' } })
    fireEvent.change(nameInput, { target: { value: 'Александр' } })

    const submitBtn = screen.getByRole('button', { name: /Показать телефон/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(revealSpy).toHaveBeenCalledWith('batumi-sea-flat', {
        requesterName: 'Александр',
        requesterPhone: '+995 555 12 34 56',
        utm: undefined,
      })
    })

    await waitFor(() => {
      expect(screen.getByText('✓ Заявка отправлена')).toBeDefined()
      expect(screen.getByText('+995 599 11 22 33')).toBeDefined()
      const link = screen.getByRole('link', { name: '+995 599 11 22 33' })
      expect(link.getAttribute('href')).toBe('tel:+995 599 11 22 33')
    })
  })

  it('handles 404 error (listing unavailable)', async () => {
    vi.spyOn(marketplaceApi, 'revealListingContact').mockRejectedValueOnce(
      new MarketplaceApiError('Объект не найден или больше не опубликован.', 404),
    )

    render(<ListingContactForm slug="batumi-sea-flat" />)

    const phoneInput = screen.getByLabelText(/Телефон/i)
    fireEvent.change(phoneInput, { target: { value: '+995 555 12 34 56' } })
    fireEvent.click(screen.getByRole('button', { name: /Показать телефон/i }))

    await waitFor(() => {
      expect(screen.getByText('Объект не найден или больше не опубликован.')).toBeDefined()
    })
  })

  it('handles 429 rate limit error', async () => {
    vi.spyOn(marketplaceApi, 'revealListingContact').mockRejectedValueOnce(
      new MarketplaceApiError('Слишком много запросов. Пожалуйста, повторите попытку позже.', 429),
    )

    render(<ListingContactForm slug="batumi-sea-flat" />)

    const phoneInput = screen.getByLabelText(/Телефон/i)
    fireEvent.change(phoneInput, { target: { value: '+995 555 12 34 56' } })
    fireEvent.click(screen.getByRole('button', { name: /Показать телефон/i }))

    await waitFor(() => {
      expect(screen.getByText('Слишком много запросов. Пожалуйста, повторите попытку позже.')).toBeDefined()
    })
  })

  it('a rapid double-submit before the disabled state commits only sends one request', async () => {
    let resolveReveal: (value: unknown) => void
    const revealSpy = vi.spyOn(marketplaceApi, 'revealListingContact').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReveal = resolve
        }),
    )

    render(<ListingContactForm slug="batumi-sea-flat" />)

    const phoneInput = screen.getByLabelText(/Телефон/i)
    fireEvent.change(phoneInput, { target: { value: '+995 555 12 34 56' } })

    const form = phoneInput.closest('form')!
    // Firing submit twice back-to-back models two events dispatched before
    // React has committed the first setStatus('submitting') re-render.
    fireEvent.submit(form)
    fireEvent.submit(form)

    await waitFor(() => {
      expect(revealSpy).toHaveBeenCalledTimes(1)
    })

    resolveReveal!({ phone: '+995 599 11 22 33', leadId: 'lead-once' })
    await waitFor(() => {
      expect(screen.getByText('✓ Заявка отправлена')).toBeDefined()
    })
  })

  it('handles network error and allows retry', async () => {
    const revealSpy = vi.spyOn(marketplaceApi, 'revealListingContact')
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ phone: '+995 599 11 22 33', leadId: 'lead-2' })

    render(<ListingContactForm slug="batumi-sea-flat" />)

    const phoneInput = screen.getByLabelText(/Телефон/i)
    fireEvent.change(phoneInput, { target: { value: '+995 555 12 34 56' } })
    fireEvent.click(screen.getByRole('button', { name: /Показать телефон/i }))

    await waitFor(() => {
      expect(screen.getByText(/Не удалось отправить заявку/i)).toBeDefined()
    })

    const retryBtn = screen.getByRole('button', { name: /Попробовать снова/i })
    fireEvent.click(retryBtn)

    // Form resets error and allows resubmitting
    expect(screen.queryByText(/Не удалось отправить заявку/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Показать телефон/i }))

    await waitFor(() => {
      expect(screen.getByText('+995 599 11 22 33')).toBeDefined()
    })
  })
})
