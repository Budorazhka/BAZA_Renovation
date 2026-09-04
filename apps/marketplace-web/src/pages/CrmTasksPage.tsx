import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSeoMetadata } from '../hooks/useSeoMetadata'

export interface CrmTaskItem {
  id: string
  title: string
  clientName?: string
  deadline: string
  priority: 'high' | 'medium' | 'low'
  isDone: boolean
}

const INITIAL_TASKS: CrmTaskItem[] = [
  {
    id: 'task-1',
    title: 'Отправить подборку квартир у моря Михаилу',
    clientName: 'Михаил Ковалев',
    deadline: 'Сегодня, до 18:00',
    priority: 'high',
    isDone: false,
  },
  {
    id: 'task-2',
    title: 'Подтвердить время показа ЖК Batumi Horizon',
    clientName: 'Елена Смирнова',
    deadline: 'Завтра, 12:00',
    priority: 'medium',
    isDone: false,
  },
  {
    id: 'task-3',
    title: 'Запросить свежую выписку из реестра по объекту в Ваке',
    clientName: 'Давид Беридзе',
    deadline: '05 сентября',
    priority: 'low',
    isDone: true,
  },
]

export function CrmTasksPage() {
  const [tasks, setTasks] = useState<CrmTaskItem[]>(INITIAL_TASKS)
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all')
  const [newTaskTitle, setNewTaskTitle] = useState('')

  useSeoMetadata({
    title: 'CRM Задачи и заметки | BAZA',
    description: 'Список задач риелтора по клиентам, показам и объектам недвижимости.',
  })

  const handleToggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isDone: !t.isDone } : t))
    )
  }

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskTitle.trim()) return
    const newTask: CrmTaskItem = {
      id: `task-${Date.now()}`,
      title: newTaskTitle,
      deadline: 'На сегодня',
      priority: 'medium',
      isDone: false,
    }
    setTasks([newTask, ...tasks])
    setNewTaskTitle('')
  }

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'active') return !t.isDone
    if (filter === 'done') return t.isDone
    return true
  })

  return (
    <div className="figma-crm-page">
      <div className="figma-crm-header">
        <div>
          <h1 className="figma-crm-title">Задачи и напоминания</h1>
          <p className="figma-crm-desc">
            Оперативные задачи по клиентам, звонкам и подготовке документов.
          </p>
        </div>
      </div>

      <nav className="figma-crm-nav" aria-label="Разделы CRM">
        <Link to="/account/crm" className="figma-crm-nav-link">
          📊 Воронка сделок
        </Link>
        <Link to="/account/tasks" className="figma-crm-nav-link is-active">
          ✓ Задачи и заметки
        </Link>
        <Link to="/account/calendar" className="figma-crm-nav-link">
          📅 Календарь показов
        </Link>
      </nav>

      <form onSubmit={handleAddTask} style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <input
          type="text"
          placeholder="+ Добавить новую задачу и нажать Enter..."
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: '12px',
            border: '1px solid #EAEAEA',
            fontSize: '14px',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          className="figma-crm-add-btn"
          data-testid="add-task-btn"
        >
          Добавить
        </button>
      </form>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button
          type="button"
          className={`figma-fav-tab-btn${filter === 'all' ? ' is-active' : ''}`}
          onClick={() => setFilter('all')}
        >
          Все ({tasks.length})
        </button>
        <button
          type="button"
          className={`figma-fav-tab-btn${filter === 'active' ? ' is-active' : ''}`}
          onClick={() => setFilter('active')}
        >
          В работе ({tasks.filter((t) => !t.isDone).length})
        </button>
        <button
          type="button"
          className={`figma-fav-tab-btn${filter === 'done' ? ' is-active' : ''}`}
          onClick={() => setFilter('done')}
        >
          Выполненные ({tasks.filter((t) => t.isDone).length})
        </button>
      </div>

      <div className="figma-tasks-list" aria-label="Список задач">
        {filteredTasks.map((t) => (
          <div key={t.id} className={`figma-task-item${t.isDone ? ' is-done' : ''}`}>
            <div className="figma-task-left">
              <input
                type="checkbox"
                checked={t.isDone}
                onChange={() => handleToggleTask(t.id)}
                className="figma-task-checkbox"
                aria-label={`Задача: ${t.title}`}
              />
              <div>
                <h2 className="figma-task-title">{t.title}</h2>
                <div className="figma-task-meta">
                  {t.clientName && <span>Клиент: {t.clientName} · </span>}
                  <span>Срок: {t.deadline}</span>
                </div>
              </div>
            </div>

            <span className={`figma-task-priority figma-task-priority--${t.priority}`}>
              {t.priority === 'high' ? 'Высокий' : t.priority === 'medium' ? 'Средний' : 'Обычный'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
