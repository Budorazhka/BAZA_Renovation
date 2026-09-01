import type {
  DistributionRule,
  Lead,
  LeadEvent,
  LeadManager,
  LeadPartnerByEmail,
  LeadStage,
  LeadStageId,
  PortalUser,
} from '@/types/leads'

/**
 * Полные стадии воронки продаж (из шаблона sales в analytics-network).
 * Сгруппированы по колонкам: rejection → in_progress → success.
 */
export const LEAD_STAGES: LeadStage[] = [
  // --- rejection ---
  { id: 'defective',   name: 'Бракованный лид',     order: 1 },
  { id: 'refused',     name: 'Отказ',               order: 2 },
  { id: 'no_answer_3', name: 'Недозвонился 3',      order: 3 },
  { id: 'no_answer_2', name: 'Недозвонился 2',      order: 4 },
  { id: 'no_answer_1', name: 'Недозвонился 1',      order: 5 },
  // --- in_progress ---
  { id: 'new',              name: 'Новый лид',                    order: 6 },
  { id: 'callback',         name: 'Попросил связаться позже',     order: 7 },
  { id: 'presented',        name: 'Презентовали компанию',        order: 8 },
  { id: 'country_discussed', name: 'Обсудили ситуацию в стране',  order: 9 },
  { id: 'need_identified',  name: 'Выявлена потребность',         order: 10 },
  { id: 'need_adjusted',    name: 'Потребность скорректирована',  order: 11 },
  { id: 'kp_sent',          name: 'Отправлено КП',                order: 12 },
  { id: 'objections',       name: 'Отработка возражений',         order: 13 },
  { id: 'deferred',         name: 'Отложенный спрос',             order: 14 },
  { id: 'warmup',           name: 'Прогрев',                      order: 15 },
  { id: 'showing',          name: 'Показ',                        order: 16 },
  { id: 'deposit',          name: 'Задаток получен',              order: 17 },
  { id: 'deal',             name: 'Заключен договор',             order: 18 },
  // --- success (Золотой фонд) ---
  { id: 'golden',     name: 'Золотой фонд',                          order: 19 },
  { id: 'check_in',   name: 'Узнал как дела',                        order: 20 },
  { id: 'referral',   name: 'Взять рекомендацию',                    order: 21 },
  { id: 'new_deals',  name: 'Выявление потребности о новых сделках', order: 22 },
]

export type FunnelColumnId = 'rejection' | 'in_progress' | 'success'

export const LEAD_STAGE_COLUMN: Record<string, FunnelColumnId> = {
  defective:          'rejection',
  refused:            'rejection',
  no_answer_3:        'rejection',
  no_answer_2:        'rejection',
  no_answer_1:        'rejection',
  new:                'in_progress',
  callback:           'in_progress',
  presented:          'in_progress',
  country_discussed:  'in_progress',
  need_identified:    'in_progress',
  need_adjusted:      'in_progress',
  kp_sent:            'in_progress',
  objections:         'in_progress',
  deferred:           'in_progress',
  warmup:             'in_progress',
  showing:            'in_progress',
  deposit:            'in_progress',
  deal:               'in_progress',
  golden:             'success',
  check_in:           'success',
  referral:           'success',
  new_deals:          'success',
}

export const LEAD_STAGE_ORDER: readonly LeadStageId[] =
  LEAD_STAGES.map((s) => s.id)

/** Пользователи портала с доступом к админке лидов (мок) */
export const PORTAL_USERS: PortalUser[] = [
  {
    id: 'user-director',
    email: 'director@portal.test',
    displayName: 'Иван Директоров',
    leadAdminRole: 'director',
  },
  {
    id: 'user-rop',
    email: 'rop@portal.test',
    displayName: 'Пётр Ропов',
    leadAdminRole: 'rop',
  },
]

export const CURRENT_PORTAL_USER_ID = 'user-director'

export const INITIAL_LEAD_MANAGERS: LeadManager[] = [
  { id: 'lm-1', login: 'manager.primary@test.com', name: 'Анна Первичкина', sourceTypes: ['primary'] },
  { id: 'lm-2', login: 'manager.secondary@test.com', name: 'Борис Вторичкин', sourceTypes: ['secondary'] },
  { id: 'lm-3', login: 'manager.rent@test.com', name: 'Виктор Арендов', sourceTypes: ['rent'] },
  { id: 'lm-4', login: 'manager.ads@test.com', name: 'Галина Рекламова', sourceTypes: ['ad_campaigns'] },
  { id: 'lm-5', login: 'manager.multi@test.com', name: 'Дмитрий Универсалов', sourceTypes: ['primary', 'secondary'] },
]

export const INITIAL_LEAD_PARTNERS: LeadPartnerByEmail[] = [
  { id: 'lp-1', email: 'partner1@lk.test', sourceType: 'primary', cityId: 'batumi' },
  { id: 'lp-2', email: 'partner2@lk.test', sourceType: 'secondary', cityId: 'batumi' },
]

export const DEFAULT_DISTRIBUTION_RULE: DistributionRule = {
  type: 'round_robin',
  params: {},
}

export const DEFAULT_MANUAL_DISTRIBUTOR_ID: string | null = 'lm-5'

export const DEV_SECTION_LEAD: Lead = {
  id: 'lead-dev-demo',
  name: 'Дмитрий Захаров',
  phone: '+995 555 987 654',
  source: 'primary',
  stageId: 'need_identified',
  managerId: 'lm-1',
  createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  channel: 'form',
  hasTask: true,
  commissionUsd: 4200,
  status: 'in_progress',
}

export const INITIAL_LEAD_POOL: Lead[] = []
export const INITIAL_LEAD_HISTORY: Record<string, LeadEvent[]> = {}
