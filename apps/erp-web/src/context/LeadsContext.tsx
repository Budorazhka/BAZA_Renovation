import { createContext, useContext, useReducer, type ReactNode, useEffect, useCallback, useState } from 'react'
import { apiService } from '@/features/crm/services/api/service'
import { ProductType, TaskPriority } from '@/features/crm/services/api/types'
import { mapCrmLeadToPoker, mapCrmHistoryToPokerEvent, POKER_SOURCE_TO_CRM_PRODUCT, mapPokerIdToCrmStage } from '@/lib/crm-poker-adapter'
import { useAuth } from '@/context/AuthContext'
import { onPush, offPush } from '@/features/crm/services/socket'
import type {
  BuyerRegistration,
  DistributionRule,
  Lead,
  LeadEvent,
  LeadManager,
  LeadPartnerByEmail,
  LeadSource,
  LeadWithHistory,
} from '@/types/leads'
import {
  DEFAULT_DISTRIBUTION_RULE,
} from '@/data/leads-mock'

/** Для round_robin: следующий менеджер по кругу для данной очереди */
function getNextManagerIdRoundRobin(
  leadPool: Lead[],
  leadManagers: LeadManager[],
  source: LeadSource
): string | null {
  const managers = leadManagers
    .filter((m) => m.sourceTypes.includes(source))
    .sort((a, b) => a.id.localeCompare(b.id))
  if (managers.length === 0) return null
  const leadsInSource = leadPool.filter((l) => l.source === source)
  const index = leadsInSource.length % managers.length
  return managers[index].id
}

/** Для by_load: менеджер с наименьшей загрузкой по этой очереди */
function getNextManagerIdByLoad(
  leadPool: Lead[],
  leadManagers: LeadManager[],
  source: LeadSource
): string | null {
  const managers = leadManagers.filter((m) => m.sourceTypes.includes(source))
  if (managers.length === 0) return null
  const countByManager: Record<string, number> = {}
  managers.forEach((m) => { countByManager[m.id] = 0 })
  leadPool.filter((l) => l.source === source).forEach((l) => {
    if (l.managerId && countByManager[l.managerId] !== undefined) {
      countByManager[l.managerId]++
    }
  })
  let minId = managers[0].id
  let minCount = countByManager[minId] ?? 0
  managers.forEach((m) => {
    const c = countByManager[m.id] ?? 0
    if (c < minCount) {
      minCount = c
      minId = m.id
    }
  })
  return minId
}

export interface LeadsState {
  leadPool: Lead[]
  distributionRule: DistributionRule
  manualDistributorId: string | null
  leadManagers: LeadManager[]
  leadPartners: LeadPartnerByEmail[]
  /** История событий по лидам: leadId → события */
  leadHistory: Record<string, LeadEvent[]>
  /** Регистрации покупателей по лидам: leadId → регистрации */
  leadRegistrations: Record<string, BuyerRegistration[]>
}

export type LeadsAction =
  | { type: 'ADD_LEAD'; lead: Lead }
  | { type: 'ASSIGN_LEAD'; leadId: string; managerId: string }
  | { type: 'UNASSIGN_LEAD'; leadId: string }
  | { type: 'UPDATE_LEAD_STAGE'; leadId: string; stageId: string; authorId?: string; authorName?: string; fromStageName?: string; toStageName?: string }
  | { type: 'SET_DISTRIBUTION_RULE'; rule: DistributionRule }
  | { type: 'SET_MANUAL_DISTRIBUTOR'; managerId: string | null }
  | { type: 'ADD_LEAD_MANAGER'; manager: LeadManager }
  | { type: 'REMOVE_LEAD_MANAGER'; managerId: string }
  | { type: 'UPDATE_LEAD_MANAGER'; managerId: string; patch: Partial<LeadManager> }
  | { type: 'ADD_LEAD_PARTNER'; partner: LeadPartnerByEmail }
  | { type: 'REMOVE_LEAD_PARTNER'; partnerId: string }
  | { type: 'UPDATE_LEAD_PARTNER'; partnerId: string; patch: Partial<LeadPartnerByEmail> }
  | { type: 'ADD_LEAD_EVENT'; leadId: string; event: LeadEvent }
  | { type: 'ADD_BUYER_REGISTRATION'; leadId: string; registration: BuyerRegistration }
  | { type: 'BULK_REASSIGN_LEADS'; fromManagerId: string; toManagerId: string }
  | { type: 'UPDATE_LEAD_MANAGER_SUBSTITUTE'; managerId: string; patch: { isUnavailable?: boolean; substituteId?: string | null } }
  | { type: 'DELETE_LEAD_EVENT'; leadId: string; eventId: string }
  | { type: 'EDIT_LEAD_EVENT'; leadId: string; eventId: string; patch: { taskName?: string; deadline?: string; eisenhowerUrgent?: boolean; eisenhowerImportant?: boolean } }
  | { type: 'SET_LEADS'; leads: Lead[] }
  | { type: 'SET_LEAD_HISTORY'; historyMap: Record<string, LeadEvent[]> }
  | { type: 'SET_MANAGERS'; managers: LeadManager[] }

function leadsReducer(state: LeadsState, action: LeadsAction): LeadsState {
  switch (action.type) {
    case 'SET_MANAGERS':
      return { ...state, leadManagers: action.managers }
    case 'SET_LEAD_HISTORY':
      return { ...state, leadHistory: { ...state.leadHistory, ...action.historyMap } }
    case 'SET_LEADS':
      return { ...state, leadPool: action.leads }
    case 'ADD_LEAD': {
      const lead = action.lead
      let managerId: string | null = lead.managerId ?? null
      const rule = state.distributionRule.type
      const noManualDistributor = state.manualDistributorId == null
      if (noManualDistributor && rule === 'round_robin') {
        managerId = getNextManagerIdRoundRobin(state.leadPool, state.leadManagers, lead.source)
      } else if (noManualDistributor && rule === 'by_load') {
        managerId = getNextManagerIdByLoad(state.leadPool, state.leadManagers, lead.source)
      }
      const newLead: Lead = { ...lead, managerId }
      return { ...state, leadPool: [newLead, ...state.leadPool] }
    }
    case 'ASSIGN_LEAD':
      return {
        ...state,
        leadPool: state.leadPool.map((l) =>
          l.id === action.leadId ? { ...l, managerId: action.managerId } : l
        ),
      }
    case 'UNASSIGN_LEAD':
      return {
        ...state,
        leadPool: state.leadPool.map((l) =>
          l.id === action.leadId ? { ...l, managerId: null } : l
        ),
      }
    case 'UPDATE_LEAD_STAGE': {
      const now = new Date().toISOString()
      const prevLead = state.leadPool.find((l) => l.id === action.leadId)
      const stageEvent: LeadEvent = {
        id: `evt-${Date.now()}`,
        type: 'stage_change',
        timestamp: now,
        authorId: action.authorId ?? 'system',
        authorName: action.authorName ?? 'Система',
        payload: {
          fromStage: prevLead?.stageId,
          fromStageName: action.fromStageName,
          toStage: action.stageId,
          toStageName: action.toStageName,
        },
      }
      const prevHistory = state.leadHistory[action.leadId] ?? []
      return {
        ...state,
        leadPool: state.leadPool.map((l) =>
          l.id === action.leadId
            ? { ...l, stageId: action.stageId, updatedAt: now }
            : l
        ),
        leadHistory: {
          ...state.leadHistory,
          [action.leadId]: [...prevHistory, stageEvent],
        },
      }
    }
    case 'SET_DISTRIBUTION_RULE':
      return { ...state, distributionRule: action.rule }
    case 'SET_MANUAL_DISTRIBUTOR':
      return { ...state, manualDistributorId: action.managerId }
    case 'ADD_LEAD_MANAGER':
      return { ...state, leadManagers: [...state.leadManagers, action.manager] }
    case 'REMOVE_LEAD_MANAGER':
      return {
        ...state,
        leadManagers: state.leadManagers.filter((m) => m.id !== action.managerId),
        manualDistributorId:
          state.manualDistributorId === action.managerId ? null : state.manualDistributorId,
      }
    case 'UPDATE_LEAD_MANAGER':
      return {
        ...state,
        leadManagers: state.leadManagers.map((m) =>
          m.id === action.managerId ? { ...m, ...action.patch } : m
        ),
      }
    case 'ADD_LEAD_PARTNER':
      return { ...state, leadPartners: [...state.leadPartners, action.partner] }
    case 'REMOVE_LEAD_PARTNER':
      return {
        ...state,
        leadPartners: state.leadPartners.filter((p) => p.id !== action.partnerId),
      }
    case 'UPDATE_LEAD_PARTNER':
      return {
        ...state,
        leadPartners: state.leadPartners.map((p) =>
          p.id === action.partnerId ? { ...p, ...action.patch } : p
        ),
      }
    case 'ADD_LEAD_EVENT': {
      const prev = state.leadHistory[action.leadId] ?? []
      return {
        ...state,
        leadHistory: { ...state.leadHistory, [action.leadId]: [...prev, action.event] },
      }
    }
    case 'DELETE_LEAD_EVENT': {
      const prev = state.leadHistory[action.leadId] ?? []
      return {
        ...state,
        leadHistory: {
          ...state.leadHistory,
          [action.leadId]: prev.filter((evt) => evt.id !== action.eventId),
        },
      }
    }
    case 'EDIT_LEAD_EVENT': {
      const prev = state.leadHistory[action.leadId] ?? []
      return {
        ...state,
        leadHistory: {
          ...state.leadHistory,
          [action.leadId]: prev.map((evt) =>
            evt.id === action.eventId
              ? { ...evt, payload: { ...evt.payload, ...action.patch } as LeadEvent['payload'] }
              : evt
          ),
        },
      }
    }
    case 'ADD_BUYER_REGISTRATION': {
      const prev = state.leadRegistrations[action.leadId] ?? []
      return {
        ...state,
        leadRegistrations: {
          ...state.leadRegistrations,
          [action.leadId]: [...prev, action.registration],
        },
      }
    }
    case 'BULK_REASSIGN_LEADS':
      return {
        ...state,
        leadPool: state.leadPool.map((l) =>
          l.managerId === action.fromManagerId
            ? { ...l, managerId: action.toManagerId }
            : l
        ),
      }
    case 'UPDATE_LEAD_MANAGER_SUBSTITUTE':
      return {
        ...state,
        leadManagers: state.leadManagers.map((m) =>
          m.id === action.managerId ? { ...m, ...action.patch } : m
        ),
      }
    default:
      return state
  }
}

const initialState: LeadsState = {
  leadPool: [],
  distributionRule: DEFAULT_DISTRIBUTION_RULE,
  manualDistributorId: null,
  leadManagers: [],
  leadPartners: [],
  leadHistory: {},
  leadRegistrations: {},
}

type LeadsContextValue = {
  state: LeadsState
  dispatch: React.Dispatch<LeadsAction>
  leadManagers: LeadManager[]
  /** Лиды по источнику (очереди) */
  leadsBySource: (source: LeadSource) => Lead[]
  /** Идёт автоназначение (по кругу / по загрузке) без ручного распределителя */
  isAutoDistribution: boolean
  /** Получить лид с историей и регистрациями */
  getLeadWithHistory: (leadId: string) => LeadWithHistory | null
  /** Состояние загрузки данных из CRM */
  isLoading: boolean
}

const LeadsContext = createContext<LeadsContextValue | null>(null)

export function LeadsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(leadsReducer, initialState)
  const [isLoading, setIsLoading] = useState(false)
  const { currentUser } = useAuth()

  // Синхронизация с реальным CRM API
  const fetchLeads = useCallback(async () => {
    setIsLoading(true)
    try {
      const [leadsRes, settingsRes, tasksRes] = await Promise.all([
        apiService.getLeads({ page: 1, limit: 1000 }),
        apiService.getDistributionSettings(),
        apiService.getTasks({ page: 1, limit: 1000 })
      ])

      if (leadsRes.success && leadsRes.data) {
        const historyMap: Record<string, LeadEvent[]> = {}
        const managersMap = new Map<string, LeadManager>()
        
        const tasksByLeadId = new Map<string, any[]>()
        if (tasksRes.success && tasksRes.data) {
          tasksRes.data.items.forEach(t => {
            const lid = typeof t.leadId === 'string' ? t.leadId : (t.leadId as any)?._id
            if (lid) {
              const existing = tasksByLeadId.get(lid) || []
              tasksByLeadId.set(lid, [...existing, t])
            }
          })
        }

        const pokerLeads = leadsRes.data.items.map(crmLead => {
          const pokerLead = mapCrmLeadToPoker(crmLead)
          const leadTasks = tasksByLeadId.get(crmLead._id) || []
          const now = new Date()

          // Если бэкенд не прислал флаги (false), считаем сами на основе подгруженных задач
          if (!pokerLead.hasTask) {
            pokerLead.hasTask = leadTasks.length > 0
          }
          if (!pokerLead.taskOverdue) {
            pokerLead.taskOverdue = leadTasks.some(t => {
              if (t.status === 'completed') return false
              return t.endDate && new Date(t.endDate) < now
            })
          }

          if (crmLead.history) {
            historyMap[crmLead._id] = crmLead.history.map((h, i) => mapCrmHistoryToPokerEvent(h, i))
          }
          
          const assigned = crmLead.assignedTo
          if (assigned && typeof assigned === 'object' && '_id' in assigned) {
            const assignedObj = assigned as { _id: string; name?: string; email?: string }
            managersMap.set(assignedObj._id, {
              id: assignedObj._id,
              name: assignedObj.name || 'Без имени',
              login: assignedObj.email || '',
              sourceTypes: ['primary', 'secondary', 'rent', 'ad_campaigns']
            })
          }
          return pokerLead
        })

        dispatch({ type: 'SET_LEADS', leads: pokerLeads })
        dispatch({ type: 'SET_LEAD_HISTORY', historyMap })
        
        const managers = Array.from(managersMap.values())
        if (managers.length > 0) {
          dispatch({ type: 'SET_MANAGERS', managers })
        }
      }

      if (settingsRes.success && settingsRes.data) {
        dispatch({ type: 'SET_DISTRIBUTION_RULE', rule: { type: settingsRes.data.type } })
        dispatch({ type: 'SET_MANUAL_DISTRIBUTOR', managerId: settingsRes.data.manualDistributorId })
      }
    } catch (err) {
      console.error('[LeadsContext] Failed to fetch leads from CRM:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Real-time Sync via WebSockets
  useEffect(() => {
    const handleLeadPush = (env: any) => {
      const crmLead = env.data
      if (crmLead && crmLead._id) {
        const pokerLead = mapCrmLeadToPoker(crmLead)
        dispatch({ type: 'SET_LEADS', leads: state.leadPool.map(l => l.id === pokerLead.id ? pokerLead : l) })
      }
    }

    const handleTaskPush = () => {
      fetchLeads()
    }

    const sub1 = onPush('lead:updated', handleLeadPush)
    const sub2 = onPush('lead:created', handleLeadPush)
    const sub3 = onPush('task:updated', handleTaskPush)
    const sub4 = onPush('task:created', handleTaskPush)

    return () => {
      offPush('lead:updated', sub1)
      offPush('lead:created', sub2)
      offPush('task:updated', sub3)
      offPush('task:created', sub4)
    }
  }, [state.leadPool, fetchLeads])

  useEffect(() => {
    if (localStorage.getItem('jwt_token') || currentUser) {
      fetchLeads()
    }
  }, [currentUser, fetchLeads])

  /** Обертка над dispatch для синхронизации с API */
  const dispatchWithSync = useCallback(async (action: LeadsAction) => {
    // Сначала обновляем локально (оптимистично)
    dispatch(action)

    try {
      // 1. Смена стадии
      if (action.type === 'UPDATE_LEAD_STAGE') {
        const lead = state.leadPool.find((l) => l.id === action.leadId)
        const productType = lead ? POKER_SOURCE_TO_CRM_PRODUCT[lead.source] : ProductType.SALES
        const crmStage = mapPokerIdToCrmStage(action.stageId, productType)
        if (crmStage) {
          await apiService.updateLeadStage(action.leadId, { stage: crmStage })
        }
      }

      // 2. Назначение менеджера
      if (action.type === 'ASSIGN_LEAD') {
        await apiService.updateLead(action.leadId, { assignedTo: action.managerId })
      }

      // 3. Создание лида
      if (action.type === 'ADD_LEAD') {
        const { lead } = action
        await apiService.createLead({
          name: lead.name || 'Новый лид',
          phone: lead.phone || '',
          productType: POKER_SOURCE_TO_CRM_PRODUCT[lead.source] || ProductType.SALES,
          assignedTo: lead.managerId || '',
          source: lead.channel || 'other',
        })
      }

      // 4. Настройки распределения
      if (action.type === 'SET_DISTRIBUTION_RULE' || action.type === 'SET_MANUAL_DISTRIBUTOR') {
        const currentType = action.type === 'SET_DISTRIBUTION_RULE' ? action.rule.type : state.distributionRule.type
        const currentManualId = action.type === 'SET_MANUAL_DISTRIBUTOR' ? action.managerId : state.manualDistributorId
        
        await apiService.updateDistributionSettings({
          type: currentType as any,
          manualDistributorId: currentManualId
        })
      }

      // 5. Массовая передача
      if (action.type === 'BULK_REASSIGN_LEADS') {
        await apiService.bulkReassignLeads(action.fromManagerId, action.toManagerId)
      }

      // 6. Создание задач через события истории
      if (action.type === 'ADD_LEAD_EVENT') {
        const { event, leadId } = action
        if (event.type === 'task_created' && event.payload.taskName) {
          let priority = TaskPriority.NOT_URGENT_IMPORTANT;
          if (event.payload.eisenhowerUrgent && event.payload.eisenhowerImportant) {
             priority = TaskPriority.URGENT_IMPORTANT;
          } else if (event.payload.eisenhowerUrgent) {
             priority = TaskPriority.URGENT_NOT_IMPORTANT;
          } else if (!event.payload.eisenhowerImportant) {
             priority = TaskPriority.NOT_URGENT_NOT_IMPORTANT;
          }

          await apiService.createTask({
            title: event.payload.taskName,
            leadId: leadId,
            endDate: event.payload.deadline,
            priority,
            assignedTo: currentUser?.id || '',
            // @ts-ignore
            description: `Создано из воронки: ${event.payload.comment || ''}`
          })
        }
      }

    } catch (err) {
      console.error(`[LeadsContext] Sync failed for ${action.type}:`, err)
    }
  }, [state.distributionRule.type, state.manualDistributorId])

  const leadsBySource = (source: LeadSource) =>
    state.leadPool.filter((l) => l.source === source)

  const isAutoDistribution =
    state.distributionRule.type !== 'manual' && state.manualDistributorId == null

  const getLeadWithHistory = (leadId: string): LeadWithHistory | null => {
    const lead = state.leadPool.find((l) => l.id === leadId)
    if (!lead) return null
    return {
      ...lead,
      history: state.leadHistory[leadId] ?? [],
      registrations: state.leadRegistrations[leadId] ?? [],
    }
  }

  return (
    <LeadsContext.Provider
      value={{
        state,
        dispatch: dispatchWithSync as any, // Подменяем обычный dispatch на версию с синхронизацией
        leadManagers: state.leadManagers,
        leadsBySource,
        isAutoDistribution,
        getLeadWithHistory,
        isLoading,
      }}
    >
      {children}
    </LeadsContext.Provider>
  )
}

export function useLeads() {
  const ctx = useContext(LeadsContext)
  if (!ctx) throw new Error('useLeads must be used within LeadsProvider')
  return ctx
}
