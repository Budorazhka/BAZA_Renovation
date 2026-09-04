import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSeoMetadata } from '../hooks/useSeoMetadata'

export type PipelineStage = 'new' | 'in_progress' | 'showing' | 'booked'

export interface CrmLeadItem {
  id: string
  clientName: string
  phone: string
  budgetFormatted: string
  objectTitle: string
  city: string
  stage: PipelineStage
  createdAt: string
}

const INITIAL_LEADS: CrmLeadItem[] = [
  {
    id: 'lead-1',
    clientName: 'Михаил Ковалев',
    phone: '+995 599 123 456',
    budgetFormatted: '$85 000',
    objectTitle: '2-комн. апартаменты у моря',
    city: 'Батуми',
    stage: 'new',
    createdAt: 'Сегодня, 11:30',
  },
  {
    id: 'lead-2',
    clientName: 'Елена Смирнова',
    phone: '+995 599 654 321',
    budgetFormatted: '$120 000',
    objectTitle: 'ЖК Batumi Horizon Tower',
    city: 'Батуми',
    stage: 'in_progress',
    createdAt: 'Вчера',
  },
  {
    id: 'lead-3',
    clientName: 'Давид Беридзе',
    phone: '+995 577 889 900',
    budgetFormatted: '$1 500 / мес',
    objectTitle: '3-комн. квартира в Ваке',
    city: 'Тбилиси',
    stage: 'showing',
    createdAt: '01 сентября',
  },
  {
    id: 'lead-4',
    clientName: 'Сергей Николаев',
    phone: '+995 591 445 566',
    budgetFormatted: '$48 000',
    objectTitle: 'Студия под ключ в Orbi City',
    city: 'Батуми',
    stage: 'booked',
    createdAt: '28 августа',
  },
]

const STAGE_LABELS: Record<PipelineStage, string> = {
  new: 'Новые лиды',
  in_progress: 'В переговорах',
  showing: 'Показы и встречи',
  booked: 'Бронь и сделка',
}

const STAGES: PipelineStage[] = ['new', 'in_progress', 'showing', 'booked']

export function CrmKanbanPage() {
  const [leads, setLeads] = useState<CrmLeadItem[]>(INITIAL_LEADS)
  const [isNewLeadModalOpen, setIsNewLeadModalOpen] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newBudget, setNewBudget] = useState('')
  const [newObject, setNewObject] = useState('')

  useSeoMetadata({
    title: 'CRM Риелтора — Воронка сделок | BAZA',
    description: 'Управление клиентами, этапами сделок и лидами риелтора на платформе BAZA.',
  })

  const handleMoveStage = (id: string, direction: 'prev' | 'next') => {
    setLeads((prev) =>
      prev.map((lead) => {
        if (lead.id !== id) return lead
        const currentIndex = STAGES.indexOf(lead.stage)
        const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1
        if (nextIndex >= 0 && nextIndex < STAGES.length) {
          return { ...lead, stage: STAGES[nextIndex] }
        }
        return lead
      })
    )
  }

  const handleCreateLead = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newClientName.trim()) return
    const newLead: CrmLeadItem = {
      id: `lead-${Date.now()}`,
      clientName: newClientName,
      phone: '+995 599 000 000',
      budgetFormatted: newBudget || '$50 000',
      objectTitle: newObject || 'Запрос на подбор',
      city: 'Батуми',
      stage: 'new',
      createdAt: 'Только что',
    }
    setLeads([newLead, ...leads])
    setIsNewLeadModalOpen(false)
    setNewClientName('')
    setNewBudget('')
    setNewObject('')
  }

  return (
    <div className="figma-crm-page">
      <div className="figma-crm-header">
        <div>
          <h1 className="figma-crm-title">CRM Риелтора</h1>
          <p className="figma-crm-desc">
            Контроль воронки клиентов, статусов переговоров и задач по объектам.
          </p>
        </div>

        <button
          type="button"
          className="figma-crm-add-btn"
          onClick={() => setIsNewLeadModalOpen(true)}
          data-testid="add-lead-btn"
        >
          + Добавить сделку
        </button>
      </div>

      <nav className="figma-crm-nav" aria-label="Разделы CRM">
        <Link to="/account/crm" className="figma-crm-nav-link is-active">
          📊 Воронка сделок
        </Link>
        <Link to="/account/tasks" className="figma-crm-nav-link">
          ✓ Задачи и заметки
        </Link>
        <Link to="/account/calendar" className="figma-crm-nav-link">
          📅 Календарь показов
        </Link>
      </nav>

      <div className="figma-crm-metrics" aria-label="Метрики CRM">
        <div className="figma-crm-metric-card">
          <span className="figma-crm-metric-card__value">{leads.length}</span>
          <span className="figma-crm-metric-card__label">Клиентов в воронке</span>
        </div>
        <div className="figma-crm-metric-card">
          <span className="figma-crm-metric-card__value" style={{ color: '#1BA800' }}>
            {leads.filter((l) => l.stage === 'new').length}
          </span>
          <span className="figma-crm-metric-card__label">Новых лидов</span>
        </div>
        <div className="figma-crm-metric-card">
          <span className="figma-crm-metric-card__value" style={{ color: '#0288D1' }}>
            {leads.filter((l) => l.stage === 'showing').length}
          </span>
          <span className="figma-crm-metric-card__label">Назначено показов</span>
        </div>
        <div className="figma-crm-metric-card">
          <span className="figma-crm-metric-card__value" style={{ color: '#E65100' }}>
            {leads.filter((l) => l.stage === 'booked').length}
          </span>
          <span className="figma-crm-metric-card__label">В стадии брони</span>
        </div>
      </div>

      <div className="figma-kanban-board" aria-label="Канбан воронки сделок">
        {STAGES.map((stage) => {
          const colLeads = leads.filter((l) => l.stage === stage)
          return (
            <div key={stage} className="figma-kanban-col" data-testid={`kanban-col-${stage}`}>
              <div className="figma-kanban-col__header">
                <span>{STAGE_LABELS[stage]}</span>
                <span className="figma-kanban-col__count">{colLeads.length}</span>
              </div>

              {colLeads.map((lead) => (
                <article key={lead.id} className="figma-kanban-card">
                  <div className="figma-kanban-card__header">
                    <span className="figma-kanban-card__name">{lead.clientName}</span>
                    <span className="figma-kanban-card__budget">{lead.budgetFormatted}</span>
                  </div>

                  <div className="figma-kanban-card__object">
                    📍 {lead.city} · {lead.objectTitle}
                  </div>

                  <div className="figma-kanban-card__footer">
                    <span>{lead.createdAt}</span>
                    <div className="figma-kanban-card__move-btns">
                      {stage !== 'new' && (
                        <button
                          type="button"
                          className="figma-kanban-move-btn"
                          onClick={() => handleMoveStage(lead.id, 'prev')}
                          title="Назад"
                        >
                          ◀
                        </button>
                      )}
                      {stage !== 'booked' && (
                        <button
                          type="button"
                          className="figma-kanban-move-btn"
                          onClick={() => handleMoveStage(lead.id, 'next')}
                          title="Вперед"
                        >
                          ▶
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )
        })}
      </div>

      {isNewLeadModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px',
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '20px',
            padding: '32px',
            maxWidth: '440px',
            width: '100%',
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 16px 0' }}>
              Новая сделка / Клиент
            </h2>
            <form onSubmit={handleCreateLead}>
              <input
                type="text"
                placeholder="Имя клиента *"
                required
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #EAEAEA',
                  marginBottom: '12px',
                  boxSizing: 'border-box',
                }}
              />
              <input
                type="text"
                placeholder="Бюджет (напр. $75 000)"
                value={newBudget}
                onChange={(e) => setNewBudget(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #EAEAEA',
                  marginBottom: '12px',
                  boxSizing: 'border-box',
                }}
              />
              <input
                type="text"
                placeholder="Интересующий объект / ЖК"
                value={newObject}
                onChange={(e) => setNewObject(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #EAEAEA',
                  marginBottom: '20px',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="figma-kanban-move-btn"
                  style={{ padding: '8px 16px' }}
                  onClick={() => setIsNewLeadModalOpen(false)}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="figma-crm-add-btn"
                  style={{ padding: '8px 18px', fontSize: '14px' }}
                >
                  Создать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
