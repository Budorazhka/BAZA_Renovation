import type { SectionKind } from './schemas/community-section.schema';

export interface SeedSection {
  sectionId: string;
  name: string;
  kind: SectionKind;
  group?: string | null;
  icon: string;
  description: string;
  order: number;
}

/**
 * Разделы форума — структура платформы, не контент: создать раздел через API
 * нельзя. Фронтенд держит их зеркало для подписей и формы новой темы
 * (apps/erp-web/src/components/community/forum/forumData.ts, SECTIONS) —
 * тест communitySectionsSync следит, чтобы списки не разошлись.
 */
export const SEED_COMMUNITY_SECTIONS: SeedSection[] = [
  {
    sectionId: 'market',
    name: 'Лента рынка',
    kind: 'feed',
    icon: 'megaphone',
    description: 'Анонсы застройщиков, старты продаж и срочные новости рынка недвижимости',
    order: 1,
  },
  {
    sectionId: 'cases',
    name: 'Кейсы и опыт',
    kind: 'category',
    icon: 'briefcase',
    description: 'Разборы реальных сделок, сложных переговоров и практических кейсов',
    order: 2,
  },
  {
    sectionId: 'law',
    name: 'Юристы и налоги',
    kind: 'category',
    icon: 'scale',
    description: 'ДДУ, эскроу, налоги, ипотека и правовые риски при покупке',
    order: 3,
  },
  {
    sectionId: 'exchange',
    name: 'Биржа запросов (MLS)',
    kind: 'exchange',
    icon: 'arrow-left-right',
    description: 'Прямой обмен клиентами, со-брокинг и поиск партнерских объектов',
    order: 4,
  },
  {
    sectionId: 'showcase',
    name: 'Витрина объектов',
    kind: 'showcase',
    icon: 'building',
    description: 'Эксклюзивные предложения партнеров с подтвержденной комиссией',
    order: 5,
  },
  {
    sectionId: 'events',
    name: 'Мероприятия',
    kind: 'events',
    group: 'Кулуары',
    icon: 'calendar',
    description: 'Брокер-туры, вебинары девелоперов и закрытые встречи сообщества',
    order: 6,
  },
];

/**
 * 11.09.2026: до этой даты при каждом старте API в пустые коллекции
 * засевались темы от несуществующих людей и компаний («Алексей Смирнов, Grand
 * Realty» и др.) с накрученными просмотрами и мероприятия на октябрь 2026 «на
 * 34 и 89 участников». Засев убран; эти id вычищаются при старте из баз, куда
 * он уже успел записать. Настоящие темы получают id вида
 * `th-<timestamp>-<uuid>`, мероприятия через API не создаются — совпасть с
 * этими фиксированными строками они не могут.
 */
export const RETIRED_SEED_THREAD_IDS: readonly string[] = [
  'th-market-batumi-premiere',
  'th-law-cobroking-escrow',
  'th-exchange-buy-seek-vnzh',
];

export const RETIRED_SEED_EVENT_IDS: readonly string[] = [
  'ev-batumi-broker-tour-2026',
  'ev-international-tax-webinar',
];
