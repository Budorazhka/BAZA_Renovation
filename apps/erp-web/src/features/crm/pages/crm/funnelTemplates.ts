/**
 * Шаблоны воронок для канбана — те же этапы и колонки, что в dashboard-front.
 * Названия этапов совпадают с LeadsBlock (statusToLeadStageMap) для маппинга на LeadStage с бэкенда.
 *
 * `STAGE_NAME_TO_LEAD_STAGE`/`buildFunnelBoardsFromStageCounts` остаются НА
 * ЛЕГАСИ `LeadStage` enum намеренно (04.09.2026) — их всё ещё читают
 * useMeAnalyticsData/usePartnerAnalyticsBackend/useNetworkAnalyticsBackend
 * через `stageCountsByProductToArray`, а те получают `stageCountsByProduct`
 * с ЛЕГАСИ `GET /crm/analytics/lead-report`, ключи которого — этот самый
 * enum, не machine-id нового backend. Только `useFunnelsBackend.ts` (вкладка
 * "Продажи/Сеть/Собственник/Партнёры" на канбане) переведена на реальный
 * `GET /crm/reports/lead-funnel` — она использует ОТДЕЛЬНЫЙ
 * `STAGE_NAME_TO_LEAD_STAGE_V2`/параметр `stageMap` ниже, не трогая эту
 * карту и не ломая три analytics-хука, которые пока остаются на легаси.
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

/**
 * Machine-id стадий продукта `sales` НОВОГО backend
 * (apps/api/src/modules/crm/lead-stage-definitions.ts
 * `LEAD_STAGE_DEFINITIONS.sales`), в том же порядке, что русские имена
 * `STAGE_NAME_TO_LEAD_STAGE.RP` выше — позиционно соответствуют один в
 * один (сверено построчно), но САМИ ЗНАЧЕНИЯ другие: легаси `LeadStage`
 * enum описывает generic 22-стадийный пайплайн api-crm.baza.sale
 * (`rejected`/`first_contact`/`qualification`/...), который с новым
 * backend для продукта `sales` не пересекается вообще.
 */
const SALES_STAGE_IDS_V2 = [
  'defective', 'refused', 'no_answer_3', 'no_answer_2', 'no_answer_1',
  'new', 'callback', 'presented', 'country_discussed', 'need_identified',
  'need_adjusted', 'kp_sent', 'objections', 'deferred', 'warmup', 'showing',
  'deposit', 'deal', 'golden', 'check_in', 'referral', 'new_deals',
] as const;

/**
 * Вариант `STAGE_NAME_TO_LEAD_STAGE` для GET /crm/reports/lead-funnel
 * (useFunnelsBackend.ts) — `RP` (sales) заменён на machine-id нового
 * backend (см. SALES_STAGE_IDS_V2 докстринг), `Net`/`Owner`/`Agent` те же
 * значения, что легаси (`network_*`/`owner_*`/`agent_*` совпадают у обоих
 * backend дословно, замена не нужна).
 */
export const STAGE_NAME_TO_LEAD_STAGE_V2: Record<ProductTab, Record<string, string>> = {
  RP: {
    'Бракованный лид': SALES_STAGE_IDS_V2[0],
    'Отказ': SALES_STAGE_IDS_V2[1],
    'Не дозвонился 3': SALES_STAGE_IDS_V2[2],
    'Не дозвонился 2': SALES_STAGE_IDS_V2[3],
    'Не дозвонился 1': SALES_STAGE_IDS_V2[4],
    'Новый лид': SALES_STAGE_IDS_V2[5],
    'Попросил связаться позже': SALES_STAGE_IDS_V2[6],
    'Презентовали компанию': SALES_STAGE_IDS_V2[7],
    'Обсудили ситуацию в стране': SALES_STAGE_IDS_V2[8],
    'Выявлена потребность': SALES_STAGE_IDS_V2[9],
    'Потребность скорректирована': SALES_STAGE_IDS_V2[10],
    'Отправлено КП': SALES_STAGE_IDS_V2[11],
    'Отработка возражений': SALES_STAGE_IDS_V2[12],
    'Отложенный спрос': SALES_STAGE_IDS_V2[13],
    'Прогрев': SALES_STAGE_IDS_V2[14],
    'Показ': SALES_STAGE_IDS_V2[15],
    'Задаток получен': SALES_STAGE_IDS_V2[16],
    'Заключен договор': SALES_STAGE_IDS_V2[17],
    'Золотой фонд': SALES_STAGE_IDS_V2[18],
    ' Узнал как дела': SALES_STAGE_IDS_V2[19],
    'Взять рекомендацию': SALES_STAGE_IDS_V2[20],
    'Выявление потребности о новых сделках': SALES_STAGE_IDS_V2[21],
  },
  Net: STAGE_NAME_TO_LEAD_STAGE.Net,
  Owner: STAGE_NAME_TO_LEAD_STAGE.Owner,
  Agent: STAGE_NAME_TO_LEAD_STAGE.Agent,
};

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

/**
 * Строит FunnelBoard[] из ответа бэкенда (массив { stage, count }) по
 * шаблонам. `stageMap` — по умолчанию легаси `STAGE_NAME_TO_LEAD_STAGE`
 * (используется stageCountsByProductToArray-потребителями на легаси
 * lead-report); useFunnelsBackend.ts передаёт `STAGE_NAME_TO_LEAD_STAGE_V2`
 * явно (см. её докстринг).
 */
export function buildFunnelBoardsFromStageCounts(
  stageCounts: Array<{ stage: LeadStage | string; count: number }>,
  stageMap: Record<ProductTab, Record<string, LeadStage | string>> = STAGE_NAME_TO_LEAD_STAGE
): FunnelBoard[] {
  const byStage: Record<string, number> = {};
  for (const { stage, count } of stageCounts) {
    const key = normalizeStageKey(stage);
    byStage[key] = (byStage[key] ?? 0) + count;
  }

  return FUNNEL_TEMPLATES.map((template) => {
    const productTab = FUNNEL_ID_TO_TAB[template.id];
    const stageToLeadStage = stageMap[productTab];

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
