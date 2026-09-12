/** @vitest-environment jsdom */
import React from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RequestsPage } from '../src/pages/RequestsPage'

function countText(): string {
  return (document.getElementById('rq-count')?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function renderPage() {
  return render(
    <MemoryRouter>
      <RequestsPage />
    </MemoryRouter>,
  )
}

describe('Buyer & Tenant Requests Board Acceptance (MKT-SCR-016)', () => {
  beforeEach(() => {
    cleanup()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders requests board with title, filters and request cards', () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: /Запросы клиентов/i })).toBeDefined()
    expect(screen.getByTestId('add-request-btn')).toBeDefined()
    expect(screen.getByText('Константин М.')).toBeDefined()
    expect(screen.getByText('до $90 000')).toBeDefined()
    expect(screen.getByRole('heading', { level: 3, name: 'Куплю двушку в центре Батуми' })).toBeDefined()
    expect(countText()).toBe('7 запросов найдено')
  })

  it('filters requests by deal type (Покупка vs Аренда)', () => {
    renderPage()

    fireEvent.click(screen.getByRole('radio', { name: 'Аренда' }))

    expect(screen.getByText('Алексей Д.')).toBeDefined()
    expect(screen.queryByText('Константин М.')).toBeNull()
  })

  it('filters requests by property type switch', () => {
    renderPage()

    fireEvent.click(screen.getByRole('switch', { name: 'Земельный участок' }))

    expect(screen.getByText('Гиорги Т.')).toBeDefined()
    expect(screen.queryByText('Константин М.')).toBeNull()
    expect(countText()).toBe('1 запрос найден')
  })

  it('filters requests by city and search query', () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('Город'), { target: { value: 'Тбилиси' } })

    expect(screen.getByText('Алексей Д.')).toBeDefined()
    expect(screen.queryByText('Татьяна В.')).toBeNull()

    fireEvent.change(screen.getByRole('searchbox', { name: /Поиск по запросам/i }), { target: { value: 'Ваке' } })
    expect(screen.getByText('Аренда 3-комнатной квартиры в Ваке или Сабуртало')).toBeDefined()
    expect(screen.queryByText('Гиорги Т.')).toBeNull()
  })

  it('shows an empty state and resets filters', () => {
    renderPage()

    fireEvent.change(screen.getByRole('searchbox', { name: /Поиск по запросам/i }), { target: { value: 'яхта' } })
    expect(screen.getByText('По этим условиям запросов нет')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))
    expect(screen.getByText('Константин М.')).toBeDefined()
  })

  it('keeps the phone masked until the realtor reveals it', () => {
    renderPage()

    const card = screen.getByRole('article', { name: 'Куплю двушку в центре Батуми' })
    expect(within(card).getByText('номер скрыт')).toBeDefined()

    fireEvent.click(within(card).getByRole('button', { name: /Показать телефон/ }))
    expect(within(card).queryByText('номер скрыт')).toBeNull()
    expect(within(card).getByText(/\+995 599 00 00 01/)).toBeDefined()
  })

  it('opens the write dialog and sends a message', () => {
    renderPage()

    fireEvent.click(screen.getByTestId('offer-btn-req-1'))

    const dialog = screen.getByRole('dialog', { name: 'Написать клиенту' })
    fireEvent.change(within(dialog).getByPlaceholderText(/Ссылка на объект/i), {
      target: { value: 'https://baza.sale/listings/batumi-flat-sea-view' },
    })
    fireEvent.change(within(dialog).getByLabelText('Сообщение'), { target: { value: 'Есть вариант у моря' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отправить' }))

    expect(within(dialog).getByText('Сообщение отправлено')).toBeDefined()
  })

  it('closes the dialog on Escape', () => {
    renderPage()

    fireEvent.click(screen.getByTestId('add-request-btn'))
    expect(screen.getByRole('dialog', { name: 'Оставить запрос' })).toBeDefined()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
