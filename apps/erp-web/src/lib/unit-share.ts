import {
  getDefaultUnitShareCustomization,
  type DevSelectionCustomization,
} from '@/config/dev-selection-customization'
import { encodeUnitShareCustomization, UNIT_SHARE_BLOCK_ORDER } from '@/lib/unit-share-customization'
import {
  developmentApi,
  type CreateUnitShareLinkPayload,
  type UnitShareLinkCustomizationDto,
  type UnitShareLinkSenderDto,
} from '@/services/developmentApi'

export interface UnitShareAgent {
  name?: string
  phone?: string
  telegram?: string
  whatsapp?: string
  company?: string
  role?: string
  avatarUrl?: string
  email?: string
  aboutMe?: string
  aboutCompany?: string
  website?: string
  instagram?: string
  /** Логотип агентства из Настроек (для блока «Отправитель» в выключенном состоянии). */
  companyLogo?: string
}

export interface UnitShareLotInfo {
  unitId: string
  lotNumber: string
  roomsLabel?: string
  area?: number
  floor?: number
  price?: number
  complexName?: string
  location?: string
  buildingName?: string
}

/** Прямая ссылка на лендинг. В URL — контакты и кастомизация (ASCII). */
export function buildUnitShareUrl(
  unitId: string,
  agent?: UnitShareAgent,
  customization?: DevSelectionCustomization,
): string {
  const base = `${window.location.origin}${window.location.pathname}#/lot/${unitId}`
  const params = new URLSearchParams()

  if (agent?.name?.trim()) params.set('n', agent.name.trim())
  if (agent?.company) params.set('co', agent.company)
  if (agent?.role) params.set('r', agent.role)
  if (agent?.phone) params.set('ph', agent.phone)
  if (agent?.whatsapp) params.set('wa', agent.whatsapp.replace(/\D/g, ''))
  if (agent?.telegram) params.set('tg', agent.telegram.replace(/^@/, ''))
  if (agent?.avatarUrl) params.set('av', agent.avatarUrl)
  // email в публичную ссылку не пишем: на визитке он не отображается и не используется как контакт,
  // а личная почта в пересылаемой ссылке — лишнее раскрытие. Старый параметр `em` парсер ещё читает.
  if (agent?.aboutMe) params.set('bio', agent.aboutMe)
  if (agent?.aboutCompany) params.set('cbio', agent.aboutCompany)
  if (agent?.website) params.set('web', agent.website)
  if (agent?.instagram) params.set('ig', agent.instagram.replace(/^@/, ''))
  // Логотип агентства: показывается клиенту в блоке «Отправитель», когда BAZA.sale-бренд выключен.
  // data-URL делает ссылку длинной — это осознанный компромисс (бэкенда для хостинга лого нет).
  if (agent?.companyLogo) params.set('lg', agent.companyLogo)

  if (customization) {
    const enc = encodeUnitShareCustomization(customization)
    const def = encodeUnitShareCustomization(getDefaultUnitShareCustomization())
    const isDefault =
      enc.lang === def.lang &&
      enc.cur === def.cur &&
      enc.thm === def.thm &&
      enc.blk === def.blk &&
      enc.bm === def.bm
    // Пишем только то, что отличается от значений по умолчанию — парсер сам подставит дефолты.
    if (!isDefault) {
      if (enc.lang !== def.lang) params.set('lang', enc.lang)
      if (enc.cur !== def.cur) params.set('cur', enc.cur)
      if (enc.thm !== def.thm) params.set('thm', enc.thm)
      if (enc.blk !== def.blk) params.set('blk', enc.blk)
      // Короткий маркер «современного» формата: иначе одиночный `blk` спутают со старой 12-битной маской.
      params.set('bm', enc.bm)
    }
  }

  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

// --- Публичная страница лота на маркетплейсе baza.sale ---

const BAZA_SALE_PUBLIC_ORIGIN = 'https://baza.sale'

/**
 * Канонический публичный URL лота на baza.sale (`/nc/apartments/:id`).
 * Страница строится платформой из тех же данных, но без кастомизации и
 * контактов агента — это витрина маркетплейса, а не персональная визитка.
 * Существует только для реальных лотов платформы (Mongo ObjectId) —
 * для мок-лотов из in-memory стора возвращает null.
 */
export function buildBazaSaleUnitUrl(unitId: string): string | null {
  if (!/^[0-9a-f]{24}$/i.test(unitId)) return null
  return `${BAZA_SALE_PUBLIC_ORIGIN}/nc/apartments/${unitId}`
}

// --- Серверные share-ссылки (`?share=<token>`) ---
// См. docs/lot-landing-backend-api-recommendations.md §1. Конфигурация и
// контакты отправителя хранятся на бэке; в URL остаётся только короткий токен.

/** Кастомизация → DTO для API: явная карта блоков вместо base36-маски. */
export function customizationToShareLinkDto(
  customization?: DevSelectionCustomization,
): UnitShareLinkCustomizationDto | undefined {
  if (!customization) return undefined
  const blocks: Record<string, boolean> = {}
  for (const key of UNIT_SHARE_BLOCK_ORDER) {
    const value = customization.blocks[key]
    if (typeof value === 'boolean') blocks[key] = value
  }
  return {
    language: customization.language,
    currency: customization.currency,
    theme: customization.theme,
    brandingMode: customization.brandingMode ?? 'agent',
    blocks,
  }
}

/** Агент → sender DTO. Без email; data-URL-логотипы бэк не принимает — пропускаем. */
export function agentToShareLinkSender(agent?: UnitShareAgent): UnitShareLinkSenderDto | undefined {
  if (!agent) return undefined
  const sender: UnitShareLinkSenderDto = {}
  if (agent.name?.trim()) sender.name = agent.name.trim()
  if (agent.company) sender.company = agent.company
  if (agent.role) sender.role = agent.role
  if (agent.phone) sender.phone = agent.phone
  if (agent.whatsapp) sender.whatsapp = agent.whatsapp.replace(/\D/g, '')
  if (agent.telegram) sender.telegram = agent.telegram.replace(/^@/, '')
  if (agent.instagram) sender.instagram = agent.instagram.replace(/^@/, '')
  if (agent.website) sender.website = agent.website
  if (agent.aboutMe) sender.bio = agent.aboutMe
  if (agent.avatarUrl && !agent.avatarUrl.startsWith('data:')) sender.avatarUrl = agent.avatarUrl
  if (agent.companyLogo && !agent.companyLogo.startsWith('data:')) sender.companyLogoUrl = agent.companyLogo
  return Object.keys(sender).length > 0 ? sender : undefined
}

/** Sender DTO из share-ссылки → агент визитки (обратное преобразование). */
export function shareLinkSenderToAgent(sender?: UnitShareLinkSenderDto | null): UnitShareAgent | null {
  if (!sender) return null
  const agent: UnitShareAgent = {
    name: sender.name,
    company: sender.company,
    role: sender.role,
    phone: sender.phone,
    whatsapp: sender.whatsapp,
    telegram: sender.telegram,
    instagram: sender.instagram,
    website: sender.website,
    aboutMe: sender.bio,
    avatarUrl: sender.avatarUrl,
    companyLogo: sender.companyLogoUrl,
  }
  return Object.values(agent).some((value) => value != null && value !== '') ? agent : null
}

// Один и тот же конфиг не должен плодить новые токены при повторном копировании,
// а изменённый — создаёт новую ссылку (уже отправленные не меняются задним числом).
const shareTokenCache = new Map<string, { payloadKey: string; token: string }>()

function shareUrlFromToken(unitId: string, token: string): string {
  return `${window.location.origin}${window.location.pathname}#/lot/${unitId}?share=${token}`
}

/**
 * Токен share-ссылки для конфигурации (создаёт через API или переиспользует
 * сессионный кэш). Один токен обслуживает и визитку ERP, и страницу baza.sale.
 * null — API недоступен, вызывающий код падает на URL-параметры.
 */
export async function getOrCreateUnitShareToken(
  unitId: string,
  agent?: UnitShareAgent,
  customization?: DevSelectionCustomization,
): Promise<string | null> {
  const payload: CreateUnitShareLinkPayload = {
    unitId,
    customization: customizationToShareLinkDto(customization),
    sender: agentToShareLinkSender(agent),
  }
  const payloadKey = JSON.stringify(payload)

  const cached = shareTokenCache.get(unitId)
  if (cached && cached.payloadKey === payloadKey) return cached.token

  try {
    const link = await developmentApi.createUnitShareLink(payload)
    if (link?.token) {
      shareTokenCache.set(unitId, { payloadKey, token: link.token })
      return link.token
    }
  } catch {
    /* бэк недоступен / роут ещё не проброшен через gateway */
  }
  return null
}

/**
 * Короткая ссылка через API share-links; при недоступности бэка — прежняя
 * длинная ссылка с параметрами (buildUnitShareUrl), чтобы шаринг не ломался.
 */
export async function buildUnitShareUrlSmart(
  unitId: string,
  agent?: UnitShareAgent,
  customization?: DevSelectionCustomization,
): Promise<string> {
  const token = await getOrCreateUnitShareToken(unitId, agent, customization)
  if (token) return shareUrlFromToken(unitId, token)
  return buildUnitShareUrl(unitId, agent, customization)
}

/**
 * Ссылка на страницу лота на baza.sale с токеном кастомизации: страница
 * `/nc/apartments/:id` читает `?share=` и применяет блоки/отправителя/язык/тему.
 * Без токена (API недоступен) — канонический URL без кастомизации.
 */
export async function buildBazaSaleUnitUrlSmart(
  unitId: string,
  agent?: UnitShareAgent,
  customization?: DevSelectionCustomization,
): Promise<string | null> {
  const base = buildBazaSaleUnitUrl(unitId)
  if (!base) return null
  const token = await getOrCreateUnitShareToken(unitId, agent, customization)
  return token ? `${base}?share=${token}` : base
}

export function parseUnitShareAgent(search: string): UnitShareAgent | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)

  const name = params.get('n') ?? params.get('agent') ?? undefined
  const phone = params.get('ph') ?? params.get('phone') ?? undefined
  const telegram = params.get('tg') ?? params.get('telegram') ?? undefined
  const whatsapp = params.get('wa') ?? params.get('whatsapp') ?? undefined
  const company = params.get('co') ?? params.get('company') ?? undefined
  const role = params.get('r') ?? params.get('role') ?? undefined
  const avatarUrl = params.get('av') ?? params.get('avatar') ?? undefined
  const email = params.get('em') ?? params.get('email') ?? undefined
  const aboutMe = params.get('bio') ?? undefined
  const aboutCompany = params.get('cbio') ?? undefined
  const website = params.get('web') ?? params.get('website') ?? undefined
  const instagram = params.get('ig') ?? params.get('instagram') ?? undefined
  const companyLogo = params.get('lg') ?? undefined

  if (!name && !phone && !telegram && !whatsapp && !company && !role && !avatarUrl && !email && !aboutMe && !aboutCompany && !website && !instagram && !companyLogo) return null
  return { name, phone, telegram, whatsapp, company, role, avatarUrl, email, aboutMe, aboutCompany, website, instagram, companyLogo }
}

/** Короткое отображение длинной ссылки (полная остаётся в href / clipboard). */
export function truncateShareUrl(url: string, maxChars = 72): string {
  if (url.length <= maxChars) return url
  const ellipsis = '…'
  const room = maxChars - ellipsis.length
  const head = Math.ceil(room / 2)
  const tail = Math.floor(room / 2)
  return `${url.slice(0, head)}${ellipsis}${url.slice(-tail)}`
}

/** Query из HashRouter (#/lot/id?...) — объединяет hash и useSearchParams. */
export function getUnitShareSearchQuery(
  searchParams: URLSearchParams,
  hash: string = typeof window !== 'undefined' ? window.location.hash : '',
): string {
  const hashQ = hash.indexOf('?')
  const fromHash = hashQ >= 0 ? hash.slice(hashQ + 1) : ''
  const fromRouter = searchParams.toString()

  if (!fromHash) return fromRouter
  if (!fromRouter) return fromHash

  const merged = new URLSearchParams(fromRouter)
  new URLSearchParams(fromHash).forEach((value, key) => merged.set(key, value))
  return merged.toString()
}

/** Карточка лота и консультант — без ссылки. */
export function buildUnitShareCard(lot: UnitShareLotInfo, agent?: UnitShareAgent): string {
  const header = lot.complexName
    ? [lot.complexName, lot.location].filter(Boolean).join(' · ')
    : 'Квартира'

  const lotLine = lot.buildingName
    ? `Корпус: ${lot.buildingName}\nЛот ${lot.lotNumber}`
    : `Лот ${lot.lotNumber}`

  const specs = [
    lot.roomsLabel,
    lot.area != null ? `${lot.area} м²` : null,
    lot.floor != null ? `${lot.floor} этаж` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const priceLine =
    lot.price != null ? `$${lot.price.toLocaleString('en-US')}` : 'Цена по запросу'

  const lines = [header, lotLine, '', specs, priceLine]

  if (agent?.name || agent?.role || agent?.company || agent?.phone) {
    lines.push('')
    const who = [agent.name, agent.role, agent.company].filter(Boolean).join(' · ')
    if (who) lines.push(who)
    if (agent.phone) lines.push(agent.phone)
  }

  return lines.join('\n')
}

/** Карточка + ссылка plain-текстом в конце. */
export function buildUnitSharePlainText(
  lot: UnitShareLotInfo,
  agent?: UnitShareAgent,
  customization?: DevSelectionCustomization,
): string {
  const url = buildUnitShareUrl(lot.unitId, agent, customization)
  return `${buildUnitShareCard(lot, agent)}\n\n${url}`
}

/** То же, но с готовой ссылкой (короткая ссылка из buildUnitShareUrlSmart). */
export function buildUnitSharePlainTextFromUrl(
  lot: UnitShareLotInfo,
  agent: UnitShareAgent | undefined,
  url: string,
): string {
  return `${buildUnitShareCard(lot, agent)}\n\n${url}`
}

export function buildUnitShareWhatsAppText(
  lot: UnitShareLotInfo,
  agent?: UnitShareAgent,
  customization?: DevSelectionCustomization,
): string {
  return buildUnitSharePlainText(lot, agent, customization)
}

/**
 * Telegram Share Widget: `url` — превью ссылки сверху, `text` — карточка без дубля внизу.
 */
export function openTelegramShare(
  lot: UnitShareLotInfo,
  agent?: UnitShareAgent,
  customization?: DevSelectionCustomization,
): void {
  openTelegramShareWithUrl(lot, agent, buildUnitShareUrl(lot.unitId, agent, customization))
}

/** Telegram-шаринг с готовой (короткой) ссылкой. */
export function openTelegramShareWithUrl(
  lot: UnitShareLotInfo,
  agent: UnitShareAgent | undefined,
  url: string,
): void {
  const text = buildUnitShareCard(lot, agent)
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`

  const popup = window.open(
    shareUrl,
    'telegram_share',
    'width=600,height=520,left=200,top=100,resizable=yes,scrollbars=yes',
  )

  if (!popup) {
    window.open(shareUrl, '_blank', 'noopener,noreferrer')
  }
}
