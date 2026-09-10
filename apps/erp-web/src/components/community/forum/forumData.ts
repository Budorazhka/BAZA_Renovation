// Данные форума сообщества (mock). Обмен с боевым API включается позже —
// структура повторяет связку с CRM (crmContactId) из CommunityPanelPage.

export type Segment = 'broker' | 'developer' | 'partner' | 'agent'
export type CommunityRole = 'member' | 'expert' | 'moderator' | 'partner_admin'

/** Тип темы определяет поведение треда и набор полей. */
export type ThreadType = 'discussion' | 'question' | 'announcement' | 'exchange' | 'showcase'

/** Сторона биржевого «стакана». */
export type ExchangeSide = 'demand' | 'supply'

/** Интент биржевого объявления. */
export type ExchangeIntent =
  | 'rent_seek' // ИЩУ · Аренда
  | 'buy_seek' // ИЩУ · Покупка
  | 'partner_seek' // ИЩУ партнёра
  | 'client_handover' // ОТДАЮ КЛИЕНТА (co-broking)
  | 'rent_offer' // СДАЮ
  | 'sale_offer' // ПРОДАЮ
  | 'service_offer' // ПРЕДЛАГАЮ услугу

export type ExchangeStatus = 'open' | 'in_work' | 'closed'

/** Раздел форума. */
export type SectionKind = 'feed' | 'category' | 'exchange' | 'showcase' | 'events'

export interface ForumSection {
  id: string
  name: string
  kind: SectionKind
  /** Группа в левом рельсе (например «Кулуары»). */
  group?: string
  icon: string
  description: string
  threads: number
}

export interface ForumMember {
  id: string
  name: string
  segment: Segment
  role: CommunityRole
  company: string
  city: string
  /** Связка с контактом CRM (демо-идентификатор). */
  crmContactId: string
  joined: string
  lastActiveLabel: string
  trustIndex: number
  solvedQuestions: number
  cobrokingDeals: number
  eventsYtd: number
  reactionsReceived: number
  /** Бейджи верификации. */
  badges: string[]
}

export interface ExchangeMeta {
  intent: ExchangeIntent
  side: ExchangeSide
  dealKind: string
  location: string
  /** Готовая подпись суммы, например «до $400 000» или «$2 100 / мес». */
  amount: string
  commission?: string
  deadline?: string
  status: ExchangeStatus
}

export interface ForumThread {
  id: string
  type: ThreadType
  sectionId: string
  title: string
  excerpt: string
  authorId: string
  createdAgo: string
  lastActiveAgo: string
  views: number
  reactions: number
  replyCount: number
  tags: string[]
  pinned?: boolean
  solved?: boolean
  exchange?: ExchangeMeta
}

export interface ForumReply {
  id: string
  threadId: string
  authorId: string
  createdAgo: string
  reactions: number
  body: string
  isBest?: boolean
}

export interface ForumEvent {
  id: string
  title: string
  date: string
  format: 'online' | 'offline'
  city: string
  registrationOpen: boolean
}

// ─── Подписи ───────────────────────────────────────────────────────────────

export const SEGMENT_LABEL: Record<Segment, string> = {
  broker: 'Брокер',
  developer: 'Застройщик',
  partner: 'Партнёр-сервис',
  agent: 'Агент',
}

export const ROLE_LABEL: Record<CommunityRole, string> = {
  member: 'Участник',
  expert: 'Эксперт',
  moderator: 'Модератор',
  partner_admin: 'Админ компании',
}

export const THREAD_TYPE_LABEL: Record<ThreadType, string> = {
  discussion: 'Обсуждение',
  question: 'Вопрос',
  announcement: 'Анонс',
  exchange: 'Биржа',
  showcase: 'Новостройки',
}

export const INTENT_LABEL: Record<ExchangeIntent, string> = {
  rent_seek: 'ИЩУ · Аренда',
  buy_seek: 'ИЩУ · Покупка',
  partner_seek: 'ИЩУ партнёра',
  client_handover: 'Отдаю клиента',
  rent_offer: 'Сдаю',
  sale_offer: 'Продаю',
  service_offer: 'Предлагаю',
}

export const INTENT_SIDE: Record<ExchangeIntent, ExchangeSide> = {
  rent_seek: 'demand',
  buy_seek: 'demand',
  partner_seek: 'demand',
  client_handover: 'supply',
  rent_offer: 'supply',
  sale_offer: 'supply',
  service_offer: 'supply',
}

export const STATUS_LABEL: Record<ExchangeStatus, string> = {
  open: 'Открыт',
  in_work: 'В работе',
  closed: 'Закрыт',
}

// ─── Разделы ─────────────────────────────────────────────────────────────────

// Зеркало разделов API (apps/api/src/modules/community/community-seed-data.ts,
// SEED_COMMUNITY_SECTIONS): отсюда берутся подписи и список разделов в форме
// новой темы. До 11.09.2026 здесь были свои девять разделов — четыре из них
// (ипотека, маркетинг, технологии, нетворкинг) API не знает, и публикация в
// них падала с 404, а раздела «Кейсы и опыт» в форме не было вовсе. Тест
// tests/unit/communitySectionsSync.test.ts не даёт спискам разойтись снова.
// Счётчик тем здесь 0: настоящие числа левый рельс берёт из GET /community/sections.
export const SECTIONS: ForumSection[] = [
  { id: 'market', name: 'Лента рынка', kind: 'feed', icon: 'megaphone', description: 'Анонсы застройщиков, старты продаж и срочные новости рынка недвижимости', threads: 0 },
  { id: 'cases', name: 'Кейсы и опыт', kind: 'category', icon: 'briefcase', description: 'Разборы реальных сделок, сложных переговоров и практических кейсов', threads: 0 },
  { id: 'law', name: 'Юристы и налоги', kind: 'category', icon: 'scale', description: 'ДДУ, эскроу, налоги, ипотека и правовые риски при покупке', threads: 0 },
  { id: 'exchange', name: 'Биржа запросов (MLS)', kind: 'exchange', icon: 'arrow-left-right', description: 'Прямой обмен клиентами, со-брокинг и поиск партнерских объектов', threads: 0 },
  { id: 'showcase', name: 'Витрина объектов', kind: 'showcase', icon: 'building', description: 'Эксклюзивные предложения партнеров с подтвержденной комиссией', threads: 0 },
  { id: 'events', name: 'Мероприятия', kind: 'events', group: 'Кулуары', icon: 'calendar', description: 'Брокер-туры, вебинары девелоперов и закрытые встречи сообщества', threads: 0 },
]

export function getSection(id: string): ForumSection | undefined {
  return SECTIONS.find((s) => s.id === id)
}

// ─── Участники ───────────────────────────────────────────────────────────────

export const MEMBERS: ForumMember[] = [
  { id: 'm1', name: 'Ирина Соколова', segment: 'broker', role: 'moderator', company: 'Альфа-недвижимость', city: 'Москва', crmContactId: 'crm-c-901', joined: '06.2024', lastActiveLabel: 'сегодня', trustIndex: 92, solvedQuestions: 7, cobrokingDeals: 4, eventsYtd: 9, reactionsReceived: 184, badges: ['Проверенный брокер', 'Модератор'] },
  { id: 'm2', name: 'Георгий Мамедов', segment: 'broker', role: 'expert', company: 'GeoPrime Realty', city: 'Москва', crmContactId: 'crm-c-902', joined: '01.2025', lastActiveLabel: '3 ч назад', trustIndex: 78, solvedQuestions: 12, cobrokingDeals: 2, eventsYtd: 6, reactionsReceived: 96, badges: ['Эксперт · право'] },
  { id: 'm3', name: 'Елена Воронова', segment: 'developer', role: 'partner_admin', company: 'ГК «Север»', city: 'Москва', crmContactId: 'crm-c-903', joined: '11.2023', lastActiveLabel: 'сегодня', trustIndex: 88, solvedQuestions: 3, cobrokingDeals: 0, eventsYtd: 11, reactionsReceived: 142, badges: ['Застройщик'] },
  { id: 'm4', name: 'Олег Панин', segment: 'partner', role: 'expert', company: 'LegalPro', city: 'Москва', crmContactId: 'crm-c-904', joined: '03.2025', lastActiveLabel: '1 дн назад', trustIndex: 74, solvedQuestions: 19, cobrokingDeals: 0, eventsYtd: 2, reactionsReceived: 118, badges: ['Эксперт · юрист'] },
  { id: 'm5', name: 'Мария Ким', segment: 'broker', role: 'member', company: 'Сити Экспресс', city: 'СПб', crmContactId: 'crm-c-905', joined: '09.2024', lastActiveLabel: '2 ч назад', trustIndex: 81, solvedQuestions: 4, cobrokingDeals: 6, eventsYtd: 7, reactionsReceived: 88, badges: ['Проверенный брокер'] },
  { id: 'm6', name: 'Артём Зайцев', segment: 'partner', role: 'expert', company: 'Mortgage Hub', city: 'Москва', crmContactId: 'crm-c-906', joined: '02.2024', lastActiveLabel: '8 ч назад', trustIndex: 69, solvedQuestions: 9, cobrokingDeals: 1, eventsYtd: 4, reactionsReceived: 74, badges: ['Эксперт · ипотека'] },
  { id: 'm7', name: 'Дмитрий Новацкий', segment: 'agent', role: 'member', company: 'West Capital Homes', city: 'Казань', crmContactId: '—', joined: '02.2025', lastActiveLabel: '3 дн назад', trustIndex: 38, solvedQuestions: 1, cobrokingDeals: 0, eventsYtd: 1, reactionsReceived: 21, badges: [] },
  { id: 'sys', name: 'BAZA Сообщество', segment: 'partner', role: 'moderator', company: 'Система', city: '—', crmContactId: '—', joined: '—', lastActiveLabel: 'сегодня', trustIndex: 100, solvedQuestions: 0, cobrokingDeals: 0, eventsYtd: 0, reactionsReceived: 0, badges: ['Система'] },
]

export function getMember(id: string): ForumMember | undefined {
  return MEMBERS.find((m) => m.id === id)
}

// ─── Треды ───────────────────────────────────────────────────────────────────

export const THREADS: ForumThread[] = [
  {
    id: 't1', type: 'announcement', sectionId: 'market', authorId: 'm3',
    title: 'Старт продаж ЖК «Грин Парк» — комиссия агентам 4.5%',
    excerpt: 'Открыли продажи первой очереди: 32 лота, студии и двушки от $95 000. Для партнёров — повышенная комиссия до конца квартала.',
    createdAgo: '2 ч', lastActiveAgo: '40 мин', views: 312, reactions: 18, replyCount: 6, tags: ['жк-грин-парк', 'старт-продаж'],
  },
  {
    id: 't2', type: 'question', sectionId: 'law', authorId: 'm2',
    title: 'Как оформить эскроу при переуступке ДДУ?',
    excerpt: 'Клиент покупает по переуступке. Нужно понять порядок переоформления эскроу-счёта на нового дольщика — кто инициирует и какие документы.',
    createdAgo: '5 ч', lastActiveAgo: '1 ч', views: 287, reactions: 9, replyCount: 14, tags: ['эскроу', 'переуступка', 'дду'], solved: true,
  },
  {
    id: 't3', type: 'exchange', sectionId: 'exchange', authorId: 'm5',
    title: 'Отдаю клиента под комиссию — готов к сделке',
    excerpt: 'Клиент с одобренной ипотекой ищет вторичку. Нужен партнёр с объектами в районе. Делюсь комиссией.',
    createdAgo: 'вчера', lastActiveAgo: '2 ч', views: 164, reactions: 4, replyCount: 11, tags: ['co-broking', 'спб'],
    exchange: { intent: 'client_handover', side: 'supply', dealKind: 'Покупка, вторичка', location: 'СПб, Приморский', amount: 'до $400 000', commission: '30% от агентской', deadline: 'до 30.04', status: 'open' },
  },
  {
    id: 't4', type: 'discussion', sectionId: 'law', authorId: 'm1',
    title: 'Стандарты показов в новостройке: чек-лист',
    excerpt: 'Собираем общий чек-лист показа в строящемся ЖК — что показывать, о чём предупреждать клиента, как фиксировать договорённости.',
    createdAgo: '1 дн', lastActiveAgo: '1 ч', views: 410, reactions: 31, replyCount: 28, tags: ['показы', 'стандарты'], pinned: true,
  },
  {
    id: 't5', type: 'exchange', sectionId: 'exchange', authorId: 'm5',
    title: 'ИЩУ 2-комнатную в аренду для клиента',
    excerpt: 'Семья, без животных, на год+. Рассмотрю варианты в центре. Готов на быстрый показ.',
    createdAgo: '2 ч', lastActiveAgo: '30 мин', views: 92, reactions: 2, replyCount: 4, tags: ['аренда', 'москва'],
    exchange: { intent: 'rent_seek', side: 'demand', dealKind: 'Аренда, жилая', location: 'Москва, ЦАО', amount: 'до $1 800 / мес', deadline: 'до 20.04', status: 'open' },
  },
  {
    id: 't6', type: 'exchange', sectionId: 'exchange', authorId: 'm5',
    title: 'СДАЮ 3-комнатную, Петроградка',
    excerpt: 'Свежий ремонт, мебель, паркинг. Заселение с 1 мая. Готов делиться комиссией с со-агентом.',
    createdAgo: '5 ч', lastActiveAgo: '3 ч', views: 138, reactions: 6, replyCount: 7, tags: ['аренда', 'спб'],
    exchange: { intent: 'rent_offer', side: 'supply', dealKind: 'Аренда, жилая', location: 'СПб, Петроградка', amount: '$2 100 / мес', commission: '50% за со-агента', deadline: 'с 01.05', status: 'open' },
  },
  {
    id: 't7', type: 'exchange', sectionId: 'exchange', authorId: 'm2',
    title: 'ПРОДАЮ дом в Подмосковье — эксклюзив',
    excerpt: 'Загородный дом 220 м², участок 12 соток. Эксклюзивный договор. Высокая комиссия для приведшего покупателя.',
    createdAgo: '1 дн', lastActiveAgo: '6 ч', views: 201, reactions: 5, replyCount: 2, tags: ['продажа', 'загород'],
    exchange: { intent: 'sale_offer', side: 'supply', dealKind: 'Продажа, дом', location: 'МО, Истринский', amount: '$620 000', commission: '40% со-агенту', status: 'open' },
  },
  {
    id: 't8', type: 'exchange', sectionId: 'exchange', authorId: 'm7',
    title: 'ИЩУ партнёра на показ в Казани',
    excerpt: 'Не успеваю на показ по объекту клиента. Нужен локальный агент, доля по договорённости.',
    createdAgo: '3 дн', lastActiveAgo: '2 дн', views: 77, reactions: 1, replyCount: 3, tags: ['партнёр', 'казань'],
    exchange: { intent: 'partner_seek', side: 'demand', dealKind: 'Совместный показ', location: 'Казань', amount: 'по договорённости', commission: '25%', status: 'in_work' },
  },
  {
    id: 't9', type: 'exchange', sectionId: 'exchange', authorId: 'm6',
    title: 'ПРЕДЛАГАЮ: ипотечный брокер, одобрение за 1 день',
    excerpt: 'Сопровождаю сделки агентов: подбор программы, ускоренное одобрение, рефинансирование. Без комиссии с агента.',
    createdAgo: '6 ч', lastActiveAgo: '4 ч', views: 119, reactions: 7, replyCount: 5, tags: ['ипотека', 'услуга'],
    exchange: { intent: 'service_offer', side: 'supply', dealKind: 'Ипотечное сопровождение', location: 'Онлайн', amount: 'бесплатно для агента', status: 'open' },
  },
  {
    id: 't10', type: 'question', sectionId: 'mortgage', authorId: 'm7',
    title: 'Налог при продаже квартиры до 5 лет владения',
    excerpt: 'Клиент продаёт квартиру, в собственности 3 года. Как корректно посчитать налог и какие есть вычеты?',
    createdAgo: '2 дн', lastActiveAgo: '1 дн', views: 156, reactions: 2, replyCount: 3, tags: ['налоги'],
  },
  {
    id: 't11', type: 'discussion', sectionId: 'mortgage', authorId: 'm6',
    title: 'Кейс: сделка с маткапиталом + ипотека',
    excerpt: 'Разбираю реальную сделку, где совместили материнский капитал и ипотеку. Подводные камни и тайминг.',
    createdAgo: '8 ч', lastActiveAgo: '2 ч', views: 233, reactions: 17, replyCount: 11, tags: ['маткапитал', 'ипотека'],
  },
  {
    id: 't12', type: 'announcement', sectionId: 'market', authorId: 'sys',
    title: 'Изменения в 214-ФЗ с июля — что меняется для агентов',
    excerpt: 'Краткая сводка поправок и как они влияют на сопровождение сделок в новостройках.',
    createdAgo: 'вчера', lastActiveAgo: '5 ч', views: 489, reactions: 24, replyCount: 6, tags: ['214-фз', 'право'],
  },
  {
    id: 't13', type: 'showcase', sectionId: 'showcase', authorId: 'm3',
    title: 'ГК «Север»: 14 ЖК, комиссия агентам до 5%',
    excerpt: 'Новостройки застройщика: актуальные проекты, условия для агентов и прямой контакт отдела брокериджа.',
    createdAgo: '3 дн', lastActiveAgo: '1 дн', views: 612, reactions: 22, replyCount: 9, tags: ['застройщик', 'витрина'],
  },
]

export function getThread(id: string): ForumThread | undefined {
  return THREADS.find((t) => t.id === id)
}

export function threadsBySection(sectionId: string): ForumThread[] {
  return THREADS.filter((t) => t.sectionId === sectionId)
}

export function exchangeThreads(): ForumThread[] {
  return THREADS.filter((t) => t.type === 'exchange' && t.exchange)
}

export function threadsByAuthor(authorId: string): ForumThread[] {
  return THREADS.filter((t) => t.authorId === authorId)
}

// ─── Ответы ──────────────────────────────────────────────────────────────────

export const REPLIES: ForumReply[] = [
  { id: 'r1', threadId: 't2', authorId: 'm4', createdAgo: '4 ч', reactions: 22, isBest: true, body: 'При переуступке эскроу-счёт переоформляется на нового дольщика через банк-эскроу-агент. Инициирует уступающая сторона: подаётся заявление в банк вместе с зарегистрированным договором уступки. Деньги остаются на счёте, меняется только бенефициар.' },
  { id: 'r2', threadId: 't2', authorId: 'm1', createdAgo: '4 ч', reactions: 6, body: 'Добавлю: уточняйте у конкретного банка регламент — у некоторых нужен личный визит обеих сторон, у других достаточно дистанционного оформления.' },
  { id: 'r3', threadId: 't2', authorId: 'm7', createdAgo: '3 ч', reactions: 1, body: 'А если застройщик против переуступки до ввода в эксплуатацию — это законно ограничивать?' },
  { id: 'r4', threadId: 't3', authorId: 'm6', createdAgo: '2 ч', reactions: 3, body: 'Есть клиент-покупатель под ипотеку, бюджет совпадает. Готов взять в работу — напишу в личные.' },
  { id: 'r5', threadId: 't3', authorId: 'm2', createdAgo: '5 ч', reactions: 2, body: 'Есть пара вариантов на Комендантском в том же бюджете. Уточните, нужен ли паркинг.' },
  { id: 'r6', threadId: 't1', authorId: 'm5', createdAgo: '1 ч', reactions: 4, body: 'Какие сроки сдачи первой очереди и есть ли субсидированная ипотека от застройщика?' },
  { id: 'r7', threadId: 't1', authorId: 'm3', createdAgo: '50 мин', reactions: 2, body: 'Сдача — 4 квартал 2027. Субсидированная программа есть, ставку пришлю в личные сообщения.' },
]

export function repliesByThread(threadId: string): ForumReply[] {
  return REPLIES.filter((r) => r.threadId === threadId)
}

// ─── Дополнительные данные правого рельса ────────────────────────────────────

export const TRENDING_TAGS: Array<{ tag: string; count: number }> = [
  { tag: 'эскроу', count: 42 },
  { tag: 'ипотека', count: 31 },
  { tag: 'внж-сделки', count: 27 },
  { tag: 'переуступка', count: 19 },
  { tag: 'маткапитал', count: 14 },
]

export const EVENTS: ForumEvent[] = [
  { id: 'e1', title: 'Нетворкинг брокеров', date: '12.04', format: 'offline', city: 'Москва', registrationOpen: true },
  { id: 'e2', title: 'MLS круглый стол', date: '16.04', format: 'online', city: '—', registrationOpen: true },
  { id: 'e3', title: 'Партнёрский разбор кейсов', date: '19.04', format: 'offline', city: 'СПб', registrationOpen: false },
]

/** Лидеры по индексу доверия. */
export function topMembers(limit = 3): ForumMember[] {
  return [...MEMBERS]
    .filter((m) => m.id !== 'sys')
    .sort((a, b) => b.trustIndex - a.trustIndex)
    .slice(0, limit)
}

/** Лента: сначала закреплённые, затем по свежести (как в моке — по порядку). */
export function feedThreads(): ForumThread[] {
  return [...THREADS].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)))
}
