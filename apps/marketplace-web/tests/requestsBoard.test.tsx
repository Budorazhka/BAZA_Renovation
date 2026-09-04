/** @vitest-environment jsdom */
import React from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RequestsPage } from '../src/pages/RequestsPage'

describe('Buyer & Tenant Requests Board Acceptance (MKT-SCR-016)', () => {
  beforeEach(() => {
    cleanup()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders requests board with title, filters and request cards', () => {
    render(
      <MemoryRouter>
        <RequestsPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 1, name: /Запросы клиентов/i })).toBeDefined()
    expect(screen.getByTestId('add-request-btn')).toBeDefined()
    expect(screen.getByText('Константин М.')).toBeDefined()
    expect(screen.getByText('до $90 000')).toBeDefined()
    expect(screen.getByText('Куплю 2-комнатную квартиру у моря с ремонтом')).toBeDefined()
  })

  it('filters requests by deal type (Покупка vs Аренда)', () => {
    render(
      <MemoryRouter>
        <RequestsPage />
      </MemoryRouter>,
    )

    const rentBtn = screen.getByRole('button', { name: /Аренда/i })
    fireEvent.click(rentBtn)

    expect(screen.getByText('Алексей Д.')).toBeDefined()
    expect(screen.queryByText('Константин М.')).toBeNull()
  })

  it('filters requests by city and search query', () => {
    render(
      <MemoryRouter>
        <RequestsPage />
      </MemoryRouter>,
    )

    const tbilisiBtn = screen.getByRole('button', { name: /Тбилиси/i })
    fireEvent.click(tbilisiBtn)

    expect(screen.getByText('Алексей Д.')).toBeDefined()
    expect(screen.queryByText('Татьяна В.')).toBeNull()

    const searchInput = screen.getByRole('searchbox', { name: /Поиск по запросам/i })
    fireEvent.change(searchInput, { target: { value: 'Ваке' } })
    expect(screen.getByText('Аренда 3-комнатной квартиры в Ваке или Сабуртало')).toBeDefined()
  })

  it('opens offer modal and sends object proposal', () => {
    render(
      <MemoryRouter>
        <RequestsPage />
      </MemoryRouter>,
    )

    const offerBtn = screen.getByTestId('offer-btn-req-1')
    fireEvent.click(offerBtn)

    expect(screen.getByRole('heading', { level: 2, name: /Предложить объект клиенту/i })).toBeDefined()

    const linkInput = screen.getByPlaceholderText(/Ссылка на объект/i)
    fireEvent.change(linkInput, { target: { value: 'https://baza.sale/listings/batumi-flat-sea-view' } })

    const submitBtn = screen.getByRole('button', { name: /Отправить предложение/i })
    fireEvent.click(submitBtn)

    expect(screen.getByText(/✓ Предложение успешно отправлено клиенту!/i)).toBeDefined()
  })
})
