import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpRight,
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle2,
  Coffee,
  Cpu,
  Heart,
  Home,
  Landmark,
  type LucideIcon,
  Megaphone,
  MessageSquare,
  MessagesSquare,
  Pin,
  Plus,
  Scale,
  Search,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { communityApi } from '@/services/communityApi'
import {
  type ExchangeIntent,
  type ExchangeStatus,
  type ForumAuthor,
  type ForumEvent,
  type ForumMember,
  type ForumSection,
  getMember,
  INTENT_LABEL,
  INTENT_SIDE,
  STATUS_LABEL,
  type ThreadType,
} from './forumData'
import { useI18n } from "@/i18n";

// ─── Палитра (строго: только gold / mint / error) ────────────────────────────
export const GOLD = 'var(--forum-gold)'
export const MINT = 'var(--forum-mint)'
export const RISK = 'var(--forum-risk)'

export const ME_ID = 'm5'
export const FORUM_BASE = '/dashboard/community/forum'

/** Глубина через фон + едва заметный край (правило «No Line» из DESIGN.md). */
export const panelClass = 'rounded-[6px] border border-[color:var(--divider-subtle)] bg-[color:var(--hub-card-bg)]'
/** Внутренний «утопленный» блок — без рамки, только фон. */
export const insetClass = 'rounded-[6px] bg-[color:var(--workspace-row-bg)]'
/** Призрачный разделитель строк (как в таблицах DESIGN.md). */
export const ROW_DIVIDER = '1px solid rgba(30,74,42,0.35)'
// Совместимость с именами в страницах.
export const cardClass = panelClass
export const rowClass = insetClass

export function sectionRoute(section: ForumSection): string {
  if (section.kind === 'exchange') return `${FORUM_BASE}/exchange`
  return `${FORUM_BASE}/c/${section.id}`
}

// ─── Иконки ──────────────────────────────────────────────────────────────────

// Ключи — значения `icon` разделов из API (SEED_COMMUNITY_SECTIONS); неизвестный
// ключ падает на MessagesSquare.
const SECTION_ICONS: Record<string, LucideIcon> = {
  megaphone: Megaphone, briefcase: Briefcase, scale: Scale, landmark: Landmark, target: Target,
  cpu: Cpu, coffee: Coffee, arrows: ArrowLeftRight, 'arrow-left-right': ArrowLeftRight,
  building: Building2, calendar: CalendarDays,
}

export function SectionGlyph({ icon, size = 17 }: { icon: string; size?: number }) {
  const Icon = SECTION_ICONS[icon] ?? MessagesSquare
  return <Icon size={size} strokeWidth={1.6} />
}

const THREAD_TYPE_ICON: Record<ThreadType, LucideIcon> = {
  discussion: MessageSquare, question: MessagesSquare, announcement: Megaphone,
  exchange: ArrowLeftRight, showcase: Building2,
}

export function ThreadTypeIcon({ type, solved, size = 34 }: { type: ThreadType; solved?: boolean; size?: number }) {
  const Icon = solved ? CheckCircle2 : THREAD_TYPE_ICON[type]
  const color = solved ? GOLD : 'var(--theme-accent-heading)'
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[6px] transition-transform duration-150 group-hover:scale-110"
      style={{ width: size, height: size, background: 'color-mix(in srgb, var(--gold) 10%, transparent)', color }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={1.75} />
    </span>
  )
}

// ─── Анимация ─────────────────────────────────────────────────────────────────

export function useListVariants() {
  const reduce = useReducedMotion()
  return {
    container: { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.035 } } },
    item: {
      hidden: { opacity: 0, y: reduce ? 0 : 6 },
      show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' as const } },
    },
  }
}

// ─── Биржа ───────────────────────────────────────────────────────────────────

const INTENT_GLYPH: Record<ExchangeIntent, LucideIcon> = {
  rent_seek: ArrowDown, buy_seek: ArrowDown, partner_seek: ArrowLeftRight,
  client_handover: ArrowLeftRight, rent_offer: ArrowUp, sale_offer: ArrowUp, service_offer: ArrowUp,
}

export function IntentTag({ intent }: { intent: ExchangeIntent }) {
  const side = INTENT_SIDE[intent]
  const color = side === 'demand' ? MINT : GOLD
  const Glyph = INTENT_GLYPH[intent]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-[4px] px-2 py-1 text-[16px] uppercase leading-none tracking-[0.05em]"
      style={{ color, background: `color-mix(in srgb, ${color} 13%, transparent)` }}
    >
      <Glyph size={14} strokeWidth={2.25} />
      {INTENT_LABEL[intent]}
    </span>
  )
}

export function StatusDot({ status }: { status: ExchangeStatus }) {
  const color = status === 'open' ? GOLD : status === 'in_work' ? MINT : 'var(--workspace-text-dim)'
  return (
    <span className="inline-flex items-center gap-2 text-[16px]" style={{ color: 'var(--workspace-text-muted)' }}>
      <span className="size-2.5 rounded-full" style={{ background: color }} />
      {STATUS_LABEL[status]}
    </span>
  )
}

// ─── Реакция ──────────────────────────────────────────────────────────────────

export function ReactionButton({ count, size = 16, onClick }: { count: number; size?: number; onClick?: () => void }) {
  const [active, setActive] = useState(false)
  const safeCount = count || 0
  const value = onClick ? safeCount : safeCount + (active ? 1 : 0)
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9 }}
      onClick={(e) => { e.stopPropagation(); setActive((v) => !v); onClick?.() }}
      className="inline-flex items-center gap-1.5 text-[16px] transition-colors"
      style={{ color: active ? GOLD : 'var(--workspace-text-dim)' }}
    >
      <motion.span animate={active ? { scale: [1, 1.35, 1] } : { scale: 1 }} transition={{ duration: 0.24, ease: 'easeOut' }}>
        <Heart size={size} strokeWidth={1.75} fill={active ? GOLD : 'transparent'} />
      </motion.span>
      {value}
    </motion.button>
  )
}

export function ReplyCount({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[16px]" style={{ color: 'var(--workspace-text-dim)' }}>
      <MessageSquare size={16} strokeWidth={1.75} />
      {count}
    </span>
  )
}

// ─── Участник ─────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
}

// Принимает и мок-участника (ForumMember), и реальный снимок автора с API
// (ForumAuthor) — обоим достаточно имени для инициалов.
export function MemberAvatar({ member, size = 34 }: { member: { name: string }; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[6px] text-[16px] leading-none"
      style={{
        width: size, height: size,
        background: 'color-mix(in srgb, var(--gold) 15%, transparent)',
        color: 'var(--theme-accent-heading)',
      }}
    >
      {initials(member.name)}
    </span>
  )
}

export function VerifiedBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[16px]" style={{ color: MINT }}>
      <ShieldCheck size={14} strokeWidth={2} />
      {label}
    </span>
  )
}

/**
 * `author` — реальный снимок с API (ForumThread.author/ForumReply.author),
 * приоритетен над мок-справочником: до 11.09.2026 (N-08) имя брали только
 * по authorId из локального MEMBERS, и у настоящих тем (authorId —
 * ObjectId бэкенда) подпись автора молча пропадала.
 */
export function AuthorLine({ authorId, author, muted = true }: { authorId: string; author?: ForumAuthor; muted?: boolean }) {
  const navigate = useNavigate()
  const member = getMember(authorId)
  const name = author?.name ?? member?.name
  if (!name) return null
  const badge = author?.badges?.[0] ?? member?.badges[0]
  const textStyle = { color: muted ? 'var(--workspace-text-muted)' : 'var(--workspace-text)' }
  // Профиль по id есть только у демо-участников мока: у реального автора
  // (лидерборд пуст, см. community-forum-exchange.md) переход дал бы
  // «участник не найден» — не предлагаем ссылку, которой некуда вести.
  if (!member) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[16px]" style={textStyle}>
        {name}
        {badge && <span style={{ color: MINT }}>· {badge}</span>}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); navigate(`${FORUM_BASE}/u/${member.id}`) }}
      className="inline-flex items-center gap-1.5 text-[16px] transition-colors hover:text-[color:var(--theme-accent-heading)]"
      style={textStyle}
    >
      {name}
      {badge && <span style={{ color: MINT }}>· {badge}</span>}
    </button>
  )
}

export function TrustIndex({ value, size = 'sm' }: { value: number; size?: 'sm' | 'lg' }) {
  const tone = value >= 70 ? GOLD : value >= 45 ? MINT : RISK
  const px = size === 'lg' ? 46 : 19
  return <span style={{ color: tone, fontSize: px, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</span>
}

// ─── Левый рельс ──────────────────────────────────────────────────────────────

function LeftRail({ active }: { active: string }) {
    const { t } = useI18n();
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const [sections, setSections] = useState<ForumSection[]>([])
  const [me, setMe] = useState<ForumMember | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const [s, member] = await Promise.all([
        communityApi.getSections(),
        communityApi.getCurrentUser(currentUser?.id),
      ])
      if (!cancelled) {
        setSections(s)
        setMe(member)
      }
    }
    load()
    return () => { cancelled = true }
  }, [currentUser?.id])

  const railItems = useMemo(() => {
    const items: Array<{ key: string; label: string; icon: ReactNode; route: string; group?: string; showGroupHeader?: boolean }> = [
      { key: 'home', label: 'Главная', icon: <Home size={17} strokeWidth={1.6} />, route: FORUM_BASE },
    ]
    let lastGroup: string | undefined
    for (const s of Array.isArray(sections) ? sections : []) {
      const showGroupHeader = !!(s.group && s.group !== lastGroup)
      lastGroup = s.group
      items.push({ key: s.id, label: s.name, icon: <SectionGlyph icon={s.icon} />, route: sectionRoute(s), group: s.group, showGroupHeader })
    }
    return items
  }, [sections])

  return (
    <nav className="flex flex-col gap-0.5">
      {railItems.map((item) => (
        <div key={item.key}>
          {item.showGroupHeader && (
            <p className="mb-1 mt-3.5 px-3 text-[16px] uppercase tracking-[0.08em]" style={{ color: 'var(--workspace-text-dim)' }}>{item.group}</p>
          )}
          <button
            type="button"
            onClick={() => navigate(item.route)}
            className="flex w-full items-center gap-2.5 rounded-[6px] px-3 py-2 text-left text-[16px] transition-colors hover:bg-[color:var(--workspace-row-bg)]"
            style={{
              color: item.key === active ? 'var(--theme-accent-heading)' : 'var(--workspace-text-muted)',
              background: item.key === active ? 'var(--workspace-row-bg)' : 'transparent',
              boxShadow: item.key === active ? 'inset 2px 0 0 0 var(--gold)' : 'none',
            }}
          >
            <span className="flex size-5 items-center justify-center" style={{ color: item.key === active ? GOLD : 'var(--workspace-text-dim)' }}>{item.icon}</span>
            {item.label}
          </button>
        </div>
      ))}

      {me && (
        <button
          type="button"
          onClick={() => navigate(`${FORUM_BASE}/u/${me.id}`)}
          className={cn('mt-4 p-3 text-left transition-colors hover:bg-[color:var(--hub-card-bg-hover)]', panelClass)}
        >
          <p className="text-[16px] uppercase tracking-[0.08em]" style={{ color: 'var(--workspace-text-dim)' }}>{t('community.forum.forumKit.мой_индекс')}</p>
          <div className="mt-1 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-[16px]" style={{ color: 'var(--workspace-text-muted)' }}>
              <TrendingUp size={15} strokeWidth={1.75} style={{ color: GOLD }} />{t('community.forum.forumKit.доверие')}</span>
            <TrustIndex value={me.trustIndex} />
          </div>
          {me.badges[0] && <p className="mt-1.5"><VerifiedBadge label={me.badges[0]} /></p>}
        </button>
      )}
    </nav>
  )
}

// ─── Правый рельс ──────────────────────────────────────────────────────────────

function RailPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={panelClass}>
      <h3 className="px-3.5 pb-2 pt-3 text-[16px] uppercase tracking-[0.08em]" style={{ color: GOLD }}>{title}</h3>
      <div className="px-3.5 pb-3">{children}</div>
    </section>
  )
}

export function ForumRightRail() {
    const { t } = useI18n();
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const [tags, setTags] = useState<Array<{ tag: string; count: number }>>([])
  const [events, setEvents] = useState<ForumEvent[]>([])
  const [topMembersList, setTopMembersList] = useState<ForumMember[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const [t, e, m] = await Promise.all([
        communityApi.getTrendingTags(5),
        communityApi.getEvents(),
        communityApi.getMembers({ sort: 'trust', pageSize: 3 }),
      ])
      if (!cancelled) {
        setTags(t)
        setEvents(e)
        setTopMembersList(m.items.map((member) => {
          if (member.name === 'Участник' && currentUser && member.id === currentUser.id) {
            return { ...member, name: currentUser.name }
          }
          return member
        }))
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [currentUser])

  const renderSkeleton = (rows: number) => (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-1.5">
          <div className="h-3 rounded w-1/3" style={{ background: 'var(--workspace-row-bg)' }} />
          <div className="h-3 rounded w-6" style={{ background: 'var(--workspace-row-bg)' }} />
        </div>
      ))}
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {/* /community/tags/trending не реализован на бэкенде — communityApi.getTrendingTags
          честно возвращает пусто, без сети; блок скрываем, а не подменяем моком. */}
      {(loading || tags.length > 0) && (
        <RailPanel title={t('community.forum.forumKit.сейчас_обсуждают')}>
          {loading ? renderSkeleton(5) : (
            <ul className="flex flex-col">
              {tags.map((t, i) => (
                <li key={t.tag} className="flex items-center justify-between py-1.5 text-[16px]" style={{ borderTop: i ? ROW_DIVIDER : 'none' }}>
                  <span style={{ color: 'var(--workspace-text-muted)' }}>#{t.tag}</span>
                  <span style={{ color: GOLD }}>{t.count}</span>
                </li>
              ))}
            </ul>
          )}
        </RailPanel>
      )}

      {/* Мероприятий и рейтинга на старте нет (выдуманный засев убран 11.09.2026),
          поэтому пустые панели тоже скрываем, как теги выше. */}
      {(loading || events.length > 0) && (
        <RailPanel title={t('community.forum.forumKit.ближайшие_события')}>
          {loading ? renderSkeleton(3) : (
            <ul className="flex flex-col gap-2">
              {events.map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-[16px]" style={{ color: 'var(--workspace-text)' }}>
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: e.registrationOpen ? GOLD : MINT }} />
                  <span style={{ color: 'var(--workspace-text-dim)' }}>{e.date}</span>
                  <span className="min-w-0 truncate">{e.title}</span>
                </li>
              ))}
            </ul>
          )}
        </RailPanel>
      )}

      {(loading || topMembersList.length > 0) && (
        <RailPanel title={t('community.forum.forumKit.топ_недели')}>
          {loading ? renderSkeleton(3) : (
            <ul className="flex flex-col gap-1.5">
              {topMembersList.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => navigate(`${FORUM_BASE}/u/${m.id}`)}
                    className="flex w-full items-center gap-2 text-left transition-colors hover:text-[color:var(--theme-accent-heading)]">
                    <ShieldCheck size={14} strokeWidth={2} style={{ color: MINT }} />
                    <span className="min-w-0 flex-1 truncate text-[16px]" style={{ color: 'var(--workspace-text)' }}>{m.name}</span>
                    <span style={{ color: m.trustIndex >= 70 ? GOLD : MINT, fontSize: 17, fontWeight: 500 }}>{m.trustIndex}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </RailPanel>
      )}
    </div>
  )
}

// ─── Каркас ────────────────────────────────────────────────────────────────────

interface ForumShellProps { active: string; right?: ReactNode; children: ReactNode }

export function ForumShell({ active, right, children }: ForumShellProps) {
    const { t } = useI18n();
  const navigate = useNavigate()
  const gridCols = right ? 'lg:grid-cols-[212px_minmax(0,1fr)_296px]' : 'lg:grid-cols-[212px_minmax(0,1fr)]'

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" style={{ background: 'var(--app-bg)' }}>
      <div className="mx-auto w-full max-w-[1680px] px-6 py-5">
        {/* Слим-шапка */}
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => navigate(FORUM_BASE)} className="flex items-center gap-2.5">
            <MessagesSquare size={20} strokeWidth={1.6} style={{ color: GOLD }} />
            <span className="text-[22px] leading-none tracking-[-0.02em]" style={{ color: 'var(--theme-accent-heading)', fontWeight: 500 }}>{t('community.forum.forumKit.сообщество')}</span>
          </button>

          <div className="flex items-center gap-2.5">
            <div className="hidden items-center gap-2 rounded-[4px] px-2.5 py-2 md:flex" style={{ background: 'rgba(3,29,22,0.5)', boxShadow: 'inset 0 0 0 1px var(--workspace-row-border)' }}>
              <Search size={16} strokeWidth={1.75} style={{ color: 'var(--workspace-text-dim)' }} />
              <input placeholder={t('community.forum.forumKit.поиск_по_сообществу')} className="w-48 bg-transparent text-[16px] outline-none placeholder:text-[color:var(--workspace-text-dim)]" style={{ color: 'var(--workspace-text)' }} />
            </div>
            <button type="button" onClick={() => navigate(`${FORUM_BASE}/new`)}
              className="inline-flex items-center gap-2 rounded-[4px] px-3.5 py-2 text-[16px] transition-colors"
              style={{ background: GOLD, color: 'var(--gold-btn-text)', fontWeight: 500 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--gold-light)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = GOLD)}>
              <Plus size={17} strokeWidth={2} />{t('community.forum.forumKit.создать_тему')}</button>
          </div>
        </header>

        <div className={cn('grid grid-cols-1 gap-4', gridCols)}>
          <aside className="hidden lg:block"><LeftRail active={active} /></aside>
          <main className="min-w-0">{children}</main>
          {right && <aside className="hidden lg:block">{right}</aside>}
        </div>
      </div>
    </div>
  )
}

/** Сегментный фильтр-таб (gold заливка активного). */
export function FilterTabs<T extends string>({ items, value, onChange }: { items: Array<{ key: T; label: string }>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((f) => {
        const isActive = f.key === value
        return (
          <button key={f.key} type="button" onClick={() => onChange(f.key)}
            className="rounded-[4px] px-3 py-1.5 text-[16px] transition-colors"
            style={{
              color: isActive ? 'var(--gold-btn-text)' : 'var(--workspace-text-muted)',
              background: isActive ? GOLD : 'transparent',
              fontWeight: isActive ? 500 : 400,
              boxShadow: isActive ? 'none' : 'inset 0 0 0 1px var(--workspace-row-border)',
            }}>
            {f.label}
          </button>
        )
      })}
    </div>
  )
}

export { ArrowUpRight, Pin, Users, CalendarDays }
export const MotionDiv = motion.div
