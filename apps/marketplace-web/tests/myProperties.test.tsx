/** @vitest-environment jsdom */
import React from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MyPropertiesPage } from '../src/pages/MyPropertiesPage'

describe('MyProperties Page Acceptance (MKT-SCR-019)', () => {
  beforeEach(() => {
    cleanup()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders my properties page with metrics ribbon and add button', () => {
    render(
      <MemoryRouter>
        <MyPropertiesPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 1, name: /Мои объекты/i })).toBeDefined()
    expect(screen.getByTestId('account-add-property-cta')).toBeDefined()
    expect(screen.getByText('Всего объектов')).toBeDefined()
    expect(screen.getByText('В активной продаже')).toBeDefined()
    expect(screen.getAllByText('На модерации').length).toBeGreaterThan(0)

    expect(screen.getByText('2-комн. апартаменты с панорамным видом на море')).toBeDefined()
    expect(screen.getByText('Студия под ключ в Orbi City')).toBeDefined()
  })

  it('filters objects by status tab (В продаже vs На модерации)', () => {
    render(
      <MemoryRouter>
        <MyPropertiesPage />
      </MemoryRouter>,
    )

    const moderationTab = screen.getByRole('tab', { name: /На модерации/i })
    fireEvent.click(moderationTab)

    expect(screen.getByText('Студия под ключ в Orbi City')).toBeDefined()
    expect(screen.queryByText('2-комн. апартаменты с панорамным видом на море')).toBeNull()
  })

  it('switches between big cards and table view mode', () => {
    render(
      <MemoryRouter>
        <MyPropertiesPage />
      </MemoryRouter>,
    )

    const tableModeBtn = screen.getByRole('button', { name: /Отображение таблицей/i })
    fireEvent.click(tableModeBtn)

    expect(screen.getByRole('table', { name: /Таблица моих объектов/i })).toBeDefined()
  })

  it('searches objects by text input', () => {
    render(
      <MemoryRouter>
        <MyPropertiesPage />
      </MemoryRouter>,
    )

    const searchInput = screen.getByRole('searchbox', { name: /Поиск по моим объектам/i })
    fireEvent.change(searchInput, { target: { value: 'Ваке' } })

    expect(screen.getByText('Просторная 3-комнатная квартира в Ваке')).toBeDefined()
    expect(screen.queryByText('Таунхаус в историческом центре')).toBeNull()
  })

  it('toggles object publication status (pause/publish)', () => {
    render(
      <MemoryRouter>
        <MyPropertiesPage />
      </MemoryRouter>,
    )

    const pauseBtns = screen.getAllByRole('button', { name: /Снять с продажи/i })
    fireEvent.click(pauseBtns[0])

    expect(screen.getAllByText('В архиве').length).toBeGreaterThan(0)
  })

  it('confirms actuality when clicking the actuality badge', () => {
    render(
      <MemoryRouter>
        <MyPropertiesPage />
      </MemoryRouter>,
    )

    const attentionBadges = screen.getAllByTitle('Нажмите, чтобы подтвердить актуальность')
    fireEvent.click(attentionBadges[1])

    expect(screen.getAllByText('Актуально').length).toBeGreaterThan(1)
  })
})
