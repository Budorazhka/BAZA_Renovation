/**
 * Шаблоны воронок для канбана — те же этапы и колонки, что в dashboard-front.
 * Названия этапов совпадают с LeadsBlock (statusToLeadStageMap) для маппинга на LeadStage с бэкенда.
 */
import type { FunnelBoard, FunnelColumn, FunnelStage, FunnelId } from '@/types/analytics';
import { LeadStage } from '../../services/api';

type ProductTab = 'RP' | 'Net' | 'Owner' | 'Agent';

const FUNNEL_ID_TO_TAB: Record<FunnelId, ProductTab> = {
  sales: 'RP',
  network: 'Net',
  owner: 'Owner',
  broker: 'Agent',
};

/** Маппинг: воронка -> название этапа -> LeadStage (как в LeadsBlock) */
export const STAGE_NAME_TO_LEAD_STAGE: Record<ProductTab, Record<string, LeadStage>> = {
  RP: {
    'Бракованный лид': LeadStage.REJECTED,
    'Отказ': LeadStage.FIRST_CONTACT,
    'Не дозвонился 3': LeadStage.QUALIFICATION,
    'Не дозвонился 2': LeadStage.REJECTED1,
    'Не дозвонился 1': LeadStage.FIRST_CONTACT1,
    'Новый лид': LeadStage.NEEDS_ANALYSIS,
    'Попросил связаться позже': LeadStage.PRESENTATION,
    'Презентовали компанию': LeadStage.PROPOSAL,
    'Обсудили ситуацию в стране': LeadStage.NEGOTIATION,
    'Выявлена потребность': LeadStage.DECISION_MAKING,
    'Потребность скорректирована': LeadStage.CONTRACT_SIGNING,
    'Отправлено КП': LeadStage.ONBOARDING,
    'Отработка возражений': LeadStage.NEEDS_ANALYSIS1,
    'Отложенный спрос': LeadStage.PRESENTATION1,
    'Прогрев': LeadStage.PROPOSAL1,
    'Показ': LeadStage.NEGOTIATION1,
    'Задаток получен': LeadStage.DECISION_MAKING1,
    'Заключен договор': LeadStage.CONTRACT_SIGNING1,
    'Золотой фонд': LeadStage.DEAL_CLOSED,
    ' Узнал как дела': LeadStage.POST_PURCHASE_FOLLOWUP,
    'Взять рекомендацию': LeadStage.SATISFACTION_CHECK,
    'Выявление потребности о новых сделках': LeadStage.UPSELL_OPPORTUNITY,
  },
  Net: {
    'Бракованный лид': LeadStage.NETWORK_REJECTED_DEFECTIVE,
    'Отказ': LeadStage.NETWORK_REJECTED,
    'Не дозвонился 3': LeadStage.NETWORK_NO_CALL_3,
    'Не дозвонился 2': LeadStage.NETWORK_NO_CALL_2,
    'Не дозвонился 1': LeadStage.NETWORK_NO_CALL_1,
    'Новый лид': LeadStage.NETWORK_NEW_LEAD,
    'Попросил связаться позже': LeadStage.NETWORK_CALL_LATER,
    'Презентовали компанию и стратегию': LeadStage.NETWORK_COMPANY_PRESENTED,
    'Презентовали платформу': LeadStage.NETWORK_PLATFORM_PRESENTED,
    'Вручили оффер': LeadStage.NETWORK_OFFER_GIVEN,
    'Работа с возражениями': LeadStage.NETWORK_OBJECTIONS,
    'Отложенный спрос': LeadStage.NETWORK_DEFERRED_DEMAND,
    'Согласие': LeadStage.NETWORK_AGREEMENT,
    'Заполнена анкета': LeadStage.NETWORK_FORM_FILLED,
    'Регистрация в личном кабинете': LeadStage.NETWORK_ACCOUNT_REGISTERED,
    'Подписание оферты': LeadStage.NETWORK_OFFER_SIGNED,
    'Начало работы': LeadStage.NETWORK_WORK_STARTED,
  },
  Owner: {
    'Бракованный контакт': LeadStage.OWNER_REJECTED_DEFECTIVE,
    'Отказ собственника': LeadStage.OWNER_REJECTED_OWNER,
    'Недозвонился 3': LeadStage.OWNER_NO_CALL_3,
    'Недозвонился 2': LeadStage.OWNER_NO_CALL_2,
    'Недозвонился 1': LeadStage.OWNER_NO_CALL_1,
    'Новый собственник': LeadStage.OWNER_NEW_OWNER,
    'Попросил связаться позже': LeadStage.OWNER_CALL_LATER,
    'Презентовали компанию': LeadStage.OWNER_COMPANY_PRESENTED,
    'Обсудили объект и условия': LeadStage.OWNER_OBJECT_DISCUSSED,
    'Предложили фотосессия': LeadStage.OWNER_PHOTO_PROPOSED,
    'Предложен эксклюзив': LeadStage.OWNER_EXCLUSIVE_PROPOSED,
    'Отработали возражения': LeadStage.OWNER_OBJECTIONS,
    'Договорились о сотрудничестве': LeadStage.OWNER_AGREED,
    'Объект активен в продаже': LeadStage.OWNER_ACTIVE_FOR_SALE,
    'Взять рекомендацию': LeadStage.OWNER_GET_REFERRAL,
    'Узнать о новом объекте': LeadStage.OWNER_NEW_OBJECT_INQUIRY,
  },
  Agent: {
    'Бракованный контакт': LeadStage.AGENT_REJECTED_DEFECTIVE,
    'Отказ': LeadStage.AGENT_REJECTED,
    'Недозвонился 3': LeadStage.AGENT_NO_CALL_3,
    'Недозвонился 2': LeadStage.AGENT_NO_CALL_2,
    'Недозвонился 1': LeadStage.AGENT_NO_CALL_1,
    'Новый посредник': LeadStage.AGENT_NEW_AGENT,
    'Попросил связаться позже': LeadStage.AGENT_CALL_LATER,
    'Презентовали компанию': LeadStage.AGENT_COMPANY_PRESENTED,
    'Формат сотрудничества': LeadStage.AGENT_FORMAT,
    'Работа с возражениями': LeadStage.AGENT_OBJECTIONS,
    'Согласие сотрудничать': LeadStage.AGENT_AGREED,
    'Активный посредник': LeadStage.AGENT_ACTIVE,
  },
};

type FunnelTemplateColumn = {
  id: string;
  name: string;
  stages: string[];
};

type FunnelTemplate = {
  id: FunnelId;
  name: string;
  shortName: string;
  columns: FunnelTemplateColumn[];
};

const FUNNEL_TEMPLATES: FunnelTemplate[] = [
  {
    id: 'sales',
    name: 'Продажи',
    shortName: 'Продажи',
    columns: [
      { id: 'rejection', name: 'Отказ', stages: ['Бракованный лид', 'Отказ', 'Не дозвонился 3', 'Не дозвонился 2', 'Не дозвонился 1'] },
      {
        id: 'in_progress',
        name: 'В работе',
        stages: [
          'Новый лид',
          'Попросил связаться позже',
          'Презентовали компанию',
          'Обсудили ситуацию в стране',
          'Выявлена потребность',
          'Потребность скорректирована',
          'Отправлено КП',
          'Отработка возражений',
          'Отложенный спрос',
          'Прогрев',
          'Показ',
          'Задаток получен',
          'Заключен договор',
        ],
      },
      {
        id: 'success',
        name: 'Купили',
        stages: ['Золотой фонд', ' Узнал как дела', 'Взять рекомендацию', 'Выявление потребности о новых сделках'],
      },
    ],
  },
  {
    id: 'network',
    name: 'Сеть',
    shortName: 'Сеть',
    columns: [
      { id: 'rejection', name: 'Отказ', stages: ['Бракованный лид', 'Отказ', 'Не дозвонился 3', 'Не дозвонился 2', 'Не дозвонился 1'] },
      {
        id: 'in_progress',
        name: 'В работе',
        stages: [
          'Новый лид',
          'Попросил связаться позже',
          'Презентовали компанию и стратегию',
          'Презентовали платформу',
          'Вручили оффер',
          'Работа с возражениями',
          'Отложенный спрос',
          'Согласие',
          'Заполнена анкета',
          'Регистрация в личном кабинете',
          'Подписание оферты',
          'Начало работы',
        ],
      },
    ],
  },
  {
    id: 'owner',
    name: 'Собственник',
    shortName: 'Собственник',
    columns: [
      { id: 'rejection', name: 'Отказ', stages: ['Бракованный контакт', 'Отказ собственника', 'Недозвонился 3', 'Недозвонился 2', 'Недозвонился 1'] },
      {
        id: 'preparation',
        name: 'Подготовка',
        stages: [
          'Новый собственник',
          'Попросил связаться позже',
          'Презентовали компанию',
          'Обсудили объект и условия',
          'Предложили фотосессия',
          'Предложен эксклюзив',
          'Отработали возражения',
          'Договорились о сотрудничестве',
        ],
      },
      {
        id: 'in_progress',
        name: 'В работе',
        stages: ['Объект активен в продаже', 'Взять рекомендацию', 'Узнать о новом объекте'],
      },
    ],
  },
  {
    id: 'broker',
    name: 'Партнёры',
    shortName: 'Партнёры',
    columns: [
      { id: 'rejection', name: 'Отказ', stages: ['Бракованный контакт', 'Отказ', 'Недозвонился 3', 'Недозвонился 2', 'Недозвонился 1'] },
      {
        id: 'in_progress',
        name: 'В работе',
        stages: [
          'Новый посредник',
          'Попросил связаться позже',
          'Презентовали компанию',
          'Формат сотрудничества',
          'Работа с возражениями',
          'Согласие сотрудничать',
        ],
      },
      { id: 'active', name: 'Активный', stages: ['Активный посредник'] },
    ],
  },
];

function normalizeStageKey(stage: string | LeadStage): string {
  return (typeof stage === 'string' ? stage : String(stage)).toLowerCase().trim();
}

export type StageCountsByProduct = {
  sales?: Record<string, number>;
  network?: Record<string, number>;
  owner?: Record<string, number>;
  broker?: Record<string, number>;
};

/** Преобразует stageCountsByProduct из lead-report в массив для buildFunnelBoardsFromStageCounts */
export function stageCountsByProductToArray(
  stageCountsByProduct: StageCountsByProduct | null | undefined
): Array<{ stage: LeadStage | string; count: number }> {
  const arr: Array<{ stage: LeadStage | string; count: number }> = [];
  if (!stageCountsByProduct || typeof stageCountsByProduct !== 'object') return arr;
  const funnelIds: FunnelId[] = ['sales', 'network', 'owner', 'broker'];
  for (const funnelId of funnelIds) {
    const counts = stageCountsByProduct[funnelId];
    if (!counts || typeof counts !== 'object') continue;
    const productTab = FUNNEL_ID_TO_TAB[funnelId];
    const stageMap = STAGE_NAME_TO_LEAD_STAGE[productTab];
    if (!stageMap) continue;
    for (const [stageName, count] of Object.entries(counts)) {
      if (typeof count !== 'number') continue;
      const leadStage = stageMap[stageName];
      arr.push({ stage: leadStage ?? stageName, count });
    }
  }
  return arr;
}

/** Строит FunnelBoard[] из ответа бэкенда (массив { stage, count }) по шаблонам */
export function buildFunnelBoardsFromStageCounts(
  stageCounts: Array<{ stage: LeadStage | string; count: number }>
): FunnelBoard[] {
  const byStage: Record<string, number> = {};
  for (const { stage, count } of stageCounts) {
    const key = normalizeStageKey(stage);
    byStage[key] = (byStage[key] ?? 0) + count;
  }

  return FUNNEL_TEMPLATES.map((template) => {
    const productTab = FUNNEL_ID_TO_TAB[template.id];
    const stageToLeadStage = STAGE_NAME_TO_LEAD_STAGE[productTab];

    const columns: FunnelColumn[] = template.columns.map((col) => {
      const stages: FunnelStage[] = col.stages.map((stageName, idx) => {
        const leadStage = stageToLeadStage[stageName];
        const count =
          leadStage != null ? byStage[normalizeStageKey(leadStage)] ?? 0 : 0;
        return {
          id: `${template.id}-${col.id}-${idx + 1}`,
          name: stageName,
          order: idx + 1,
          count,
        };
      });
      const count = stages.reduce((s, st) => s + st.count, 0);
      return { id: col.id, name: col.name, count, stages };
    });

    const rejectionCount = columns.filter((c) => c.id === 'rejection').reduce((s, c) => s + c.count, 0);
    const closedCount = columns
      .filter((c) => c.id === 'success' || c.id === 'active')
      .reduce((s, c) => s + c.count, 0);
    const totalCount = columns.reduce((s, c) => s + c.count, 0);
    const activeCount = Math.max(0, totalCount - rejectionCount - closedCount);

    return {
      id: template.id,
      name: template.name,
      shortName: template.shortName,
      totalCount,
      activeCount,
      rejectionCount,
      closedCount,
      columns,
    };
  });
}
