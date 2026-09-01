export type ChatChannel = 'telegram' | 'whatsapp'

export interface ChatMessage {
  id: string
  author: 'client' | 'agent'
  text: string
  /** ISO datetime */
  sentAt: string
  status?: 'sent' | 'delivered' | 'read'
}

export interface ChatAiInsight {
  summary: string
  intent: string
  budget?: string
  location?: string
  readiness?: string
  risks: string[]
  suggestedReplies: string[]
  suggestedMaterialIds: string[]
}

export interface ChatThread {
  id: string
  channel: ChatChannel
  clientName: string
  clientHandle: string
  clientPhone?: string
  clientCity?: string
  avatarUrl?: string
  unread: number
  pinned?: boolean
  online?: boolean
  lastSeen?: string
  tags: string[]
  messages: ChatMessage[]
  ai: ChatAiInsight
}

export const CHAT_THREADS: ChatThread[] = [
  {
    id: 'chat-tg-1',
    channel: 'telegram',
    clientName: 'Игорь Морозов',
    clientHandle: '@igor_morozov',
    clientPhone: '+7 (903) 215-44-12',
    clientCity: 'Москва',
    unread: 2,
    online: true,
    tags: ['Первичка', 'Тбилиси'],
    messages: [
      { id: 'm1', author: 'client', text: 'Здравствуйте! Видел Horizon Towers в подборке. Есть ли 2-к на верхних этажах?', sentAt: '2026-05-26T09:14:00', status: 'read' },
      { id: 'm2', author: 'agent', text: 'Игорь, добрый день! Да, есть 2-к на 17 и 19 этажах. Скину сейчас планировки.', sentAt: '2026-05-26T09:18:00', status: 'read' },
      { id: 'm3', author: 'client', text: 'Отлично, жду. И ещё — какие условия рассрочки от застройщика?', sentAt: '2026-05-26T09:19:00', status: 'read' },
      { id: 'm4', author: 'agent', text: 'Беспроцентная до сдачи дома (Q4 2025) при первом взносе от 30%.', sentAt: '2026-05-26T09:22:00', status: 'read' },
      { id: 'm5', author: 'client', text: 'А есть видео-обзор корпуса? Хочу понять, как выглядит изнутри.', sentAt: '2026-05-26T09:45:00' },
      { id: 'm6', author: 'client', text: 'И ещё — оформление на нерезидента возможно?', sentAt: '2026-05-26T09:46:00' },
    ],
    ai: {
      summary: 'Клиент рассматривает 2-к в Horizon Towers, верхние этажи, интересуется рассрочкой и оформлением на нерезидента.',
      intent: 'Покупка под инвестицию или ПМЖ в Тбилиси',
      budget: '~$140–170k',
      location: 'Тбилиси, Horizon Towers',
      readiness: 'Готов к показу, тёплый',
      risks: ['Параллельно смотрит у конкурента (упомянул вчера)', 'Чувствителен к срокам сдачи'],
      suggestedReplies: [
        'Отправлю видео-обзор корпуса и сразу подберу 2 варианта с лучшим видом.',
        'Да, на нерезидента оформляем по упрощённой схеме — пришлю чек-лист документов.',
        'Предлагаю созвон сегодня в 16:00 — пройдёмся по планировкам и условиям рассрочки.',
      ],
      suggestedMaterialIds: ['art-crm-intro', 'script-first-call'],
    },
  },
  {
    id: 'chat-wa-1',
    channel: 'whatsapp',
    clientName: 'Анна Соколова',
    clientHandle: '+7 (916) 308-77-21',
    clientPhone: '+7 (916) 308-77-21',
    clientCity: 'Санкт-Петербург',
    unread: 0,
    online: false,
    lastSeen: '2026-05-26T08:31:00',
    tags: ['Семья', 'Батуми'],
    messages: [
      { id: 'm1', author: 'agent', text: 'Анна, добрый день! Отправляю подборку по Батуми, как договаривались.', sentAt: '2026-05-25T18:02:00', status: 'read' },
      { id: 'm2', author: 'client', text: 'Спасибо! Посмотрим с мужем вечером.', sentAt: '2026-05-25T18:14:00', status: 'read' },
      { id: 'm3', author: 'client', text: 'А есть варианты ближе к школе? У нас двое детей.', sentAt: '2026-05-26T08:30:00', status: 'read' },
      { id: 'm4', author: 'agent', text: 'Конечно, подберу районы рядом с международной школой и пришлю до обеда.', sentAt: '2026-05-26T08:31:00', status: 'read' },
    ],
    ai: {
      summary: 'Семейная пара ищет жильё в Батуми с приоритетом по близости к школе. Бюджет уточняется.',
      intent: 'Релокация семьи, покупка для проживания',
      location: 'Батуми, рядом с международной школой',
      readiness: 'Прогрев, нужен подбор по локации',
      risks: ['Решение принимают вдвоём — нужно учитывать обоих'],
      suggestedReplies: [
        'Подобрал три ЖК в шаговой доступности от BIS Batumi — отправляю.',
        'Могу организовать видео-тур по школе и району в эту субботу.',
        'Уточните, пожалуйста, ориентировочный бюджет — чтобы не предлагать лишнего.',
      ],
      suggestedMaterialIds: ['art-crm-intro'],
    },
  },
  {
    id: 'chat-tg-2',
    channel: 'telegram',
    clientName: 'Дмитрий Левченко',
    clientHandle: '@dmlevch',
    unread: 0,
    online: false,
    lastSeen: '2026-05-25T22:10:00',
    tags: ['Аренда', 'Тбилиси'],
    messages: [
      { id: 'm1', author: 'client', text: 'Привет. Аренда 1-к в Сабуртало есть на лето?', sentAt: '2026-05-25T21:48:00', status: 'read' },
      { id: 'm2', author: 'agent', text: 'Привет, Дмитрий! Да, есть 4 варианта на июнь-август. Скинуть?', sentAt: '2026-05-25T21:55:00', status: 'read' },
      { id: 'm3', author: 'client', text: 'Скидывай.', sentAt: '2026-05-25T22:10:00', status: 'read' },
    ],
    ai: {
      summary: 'Короткосрочная аренда 1-к в Сабуртало, июнь–август. Холодный контакт, нужно прогреть подборкой.',
      intent: 'Краткосрочная аренда',
      location: 'Тбилиси, Сабуртало',
      readiness: 'Ждёт подборку',
      risks: ['Низкая вовлечённость в переписке'],
      suggestedReplies: [
        'Отправляю топ-4 варианта с фото и ценами на лето.',
        'Все варианты доступны для заселения с 1 июня — подскажите даты, под которые ищем.',
      ],
      suggestedMaterialIds: [],
    },
  },
  {
    id: 'chat-wa-2',
    channel: 'whatsapp',
    clientName: 'Карина Манукян',
    clientHandle: '+374 77 12-34-56',
    clientPhone: '+374 77 12-34-56',
    clientCity: 'Ереван',
    unread: 1,
    online: true,
    tags: ['Премиум', 'Инвестиции'],
    messages: [
      { id: 'm1', author: 'agent', text: 'Карина, отправил презентацию проекта Sea Towers.', sentAt: '2026-05-26T07:40:00', status: 'read' },
      { id: 'm2', author: 'client', text: 'Спасибо. По ROI есть свежие цифры?', sentAt: '2026-05-26T09:50:00' },
    ],
    ai: {
      summary: 'Инвестор, интересуется ROI премиум-проектов на побережье. Принимает решения быстро.',
      intent: 'Инвестиционная покупка под доходную аренду',
      budget: '$250k+',
      location: 'Побережье, премиум-сегмент',
      readiness: 'Горячий, нужны цифры доходности',
      risks: ['Нужна оперативная аналитика — иначе уйдёт к конкуренту'],
      suggestedReplies: [
        'Сейчас пришлю свежие цифры по доходности и заполняемости за последний квартал.',
        'Подготовлю сравнение Sea Towers с двумя альтернативами по ROI — будет готово к обеду.',
      ],
      suggestedMaterialIds: ['art-crm-intro'],
    },
  },
  {
    id: 'chat-tg-3',
    channel: 'telegram',
    clientName: 'Михаил Орлов',
    clientHandle: '@mike_orlov',
    unread: 0,
    online: false,
    lastSeen: '2026-05-24T19:00:00',
    tags: ['Холодный'],
    messages: [
      { id: 'm1', author: 'agent', text: 'Михаил, напоминаю о подборке от прошлой недели — актуально ещё?', sentAt: '2026-05-24T18:45:00', status: 'delivered' },
      { id: 'm2', author: 'client', text: 'Пока пауза, спасибо.', sentAt: '2026-05-24T19:00:00', status: 'read' },
    ],
    ai: {
      summary: 'Клиент взял паузу. Нужна аккуратная переактивация через 2–3 недели.',
      intent: 'Покупка отложена',
      readiness: 'Холодный, требует прогрева',
      risks: ['Высокая вероятность потери лида', 'Не отвечает в течение 48ч'],
      suggestedReplies: [
        'Хорошо! Я отпишусь через пару недель с новинками. Удачи!',
        'Может, отложить контакт на месяц и прислать обзор рынка к тому моменту?',
      ],
      suggestedMaterialIds: [],
    },
  },
]
