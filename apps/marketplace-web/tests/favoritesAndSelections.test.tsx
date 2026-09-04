/** @vitest-environment jsdom */
import React from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { FavoritesPage } from '../src/pages/FavoritesPage'
import { SelectionsPage } from '../src/pages/SelectionsPage'
import { SelectionDetailPage } from '../src/pages/SelectionDetailPage'

describe('Favorites & Selections Acceptance (MKT-SCR-017, MKT-SCR-018)', () => {
  beforeEach(() => {
    cleanup()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders favorites page with counter and saved items', () => {
    render(
      <MemoryRouter>
        <FavoritesPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 1, name: /Избранное/i })).toBeDefined()
    expect(screen.getByTestId('favorites-count-badge')).toBeDefined()
    expect(screen.getByText('2-комн. апартаменты с панорамным видом на море')).toBeDefined()
    expect(screen.getByText('Студия под ключ в Orbi City')).toBeDefined()
  })

  it('filters favorites by deal type tabs and text search', () => {
    render(
      <MemoryRouter>
        <FavoritesPage />
      </MemoryRouter>,
    )

    const longRentTab = screen.getByRole('tab', { name: /Долгосрок/i })
    fireEvent.click(longRentTab)

    expect(screen.getByText('Просторная 3-комнатная квартира в Ваке')).toBeDefined()
    expect(screen.queryByText('Студия под ключ в Orbi City')).toBeNull()

    const searchInput = screen.getByRole('searchbox', { name: /Поиск по избранному/i })
    fireEvent.change(searchInput, { target: { value: 'Ваке' } })
    expect(screen.getByText('Просторная 3-комнатная квартира в Ваке')).toBeDefined()
  })

  it('removes item from favorites when clicking heart/remove button', () => {
    render(
      <MemoryRouter>
        <FavoritesPage />
      </MemoryRouter>,
    )

    const removeBtns = screen.getAllByRole('button', { name: /Удалить/i })
    fireEvent.click(removeBtns[0])

    expect(screen.queryByText('2-комн. апартаменты с панорамным видом на море')).toBeNull()
  })

  it('renders selections page with collection cards and creates new collection', () => {
    render(
      <MemoryRouter>
        <SelectionsPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 1, name: /Мои подборки/i })).toBeDefined()
    expect(screen.getByDisplayValue('Подборка для инвестора (Батуми у моря)')).toBeDefined()

    const newBtn = screen.getByTestId('new-collection-btn')
    fireEvent.click(newBtn)

    expect(screen.getByDisplayValue(/Новая подборка/i)).toBeDefined()
  })

  it('renders public client selection detail view with realtor header', () => {
    render(
      <MemoryRouter initialEntries={['/selections/batumi-investor-sea']}>
        <Routes>
          <Route path="/selections/:slug" element={<SelectionDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('ПЕРСОНАЛЬНАЯ ПОДБОРКА')).toBeDefined()
    expect(screen.getByText('Георгий Беридзе')).toBeDefined()
    expect(screen.getByText('Написать в WhatsApp')).toBeDefined()
  })
})
