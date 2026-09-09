import type { SectionKind } from './schemas/community-section.schema';
import type { ThreadType, ExchangeMeta, AuthorSnapshot } from './schemas/community-thread.schema';
import type { EventFormat } from './schemas/community-event.schema';

export interface SeedSection {
  sectionId: string;
  name: string;
  kind: SectionKind;
  group?: string | null;
  icon: string;
  description: string;
  order: number;
}

export interface SeedThread {
  threadId: string;
  type: ThreadType;
  sectionId: string;
  title: string;
  excerpt: string;
  body: string;
  authorSnapshot: AuthorSnapshot;
  views: number;
  reactions: number;
  replyCount: number;
  tags: string[];
  pinned: boolean;
  solved: boolean;
  exchange?: ExchangeMeta;
}

export interface SeedEvent {
  eventId: string;
  title: string;
  description: string;
  date: string;
  location: string;
  format: EventFormat;
  attendeeCount: number;
}

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

export const SEED_COMMUNITY_THREADS: SeedThread[] = [
  {
    threadId: 'th-market-batumi-premiere',
    type: 'announcement',
    sectionId: 'market',
    title: 'Старт продаж премиального комплекса на побережье Батуми — закрытый пул для партнеров BAZA',
    excerpt: 'Комиссия 4.5% на старте, рассрочка 0% до 2028 года. Первые 15 лотов с отделкой "под ключ".',
    body: `## Закрытый старт продаж для партнеров платформы BAZA

Объявляем открытие закрытого пула квартир в проекте **Horizon Bay Batumi**.

### Условия для партнеров:
- **Базовая комиссия брокера:** 4.5% от цены договора.
- **Первоначальный взнос:** от 15%.
- **Беспроцентная рассрочка:** до 36 месяцев.
- **Гарантированная доходность:** программа аренды от международного отельного оператора.

Все презентационные материалы и шахматка доступны в разделе «Витрина новостроек».`,
    authorSnapshot: {
      name: 'Девелопмент Групп',
      company: 'Horizon Development',
      city: 'Батуми',
      segment: 'developer',
      role: 'partner_admin',
      badges: ['Застройщик · Верифицирован'],
    },
    views: 420,
    reactions: 28,
    replyCount: 5,
    tags: ['старт-продаж', 'батуми', 'инвестиции'],
    pinned: true,
    solved: false,
  },
  {
    threadId: 'th-law-cobroking-escrow',
    type: 'question',
    sectionId: 'law',
    title: 'Как правильно оформить соглашение со-брокинга и зафиксировать комиссионный сплит?',
    excerpt: 'Коллеги, подскажите юридически выверенный шаблон фиксации клиента при передаче в другое агентство.',
    body: `Коллеги, добрый день! 

Передаем клиенту партнерскому агентству в другом городе (покупка элитной недвижимости). Как юридически безупречно оформить акт фиксации клиента и договор разделения комиссии (50/50), чтобы избежать спорных ситуаций при прямой оплате застройщику?

Поделитесь практикой или шаблоном договора.`,
    authorSnapshot: {
      name: 'Алексей Смирнов',
      company: 'Grand Realty',
      city: 'Тбилиси',
      segment: 'broker',
      role: 'member',
      badges: ['Брокер'],
    },
    views: 310,
    reactions: 14,
    replyCount: 8,
    tags: ['со-брокинг', 'комиссия', 'договор'],
    pinned: false,
    solved: true,
  },
  {
    threadId: 'th-exchange-buy-seek-vnzh',
    type: 'exchange',
    sectionId: 'exchange',
    title: 'ИЩУ: 2-комнатная квартира в готовом доме под ВНЖ, бюджет до $180 000',
    excerpt: 'Клиент с наличными, быстрый выход на сделку. Готов делиться комиссией 50/50.',
    body: `Срочный запрос от проверенного инвестора:
- Локация: Батуми, первая или вторая линия, Новый бульвар или Старый город.
- Статус: Сданный дом, зарегистрированное право собственности (под оформление ВНЖ).
- Бюджет: до $180 000.
- Оплата: 100% готовность, банковский перевод или наличные.

Предложения с фото и кадастровым номером присылайте в личные сообщения или в ответы к теме.`,
    authorSnapshot: {
      name: 'Елена Васильева',
      company: 'Invest Realty Pro',
      city: 'Батуми',
      segment: 'agent',
      role: 'member',
      badges: ['MLS Участник'],
    },
    views: 285,
    reactions: 19,
    replyCount: 12,
    tags: ['покупка', 'готовое', 'внж', 'инвестор'],
    pinned: false,
    solved: false,
    exchange: {
      intent: 'buy_seek',
      side: 'demand',
      dealKind: 'Покупка, вторичка',
      location: 'Батуми, Новый бульвар / Центр',
      amount: 'до $180 000',
      commission: '50/50 сплит',
      deadline: 'до конца месяца',
      status: 'open',
    },
  },
];

export const SEED_COMMUNITY_EVENTS: SeedEvent[] = [
  {
    eventId: 'ev-batumi-broker-tour-2026',
    title: 'Брокер-тур по премиальным новостройкам побережья Батуми',
    description: 'Закрытый осмотр 4 ведущих строящихся проектов с участием топ-менеджмента застройщиков, разбор реальной доходности и условий партнерского вознаграждения.',
    date: '2026-10-15T11:00:00Z',
    location: 'Батуми, бульвар Химшиашвили',
    format: 'offline',
    attendeeCount: 34,
  },
  {
    eventId: 'ev-international-tax-webinar',
    title: 'Вебинар: Налоговые и валютные нюансы трансграничных сделок с недвижимостью 2026',
    description: 'Практический вебинар налогового эксперта BAZA: валютный контроль, декларирование доходов, открытие счетов и оптимизация налогов при покупке за рубежом.',
    date: '2026-10-22T16:00:00Z',
    location: 'Онлайн (Zoom)',
    format: 'online',
    attendeeCount: 89,
  },
];
