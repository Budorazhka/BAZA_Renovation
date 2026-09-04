/** @vitest-environment jsdom */
import React from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App'
import { RealtorsPage } from '../src/pages/RealtorsPage'
import { RealtorProfilePage } from '../src/pages/RealtorProfilePage'

describe('Realtors Rating & Profiles Acceptance (MKT-SCR-014, MKT-SCR-015)', () => {
  beforeEach(() => {
    cleanup()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders realtors rating directory with header, search and cards', () => {
    render(
      <MemoryRouter>
        <RealtorsPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 1, name: /Рейтинг риелторов/i })).toBeDefined()
    expect(screen.getByRole('searchbox', { name: /Поиск по риелторам/i })).toBeDefined()
    expect(screen.getByRole('tab', { name: /Батуми/i })).toBeDefined()
    expect(screen.getByRole('tab', { name: /Тбилиси/i })).toBeDefined()

    expect(screen.getByText('Георгий Беридзе')).toBeDefined()
    expect(screen.getByText('Давид Кварацхелия')).toBeDefined()
  })

  it('filters realtors list by city tab', () => {
    render(
      <MemoryRouter>
        <RealtorsPage />
      </MemoryRouter>,
    )

    const tbilisiTab = screen.getByRole('tab', { name: 'Тбилиси' })
    fireEvent.click(tbilisiTab)

    expect(screen.getByText('Давид Кварацхелия')).toBeDefined()
    expect(screen.queryByText('Георгий Беридзе')).toBeNull()
  })

  it('filters realtors list by text search input', () => {
    render(
      <MemoryRouter>
        <RealtorsPage />
      </MemoryRouter>,
    )

    const searchInput = screen.getByRole('searchbox', { name: /Поиск по риелторам/i })
    fireEvent.change(searchInput, { target: { value: 'Нино' } })

    expect(screen.getByText('Нино Цинцадзе')).toBeDefined()
    expect(screen.queryByText('Георгий Беридзе')).toBeNull()
  })

  it('navigates to realtor profile and renders reviews', () => {
    render(
      <MemoryRouter initialEntries={['/realtors/realtor-1']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 1, name: /Георгий Беридзе/i })).toBeDefined()
    expect(screen.getByRole('heading', { level: 2, name: /Отзывы клиентов/i })).toBeDefined()
    expect(screen.getByText(/Георгий помог выбрать отличную студию/i)).toBeDefined()
  })

  it('submits a new client review on realtor profile', () => {
    render(
      <MemoryRouter initialEntries={['/realtors/realtor-1']}>
        <App />
      </MemoryRouter>,
    )

    const nameInput = screen.getByLabelText(/Ваше имя/i)
    const commentInput = screen.getByLabelText(/Текст отзыва/i)
    const submitBtn = screen.getByRole('button', { name: /Отправить отзыв/i })

    fireEvent.change(nameInput, { target: { value: 'Константин' } })
    fireEvent.change(commentInput, { target: { value: 'Прекрасная работа, все быстро и профессионально!' } })
    fireEvent.click(submitBtn)

    expect(screen.getByText(/Спасибо! Ваш отзыв успешно добавлен/i)).toBeDefined()
  })
})
