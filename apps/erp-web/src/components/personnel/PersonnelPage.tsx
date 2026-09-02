import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { UserPlus, Phone, X, Pencil, Trash2, Users, ShieldOff, ShieldCheck, Check, Contact, ShieldQuestion, TrendingUp, Send, ZoomIn, ZoomOut, RotateCcw, Sparkles, KeyRound } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import {
  ROLE_LABELS,
  type Employee,
  type EmployeeRole,
} from '@/types/personnel'
import { teamApi, teamUserToEmployee } from '@/services/teamApi'
import {
  PERMISSIONS,
  DEFAULT_PERMISSIONS,
  getDefaultPermissionsForRole,
  type PermissionKey,
  type PermissionLevel,
  type PermissionMap,
} from '@/data/personnel-permissions'
import {
  resolveModulePermissions,
  resolveEffectiveAccess,
  serializeAccessProfile,
} from '@/lib/module-permissions'
import { ROLE_LABEL, canDo } from '@/lib/permissions'
import { canManageTeamPasswords } from '@/lib/team-password-access'
import {
  PRESENCE_STATUS_OPTIONS,
  readPresenceStatus,
  writePresenceStatus,
  type PresenceStatus,
} from '@/lib/presence'
import type { UserRole } from '@/types/auth'
import { useI18n } from "@/i18n";

// ─── Палитра: только gold / mint (DESIGN.md) ──────────────────────────────────

const GOLD = 'var(--gold)'
const MINT = '#d0e8df'

const ROLE_STYLE: Record<EmployeeRole, { accent: string; badge: string; text: string }> = {
  owner:    { accent: GOLD, badge: 'color-mix(in srgb, var(--gold) 14%, transparent)', text: GOLD },
  director: { accent: MINT, badge: 'rgba(208,232,223,0.10)', text: MINT },
  rop:      { accent: MINT, badge: 'rgba(208,232,223,0.08)', text: MINT },
  marketer: { accent: MINT, badge: 'rgba(208,232,223,0.08)', text: MINT },
  administrator: { accent: MINT, badge: 'rgba(208,232,223,0.08)', text: MINT },
  manager:  { accent: MINT, badge: 'rgba(208,232,223,0.06)', text: MINT },
}

const LINE = 'var(--hub-card-border)'
const CARD_BORDER = 'var(--hub-card-border)'
const TEXT_MAIN = 'var(--workspace-text)'
const TEXT_MUTED = 'var(--workspace-text-muted)'

// 400px keeps the longest role + «ВАКАНТНА» badge in one header row.
const NODE_WIDTH = 400
const ORG_MIN_SCALE = 0.6
const ORG_MAX_SCALE = 1.5
const ORG_SCALE_STEP = 0.1

const accessHeadCellStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'var(--gold)',
  padding: '8px 12px',
  background: 'rgba(201,168,76,0.08)',
  textAlign: 'left',
  borderBottom: '1px solid var(--hub-card-border)',
}

const accessGroupCellStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'var(--gold)',
  padding: '6px 12px',
  background: 'rgba(201,168,76,0.05)',
  textAlign: 'left',
  borderTop: '1px solid var(--hub-card-border)',
}

const accessLabelCellStyle: React.CSSProperties = {
  fontSize: 15, color: TEXT_MAIN, padding: '6px 12px', lineHeight: 1.3,
}

const accessCheckCellStyle: React.CSSProperties = {
  padding: '5px 12px', textAlign: 'center',
}

// ─── Утилиты ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}
function buildChildren(employees: Employee[], parentId: string) {
  return employees.filter((e) => e.managerId === parentId)
}

function clampOrgScale(value: number) {
  return Math.min(ORG_MAX_SCALE, Math.max(ORG_MIN_SCALE, Number(value.toFixed(2))))
}

/** Вертикальный отступ между уровнями оргструктуры */
const ORG_STEM_H = 28
/** Зазор между колонками подчинённых одного руководителя */
const ORG_CHILD_GAP = 32
const ROP_TEAM_COLUMNS = 2
const ROP_TEAM_FRAME_GUTTER = 16
const ROP_TEAM_ROW_GAP = 16

const orgStemStyle: React.CSSProperties = {
  width: 1,
  flexShrink: 0,
  background: LINE,
}

/** Ширина колонки узла с учётом всего поддерева — чтобы ветки не наезжали друг на друга */
function getSubtreeWidth(employeeId: string, allEmployees: Employee[], includeManagerAddSlot = false): number {
  const employee = allEmployees.find((e) => e.id === employeeId)
  const children = buildChildren(allEmployees, employeeId)
  const shouldReserveAddSlot = includeManagerAddSlot
    && employee?.role === 'rop'

  // Менеджеры РОПа живут в отдельной сетке 2×N: её ширина постоянна,
  // а высота растёт по мере добавления сотрудников.
  const isRopManagerTeam = employee?.role === 'rop' && children.every((child) => child.role === 'manager')
  if (isRopManagerTeam && (children.length > 0 || shouldReserveAddSlot)) {
    const teamSize = children.length + (shouldReserveAddSlot ? 1 : 0)
    const columns = Math.min(ROP_TEAM_COLUMNS, teamSize)
    return Math.max(
      NODE_WIDTH,
      columns * NODE_WIDTH + (columns - 1) * ORG_CHILD_GAP + ROP_TEAM_FRAME_GUTTER * 2,
    )
  }

  const columnWidths = children.map((child) => getSubtreeWidth(child.id, allEmployees, includeManagerAddSlot))

  if (shouldReserveAddSlot) {
    columnWidths.push(NODE_WIDTH)
  }

  if (columnWidths.length === 0) return NODE_WIDTH

  return Math.max(
    NODE_WIDTH,
    columnWidths.reduce(
      (sum, width, index) =>
        sum
        + width
        + (index < columnWidths.length - 1 ? ORG_CHILD_GAP : 0),
      0,
    ),
  )
}

// ─── Уровень доступа в формате матрицы ────────────────────────────────────────

const PERMISSION_LEVELS: Array<{ value: PermissionLevel; code: string; label: string; color: string; background: string }> = [
  { value: 'none', code: '—', label: 'Раздел не виден', color: 'var(--workspace-text-muted)', background: 'rgba(255,255,255,0.04)' },
  { value: 'view', code: 'В', label: 'Только просмотр', color: MINT, background: 'rgba(208,232,223,0.10)' },
  { value: 'edit', code: 'Р', label: 'Просмотр, создание и редактирование', color: GOLD, background: 'color-mix(in srgb, var(--gold) 14%, transparent)' },
]

function PermissionLegend() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
      {PERMISSION_LEVELS.map((level) => (
        <div key={level.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 8px', borderRadius: 4, background: level.background, color: level.color, fontSize: 16 }}>
          <span style={{ minWidth: 18, fontWeight: 500, textAlign: 'center' }}>{level.code}</span>
          <span>{level.label}</span>
        </div>
      ))}
    </div>
  )
}

function PermissionLevelControl({
  value,
  disabled,
  onChange,
  label,
}: {
  value: PermissionLevel
  disabled: boolean
  onChange: (value: PermissionLevel) => void
  label: string
}) {
  return (
    <div aria-label={label} style={{ display: 'inline-flex', overflow: 'hidden', border: '1px solid var(--green-border)', borderRadius: 4 }}>
      {PERMISSION_LEVELS.map((level) => {
        const active = value === level.value
        return (
          <button
            key={level.value}
            type="button"
            onClick={(event) => { event.stopPropagation(); if (!disabled) onChange(level.value) }}
            disabled={disabled}
            aria-pressed={active}
            aria-label={`${label}: ${level.label}`}
            title={level.label}
            style={{
              width: 34, height: 30, border: 'none', borderRight: level.value === 'edit' ? 'none' : '1px solid var(--green-border)',
              background: active ? level.background : 'rgba(3,29,22,0.5)', color: active ? level.color : 'var(--workspace-text-muted)',
              fontSize: 16, fontFamily: "'Montserrat', sans-serif", fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.6 : 1, padding: 0, transition: 'background 0.15s, color 0.15s',
            }}
          >
            {level.code}
          </button>
        )
      })}
    </div>
  )
}

// ─── Узел оргструктуры (компактный прямоугольник) ─────────────────────────────

function EmployeeNode({
  employee,
  isSelected,
  editMode,
  onClick,
  onEdit,
  onDelete,
  onVacate,
  onAssign,
}: {
  employee: Employee
  isSelected: boolean
  editMode: boolean
  onClick: () => void
  onEdit?: () => void
  onDelete?: () => void
  onVacate?: () => void
  onAssign?: () => void
}) {
    const { t } = useI18n();
  const s = ROLE_STYLE[employee.role] ?? ROLE_STYLE.manager
  const vacant = employee.vacant === true
  const occHistory = employee.occupancyHistory ?? []
  const occTitle = vacant
    ? 'Позиция свободна. Клиенты и доступы остаются на позиции.'
    : occHistory.length > 0
      ? 'История: ' +
        occHistory
          .map((h) => `${h.name || '—'} (${h.startedAt.slice(0, 10)}–${h.endedAt ? h.endedAt.slice(0, 10) : 'сейчас'})`)
          .join('; ')
      : 'Позиция занята'
  const initials = getInitials(vacant ? '?' : employee.name || '?')
  const [hovered, setHovered] = useState(false)
  const defaultPresence: PresenceStatus = employee.status === 'blocked'
    ? 'offline'
    : employee.status === 'invited'
      ? 'away'
      : 'online'
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>(() =>
    readPresenceStatus(
      typeof window === 'undefined' ? undefined : window.localStorage,
      employee.id,
      defaultPresence,
    ),
  )
  const [presenceOpen, setPresenceOpen] = useState(false)
  const [aiEnabled, setAiEnabled] = useState(false)
  const showActions = editMode && hovered
  const currentPresence = PRESENCE_STATUS_OPTIONS.find((option) => option.id === presenceStatus) ?? PRESENCE_STATUS_OPTIONS[0]

  const selectPresenceStatus = (status: PresenceStatus) => {
    setPresenceStatus(status)
    setPresenceOpen(false)
    writePresenceStatus(
      typeof window === 'undefined' ? undefined : window.localStorage,
      employee.id,
      status,
    )
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        width: NODE_WIDTH,
        paddingBottom: editMode ? 12 : 0,
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        onClick={onClick}
        style={{
          width: '100%',
          background: isSelected
              ? 'var(--green-card-hover)'
              : 'var(--green-card)',
          borderRadius: 6,
          border: `1px solid ${
            isSelected
                ? s.accent
                : editMode && hovered
                  ? `${s.accent}66`
                  : CARD_BORDER
          }`,
          boxShadow: isSelected
              ? `inset 0 0 0 1px ${s.accent}40, 0 6px 22px rgba(0,0,0,0.35)`
              : 'inset 0 0 0 1px rgba(201,168,76,0.10)',
          transition: 'all 0.15s',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '44px 16px 14px',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div
          title={occTitle}
          style={{
            width: 48, height: 48, flexShrink: 0, borderRadius: '50%',
            background: s.badge, border: `1px solid ${s.accent}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: s.accent, fontSize: 16, fontWeight: 500, letterSpacing: '0.02em',
            cursor: 'help',
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{ fontSize: 16, fontWeight: 500, color: TEXT_MAIN, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={employee.position}
          >
            {employee.position}
          </div>
          <div
            style={{ fontSize: 16, color: TEXT_MUTED, fontStyle: vacant ? 'italic' : 'normal', marginTop: 3, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={vacant ? 'Сотрудник не назначен' : employee.name}
          >
            {vacant ? 'Сотрудник не назначен' : employee.name}
          </div>
        </div>
      </button>

      <div
        role="group"
        aria-label={`Роль и статус ${employee.name}`}
        style={{
          position: 'absolute',
          top: 10,
          left: 12,
          right: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          flexWrap: 'wrap',
          gap: 4,
          zIndex: 4,
        }}
      >
        <span
          style={{
            fontSize: 17,
            fontWeight: 500,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: s.accent,
            background: s.badge,
            border: `1px solid ${s.accent}35`,
            borderRadius: 4,
            padding: '3px 7px',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {ROLE_LABELS[employee.role]}
        </span>
        {vacant && (
          <span
            title={occTitle}
            style={{
              fontSize: 16,
              fontWeight: 500,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: GOLD,
              border: '1px solid color-mix(in srgb, var(--gold) 45%, transparent)',
              borderRadius: 4,
              padding: '3px 7px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {t('personnel.personnelPage.вакантна')}</span>
        )}
        {!vacant && (
          <>
            <button
              type="button"
              aria-label={`Статус: ${currentPresence.label}`}
              title={`Статус: ${currentPresence.label}`}
              onClick={(event) => {
                event.stopPropagation()
                setPresenceOpen((open) => !open)
              }}
              style={{
                width: 28,
                height: 28,
                borderRadius: 4,
                border: '1px solid color-mix(in srgb, var(--gold) 30%, transparent)',
                background: 'var(--green-deep)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: currentPresence.color,
                  boxShadow: `0 0 0 2px color-mix(in srgb, ${currentPresence.color} 22%, transparent)`,
                }}
              />
            </button>

            <button
              type="button"
              aria-pressed={aiEnabled}
              aria-label={aiEnabled ? 'AI включён' : 'AI выключен'}
              title={aiEnabled ? 'AI включён' : 'AI выключен'}
              onClick={(event) => {
                event.stopPropagation()
                setAiEnabled((enabled) => !enabled)
              }}
              style={{
                width: 28,
                height: 28,
                borderRadius: 4,
                border: `1px solid ${aiEnabled ? 'color-mix(in srgb, var(--gold) 60%, transparent)' : 'var(--green-border)'}`,
                background: aiEnabled ? 'color-mix(in srgb, var(--gold) 14%, transparent)' : 'var(--green-deep)',
                color: aiEnabled ? GOLD : MINT,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <Sparkles size={14} strokeWidth={2} />
            </button>

            {presenceOpen && (
              <div
                role="menu"
                aria-label={t('personnel.personnelPage.статус_сотрудника')}
                style={{
                  position: 'absolute',
                  top: 32,
                  right: 0,
                  width: 196,
                  padding: 4,
                  borderRadius: 6,
                  background: 'var(--green-deep)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(201,168,76,0.18)',
                }}
              >
                {PRESENCE_STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={option.id === presenceStatus}
                    onClick={(event) => {
                      event.stopPropagation()
                      selectPresenceStatus(option.id)
                    }}
                    style={{
                      width: '100%',
                      minHeight: 40,
                      border: 0,
                      borderRadius: 4,
                      background: option.id === presenceStatus ? 'var(--green-card-hover)' : 'transparent',
                      color: TEXT_MAIN,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '6px 8px',
                      fontFamily: 'inherit',
                      fontSize: 16,
                      fontWeight: 400,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{ width: 12, height: 12, borderRadius: '50%', background: option.color, flexShrink: 0 }}
                    />
                    <span style={{ flex: 1 }}>{option.label}</span>
                    {option.id === presenceStatus && <Check size={14} color={GOLD} strokeWidth={2} />}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showActions && (
        <div
          style={{
            position: 'absolute',
            top: -10,
            right: -10,
            display: 'flex',
            gap: 4,
            zIndex: 5,
          }}
        >
          {vacant ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAssign?.() }}
              title={t('personnel.personnelPage.заполнить_аккаунт_че')}
              style={{
                width: 30, height: 30, borderRadius: 4,
                border: '1px solid rgba(208,232,223,0.5)',
                background: 'var(--green-deep)', color: MINT,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }}
            >
              <UserPlus size={15} />
            </button>
          ) : employee.role !== 'owner' ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onVacate?.() }}
              title={t('personnel.personnelPage.освободить_аккаунт_к')}
              style={{
                width: 30, height: 30, borderRadius: 4,
                border: '1px solid color-mix(in srgb, var(--gold) 45%, transparent)',
                background: 'var(--green-deep)', color: GOLD,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }}
            >
              <ShieldOff size={15} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit?.() }}
            title={t('personnel.personnelPage.редактировать')}
            style={{
              width: 30, height: 30, borderRadius: 4,
              border: `1px solid ${s.accent}50`,
              background: 'var(--green-deep)',
              color: s.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            <Pencil size={15} />
          </button>
          {employee.role === 'manager' && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete?.() }}
              title={t('personnel.personnelPage.удалить_менеджерский')}
              style={{
                width: 30, height: 30, borderRadius: 4,
                border: '1px solid rgba(255,180,171,0.4)',
                background: 'var(--green-deep)',
                color: '#ffb4ab',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── KPI аккаунта ────────────────────────────────────────────────────────────

interface EmployeeKpi {
  period: string
  metrics: { label: string; value: string; hint?: string; accent?: boolean }[]
  goals: { key: 'revenue' | 'deals' | 'leads'; label: string; plan: number; fact: number; unit: string }[]
}

interface KpiPlanOverride {
  revenue?: number
  deals?: number
  leads?: number
  period?: string
}

const KPI_PERIODS: { id: string; label: string; range: string }[] = [
  { id: 'Q1 2026', label: 'Q1 2026', range: '1 янв — 31 мар 2026' },
  { id: 'Q2 2026', label: 'Q2 2026', range: '1 апр — 30 июн 2026' },
  { id: 'Q3 2026', label: 'Q3 2026', range: '1 июл — 30 сен 2026' },
  { id: 'Q4 2026', label: 'Q4 2026', range: '1 окт — 31 дек 2026' },
  { id: 'H1 2026', label: 'H1 2026 (полугодие)', range: '1 янв — 30 июн 2026' },
  { id: 'H2 2026', label: 'H2 2026 (полугодие)', range: '1 июл — 31 дек 2026' },
  { id: '2026',    label: '2026 (год)',           range: '1 янв — 31 дек 2026' },
]

function seedFrom(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

function buildEmployeeKpi(employee: Employee, override?: KpiPlanOverride): EmployeeKpi {
  const seed = seedFrom(employee.id)
  const r = (mod: number, off = 0) => (seed >> off) % mod
  const dealsClosed = 4 + r(18)
  const revenue = (1.2 + r(54, 3) / 10) * 1_000_000
  const commission = revenue * (0.04 + r(7, 5) / 100)
  const leadsActive = 12 + r(40, 2)
  const conversionPct = 14 + r(28, 4)
  const avgCheck = revenue / Math.max(1, dealsClosed)
  const planRevenue = revenue * (1 + (r(40, 6) - 10) / 100)
  const planDeals = Math.round(dealsClosed * (1 + (r(28, 7) - 4) / 100))
  const planLeads = leadsActive + 6 + r(10, 1)

  const fmtMoney = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace('.', ',')} млн`
    if (n >= 1_000) return `$${Math.round(n / 1_000)} тыс`
    return `$${Math.round(n)}`
  }

  return {
    period: override?.period ?? 'Q2 2026',
    metrics: [
      { label: 'Сделок закрыто', value: String(dealsClosed), accent: true },
      { label: 'Объём продаж', value: fmtMoney(revenue) },
      { label: 'Комиссия', value: fmtMoney(commission), accent: true },
      { label: 'Лиды в работе', value: String(leadsActive) },
      { label: 'Конверсия лид → сделка', value: `${conversionPct}%` },
      { label: 'Средний чек', value: fmtMoney(avgCheck) },
    ],
    goals: [
      { key: 'revenue', label: 'Выручка', plan: override?.revenue ?? Math.round(planRevenue / 1000), fact: Math.round(revenue / 1000), unit: 'тыс $' },
      { key: 'deals',   label: 'Сделки',  plan: override?.deals   ?? planDeals,                       fact: dealsClosed,                  unit: 'шт' },
      { key: 'leads',   label: 'Лиды',    plan: override?.leads   ?? planLeads,                       fact: leadsActive,                  unit: 'шт' },
    ],
  }
}

function periodRange(periodId: string): string {
  return KPI_PERIODS.find((p) => p.id === periodId)?.range ?? ''
}

function EmployeeKpiPanel({
  kpi,
  canEdit,
  onChangePlan,
  onChangePeriod,
  firstInputRef,
}: {
  kpi: EmployeeKpi
  canEdit: boolean
  onChangePlan: (key: 'revenue' | 'deals' | 'leads', value: string) => void
  onChangePeriod: (period: string) => void
  firstInputRef?: React.RefObject<HTMLInputElement | null>
}) {
    const { t } = useI18n();
  const periodRangeText = periodRange(kpi.period)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{
        padding: '16px',
        borderRadius: 6,
        boxShadow: 'inset 0 0 0 1px rgba(201,168,76,0.18)',
        background: 'color-mix(in srgb, var(--gold) 7%, var(--green-card))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 500, color: TEXT_MAIN, marginBottom: 4 }}>
            {t('personnel.personnelPage.план_сотрудника')}</div>
          <div style={{ fontSize: 16, color: 'var(--workspace-text-muted)' }}>
            {t('personnel.personnelPage.укажите_целевые_знач')}{periodRangeText ? ` · ${periodRangeText}` : ''}
          </div>
        </div>
        {canEdit ? (
          <select
            value={kpi.period}
            onChange={(e) => onChangePeriod(e.target.value)}
            title={t('personnel.personnelPage.период_плана')}
            style={{
              height: 36, paddingInline: 12, paddingRight: 32, borderRadius: 4,
              fontSize: 16, fontWeight: 500, cursor: 'pointer',
              border: '1px solid color-mix(in srgb, var(--gold) 40%, transparent)',
              background: 'color-mix(in srgb, var(--gold) 12%, transparent)', color: 'var(--gold)',
              fontFamily: "'Montserrat', sans-serif", appearance: 'none', WebkitAppearance: 'none',
              backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23e6c364' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 11px center', outline: 'none',
            }}
          >
            {KPI_PERIODS.map((period) => (
              <option key={period.id} value={period.id} style={{ background: 'var(--green-deep)' }}>{period.label}</option>
            ))}
          </select>
        ) : (
          <span style={{ fontSize: 16, color: 'var(--gold)', fontWeight: 500 }}>{kpi.period}</span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {kpi.goals.map((goal, index) => (
          <div key={goal.key} style={{ padding: '18px 16px', borderRadius: 6, background: 'var(--green-deep)', boxShadow: 'inset 0 0 0 1px rgba(201,168,76,0.18)' }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--workspace-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
              {goal.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              {canEdit ? (
                <input
                  ref={index === 0 ? firstInputRef : undefined}
                  type="text"
                  inputMode="numeric"
                  value={goal.plan}
                  onChange={(event) => onChangePlan(goal.key, event.target.value.replace(/[^\d]/g, ''))}
                  aria-label={`План: ${goal.label}`}
                  style={{ width: '100%', minWidth: 0, background: 'transparent', border: 'none', borderBottom: '1px solid color-mix(in srgb, var(--gold) 45%, transparent)', color: GOLD, fontSize: 30, fontWeight: 500, fontFamily: "'Montserrat', sans-serif", fontVariantNumeric: 'tabular-nums', outline: 'none', padding: '0 0 6px' }}
                />
              ) : (
                <span style={{ color: GOLD, fontSize: 30, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{goal.plan.toLocaleString('ru-RU')}</span>
              )}
              <span style={{ flexShrink: 0, fontSize: 16, color: 'var(--workspace-text-muted)' }}>{goal.unit}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Модалка аккаунта ────────────────────────────────────────────────────────

// Карточка поля вкладки «Аккаунт» — одна и та же оболочка что при просмотре, что при
// редактировании, чтобы переключение режима не дёргало сетку/высоту панели.
function AccountFieldCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '12px 14px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--hub-card-border)' }}>
      <div style={{ fontSize: 12, color: 'var(--workspace-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}

function AccountFieldValue({ value }: { value: string }) {
  return (
    <div style={{ fontSize: 16, color: value === 'Не заполнен' ? TEXT_MUTED : TEXT_MAIN, wordBreak: 'break-word' }}>
      {value}
    </div>
  )
}

function AccountFieldInput({
  inputRef, value, onChange, placeholder, type = 'text',
}: {
  inputRef?: React.RefObject<HTMLInputElement | null>
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      ref={inputRef}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', background: 'transparent',
        border: 'none', borderBottom: '1px dashed color-mix(in srgb, var(--gold) 50%, transparent)',
        outline: 'none', padding: '0 0 2px', margin: 0,
        fontSize: 16, fontFamily: "'Montserrat', sans-serif", color: TEXT_MAIN,
      }}
      onFocus={(e) => { e.currentTarget.style.borderBottom = '1px solid var(--gold)' }}
      onBlur={(e) => { e.currentTarget.style.borderBottom = '1px dashed color-mix(in srgb, var(--gold) 50%, transparent)' }}
    />
  )
}

function AccountLoginPreview({ phone, telegram, accent }: { phone?: string; telegram?: string; accent: string }) {
    const { t } = useI18n();
  if (!phone && !telegram) {
    return <span style={{ fontSize: 16, color: TEXT_MUTED }}>{t('personnel.personnelPage.не_заполнен')}</span>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {phone && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 16, color: TEXT_MAIN }}>
          <Phone size={15} style={{ color: accent, flexShrink: 0 }} />
          {phone}
        </span>
      )}
      {telegram && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 16, color: TEXT_MAIN }}>
          <Send size={15} style={{ color: accent, flexShrink: 0 }} />
          {telegram}
        </span>
      )}
    </div>
  )
}

function PasswordChangeDialog({
  employee,
  onClose,
  onSubmit,
}: {
  employee: Employee
  onClose: () => void
  onSubmit: (password: string) => Promise<void>
}) {
  const passwordRef = useRef<HTMLInputElement>(null)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    passwordRef.current?.focus()
  }, [])

  const submit = async () => {
    if (saving) return
    if (password.trim().length < 6) {
      setError('Пароль должен содержать минимум 6 символов')
      return
    }
    if (password !== confirmation) {
      setError('Пароли не совпадают')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onSubmit(password)
      onClose()
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Не удалось сменить пароль')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="presentation"
      onClick={() => { if (!saving) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 110,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        background: 'rgba(0, 17, 13, 0.72)', backdropFilter: 'blur(8px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(460px, 100%)', borderRadius: 8, overflow: 'hidden',
          background: 'var(--green-card)',
          boxShadow: 'inset 0 0 0 1px rgba(201,168,76,0.2), 0 18px 48px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', background: 'var(--green-deep)' }}>
          <span style={{ width: 32, height: 32, borderRadius: 4, background: 'color-mix(in srgb, var(--gold) 14%, transparent)', color: GOLD, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <KeyRound size={16} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id="change-password-title" style={{ margin: 0, fontSize: 19, fontWeight: 500, color: TEXT_MAIN }}>Сменить пароль</h2>
            <p style={{ margin: '3px 0 0', fontSize: 16, color: TEXT_MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{employee.vacant ? employee.position : employee.name}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Закрыть" style={{ padding: 6, border: 'none', borderRadius: 4, background: 'transparent', color: TEXT_MUTED, cursor: saving ? 'not-allowed' : 'pointer' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ display: 'grid', gap: 14, padding: 18 }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 16, color: TEXT_MAIN }}>
            Новый пароль
            <input
              ref={passwordRef}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={{ height: 42, borderRadius: 4, border: '1px solid var(--green-border)', background: 'var(--green-deep)', color: TEXT_MAIN, font: 'inherit', padding: '0 12px' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 16, color: TEXT_MAIN }}>
            Подтвердите пароль
            <input
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void submit() }}
              style={{ height: 42, borderRadius: 4, border: '1px solid var(--green-border)', background: 'var(--green-deep)', color: TEXT_MAIN, font: 'inherit', padding: '0 12px' }}
            />
          </label>
          {error && <p role="alert" style={{ margin: 0, fontSize: 16, color: '#ffb4ab' }}>{error}</p>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 18px', background: 'var(--green-deep)' }}>
          <button type="button" onClick={onClose} disabled={saving} style={{ height: 40, paddingInline: 16, borderRadius: 4, border: '1px solid var(--green-border)', background: 'transparent', color: TEXT_MUTED, fontSize: 16, cursor: saving ? 'not-allowed' : 'pointer' }}>Отмена</button>
          <button type="button" onClick={() => void submit()} disabled={saving || !password || !confirmation} style={{ height: 40, paddingInline: 16, borderRadius: 4, border: '1px solid var(--gold)', background: 'var(--gold)', color: 'var(--gold-btn-text, #1a1a1a)', fontSize: 16, fontWeight: 500, cursor: saving || !password || !confirmation ? 'not-allowed' : 'pointer', opacity: saving || !password || !confirmation ? 0.55 : 1 }}>
            {saving ? 'Сохранение…' : 'Сохранить пароль'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EmployeeModal({
  employee,
  canEdit,
  canEditPermissions,
  canChangeCredentials,
  permissions,
  kpiOverride,
  onClose,
  onSaveAccount,
  onChangePassword,
  onDelete,
  onTogglePermission,
  onChangePlan,
  onChangePeriod,
}: {
  employee: Employee
  canEdit: boolean
  canEditPermissions: boolean
  canChangeCredentials: boolean
  permissions: PermissionMap
  kpiOverride?: KpiPlanOverride
  onClose: () => void
  onSaveAccount: (id: string, patch: { position: string; name: string; email: string; phone: string; telegram: string; password: string }) => Promise<void>
  onChangePassword: (id: string, password: string) => Promise<void>
  onDelete: (id: string) => void
  onTogglePermission: (empId: string, role: EmployeeRole, key: PermissionKey, next: PermissionLevel) => void
  onChangePlan: (empId: string, key: 'revenue' | 'deals' | 'leads', value: string) => void
  onChangePeriod: (empId: string, period: string) => void
}) {
    const { t } = useI18n();
  const s = ROLE_STYLE[employee.role] ?? ROLE_STYLE.manager
  const isVacant = employee.vacant === true
  const initials = getInitials(isVacant ? '?' : employee.name || '?')
  const showPermissions = employee.role !== 'owner'
  const [tab, setTab] = useState<'info' | 'access' | 'kpi'>('info')
  const firstPlanInputRef = useRef<HTMLInputElement>(null)
  const firstAccountFieldRef = useRef<HTMLInputElement>(null)
  const kpi = useMemo(() => buildEmployeeKpi(employee, kpiOverride), [employee, kpiOverride])

  const [editingAccount, setEditingAccount] = useState(false)
  const [accountForm, setAccountForm] = useState(() => ({
    position: employee.position ?? '',
    name: isVacant ? '' : (employee.name ?? ''),
    email: employee.email ?? '',
    phone: employee.phone ?? '',
    telegram: employee.telegram ?? '',
    password: '',
  }))
  const [savingAccount, setSavingAccount] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)

  useEffect(() => {
    if (!editingAccount) return
    const el = firstAccountFieldRef.current
    if (el) { el.focus(); el.select() }
  }, [editingAccount])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (passwordDialogOpen) { setPasswordDialogOpen(false); return }
      if (editingAccount) { setEditingAccount(false); return }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, editingAccount, passwordDialogOpen])

  function startAccountEdit() {
    setAccountForm({
      position: employee.position ?? '',
      name: isVacant ? '' : (employee.name ?? ''),
      email: employee.email ?? '',
      phone: employee.phone ?? '',
      telegram: employee.telegram ?? '',
      password: '',
    })
    setAccountError(null)
    setEditingAccount(true)
  }

  function cancelAccountEdit() {
    setEditingAccount(false)
    setAccountError(null)
  }

  async function saveAccount() {
    if (!accountForm.position.trim() || savingAccount) return
    setSavingAccount(true)
    setAccountError(null)
    try {
      await onSaveAccount(employee.id, {
        position: accountForm.position.trim(),
        name: accountForm.name.trim(),
        email: accountForm.email.trim(),
        phone: accountForm.phone.trim(),
        telegram: accountForm.telegram.trim(),
        password: accountForm.password.trim(),
      })
      setEditingAccount(false)
    } catch (err: unknown) {
      setAccountError((err as { message?: string })?.message || 'Не удалось сохранить изменения')
    } finally {
      setSavingAccount(false)
    }
  }

  const tabs: { id: 'info' | 'access' | 'kpi'; label: string; icon: typeof Contact }[] = [
    { id: 'info', label: 'Аккаунт', icon: Contact },
    { id: 'access', label: 'Доступы', icon: ShieldQuestion },
    { id: 'kpi', label: 'План', icon: TrendingUp },
  ]

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(960px, 94vw)',
          height: 'min(880px, 94vh)',
          background: 'var(--green-card)',
          borderRadius: 8,
          boxShadow: 'inset 0 0 0 1px rgba(201,168,76,0.18), 0 12px 48px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Шапка */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '16px 20px',
          background: 'var(--green-deep)',
        }}>
          <div style={{
            width: 48, height: 48, flexShrink: 0, borderRadius: '50%',
            background: s.badge, border: `1px solid ${s.accent}50`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: s.accent, fontSize: 16, fontWeight: 500, overflow: 'hidden',
          }}>
            {employee.avatarUrl
              ? <img src={employee.avatarUrl} alt={employee.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 500, color: TEXT_MAIN, letterSpacing: '-0.01em' }}>
                {employee.position}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: s.text, background: s.badge,
                border: `1px solid ${s.accent}40`,
                borderRadius: 4, padding: '2px 7px',
              }}>
                {ROLE_LABELS[employee.role]}
              </span>
            </div>
            <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 2 }}>
              {isVacant ? 'Сотрудник не назначен' : employee.name}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: 6, color: 'var(--workspace-text-dim)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 4 }}
            aria-label={t('personnel.personnelPage.закрыть')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Табы */}
        <div style={{ display: 'flex', background: 'var(--green-deep)' }}>
          {tabs.map((t) => {
            const active = tab === t.id
            const Icon = t.icon
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '12px 12px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${active ? 'var(--gold)' : 'transparent'}`,
                  color: active ? 'var(--gold)' : 'rgba(255,255,255,0.72)',
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 13, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'color 0.15s, border-color 0.15s',
                }}
              >
                <Icon size={14} />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Контент */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {tab === 'info' && (
            <div style={{ padding: '18px 20px', display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                <AccountFieldCard label={t('personnel.personnelPage.имя_аккаунта')}>
                  {editingAccount ? (
                    <AccountFieldInput
                      inputRef={firstAccountFieldRef}
                      value={accountForm.position}
                      onChange={(v) => setAccountForm((f) => ({ ...f, position: v }))}
                      placeholder={t('personnel.personnelPage.название_аккаунта')}
                    />
                  ) : (
                    <AccountFieldValue value={employee.position} />
                  )}
                </AccountFieldCard>
                <AccountFieldCard label={t('personnel.personnelPage.роль')}>
                  <AccountFieldValue value={ROLE_LABELS[employee.role]} />
                </AccountFieldCard>
                <AccountFieldCard label={t('personnel.personnelPage.имя_сотрудника')}>
                  {editingAccount ? (
                    <AccountFieldInput
                      value={accountForm.name}
                      onChange={(v) => setAccountForm((f) => ({ ...f, name: v }))}
                      placeholder={t('personnel.personnelPage.не_заполнен')}
                    />
                  ) : (
                    <AccountFieldValue value={employee.vacant ? 'Не заполнен' : employee.name} />
                  )}
                </AccountFieldCard>
                <AccountFieldCard label={t('personnel.personnelPage.email_сотрудника')}>
                  {editingAccount ? (
                    <AccountFieldInput
                      type="email"
                      value={accountForm.email}
                      onChange={(v) => setAccountForm((f) => ({ ...f, email: v }))}
                      placeholder="name@company.com"
                    />
                  ) : (
                    <AccountFieldValue value={employee.email || 'Не заполнен'} />
                  )}
                </AccountFieldCard>
                <AccountFieldCard label={t('personnel.personnelPage.телефон')}>
                  {editingAccount ? (
                    <AccountFieldInput
                      value={accountForm.phone}
                      onChange={(v) => setAccountForm((f) => ({ ...f, phone: v }))}
                      placeholder="+995 ..."
                    />
                  ) : (
                    <AccountFieldValue value={employee.phone || 'Не заполнен'} />
                  )}
                </AccountFieldCard>
                <AccountFieldCard label="Telegram">
                  {editingAccount ? (
                    <AccountFieldInput
                      value={accountForm.telegram}
                      onChange={(v) => setAccountForm((f) => ({ ...f, telegram: v }))}
                      placeholder="@username"
                    />
                  ) : (
                    <AccountFieldValue value={employee.telegram || 'Не заполнен'} />
                  )}
                </AccountFieldCard>
                <AccountFieldCard label={t('personnel.personnelPage.логин')}>
                  <AccountLoginPreview
                    phone={editingAccount ? accountForm.phone : employee.phone}
                    telegram={editingAccount ? accountForm.telegram : employee.telegram}
                    accent={s.accent}
                  />
                </AccountFieldCard>
              </div>
              {editingAccount && canChangeCredentials && (
                <AccountFieldCard label={t('personnel.personnelPage.новый_пароль')}>
                  <AccountFieldInput
                    type="password"
                    value={accountForm.password}
                    onChange={(v) => setAccountForm((f) => ({ ...f, password: v }))}
                    placeholder={t('personnel.personnelPage.оставьте_пустым_чтоб')}
                  />
                </AccountFieldCard>
              )}
              {editingAccount && accountError && (
                <div style={{ fontSize: 16, color: '#ffb4ab' }}>{accountError}</div>
              )}
            </div>
          )}

          {tab === 'access' && (
            <div style={{ padding: '18px 20px' }}>
              {showPermissions ? (
                <>
                  {!canEditPermissions && (
                    <div style={{ fontSize: 13, color: 'var(--workspace-text-muted)', letterSpacing: '0.05em', textAlign: 'right', marginBottom: 10 }}>
                      {t('personnel.personnelPage.только_просмотр')}</div>
                  )}
                  <PermissionLegend />
                  <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid var(--hub-card-border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                      <colgroup>
                        <col />
                        <col style={{ width: 130 }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th style={accessHeadCellStyle}>{t('personnel.personnelPage.раздел')}</th>
                          <th style={{ ...accessHeadCellStyle, textAlign: 'center' }}>{t('personnel.personnelPage.уровень')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from(new Set(PERMISSIONS.map((p) => p.group))).map((group) => (
                          <Fragment key={group}>
                            <tr>
                              <th colSpan={2} style={accessGroupCellStyle}>{group}</th>
                            </tr>
                            {PERMISSIONS.filter((p) => p.group === group).map((perm, i) => {
                              const lvl = permissions[perm.key]
                              return (
                                <tr key={perm.key} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                                  <td style={accessLabelCellStyle} title={perm.hint}>
                                    {perm.label}
                                  </td>
                                  <td style={accessCheckCellStyle}>
                                    <PermissionLevelControl
                                      value={lvl}
                                      disabled={!canEditPermissions}
                                      onChange={(next) => onTogglePermission(employee.id, employee.role, perm.key, next)}
                                      label={`Уровень доступа к «${perm.label}»`}
                                    />
                                  </td>
                                </tr>
                              )
                            })}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--workspace-text-muted)', fontSize: 16 }}>
                  {t('personnel.personnelPage.у_владельца_полный_д')}</div>
              )}
            </div>
          )}

          {tab === 'kpi' && (
            <div style={{ padding: '16px 20px' }}>
              <EmployeeKpiPanel
                kpi={kpi}
                canEdit={canEdit}
                firstInputRef={firstPlanInputRef}
                onChangePlan={(key, value) => onChangePlan(employee.id, key, value)}
                onChangePeriod={(period) => onChangePeriod(employee.id, period)}
              />
            </div>
          )}
        </div>

        {/* Футер */}
        {canEdit && (
          <div style={{ display: 'flex', gap: 10, padding: '14px 20px', background: 'var(--green-deep)' }}>
            {tab === 'info' && editingAccount ? (
              <>
                <button
                  type="button"
                  onClick={() => void saveAccount()}
                  disabled={!accountForm.position.trim() || savingAccount}
                  style={{
                    flex: 1, height: 40, borderRadius: 4,
                    border: `1px solid ${s.accent}40`, background: s.badge, color: s.text,
                    fontSize: 16, fontWeight: 500,
                    cursor: accountForm.position.trim() && !savingAccount ? 'pointer' : 'not-allowed',
                    opacity: accountForm.position.trim() && !savingAccount ? 1 : 0.5,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <Check size={15} /> {savingAccount ? 'Сохранение…' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  onClick={cancelAccountEdit}
                  disabled={savingAccount}
                  style={{ height: 40, paddingInline: 18, borderRadius: 4, border: '1px solid var(--green-border)', background: 'transparent', color: 'var(--workspace-text-dim)', fontSize: 16, cursor: 'pointer' }}
                >
                  {t('personnel.personnelPage.отмена')}</button>
              </>
            ) : tab !== 'access' ? (
              <button
                type="button"
                onClick={() => {
                  if (tab === 'kpi') {
                    const el = firstPlanInputRef.current
                    if (el) { el.focus(); el.select() }
                  } else {
                    startAccountEdit()
                  }
                }}
                style={{
                  flex: 1, height: 40, borderRadius: 4,
                  border: `1px solid ${s.accent}40`, background: s.badge, color: s.text,
                  fontSize: 16, fontWeight: 500, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <Pencil size={15} /> {tab === 'kpi' ? 'Изменить план' : 'Редактировать'}
              </button>
            ) : null}
            {tab === 'info' && !editingAccount && canChangeCredentials && (
              <button
                type="button"
                onClick={() => setPasswordDialogOpen(true)}
                style={{
                  height: 40, paddingInline: 16, borderRadius: 4,
                  border: '1px solid rgba(230,195,100,0.45)', background: 'transparent', color: GOLD,
                  fontSize: 16, fontWeight: 500, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <KeyRound size={15} /> Сменить пароль
              </button>
            )}
            {!editingAccount && employee.role === 'manager' && (
              <button
                type="button"
                onClick={() => onDelete(employee.id)}
                style={{
                  height: 40, paddingInline: 16, borderRadius: 4,
                  border: '1px solid rgba(255,180,171,0.3)', background: 'rgba(255,180,171,0.08)', color: '#ffb4ab',
                  fontSize: 16, fontWeight: 500, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <Trash2 size={15} /> {t('personnel.personnelPage.удалить_слот')}</button>
            )}
          </div>
        )}
      </div>
      {passwordDialogOpen && (
        <PasswordChangeDialog
          employee={employee}
          onClose={() => setPasswordDialogOpen(false)}
          onSubmit={(password) => onChangePassword(employee.id, password)}
        />
      )}
    </div>
  )
}

function AddManagerSlotNode({ onClick }: { onClick: () => void }) {
    const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      title={t('personnel.personnelPage.добавить_менеджера')}
      style={{
        width: NODE_WIDTH,
        minHeight: 96,
        borderRadius: 6,
        border: '1px dashed var(--gold)',
        background: 'color-mix(in srgb, var(--gold) 7%, var(--green-card))',
        color: 'var(--gold)',
        boxShadow: 'inset 0 0 0 1px rgba(201,168,76,0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '12px 14px',
        cursor: 'pointer',
        fontFamily: "'Montserrat', sans-serif",
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 44,
          height: 44,
          borderRadius: 4,
          border: '1px solid color-mix(in srgb, var(--gold) 42%, transparent)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          fontWeight: 400,
          lineHeight: 1,
        }}
      >
        +
      </span>
      <span style={{ fontSize: 16, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {t('personnel.personnelPage.менеджер')}</span>
    </button>
  )
}

// ─── Узел дерева ──────────────────────────────────────────────────────────────

type OrgNodeTreeProps = {
  employee: Employee
  allEmployees: Employee[]
  onSelect: (e: Employee) => void
  selectedId: string | null
  editMode: boolean
  onEdit: (e: Employee) => void
  onDelete: (id: string) => void
  onAddChild: (managerId: string) => void
  onVacate: (e: Employee) => void
  onAssign: (e: Employee) => void
}

function OrgNode({
  employee,
  allEmployees,
  onSelect,
  selectedId,
  editMode,
  onEdit,
  onDelete,
  onAddChild,
  onVacate,
  onAssign,
}: OrgNodeTreeProps) {
    const { t } = useI18n();
  const children = buildChildren(allEmployees, employee.id)
  const managerSlotCount = employee.role === 'rop'
    ? children.filter((child) => child.role === 'manager').length
    : 0
  const canAddManagerSlot = editMode && employee.role === 'rop'
  const childColumns: Array<
    | { kind: 'employee'; id: string; width: number; employee: Employee }
    | { kind: 'add-manager'; id: string; width: number }
  > = children.map((child) => ({
    kind: 'employee',
    id: child.id,
    width: getSubtreeWidth(child.id, allEmployees, editMode),
    employee: child,
  }))

  if (canAddManagerSlot) {
    childColumns.push({ kind: 'add-manager', id: `${employee.id}-add-manager`, width: NODE_WIDTH })
  }

  const isRopManagerTeam = employee.role === 'rop' && children.every((child) => child.role === 'manager')
  const ropTeamColumns = Math.min(ROP_TEAM_COLUMNS, childColumns.length)

  const treeProps: Omit<OrgNodeTreeProps, 'employee'> = {
    allEmployees,
    onSelect,
    selectedId,
    editMode,
    onEdit,
    onDelete,
    onAddChild,
    onVacate,
    onAssign,
  }

  const subtreeW = getSubtreeWidth(employee.id, allEmployees, editMode)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: childColumns.length > 0 ? subtreeW : NODE_WIDTH,
        flexShrink: 0,
      }}
    >
      <EmployeeNode
        employee={employee}
        isSelected={selectedId === employee.id}
        editMode={editMode}
        onClick={() => onSelect(employee)}
        onEdit={() => onEdit(employee)}
        onDelete={() => onDelete(employee.id)}
        onVacate={() => onVacate(employee)}
        onAssign={() => onAssign(employee)}
      />

      {childColumns.length > 0 && (
        isRopManagerTeam ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: subtreeW,
              flexShrink: 0,
            }}
          >
            <div style={{ ...orgStemStyle, height: ORG_STEM_H }} />
            <section
              aria-label={`Команда РОПа: ${managerSlotCount} менеджеров`}
              style={{
                width: '100%',
                padding: ROP_TEAM_FRAME_GUTTER,
                borderRadius: 6,
                boxSizing: 'border-box',
                background: 'color-mix(in srgb, var(--green-card) 76%, var(--green-deep))',
                boxShadow: 'inset 0 0 0 1px rgba(201,168,76,0.28)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                <span style={{ fontSize: 16, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)' }}>
                  {t('personnel.personnelPage.команда_продаж')}</span>
                <span style={{ fontSize: 16, color: TEXT_MUTED, fontVariantNumeric: 'tabular-nums' }}>
                  {managerSlotCount} {t('personnel.personnelPage.аккаунтов')}</span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${ropTeamColumns}, ${NODE_WIDTH}px)`,
                  gap: `${ROP_TEAM_ROW_GAP}px ${ORG_CHILD_GAP}px`,
                  alignItems: 'start',
                }}
              >
                {childColumns.map((column) => (
                  <div key={column.id} style={{ width: NODE_WIDTH, minWidth: 0 }}>
                    {column.kind === 'employee' ? (
                      <OrgNode employee={column.employee} {...treeProps} />
                    ) : (
                      <AddManagerSlotNode onClick={() => onAddChild(employee.id)} />
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : childColumns.length === 1 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: childColumns[0].width,
              flexShrink: 0,
            }}
          >
            <div style={{ ...orgStemStyle, height: ORG_STEM_H }} />
            {childColumns[0].kind === 'employee' ? (
              <OrgNode employee={childColumns[0].employee} {...treeProps} />
            ) : (
              <AddManagerSlotNode onClick={() => onAddChild(employee.id)} />
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: subtreeW,
              flexShrink: 0,
            }}
          >
            <div style={{ ...orgStemStyle, height: ORG_STEM_H }} />
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'flex-start',
                width: subtreeW,
                position: 'relative',
                flexShrink: 0,
              }}
            >
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 0,
                  left: childColumns[0].width / 2,
                  right: childColumns[childColumns.length - 1].width / 2,
                  height: 1,
                  background: LINE,
                  pointerEvents: 'none',
                }}
              />
              {childColumns.map((column, index) => {
                return (
                  <div
                    key={column.id}
                    style={{
                      width: column.width,
                      marginRight: index < childColumns.length - 1 ? ORG_CHILD_GAP : 0,
                      flexShrink: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ ...orgStemStyle, height: ORG_STEM_H }} />
                    {column.kind === 'employee' ? (
                      <OrgNode employee={column.employee} {...treeProps} />
                    ) : (
                      <AddManagerSlotNode onClick={() => onAddChild(employee.id)} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      )}
    </div>
  )
}

// ─── Форма ────────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '',
  role: 'manager' as EmployeeRole,
  position: '',
  managerId: '',
  loginEmail: '',
  password: '',
  phone: '',
  email: '',
  hireDate: '',
  birthDate: '',
  department: '',
  city: '',
  telegram: '',
  aboutMe: '',
  skills: '',
  whatsapp: '',
  vk: '',
  instagram: '',
  website: '',
}

const splitSkills = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

const iStyle: React.CSSProperties = { height: 34, width: '100%', borderRadius: 4, border: '1px solid var(--green-border)', background: 'var(--green-deep)', color: 'var(--workspace-text)', fontSize: 12, padding: '0 10px', outline: 'none' }
const lStyle: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 500, color: 'var(--workspace-text-dim)', marginBottom: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }
const sStyle: React.CSSProperties = { ...iStyle, appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }

function EmployeeForm({ initial, employees, isEdit, saving, onSave, onCancel, initialPerms, canChangeCredentials = false }: {
  initial?: Partial<typeof EMPTY_FORM>
  employees: Employee[]
  isEdit?: boolean
  saving?: boolean
  onSave: (data: typeof EMPTY_FORM, accessProfile: Record<string, string>) => void
  onCancel: () => void
  initialPerms?: Record<string, string>
  canChangeCredentials?: boolean
}) {
    const { t } = useI18n();
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial })
  const set = (k: keyof typeof EMPTY_FORM, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const [activeTab, setActiveTab] = useState<'account' | 'access'>('account')
  const [permMap, setPermMap] = useState<PermissionMap>(() => {
    const base = getDefaultPermissionsForRole(initial?.role ?? 'manager')
    if (!initialPerms) return base
    const overrides: Partial<PermissionMap> = {}
    for (const [k, v] of Object.entries(initialPerms)) {
      if (v === 'none' || v === 'view' || v === 'edit') overrides[k as PermissionKey] = v as PermissionLevel
    }
    return { ...base, ...overrides }
  })
  const valid =
    form.position.trim() &&
    (isEdit || (form.name.trim() && (form.phone.trim() || form.telegram.trim()) && form.password.trim().length >= 6))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  useEffect(() => {
    setPermMap((prev) => {
      const base = getDefaultPermissionsForRole(form.role)
      const merged: PermissionMap = { ...base }
      for (const key of Object.keys(base) as PermissionKey[]) {
        if (key in prev) merged[key] = prev[key]
      }
      return merged
    })
  }, [form.role])

  const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }

  const TABS = [
    { id: 'account' as const, label: 'Аккаунт' },
    { id: 'access' as const, label: 'Доступы' },
  ]

  return (
    <div
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: 24 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(680px, 94vw)', maxHeight: '92vh', background: 'var(--green-card)', borderRadius: 8, boxShadow: 'inset 0 0 0 1px rgba(201,168,76,0.18), 0 12px 48px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {/* Шапка */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', background: 'var(--green-deep)' }}>
          <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 8, background: 'color-mix(in srgb, var(--gold) 14%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold)' }}>
            <UserPlus size={18} />
          </div>
          <span style={{ flex: 1, fontSize: 16, fontWeight: 500, color: TEXT_MAIN }}>
            {initial ? 'Редактировать аккаунт' : 'Новый аккаунт'}
          </span>
          <button type="button" onClick={onCancel} aria-label={t('personnel.personnelPage.закрыть')} style={{ padding: 6, color: 'var(--workspace-text-dim)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Табы */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--hub-card-border)', background: 'var(--green-deep)', padding: '0 20px' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              style={{
                height: 40, paddingInline: 16, background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 500,
                color: activeTab === t.id ? 'var(--gold)' : 'var(--workspace-text-dim)',
                borderBottom: activeTab === t.id ? '2px solid var(--gold)' : '2px solid transparent',
                marginBottom: -1, transition: 'color 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Тело */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {/* ── Аккаунт ── */}
          {activeTab === 'account' && (
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={grid2}>
                <div>
                  <label style={lStyle}>{t('personnel.personnelPage.роль')}</label>
                  <select style={{ ...sStyle, opacity: 0.72 }} value={form.role} disabled>
                    {(Object.entries(ROLE_LABELS) as [EmployeeRole, string][]).map(([k, v]) => (
                      <option key={k} value={k} style={{ background: 'var(--green-deep)' }}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={lStyle}>{t('personnel.personnelPage.родительский_аккаунт')}</label>
                  <select style={{ ...sStyle, opacity: 0.72 }} value={form.managerId} disabled>
                    <option value="" style={{ background: 'var(--green-deep)' }}>{t('personnel.personnelPage.нет')}</option>
                    {employees.map((e) => <option key={e.id} value={e.id} style={{ background: 'var(--green-deep)' }}>{e.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={grid2}>
                <div><label style={lStyle}>{t('personnel.personnelPage.имя_аккаунта')}</label><input style={iStyle} value={form.position} onChange={(e) => set('position', e.target.value)} placeholder={t('personnel.personnelPage.менеджер_1')} /></div>
                <div><label style={lStyle}>{t('personnel.personnelPage.имя_сотрудника')}</label><input style={iStyle} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={t('personnel.personnelPage.не_заполнен')} /></div>
              </div>
              <div style={grid2}>
                <div><label style={lStyle}>{t('personnel.personnelPage.телефон_логин')}</label><input style={iStyle} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+995 ..." /></div>
                <div><label style={lStyle}>{t('personnel.personnelPage.telegram_логин')}</label><input style={iStyle} value={form.telegram} onChange={(e) => set('telegram', e.target.value)} placeholder="@username" /></div>
              </div>
              {canChangeCredentials && (
                <div>
                  <label style={lStyle}>{isEdit ? 'Новый пароль' : 'Пароль *'}</label>
                  <input style={iStyle} type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder={isEdit ? 'Оставьте пустым' : 'Минимум 6 символов'} />
                </div>
              )}
            </div>
          )}

          {/* ── Доступы ── */}
          {activeTab === 'access' && (
            form.role === 'owner' ? (
              <p style={{ fontSize: 16, color: 'var(--workspace-text-dim)', padding: '12px 0' }}>{t('personnel.personnelPage.у_владельца_полный_д')}</p>
            ) : (
              <>
                <PermissionLegend />
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 16 }}>
                  <colgroup>
                    <col />
                    <col style={{ width: 130 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={accessHeadCellStyle}>{t('personnel.personnelPage.раздел')}</th>
                      <th style={{ ...accessHeadCellStyle, textAlign: 'center' }}>{t('personnel.personnelPage.уровень')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(new Set(PERMISSIONS.map((p) => p.group))).map((group) => (
                      <Fragment key={group}>
                        <tr><th colSpan={2} style={accessGroupCellStyle}>{group}</th></tr>
                        {PERMISSIONS.filter((p) => p.group === group).map((perm, i) => (
                          <tr key={perm.key} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                            <td style={accessLabelCellStyle} title={perm.hint}>{perm.label}</td>
                            <td style={accessCheckCellStyle}>
                              <PermissionLevelControl
                                value={permMap[perm.key]}
                                disabled={false}
                                onChange={(next) => setPermMap((map) => ({ ...map, [perm.key]: next }))}
                                label={`Уровень доступа к «${perm.label}»`}
                              />
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </>
            )
          )}
        </div>

        {/* Футер */}
        <div style={{ display: 'flex', gap: 10, padding: '14px 20px', background: 'var(--green-deep)' }}>
          <button
            type="button"
            onClick={() => valid && !saving && onSave(form, serializeAccessProfile(permMap))}
            disabled={!valid || saving}
            className={valid && !saving ? 'alphabase-section-primary' : ''}
            style={valid && !saving ? { flex: 1, height: 40, justifyContent: 'center' } : { flex: 1, height: 40, borderRadius: 4, border: '1px solid var(--hub-card-border)', background: 'var(--hub-card-bg)', color: 'var(--workspace-text-dim)', fontSize: 16, fontWeight: 400, cursor: 'not-allowed', opacity: 0.45 }}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
          <button type="button" onClick={onCancel} style={{ height: 40, paddingInline: 18, borderRadius: 4, border: '1px solid var(--green-border)', background: 'transparent', color: 'var(--workspace-text-dim)', fontSize: 16, cursor: 'pointer' }}>
            {t('personnel.personnelPage.отмена')}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Стили ролей для управления аккаунтами (gold для owner, mint для остальных) ─

const MGMT_ACCENT: Record<UserRole, { accent: string; badge: string }> = {
  owner:            { accent: GOLD, badge: 'color-mix(in srgb, var(--gold) 14%, transparent)' },
  director:         { accent: MINT, badge: 'rgba(208,232,223,0.10)' },
  rop:              { accent: MINT, badge: 'rgba(208,232,223,0.08)' },
  marketer:         { accent: MINT, badge: 'rgba(208,232,223,0.08)' },
  manager:          { accent: MINT, badge: 'rgba(208,232,223,0.06)' },
  lawyer:           { accent: MINT, badge: 'rgba(208,232,223,0.08)' },
  procurement_head: { accent: MINT, badge: 'rgba(208,232,223,0.08)' },
  administrator:    { accent: MINT, badge: 'rgba(208,232,223,0.08)' },
  trainee:          { accent: MINT, badge: 'rgba(208,232,223,0.05)' },
  finance:          { accent: MINT, badge: 'rgba(208,232,223,0.08)' },
  developer:        { accent: MINT, badge: 'rgba(208,232,223,0.08)' },
  hr:               { accent: MINT, badge: 'rgba(208,232,223,0.08)' },
  partner:          { accent: MINT, badge: 'rgba(208,232,223,0.08)' },
}

// ─── Вкладка управления аккаунтами ────────────────────────────────────────────

function AccountManagementTab({
  currentUserId,
  employees,
  canBlockOwner,
  onToggleStatus,
}: {
  currentUserId: string
  employees: Employee[]
  canBlockOwner: boolean
  onToggleStatus: (id: string, blocked: boolean) => Promise<void>
}) {
    const { t } = useI18n();
  const [busyId, setBusyId] = useState<string | null>(null)
  const teamAccounts = employees.filter((e) => e.loginEmail)

  return (
    <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        padding: '12px 16px',
        borderRadius: 6,
        border: '1px solid rgba(201,168,76,0.28)',
        background: 'rgba(201,168,76,0.06)',
        fontSize: 12,
        color: 'rgba(208,232,223,0.85)',
        marginBottom: 4,
      }}>
        {t('personnel.personnelPage.заблокированный_акка')}</div>

      {teamAccounts.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--workspace-text-dim)' }}>
          {t('personnel.personnelPage.нет_заполненных_акка')}</p>
      )}

      {teamAccounts.map((user) => {
        const isSelf = user.id === currentUserId
        const isProtectedOwner = user.role === 'owner' && !canBlockOwner
        const blocked = user.status === 'blocked'
        const style = MGMT_ACCENT[user.role as UserRole] ?? MGMT_ACCENT.manager
        const initials = user.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()

        return (
          <div
            key={user.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '12px 16px',
              borderRadius: 6,
              border: `1px solid ${blocked ? 'rgba(255,180,171,0.25)' : 'rgba(201,168,76,0.2)'}`,
              background: blocked ? 'rgba(255,180,171,0.05)' : 'var(--green-card)',
              boxShadow: blocked ? 'none' : 'inset 0 0 0 1px rgba(201,168,76,0.08)',
              opacity: blocked ? 0.75 : 1,
              transition: 'all 0.15s',
            }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
              background: style.badge,
              border: `1px solid ${style.accent}40`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 500, color: style.accent,
            }}>
              {initials}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: TEXT_MAIN }}>{user.name}</span>
                <span style={{
                  fontSize: 9, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: style.accent, background: style.badge,
                  border: `1px solid ${style.accent}40`,
                  borderRadius: 4, padding: '2px 7px',
                }}>
                  {ROLE_LABEL[user.role as UserRole]}
                </span>
                {blocked && (
                  <span style={{
                    fontSize: 9, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: '#ffb4ab', background: 'rgba(255,180,171,0.10)',
                    border: '1px solid rgba(255,180,171,0.3)',
                    borderRadius: 4, padding: '2px 7px',
                  }}>
                    {t('personnel.personnelPage.заблокирован')}</span>
                )}
              </div>
              <span style={{ fontSize: 11, color: 'var(--workspace-text-dim)', marginTop: 2, display: 'block' }}>
                {user.loginEmail}
              </span>
            </div>

            <button
              disabled={isSelf || isProtectedOwner || busyId === user.id}
              onClick={async () => {
                setBusyId(user.id)
                try {
                  await onToggleStatus(user.id, !blocked)
                } finally {
                  setBusyId(null)
                }
              }}
              title={isSelf ? 'Нельзя заблокировать себя' : isProtectedOwner ? 'Директор не блокирует собственника' : blocked ? 'Разблокировать' : 'Заблокировать'}
              style={{
                height: 32, paddingInline: 14, borderRadius: 4,
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 500, cursor: isSelf || isProtectedOwner ? 'not-allowed' : 'pointer',
                opacity: isSelf || isProtectedOwner ? 0.35 : 1,
                border: blocked
                  ? `1px solid ${MINT}40`
                  : '1px solid rgba(255,180,171,0.35)',
                background: blocked
                  ? 'rgba(208,232,223,0.08)'
                  : 'rgba(255,180,171,0.08)',
                color: blocked ? MINT : '#ffb4ab',
                transition: 'all 0.15s',
                flexShrink: 0,
              }}
            >
              {blocked
                ? <><ShieldCheck size={13} /> {t('personnel.personnelPage.разблокировать')}</>
                : <><ShieldOff size={13} /> {t('personnel.personnelPage.заблокировать')}</>
              }
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ─── Главная страница ──────────────────────────────────────────────────────────

export function PersonnelPage() {
    const { t } = useI18n();
  const { currentUser, updateProfile } = useAuth()
  // Доступы считаются по роли занимаемой позиции (teamRole из ensure-self):
  // аккаунтная role реального логина — идентичность кабинета («agency»), в матрице
  // ROLE_PERMISSIONS её нет. Fallback на role — для демо-сессий (мок-роли и есть позиции).
  const userRole = (currentUser?.teamRole ?? currentUser?.role ?? 'manager') as UserRole
  const canEdit = canDo('manage_team', userRole)
  const isOwner = userRole === 'owner'
  const canManagePasswords = canManageTeamPasswords(currentUser)
  const canManageAccounts = isOwner || userRole === 'director'

  const [activeTab] = useState<'org' | 'management'>('org')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loadingTeam, setLoadingTeam] = useState(true)
  const [teamError, setTeamError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Employee | null>(null)
  const [assignTarget, setAssignTarget] = useState<Employee | null>(null)
  const [assignName, setAssignName] = useState('')
  const [assignEmail, setAssignEmail] = useState('')
  const [assignTelegram, setAssignTelegram] = useState('')
  const [assignPhone, setAssignPhone] = useState('')
  // Итог назначения: найден существующий пользователь или создан новый (со ссылкой-приглашением).
  const [assignResult, setAssignResult] = useState<{ title: string; text: string; inviteLink?: string } | null>(null)
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [orgScale, setOrgScale] = useState(1)
  const [orgPan, setOrgPan] = useState({ x: 0, y: 0 })
  const [orgPanDrag, setOrgPanDrag] = useState<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const [permissionOverrides, setPermissionOverrides] = useState<Record<string, Partial<PermissionMap>>>({})
  const [kpiPlans, setKpiPlans] = useState<Record<string, KpiPlanOverride>>({})

  const updateOrgScale = (next: number | ((current: number) => number)) => {
    setOrgScale((current) => clampOrgScale(typeof next === 'function' ? next(current) : next))
  }

  const resetOrgViewport = () => {
    setOrgScale(1)
    setOrgPan({ x: 0, y: 0 })
  }

  const startOrgPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, textarea, select, [role="button"]')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setOrgPanDrag({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: orgPan.x,
      originY: orgPan.y,
    })
  }

  const moveOrgPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!orgPanDrag || orgPanDrag.pointerId !== event.pointerId) return
    setOrgPan({
      x: orgPanDrag.originX + event.clientX - orgPanDrag.startX,
      y: orgPanDrag.originY + event.clientY - orgPanDrag.startY,
    })
  }

  const stopOrgPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!orgPanDrag || orgPanDrag.pointerId !== event.pointerId) return
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* pointer capture мог уже сброситься */
    }
    setOrgPanDrag(null)
  }

  const loadTeam = async () => {
    setLoadingTeam(true)
    setTeamError(null)
    try {
      try {
        await teamApi.ensureSelf()
      } catch {
        /* ensure-self недоступен на бэкенде — не блокируем загрузку списка команды */
      }
      // organizationId сервер выводит из TenantContext сессии (ADR-002), не из
      // аргумента — teamApi.list() ничего не принимает.
      const items = await teamApi.list()
      const mapped = items.map(teamUserToEmployee)
      setEmployees(mapped)
      // Локальный кэш правок прав сбрасываем — итог считается из записи (профиль позиции + дельта).
      setPermissionOverrides({})
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data
          ?.message ||
        (err as { message?: string })?.message ||
        'Не удалось загрузить команду'
      setTeamError(message)
    } finally {
      setLoadingTeam(false)
    }
  }

  useEffect(() => {
    void loadTeam()
    // Перезагружаем, когда ensureTeam в AuthContext дотянул реальный teamId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.companyId])

  const updateKpiPlan = (empId: string, key: 'revenue' | 'deals' | 'leads', value: string) => {
    setKpiPlans((prev) => ({
      ...prev,
      [empId]: { ...(prev[empId] ?? {}), [key]: value === '' ? undefined : Number(value) },
    }))
  }
  const updateKpiPeriod = (empId: string, period: string) => {
    setKpiPlans((prev) => ({ ...prev, [empId]: { ...(prev[empId] ?? {}), period } }))
  }

  const canEditPermissions = canEdit

  const resolvePermissions = (emp: Employee): PermissionMap => {
    const role = emp.role in DEFAULT_PERMISSIONS ? emp.role : 'manager'
    const local = permissionOverrides[emp.id]
    // local — кэш уже абсолютной карты после правки; иначе считаем профиль позиции + персональную дельту.
    if (local) return resolveModulePermissions(role, local)
    return resolveEffectiveAccess(role, emp.accessProfile ?? emp.permissionOverrides, emp.personalAccess)
  }

  const togglePermission = async (
    empId: string,
    _role: EmployeeRole,
    key: PermissionKey,
    next: PermissionLevel,
  ) => {
    if (!canEditPermissions) return
    const employee = employees.find((e) => e.id === empId)
    if (!employee) return
    // Правим АБСОЛЮТНЫЙ профиль доступа позиции (не diff-от-роли) — снимок не «протухает» при смене роли.
    const updatedMap: PermissionMap = { ...resolvePermissions(employee), [key]: next }
    const serialized = serializeAccessProfile(updatedMap)

    try {
      // accessProfile — профиль позиции; permissionOverrides зеркалим для рантайм-гардов (читают его).
      await teamApi.update(empId, { accessProfile: serialized, permissionOverrides: serialized })
      setPermissionOverrides((prev) => ({ ...prev, [empId]: updatedMap }))
      setEmployees((prev) =>
        prev.map((e) =>
          e.id === empId ? { ...e, accessProfile: serialized, permissionOverrides: serialized } : e,
        ),
      )
      if (currentUser?.id === empId) {
        updateProfile({ permissionOverrides: serialized })
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data
          ?.message ||
        (err as { message?: string })?.message ||
        'Не удалось сохранить права'
      setTeamError(message)
    }
  }

  const visibleRoots = useMemo(
    () => employees.filter((e) => !e.managerId),
    [employees],
  )

  const ropAccount = useMemo(
    () => employees.find((e) => e.role === 'rop') ?? null,
    [employees],
  )

  const managerSlotCount = useMemo(
    () => employees.filter((e) => e.role === 'manager' && e.managerId === ropAccount?.id).length,
    [employees, ropAccount?.id],
  )

  const handleAdd = async (data: typeof EMPTY_FORM, accessProfile: Record<string, string>) => {
    setSaving(true)
    setTeamError(null)
    try {
      const login = data.telegram.trim() || data.phone.trim() || data.loginEmail.trim()
      const created = await teamApi.create({
        name: data.name.trim(),
        role: data.role,
        position: data.position.trim(),
        managerId: data.managerId || undefined,
        loginEmail: login,
        password: data.password,
        email: login || undefined,
        phone: data.phone.trim() || undefined,
        hireDate: data.hireDate || undefined,
        birthDate: data.birthDate || undefined,
        department: data.department.trim() || undefined,
        city: data.city.trim() || undefined,
        telegram: data.telegram.trim() || undefined,
        aboutMe: data.aboutMe.trim() || undefined,
        skills: splitSkills(data.skills),
        whatsapp: data.whatsapp.trim() || undefined,
        vk: data.vk.trim() || undefined,
        instagram: data.instagram.trim() || undefined,
        website: data.website.trim() || undefined,
      })
      await teamApi.update(created.id, { accessProfile })
      setEmployees((prev) => [...prev, teamUserToEmployee(created)])
      setShowForm(false)
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data
          ?.message ||
        (err as { message?: string })?.message ||
        'Не удалось создать аккаунт'
      setTeamError(message)
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async (data: typeof EMPTY_FORM, accessProfile: Record<string, string>) => {
    if (!editTarget) return
    setSaving(true)
    setTeamError(null)
    try {
      const nextLogin = data.telegram.trim() || data.phone.trim() || editTarget.loginEmail || ''
      const updated = await teamApi.update(editTarget.id, {
        name: data.name.trim(),
        role: data.role,
        position: data.position.trim(),
        managerId: data.managerId || null,
        loginEmail: nextLogin,
        password: isOwner ? data.password.trim() || undefined : undefined,
        email: nextLogin,
        phone: data.phone.trim() || undefined,
        hireDate: undefined,
        birthDate: undefined,
        department: undefined,
        city: undefined,
        telegram: data.telegram.trim() || undefined,
        aboutMe: undefined,
        skills: [],
        whatsapp: undefined,
        vk: undefined,
        instagram: undefined,
        website: undefined,
        accessProfile,
      })
      setEmployees((prev) =>
        prev.map((e) => (e.id === editTarget.id ? teamUserToEmployee(updated) : e)),
      )
      if (selectedId === editTarget.id) setSelectedId(null)
      setEditTarget(null)
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data
          ?.message ||
        (err as { message?: string })?.message ||
        'Не удалось сохранить изменения'
      setTeamError(message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    const emp = employees.find((e) => e.id === id)
    if (emp?.role !== 'manager') return
    const subCount = employees.filter((e) => e.managerId === id).length
    const msg = subCount > 0
      ? `Удалить менеджерский слот «${emp?.position ?? 'Менеджер'}» и ${subCount} подчинённых слотов?`
      : `Удалить менеджерский слот «${emp?.position ?? 'Менеджер'}»?`
    if (!window.confirm(msg)) return
    setTeamError(null)
    try {
      await teamApi.remove(id)
      setEmployees((prev) => prev.filter((e) => e.id !== id && e.managerId !== id))
      setSelectedId(null)
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data
          ?.message ||
        (err as { message?: string })?.message ||
        'Не удалось удалить аккаунт'
      setTeamError(message)
    }
  }

  const handleToggleStatus = async (id: string, blocked: boolean) => {
    setTeamError(null)
    const updated = await teamApi.setStatus(id, blocked ? 'blocked' : 'active')
    setEmployees((prev) =>
      prev.map((e) => (e.id === id ? teamUserToEmployee(updated) : e)),
    )
  }

  const handleVacate = async (emp: Employee) => {
    if (emp.role === 'owner') return
    setTeamError(null)
    if (typeof window !== 'undefined' && !window.confirm(`Освободить аккаунт «${emp.position}»? Человек снимается, клиенты и доступы остаются на позиции.`)) return
    try {
      const updated = await teamApi.vacate(emp.positionId ?? emp.id)
      setEmployees((prev) => prev.map((e) => (e.id === emp.id ? teamUserToEmployee(updated) : e)))
    } catch (err: unknown) {
      setTeamError((err as { message?: string })?.message || 'Не удалось освободить позицию')
    }
  }

  const openAssign = (emp: Employee) => {
    setAssignTarget(emp)
    setAssignName('')
    setAssignEmail('')
    setAssignTelegram('')
    setAssignPhone('')
  }

  const isValidEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value.trim())

  const submitAssign = async () => {
    const login = assignTelegram.trim() || assignPhone.trim() || assignEmail.trim()
    if (!assignTarget || !assignName.trim() || !isValidEmail(assignEmail) || !login) return
    setTeamError(null)
    try {
      const result = await teamApi.assignOccupant(assignTarget.positionId ?? assignTarget.id, {
        name: assignName.trim(),
        email: assignEmail.trim(),
        loginEmail: login,
        phone: assignPhone.trim() || undefined,
        telegram: assignTelegram.trim() || undefined,
      })
      setEmployees((prev) => prev.map((e) => (e.id === assignTarget.id ? teamUserToEmployee(result.user) : e)))
      setAssignTarget(null)
      setInviteLinkCopied(false)
      setAssignResult(
        result.linkedExisting || !result.inviteToken
          ? {
              title: 'Пользователь найден',
              text: 'Аккаунт с таким email уже существует — сотрудник назначен на позицию и войдёт со своим обычным паролем.',
            }
          : {
              title: 'Пользователь создан — отправьте приглашение',
              text: 'Пользователя с таким email ещё не было. Передайте сотруднику ссылку любым способом — по ней он установит пароль и получит доступ. Ссылка действует 7 дней.',
              inviteLink: `${window.location.origin}/#/invite/${result.inviteToken}`,
            },
      )
    } catch (err: unknown) {
      setTeamError((err as { message?: string })?.message || 'Не удалось заполнить аккаунт')
    }
  }

  const handleAddManagerSlot = async (managerId: string) => {
    setTeamError(null)
    try {
      const nextNumber = managerSlotCount + 1
      // Заголовки позиций в БД храним на английском (см. teams-tracker.md);
      // локализация отображения — задача UI-слоя, не хранилища.
      const created = await teamApi.createAccountSlot({
        role: 'manager',
        position: `Manager ${nextNumber}`,
        managerId,
        accessProfile: serializeAccessProfile(getDefaultPermissionsForRole('manager')),
      })
      setEmployees((prev) => [...prev, teamUserToEmployee(created)])
    } catch (err: unknown) {
      setTeamError((err as { message?: string })?.message || 'Не удалось добавить аккаунт менеджера')
    }
  }

  const startEdit = (emp: Employee) => {
    setEditTarget(emp)
    setSelectedId(null)
    setShowForm(false)
  }

  const saveAccountInline = async (
    employeeId: string,
    patch: { position: string; name: string; email: string; phone: string; telegram: string; password: string },
  ) => {
    const current = employees.find((e) => e.id === employeeId)
    const nextLogin = patch.telegram || patch.phone || current?.loginEmail || ''
    const updated = await teamApi.update(employeeId, {
      name: patch.name,
      position: patch.position,
      phone: patch.phone || undefined,
      telegram: patch.telegram || undefined,
      loginEmail: nextLogin,
      email: patch.email || undefined,
      ...(isOwner && patch.password ? { password: patch.password } : {}),
    })
    setEmployees((prev) => prev.map((e) => (e.id === employeeId ? teamUserToEmployee(updated) : e)))
  }

  const changeEmployeePassword = async (employeeId: string, password: string) => {
    if (!canManageTeamPasswords(currentUser)) {
      throw new Error('Недостаточно прав для смены пароля')
    }
    if (password.length < 6) {
      throw new Error('Пароль должен содержать минимум 6 символов')
    }
    await teamApi.update(employeeId, { password })
  }

  // Реальная сессия (не демо): jwt_token всегда ставится реальным логином и
  // удаляется мок-логином (см. AuthContext.login).
  const isRealSession = typeof window !== 'undefined' && !!window.localStorage.getItem('jwt_token')
  // Не владелец и не занимает позицию ни в одной команде (roster из БД пуст) —
  // раздел «Команда» закрыт.
  const teamAccessDenied =
    isRealSession && !loadingTeam && !teamError && employees.length === 0 && currentUser?.isOwner !== true

  if (teamAccessDenied) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col items-center justify-center bg-[var(--app-bg)] text-[color:var(--workspace-text)]" style={{ padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Доступ ограничен</div>
          <div style={{ fontSize: 14, color: 'var(--workspace-text-dim)', lineHeight: 1.5 }}>
            У вас нет доступа к разделу «Команда»: вы не являетесь владельцем компании и не назначены
            ни на одну позицию. Обратитесь к владельцу вашей команды.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-[var(--app-bg)] text-[color:var(--workspace-text)]">
      <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Шапка */}
        <div
          className="shrink-0 border-b border-[var(--green-border)] shadow-[0_1px_0_rgba(201,168,76,0.1)]"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 24px',
            background: 'var(--shell-elevated-bg)',
            backdropFilter: 'blur(12px)',
            zIndex: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div
              className="flex items-center justify-center rounded-full border border-[var(--hub-card-border-hover)] bg-[var(--green-deep)] text-[color:var(--theme-accent-heading)]"
              style={{ width: 34, height: 34 }}
            >
              <Users size={16} />
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--workspace-text-dim)', margin: 0 }}>{t('personnel.personnelPage.аккаунты')}</p>
              <p style={{ fontSize: 17, fontWeight: 500, color: 'var(--workspace-text)', margin: '2px 0 0', letterSpacing: '-0.01em' }}>
                {t('personnel.personnelPage.оргструктура_аккаунт')}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {activeTab === 'org' && (
              <>
                <span style={{ fontSize: 12, color: 'var(--workspace-text-dim)' }}>{employees.length} {t('personnel.personnelPage.аккаунтов_менеджеры')}{managerSlotCount}</span>
                <div
                  aria-label={t('personnel.personnelPage.масштаб_оргструктуры')}
                  style={{
                    height: 32,
                    borderRadius: 4,
                    border: '1px solid var(--green-border)',
                    background: 'rgba(3,29,22,0.45)',
                    display: 'flex',
                    alignItems: 'center',
                    overflow: 'hidden',
                    boxShadow: 'inset 0 0 0 1px rgba(201,168,76,0.08)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => updateOrgScale((current) => current - ORG_SCALE_STEP)}
                    title={t('personnel.personnelPage.уменьшить_масштаб')}
                    style={{
                      width: 32,
                      height: 30,
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--workspace-text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <ZoomOut size={15} />
                  </button>
                  <span
                    style={{
                      width: 58,
                      textAlign: 'center',
                      fontSize: 16,
                      fontWeight: 500,
                      color: 'var(--workspace-text)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {Math.round(orgScale * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => updateOrgScale((current) => current + ORG_SCALE_STEP)}
                    title={t('personnel.personnelPage.увеличить_масштаб')}
                    style={{
                      width: 32,
                      height: 30,
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--workspace-text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <ZoomIn size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={resetOrgViewport}
                    title={t('personnel.personnelPage.сбросить_масштаб')}
                    style={{
                      width: 32,
                      height: 30,
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--gold)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
                {canEdit && !showForm && !editTarget && (
                  <button
                    type="button"
                    onClick={() => setEditMode((v) => !v)}
                    title={editMode ? 'Завершить редактирование' : 'Включить действия над аккаунтами'}
                    style={{
                      height: 32, paddingInline: 12, borderRadius: 4,
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 12, fontWeight: 500, cursor: 'pointer',
                      border: `1px solid ${editMode ? 'var(--gold)' : 'var(--green-border)'}`,
                      background: editMode ? 'color-mix(in srgb, var(--gold) 14%, transparent)' : 'transparent',
                      color: editMode ? 'var(--gold)' : 'var(--workspace-text-dim)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {editMode ? <><Check size={13} /> {t('personnel.personnelPage.готово')}</> : <><Pencil size={13} /> {t('personnel.personnelPage.аккаунты')}</>}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {teamError && (
          <div
            className="shrink-0"
            style={{
              margin: '12px 24px 0',
              padding: '10px 14px',
              borderRadius: 6,
              border: '1px solid rgba(255,180,171,0.35)',
              background: 'rgba(255,180,171,0.08)',
              color: '#ffb4ab',
              fontSize: 13,
            }}
          >
            {teamError}
          </div>
        )}

        {activeTab === 'management' && canManageAccounts
          ? (
            <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
              <AccountManagementTab
                currentUserId={currentUser?.id ?? ''}
                employees={employees}
                canBlockOwner={isOwner}
                onToggleStatus={handleToggleStatus}
              />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

              {loadingTeam ? (
                <p style={{ padding: '32px 24px', fontSize: 14, color: 'var(--workspace-text-dim)' }}>
                  {t('personnel.personnelPage.загрузка_команды')}</p>
              ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {/* Заполнить аккаунт человеком — модалка */}
              {assignTarget && (
                <div
                  onClick={() => setAssignTarget(null)}
                  style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: '100%', maxWidth: 420, background: 'var(--green-card)', border: '1px solid var(--gold)', borderRadius: 6, padding: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.55)' }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 500, color: TEXT_MAIN, marginBottom: 4 }}>{t('personnel.personnelPage.заполнить_аккаунт')}</div>
                    <div style={{ fontSize: 13, color: TEXT_MUTED, marginBottom: 16 }}>
                      {t('personnel.personnelPage.аккаунт')}{assignTarget.position}{t('personnel.personnelPage.клиенты_и_доступы_о')}</div>
                    <label style={{ display: 'block', fontSize: 13, color: TEXT_MUTED, marginBottom: 6 }}>{t('personnel.personnelPage.имя_сотрудника')}</label>
                    <input
                      value={assignName}
                      onChange={(e) => setAssignName(e.target.value)}
                      placeholder={t('personnel.personnelPage.иван_петров')}
                      style={{ width: '100%', height: 38, marginBottom: 12, padding: '0 12px', borderRadius: 4, border: `1px solid ${CARD_BORDER}`, background: 'var(--green-deep)', color: TEXT_MAIN, fontSize: 15 }}
                    />
                    <label style={{ display: 'block', fontSize: 13, color: TEXT_MUTED, marginBottom: 6 }}>{t('personnel.personnelPage.email_сотрудника')}</label>
                    <input
                      type="email"
                      value={assignEmail}
                      onChange={(e) => setAssignEmail(e.target.value)}
                      placeholder="name@company.com"
                      style={{ width: '100%', height: 38, marginBottom: 4, padding: '0 12px', borderRadius: 4, border: `1px solid ${CARD_BORDER}`, background: 'var(--green-deep)', color: TEXT_MAIN, fontSize: 15 }}
                    />
                    <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 12 }}>{t('personnel.personnelPage.email_подсказка')}</div>
                    <label style={{ display: 'block', fontSize: 13, color: TEXT_MUTED, marginBottom: 6 }}>{t('personnel.personnelPage.телефон_логин')}</label>
                    <input
                      value={assignPhone}
                      onChange={(e) => setAssignPhone(e.target.value)}
                      placeholder="+995 ..."
                      style={{ width: '100%', height: 38, marginBottom: 12, padding: '0 12px', borderRadius: 4, border: `1px solid ${CARD_BORDER}`, background: 'var(--green-deep)', color: TEXT_MAIN, fontSize: 15 }}
                    />
                    <label style={{ display: 'block', fontSize: 13, color: TEXT_MUTED, marginBottom: 6 }}>{t('personnel.personnelPage.telegram_логин')}</label>
                    <input
                      value={assignTelegram}
                      onChange={(e) => setAssignTelegram(e.target.value)}
                      placeholder="@username"
                      style={{ width: '100%', height: 38, marginBottom: 20, padding: '0 12px', borderRadius: 4, border: `1px solid ${CARD_BORDER}`, background: 'var(--green-deep)', color: TEXT_MAIN, fontSize: 15 }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                      <button
                        type="button"
                        onClick={() => setAssignTarget(null)}
                        style={{ height: 38, padding: '0 16px', borderRadius: 4, border: `1px solid ${CARD_BORDER}`, background: 'transparent', color: TEXT_MUTED, fontSize: 15, cursor: 'pointer' }}
                      >
                        {t('personnel.personnelPage.отмена')}</button>
                      <button
                        type="button"
                        onClick={() => void submitAssign()}
                        disabled={!assignName.trim() || !isValidEmail(assignEmail) || !(assignPhone.trim() || assignTelegram.trim() || assignEmail.trim())}
                        style={{ height: 38, padding: '0 16px', borderRadius: 4, border: '1px solid var(--gold)', background: 'var(--gold)', color: 'var(--gold-btn-text, #1a1a1a)', fontSize: 15, fontWeight: 500, cursor: 'pointer', opacity: !assignName.trim() || !isValidEmail(assignEmail) || !(assignPhone.trim() || assignTelegram.trim() || assignEmail.trim()) ? 0.5 : 1 }}
                      >
                        {t('personnel.personnelPage.заполнить')}</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Итог назначения (найден / создан + ссылка-приглашение) — модалка */}
              {assignResult && (
                <div
                  onClick={() => setAssignResult(null)}
                  style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: '100%', maxWidth: 480, background: 'var(--green-card)', border: '1px solid var(--gold)', borderRadius: 6, padding: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.55)' }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 500, color: TEXT_MAIN, marginBottom: 4 }}>{assignResult.title}</div>
                    <div style={{ fontSize: 13, color: TEXT_MUTED, marginBottom: 16 }}>{assignResult.text}</div>
                    {assignResult.inviteLink && (
                      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                        <input
                          readOnly
                          value={assignResult.inviteLink}
                          onFocus={(e) => e.currentTarget.select()}
                          style={{ flex: 1, height: 38, padding: '0 12px', borderRadius: 4, border: `1px solid ${CARD_BORDER}`, background: 'var(--green-deep)', color: TEXT_MAIN, fontSize: 13 }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard?.writeText(assignResult.inviteLink!).then(() => setInviteLinkCopied(true))
                          }}
                          style={{ height: 38, padding: '0 14px', borderRadius: 4, border: '1px solid var(--gold)', background: inviteLinkCopied ? 'transparent' : 'var(--gold)', color: inviteLinkCopied ? 'var(--gold)' : 'var(--gold-btn-text, #1a1a1a)', fontSize: 14, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          {inviteLinkCopied ? 'Скопировано' : 'Скопировать'}
                        </button>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => setAssignResult(null)}
                        style={{ height: 38, padding: '0 16px', borderRadius: 4, border: `1px solid ${CARD_BORDER}`, background: 'transparent', color: TEXT_MUTED, fontSize: 15, cursor: 'pointer' }}
                      >
                        Закрыть
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Форма — модалка */}
              {(showForm || editTarget) && (
                <EmployeeForm
                  isEdit={!!editTarget}
                  saving={saving}
                  initial={editTarget ? {
                    name: editTarget.name,
                    role: editTarget.role,
                    position: editTarget.position,
                    managerId: editTarget.managerId ?? '',
                    loginEmail: editTarget.loginEmail ?? editTarget.email ?? '',
                    password: '',
                    phone: editTarget.phone ?? '',
                    email: editTarget.email ?? '',
                    telegram: editTarget.telegram ?? '',
                  } : undefined}
                  employees={employees.filter((e) => !editTarget || e.id !== editTarget.id)}
                  initialPerms={editTarget?.accessProfile ?? editTarget?.permissionOverrides}
                  canChangeCredentials={isOwner}
                  onSave={editTarget ? handleEdit : handleAdd}
                  onCancel={() => {
                    setShowForm(false)
                    setEditTarget(null)
                  }}
                />
              )}

              {/* Дерево: по высоте — весь доступный экран; скролл только если не помещается */}
              <div
                data-team-org-viewport="true"
                className="min-h-0 flex-1 overscroll-contain"
                onPointerDown={startOrgPan}
                onPointerMove={moveOrgPan}
                onPointerUp={stopOrgPan}
                onPointerCancel={stopOrgPan}
                style={{
                  padding: '16px 8px 32px',
                  overflow: 'hidden',
                  WebkitOverflowScrolling: 'touch',
                  cursor: orgPanDrag ? 'grabbing' : 'grab',
                  touchAction: 'none',
                  userSelect: orgPanDrag ? 'none' : 'auto',
                }}
              >
                <div
                  data-team-org-canvas="true"
                  style={{
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    minWidth: '100%',
                    width: 'max-content',
                    margin: '0 auto',
                    padding: '8px 32px 40px',
                    boxSizing: 'border-box',
                    transform: `translate(${orgPan.x}px, ${orgPan.y}px) scale(${orgScale})`,
                    transformOrigin: 'center top',
                    transition: orgPanDrag ? 'none' : 'transform 0.15s ease',
                    willChange: 'transform',
                  }}
                >
                  {visibleRoots.length === 0 ? (
                    <p style={{ padding: '48px 0', fontSize: 14, color: 'var(--app-text-subtle)' }}>
                      {canEdit
                        ? 'Оргструктура аккаунтов пуста.'
                        : 'Оргструктура аккаунтов пуста. Управление доступно руководителям.'}
                    </p>
                  ) : (
                    visibleRoots.map((root) => (
                      <div key={root.id} style={{ marginBottom: visibleRoots.length > 1 ? 40 : 0 }}>
                      <OrgNode
                        employee={root}
                        allEmployees={employees}
                        onSelect={(e) => setSelectedId(e.id)}
                        selectedId={selectedId}
                        editMode={editMode && canEdit}
                        onEdit={startEdit}
                        onDelete={handleDelete}
                        onAddChild={handleAddManagerSlot}
                        onVacate={handleVacate}
                        onAssign={openAssign}
                      />
                      </div>
                    ))
                  )}
                </div>
              </div>
              </div>
              )}
            </div>
          )
        }
      </div>

      {(() => {
        const selected = selectedId ? employees.find((e) => e.id === selectedId) ?? null : null
        if (!selected) return null
        return (
          <EmployeeModal
            key={selected.id}
            employee={selected}
            // Вне режима «АККАУНТЫ» (editMode) попап карточки — только просмотр,
            // даже для владельца: кнопки Edit и переключатели доступов скрыты.
            canEdit={canEdit && editMode}
            canEditPermissions={canEditPermissions && editMode}
            canChangeCredentials={canManagePasswords && editMode}
            permissions={resolvePermissions(selected)}
            kpiOverride={kpiPlans[selected.id]}
            onClose={() => setSelectedId(null)}
            onSaveAccount={saveAccountInline}
            onChangePassword={changeEmployeePassword}
            onDelete={handleDelete}
            onTogglePermission={togglePermission}
            onChangePlan={updateKpiPlan}
            onChangePeriod={updateKpiPeriod}
          />
        )
      })()}
    </div>
  )
}
