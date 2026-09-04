/** @vitest-environment jsdom */
import React from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CrmKanbanPage } from '../src/pages/CrmKanbanPage'
import { CrmTasksPage } from '../src/pages/CrmTasksPage'
import { CrmCalendarPage } from '../src/pages/CrmCalendarPage'

describe('Realtor CRM Acceptance (MKT-SCR-022, MKT-SCR-023, MKT-SCR-024)', () => {
  beforeEach(() => {
    cleanup()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders CRM kanban board with columns, metrics ribbon and cards', () => {
    render(
      <MemoryRouter>
        <CrmKanbanPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 1, name: /CRM Риелтора/i })).toBeDefined()
    expect(screen.getByTestId('add-lead-btn')).toBeDefined()
    expect(screen.getByText('Клиентов в воронке')).toBeDefined()
    expect(screen.getByTestId('kanban-col-new')).toBeDefined()
    expect(screen.getByTestId('kanban-col-in_progress')).toBeDefined()
    expect(screen.getByTestId('kanban-col-showing')).toBeDefined()
    expect(screen.getByTestId('kanban-col-booked')).toBeDefined()

    expect(screen.getByText('Михаил Ковалев')).toBeDefined()
    expect(screen.getByText('$85 000')).toBeDefined()
  })

  it('moves lead through stages using advance button', () => {
    render(
      <MemoryRouter>
        <CrmKanbanPage />
      </MemoryRouter>,
    )

    const advanceBtns = screen.getAllByTitle('Вперед')
    fireEvent.click(advanceBtns[0])

    const inProgressCol = screen.getByTestId('kanban-col-in_progress')
    expect(inProgressCol.textContent).toContain('Михаил Ковалев')
  })

  it('opens new deal modal and adds lead to new column', () => {
    render(
      <MemoryRouter>
        <CrmKanbanPage />
      </MemoryRouter>,
    )

    const addBtn = screen.getByTestId('add-lead-btn')
    fireEvent.click(addBtn)

    expect(screen.getByRole('heading', { level: 2, name: /Новая сделка/i })).toBeDefined()

    const nameInput = screen.getByPlaceholderText(/Имя клиента/i)
    fireEvent.change(nameInput, { target: { value: 'Анастасия Попова' } })

    const submitBtn = screen.getByRole('button', { name: /Создать/i })
    fireEvent.click(submitBtn)

    expect(screen.getByText('Анастасия Попова')).toBeDefined()
  })

  it('renders tasks page, toggles task completion and adds new task', () => {
    render(
      <MemoryRouter>
        <CrmTasksPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 1, name: /Задачи и напоминания/i })).toBeDefined()
    expect(screen.getByText('Отправить подборку квартир у моря Михаилу')).toBeDefined()

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])

    const input = screen.getByPlaceholderText(/Добавить новую задачу/i)
    fireEvent.change(input, { target: { value: 'Подготовить договор купли-продажи' } })

    const addBtn = screen.getByTestId('add-task-btn')
    fireEvent.click(addBtn)

    expect(screen.getByText('Подготовить договор купли-продажи')).toBeDefined()
  })

  it('renders calendar schedule grid with weekly showing events', () => {
    render(
      <MemoryRouter>
        <CrmCalendarPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 1, name: /Календарь показов/i })).toBeDefined()
    expect(screen.getByTestId('add-showing-btn')).toBeDefined()
    expect(screen.getByText('Показ апартаментов у моря')).toBeDefined()
    expect(screen.getByText('Встреча в офисе застройщика')).toBeDefined()
  })
})
