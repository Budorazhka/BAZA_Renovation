/** Типы для модуля Клиенты */

export type ClientType = 'individual' | 'company'

export type ClientSegment =
  | 'active'       // Активный клиент
  | 'golden'       // Золотой фонд (совершил сделку)
  | 'deferred'     // Отложенный спрос
  | 'archived'     // Архив

/** Тип запроса клиента */
export type ClientRequestType = 'primary' | 'secondary' | 'rent' | 'commercial'

export const CLIENT_REQUEST_TYPE_LABEL: Record<ClientRequestType, string> = {
  primary: 'Первичка',
  secondary: 'Вторичка',
  rent: 'Аренда',
  commercial: 'Коммерция',
}

/**
 * Роль человека в отношениях с агентством. Один клиент может совмещать несколько ролей
 * одновременно (например, купил квартиру, затем передал реферала, затем продаёт свой объект) —
 * общая история отношений остаётся в одной карточке.
 */
export type ClientRole = 'buyer' | 'investor' | 'owner' | 'referral_partner' | 'broker'

export const CLIENT_ROLE_LABEL: Record<ClientRole, string> = {
  buyer: 'Покупатель',
  investor: 'Инвестор',
  owner: 'Собственник',
  referral_partner: 'Реферальный партнёр',
  broker: 'Посредник',
}

export interface Client {
  id: string
  type: ClientType
  /** Полное имя (физлицо) или название компании */
  name: string
  /** Краткое имя для отображения */
  displayName: string
  /** Для физлица — имя (если заведено отдельно от поля name) */
  firstName?: string
  /** Для физлица — фамилия */
  lastName?: string
  phone: string
  email?: string
  /** ID ответственного менеджера */
  assignedAgentId: string
  assignedAgentName: string
  segment: ClientSegment
  /** Источник: откуда пришёл */
  source: string
  /** Дата создания записи */
  createdAt: string
  /** Дата последнего контакта */
  lastContactAt?: string
  /** ID лида, из которого был конвертирован */
  convertedFromLeadId?: string
  /** Описание/заметки */
  notes?: string
  /** Интересы / запрос */
  interests?: string
  /** Ориентир бюджета (текст) */
  budget?: string
  /** Первичка / вторичка / аренда */
  requestType?: ClientRequestType
  /** Количество связанных сделок */
  dealsCount: number
  /** Количество связанных задач */
  tasksCount: number
  /** Роли человека в отношениях с агентством (может быть несколько одновременно) */
  roles?: ClientRole[]
  /** Краткое резюме отношений, собранное AI из истории общения */
  aiSummary?: string
}
