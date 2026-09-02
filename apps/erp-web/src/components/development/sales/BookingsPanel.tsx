import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'

import { compactRoomsLabel } from '@/lib/chessboard'
import { optionLabel } from '@/lib/project-options'
import type { IProject, IUnit } from '@/types/core'
import { useCoreStore } from '@/store/useCoreStore'
import { useI18n, type Translate } from '@/i18n'

import { developmentApi } from '@/services/developmentApi'
import { bookingsKey } from './salesManagementStorage'
import {
  devStatusToApi,
  fetchProjectBookingRows,
  type DevBookingRow,
  type DevBookingStatus,
} from './bookingsApi'
import { RealtorProfileModal, type RealtorProfile } from './RealtorProfileModal'

export type { DevBookingRow, DevBookingStatus }

const REALTOR_PROFILES: Record<string, Omit<RealtorProfile, 'name' | 'agency'>> = {
  'Ирина Соколова': {
    position: 'Старший риэлтор',
    experienceYears: 7,
    phone: '+995 591 805 562',
    email: 'i.sokolova@white-estates.ge',
    telegram: 'irina_sokolova',
    whatsapp: '995591805562',
  },
  'Георгий Меладзе': {
    position: 'Риэлтор по новостройкам',
    experienceYears: 4,
    phone: '+995 599 88 77 66',
    email: 'g.meladze@batumi-prime.ge',
    telegram: 'g_meladze',
    whatsapp: '995599887766',
  },
  'Дмитрий Волков': {
    position: 'Ведущий риэлтор',
    experienceYears: 9,
    phone: '+7 921 555 11 22',
    email: 'd.volkov@premier-estate.com',
    telegram: 'volkov_realty',
  },
  'Анна Ким': {
    position: 'Риэлтор',
    experienceYears: 3,
    phone: '+7 916 444 33 22',
    email: 'a.kim@global-realty.com',
    whatsapp: '79164443322',
  },
  'Максим Петров': {
    position: 'Партнёр-риэлтор',
    experienceYears: 6,
    phone: '+995 577 12 34 56',
    email: 'm.petrov@sun-realty.ge',
    telegram: 'maxpetrov',
  },
  'Элина Краснова свободный риэлтор': {
    position: 'Свободный риэлтор',
    experienceYears: 5,
    phone: '+7 985 222 11 00',
    email: 'elina.krasnova@gmail.com',
    telegram: 'elina_kr',
    whatsapp: '79852221100',
  },
}

function buildRealtorProfile(name: string, agency: string): RealtorProfile {
  const base = REALTOR_PROFILES[name] ?? {}
  return {
    name,
    agency: agency || undefined,
    ...base,
  }
}

const inputClass =
  'h-8 w-full rounded-[4px] border border-[rgba(242,207,141,0.22)] bg-[rgba(0,0,0,0.24)] px-2 text-[15px] text-[#fcecc8] outline-none transition-colors focus:border-[rgba(242,207,141,0.5)]'


function seedBookings(projectId: string): DevBookingRow[] {
  if (projectId !== 'project-sample') return []
  return [
    {
      id: 'bk-1',
      projectId,
      unitLabel: 'A-1204',
      realtorName: 'Ирина Соколова',
      agency: 'White Estates',
      status: 'in_progress',
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      confirmUntilAt: new Date(Date.now() + 2 * 60 * 60 * 1000 + 17 * 60 * 1000).toISOString(),
      manager: 'Михайлов О.П.',
      comment: 'Ожидает подтверждения.',
    },
    {
      id: 'bk-2',
      projectId,
      unitLabel: 'B-0802',
      realtorName: 'Георгий Меладзе',
      agency: 'Batumi Prime',
      status: 'in_progress',
      createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
      confirmUntilAt: new Date(Date.now() + 38 * 60 * 1000 + 44 * 1000).toISOString(),
      manager: 'Сергеева О.П.',
      comment: 'Ждём финального ответа по клиенту.',
    },
    {
      id: 'bk-6',
      projectId,
      unitLabel: 'D-1101',
      realtorName: 'Дмитрий Волков',
      agency: 'Premier Estate',
      status: 'in_progress',
      createdAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
      confirmUntilAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      manager: 'Михайлов О.П.',
      comment: 'Клиент не вышел на связь.',
    },
    {
      id: 'bk-3',
      projectId,
      unitLabel: 'A-0501',
      realtorName: 'Анна Ким',
      agency: 'Global Realty',
      status: 'booked',
      createdAt: new Date(Date.now() - 84 * 60 * 60 * 1000).toISOString(),
      confirmUntilAt: new Date(Date.now() - 60 * 60 * 60 * 1000).toISOString(),
      manager: 'Ким Д.',
      comment: 'Договор подписан.',
    },
    {
      id: 'bk-4',
      projectId,
      unitLabel: 'C-0105',
      realtorName: 'Максим Петров',
      agency: 'Sun Realty',
      status: 'paid',
      createdAt: new Date(Date.now() - 200 * 60 * 60 * 1000).toISOString(),
      confirmUntilAt: new Date(Date.now() - 176 * 60 * 60 * 1000).toISOString(),
      manager: 'Михайлов О.П.',
      comment: 'Оплата получена.',
    },
    {
      id: 'bk-5',
      projectId,
      unitLabel: 'B-0310',
      realtorName: 'Элина Краснова свободный риэлтор',
      agency: '',
      status: 'rejected',
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      confirmUntilAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      manager: 'Михайлов О.П.',
      comment: 'Клиент отказался.',
    },
  ]
}

function normalizeStatus(raw: unknown): DevBookingStatus {
  const value = String(raw)
  if (value === 'in_progress' || value === 'booked' || value === 'rejected' || value === 'paid' || value === 'expired') return value as DevBookingStatus
  return 'in_progress'
}

function migrateBooking(raw: unknown, projectId: string): DevBookingRow | null {
  const row = raw as Partial<DevBookingRow> & { status?: string; holdUntilAt?: string | null }
  if (!row.id || row.projectId !== projectId || typeof row.unitLabel !== 'string') return null

  const legacyStatus: string = typeof row.status === 'string' ? row.status : ''
  let status = normalizeStatus(legacyStatus)
  if (legacyStatus === 'confirmed' || legacyStatus === 'expiring' || legacyStatus === 'new') status = 'in_progress'
  if (legacyStatus === 'deal' || legacyStatus === 'awaiting_payment') status = 'booked'

  const confirmUntilAt =
    typeof row.confirmUntilAt === 'string'
      ? row.confirmUntilAt
      : typeof row.holdUntilAt === 'string'
        ? row.holdUntilAt
        : null

  return {
    id: row.id,
    projectId,
    unitLabel: row.unitLabel,
    realtorName: typeof row.realtorName === 'string' ? row.realtorName : '',
    agency: typeof row.agency === 'string' ? row.agency : '',
    status,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
    confirmUntilAt,
    manager: typeof row.manager === 'string' && row.manager.trim() ? row.manager : '—',
    comment: typeof row.comment === 'string' ? row.comment : '',
  }
}

function parseBookings(raw: string | null, projectId: string): DevBookingRow[] | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as unknown[]
    if (!Array.isArray(data)) return null
    return data.map((row) => migrateBooking(row, projectId)).filter((row): row is DevBookingRow => row != null)
  } catch {
    return null
  }
}


function formatDateParts(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '—', time: '' }
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    time: d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
  }
}

function getTimerLeft(confirmUntilAt: string): { h: number; m: number; expired: boolean; urgency: 'ok' | 'warn' | 'expired' } {
  const diff = new Date(confirmUntilAt).getTime() - Date.now()
  if (diff <= 0) return { h: 0, m: 0, expired: true, urgency: 'expired' }

  const h = Math.floor(diff / (1000 * 60 * 60))
  const m = Math.floor((diff / (1000 * 60)) % 60)

  return {
    h,
    m,
    expired: false,
    urgency: h < 12 ? 'warn' : 'ok',
  }
}

function BookingTimer({ confirmUntilAt, onExpired }: { confirmUntilAt: string; onExpired?: () => void }) {
  const { t } = useI18n()
  const [timer, setTimer] = useState(() => getTimerLeft(confirmUntilAt))
  const firedRef = useRef(false)

  useEffect(() => {
    if (timer.expired) {
      if (!firedRef.current) { firedRef.current = true; onExpired?.() }
      return
    }
    const id = setInterval(() => {
      const next = getTimerLeft(confirmUntilAt)
      setTimer(next)
      if (next.expired && !firedRef.current) { firedRef.current = true; onExpired?.() }
    }, 60000)
    return () => clearInterval(id)
  }, [confirmUntilAt, timer.expired, onExpired])

  const color =
    timer.urgency === 'expired'
      ? 'text-[#ff5449]'
      : timer.urgency === 'warn'
        ? 'text-[#ffb74d]'
        : 'text-[#e6c364]'

  const hStr = timer.h.toString().padStart(2, '0')
  const mStr = timer.m.toString().padStart(2, '0')

  return (
    <span className={`font-mono text-[18px] font-medium tabular-nums tracking-wide ${color}`}>
      {hStr}<span className="text-[16px] opacity-70">{t('salesManagement.bookings.timer.hoursSuffix', 'ч')}</span>{' '}{mStr}<span className="text-[16px] opacity-70">{t('salesManagement.bookings.timer.minutesSuffix', 'м')}</span>
    </span>
  )
}

function bookingLotDisplay(row: DevBookingRow, units: IUnit[], buildingNameById: Map<string, string>, t: Translate): string {
  const tail = row.unitLabel.split('-').pop()?.trim().replace(/\s/g, '') ?? ''
  const unit = units.find((item) => String(item.number).replace(/\s/g, '') === tail)
  if (!unit) return row.unitLabel
  const building = buildingNameById.get(unit.building) ?? t('salesManagement.shared.corpusFallback', 'Корпус')
  const rooms = optionLabel(t, 'rooms', compactRoomsLabel(unit.rooms)) || '—'
  const area = unit.area != null ? `${unit.area} ${t('complexCard.areaUnit', 'м²')}` : '—'
  return `${building} · ${rooms} · ${area}`
}

// ---------- Поп-ап управления бронью ----------
interface BookingPopupProps {
  row: DevBookingRow
  anchorRef: React.RefObject<HTMLElement | null>
  onClose: () => void
  onConfirm: (comment: string) => void
  onReject: (comment: string) => void
}

function BookingPopup({ row, anchorRef, onClose, onConfirm, onReject }: BookingPopupProps) {
  const { t } = useI18n()
  const [comment, setComment] = useState(row.comment)
  const popupRef = useRef<HTMLDivElement>(null)

  // Позиционируем под ячейкой статуса
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  useEffect(() => {
    if (!anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 6, left: rect.left })
  }, [anchorRef])

  // Закрываем при клике снаружи
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, anchorRef])

  if (!pos) return null

  return (
    <div
      ref={popupRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, minWidth: 280 }}
      className="rounded-[8px] border border-[rgba(242,207,141,0.2)] bg-[#111a14] shadow-xl p-4 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-[14px] text-[rgba(242,207,141,0.7)]">{row.unitLabel} · {row.realtorName}</span>
        <button type="button" onClick={onClose} className="text-[rgba(242,207,141,0.4)] hover:text-[#fcecc8] transition-colors">
          <X size={15} />
        </button>
      </div>
      <textarea
        autoFocus
        rows={3}
        placeholder={t('salesManagement.bookings.commentPlaceholder', 'Комментарий (необязательно)')}
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, 240))}
        className="w-full resize-none rounded-[4px] border border-[rgba(242,207,141,0.22)] bg-[rgba(0,0,0,0.3)] px-3 py-2 text-[16px] text-[#fcecc8] outline-none transition-colors focus:border-[rgba(242,207,141,0.5)] placeholder:text-[rgba(242,207,141,0.72)]"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onConfirm(comment)}
          className="flex-1 rounded-[6px] bg-[#c9a84c] px-3 py-2 text-[16px] font-normal text-[#0a1f12] transition-colors hover:bg-[#e2c97e]"
        >
          {t('salesManagement.bookings.confirmBooking', 'Бронь')}
        </button>
        <button
          type="button"
          onClick={() => onReject(comment)}
          className="flex-1 rounded-[6px] border border-[rgba(255,100,100,0.3)] bg-[rgba(200,50,50,0.12)] px-3 py-2 text-[16px] font-normal text-[#ffb4ab] transition-colors hover:bg-[rgba(200,50,50,0.22)]"
        >
          {t('salesManagement.bookings.rejectBooking', 'Отказ')}
        </button>
      </div>
    </div>
  )
}

// ---------- Инлайн-редактирование даты ----------
function InlineDateEdit({
  value,
  onChange,
  readOnly,
}: {
  value: string | null
  onChange: (iso: string) => void
  readOnly: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const parts = formatDateParts(value)

  if (readOnly) return (
    <div>
      <div className="text-[14px] text-[rgba(242,207,141,0.85)]">{parts.date}</div>
      {parts.time && <div className="text-[12px] text-[rgba(242,207,141,0.45)]">{parts.time}</div>}
    </div>
  )

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value ? new Date(value).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16))
          setEditing(true)
        }}
        className="text-left underline-offset-2 hover:underline transition-colors"
      >
        <div className="text-[14px] text-[rgba(242,207,141,0.85)] hover:text-[#fcecc8]">{parts.date}</div>
        {parts.time && <div className="text-[12px] text-[rgba(242,207,141,0.45)]">{parts.time}</div>}
      </button>
    )
  }

  return (
    <input
      autoFocus
      type="datetime-local"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft) onChange(new Date(draft).toISOString())
        setEditing(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { if (draft) onChange(new Date(draft).toISOString()); setEditing(false) }
        if (e.key === 'Escape') setEditing(false)
      }}
      className="h-7 rounded-[4px] border border-[rgba(242,207,141,0.4)] bg-[rgba(0,0,0,0.3)] px-2 text-[13px] text-[#fcecc8] outline-none"
    />
  )
}

// ---------- Инлайн-редактирование текста ----------
function InlineTextEdit({
  value,
  onChange,
  readOnly,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  readOnly: boolean
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  if (readOnly) return <span className="text-[15px] text-[rgba(242,207,141,0.85)]">{value || '—'}</span>

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setDraft(value); setEditing(true) }}
        className="text-[15px] text-[rgba(242,207,141,0.85)] hover:text-[#fcecc8] underline-offset-2 hover:underline transition-colors text-left"
      >
        {value || <span className="opacity-40">{placeholder ?? '—'}</span>}
      </button>
    )
  }

  return (
    <input
      autoFocus
      type="text"
      value={draft}
      maxLength={80}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { onChange(draft); setEditing(false) }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { onChange(draft); setEditing(false) }
        if (e.key === 'Escape') setEditing(false)
      }}
      className={inputClass}
    />
  )
}

// ---------- Главный компонент ----------
export function BookingsPanel({
  project,
  units,
  readOnly,
}: {
  project: IProject
  units: IUnit[]
  readOnly: boolean
}) {
  const { t } = useI18n()
  const buildings = useCoreStore((s) => s.buildings)
  const buildingNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const building of buildings) map.set(building._id, building.name ?? t('salesManagement.shared.corpusFallback', 'Корпус'))
    return map
  }, [buildings, t])

  const [rows, setRows] = useState<DevBookingRow[]>([])
  const [filter, setFilter] = useState<'all' | DevBookingStatus>('all')
  const [realtorProfile, setRealtorProfile] = useState<RealtorProfile | null>(null)

  // Поп-ап
  const [popupRowId, setPopupRowId] = useState<string | null>(null)
  const statusCellRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const apiRows = await fetchProjectBookingRows(project._id)
      if (cancelled) return
      if (apiRows) {
        setRows(apiRows)
        try { localStorage.setItem(bookingsKey(project._id), JSON.stringify(apiRows)) } catch { /* ignore */ }
        return
      }
      // Fallback: localStorage cache + demo seed when the API is unavailable.
      const stored = parseBookings(localStorage.getItem(bookingsKey(project._id)), project._id)
      const next = stored?.length ? stored : seedBookings(project._id)
      setRows(next)
      try { localStorage.setItem(bookingsKey(project._id), JSON.stringify(next)) } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [project._id])

  const filteredRows = useMemo(
    () => rows.filter((row) => filter === 'all' || row.status === filter),
    [rows, filter],
  )

  const patchRow = (id: string, patch: Partial<DevBookingRow>) => {
    if (readOnly) return
    // Оптимистично обновляем строку и зеркалим в localStorage (кэш/демо-фолбэк).
    const next = rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
    setRows(next)
    try {
      localStorage.setItem(bookingsKey(project._id), JSON.stringify(next))
    } catch { /* ignore */ }
    void persistPatch(id, patch)
  }

  async function persistPatch(id: string, patch: Partial<DevBookingRow>) {
    try {
      if (patch.status) {
        await developmentApi.updateBookingStatus(id, {
          status: devStatusToApi(patch.status),
          comment: patch.comment,
        })
      }
      const fields: { expiresAt?: string; manager?: string; comment?: string } = {}
      if (patch.confirmUntilAt !== undefined && patch.confirmUntilAt !== null) {
        fields.expiresAt = patch.confirmUntilAt
      }
      if (patch.manager !== undefined) fields.manager = patch.manager
      // Комментарий без смены статуса отправляем отдельным PATCH.
      if (patch.comment !== undefined && !patch.status) fields.comment = patch.comment
      if (Object.keys(fields).length > 0) {
        await developmentApi.updateBooking(id, fields)
      }
    } catch {
      // localStorage уже обновлён выше — оставляем как офлайн-фолбэк.
    }
  }

  const popupRow = rows.find((r) => r.id === popupRowId) ?? null

  const TABS: { id: 'all' | DevBookingStatus; label: string }[] = [
    { id: 'all', label: t('salesManagement.bookings.tabs.all', 'Все') },
    { id: 'in_progress', label: t('salesManagement.bookings.tabs.inProgress', 'В процессе') },
    { id: 'booked', label: t('salesManagement.bookings.tabs.booked', 'Бронь') },
    { id: 'expired', label: t('salesManagement.bookings.tabs.expired', 'Истекла') },
    { id: 'rejected', label: t('salesManagement.bookings.tabs.rejected', 'Отказ') },
    { id: 'paid', label: t('salesManagement.bookings.tabs.paid', 'Оплачены') },
  ]

  return (
    <div className="flex flex-col h-full rounded-[8px] border border-[rgba(242,207,141,0.15)] bg-[rgba(0,0,0,0.2)] p-5 shadow-sm">
      {/* Фильтр-табы */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(242,207,141,0.1)] pb-4 mb-4">
        {TABS.map((tab) => {
          const count = tab.id === 'all' ? rows.length : rows.filter((r) => r.status === tab.id).length
          const isActive = filter === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-[14px] font-normal transition-colors ${
                isActive
                  ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.15)] text-[#fcecc8]'
                  : 'border-[rgba(242,207,141,0.15)] text-[rgba(242,207,141,0.72)] hover:border-[rgba(242,207,141,0.3)] hover:text-[#fcecc8]'
              }`}
            >
              {tab.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-normal ${isActive ? 'bg-[#c9a84c] text-[#0a1f12]' : 'bg-[rgba(0,0,0,0.3)]'}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Таблица */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="text-[16px] font-normal uppercase tracking-wide text-[rgba(242,207,141,0.45)] bg-[rgba(255,255,255,0.02)]">
              <th className="px-4 py-3 font-normal">{t('salesManagement.bookings.columns.lot', 'Лот')}</th>
              <th className="px-4 py-3 font-normal">{t('salesManagement.bookings.columns.realtor', 'Риэлтор')}</th>
              <th className="px-4 py-3 font-normal">{t('salesManagement.bookings.columns.term', 'Срок')}</th>
              <th className="px-4 py-3 font-normal">{t('salesManagement.bookings.columns.countdown', 'Отсчёт')}</th>
              <th className="px-4 py-3 font-normal">{t('salesManagement.bookings.columns.status', 'Статус')}</th>
              <th className="px-4 py-3 font-normal w-[260px]">{t('salesManagement.bookings.columns.comment', 'Комментарий')}</th>
              <th className="px-4 py-3 font-normal w-[120px]">{t('salesManagement.bookings.columns.manager', 'Ответственный')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => {
              const showTimer = (row.status === 'in_progress' || row.status === 'expired') && !!row.confirmUntilAt
              const untilParts = formatDateParts(row.confirmUntilAt)
              const from = formatDateParts(row.createdAt)

              return (
                <tr
                  key={row.id}
                  className="border-b border-[rgba(242,207,141,0.07)] last:border-0 hover:bg-[rgba(255,255,255,0.015)] transition-colors"
                >
                  {/* Лот */}
                  <td className="px-4 py-3">
                    <div className="text-[16px] text-[#fcecc8]">{bookingLotDisplay(row, units, buildingNameById, t)}</div>
                    {bookingLotDisplay(row, units, buildingNameById, t) === row.unitLabel ? null : (
                      <div className="text-[13px] text-[rgba(242,207,141,0.5)] mt-0.5">{row.unitLabel}</div>
                    )}
                  </td>

                  {/* Риэлтор */}
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setRealtorProfile(buildRealtorProfile(row.realtorName, row.agency))}
                      className="group flex items-center gap-2 text-left transition-colors"
                    >
                      <RealtorAvatar name={row.realtorName} />
                      <div className="min-w-0">
                        <div className="text-[15px] text-[#fcecc8] group-hover:text-[#e6c364] transition-colors">
                          {row.realtorName}
                        </div>
                        {row.agency && (
                          <div className="text-[13px] text-[rgba(242,207,141,0.5)] mt-0.5">{row.agency}</div>
                        )}
                      </div>
                    </button>
                  </td>

                  {/* Срок: от → до */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-[14px] text-[rgba(242,207,141,0.72)]">{from.date}</div>
                    <div className="text-[12px] text-[rgba(242,207,141,0.45)]">{from.time}</div>
                    {row.confirmUntilAt && (
                      <div className="mt-1 text-[14px] text-[rgba(242,207,141,0.72)]">
                        <InlineDateEdit
                          value={row.confirmUntilAt}
                          onChange={(iso) => patchRow(row.id, { confirmUntilAt: iso })}
                          readOnly={readOnly}
                        />
                      </div>
                    )}
                  </td>

                  {/* Обратный отсчёт */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {showTimer ? (
                      <BookingTimer
                        confirmUntilAt={row.confirmUntilAt!}
                        onExpired={row.status === 'in_progress' ? () => patchRow(row.id, { status: 'expired' }) : undefined}
                      />
                    ) : row.confirmUntilAt ? (
                      <div>
                        <div className="text-[14px] text-[rgba(242,207,141,0.72)]">{untilParts.date}</div>
                        <div className="text-[12px] text-[rgba(242,207,141,0.45)]">{untilParts.time}</div>
                      </div>
                    ) : (
                      <span className="text-[13px] text-[rgba(242,207,141,0.3)]">—</span>
                    )}
                  </td>

                  {/* Статус */}
                  <td className="px-4 py-3">
                    {row.status === 'in_progress' && !readOnly ? (
                      <button
                        type="button"
                        ref={(el) => {
                          if (popupRowId === row.id) statusCellRef.current = el
                        }}
                        onClick={(e) => {
                          statusCellRef.current = e.currentTarget
                          setPopupRowId((prev) => (prev === row.id ? null : row.id))
                        }}
                        className="inline-flex items-center rounded-md border border-amber-800/50 bg-amber-900/40 px-2.5 py-1 text-[16px] font-normal text-amber-300 transition-colors hover:border-amber-700/60 hover:bg-amber-900/60 cursor-pointer"
                      >
                        {t('salesManagement.bookings.statuses.in_progress', 'В процессе')}
                      </button>
                    ) : (
                      <StatusBadge status={row.status} />
                    )}
                  </td>

                  {/* Комментарий */}
                  <td className="px-4 py-3">
                    <span className="line-clamp-3 text-[14px] text-[rgba(242,207,141,0.72)]">
                      {row.comment || '—'}
                    </span>
                  </td>

                  {/* Ответственный */}
                  <td className="px-4 py-3">
                    <InlineTextEdit
                      value={row.manager === '—' ? '' : row.manager}
                      onChange={(v) => patchRow(row.id, { manager: v || '—' })}
                      readOnly={readOnly}
                      placeholder={t('salesManagement.bookings.managerPlaceholder', 'Не указан')}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filteredRows.length === 0 && (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-[rgba(242,207,141,0.12)] mt-4">
            <span className="text-[16px] text-[rgba(242,207,141,0.4)]">{t('salesManagement.bookings.emptyFiltered', 'Нет броней в этой категории')}</span>
          </div>
        )}
      </div>

      {/* Поп-ап */}
      {popupRow && (
        <BookingPopup
          row={popupRow}
          anchorRef={statusCellRef as React.RefObject<HTMLElement | null>}
          onClose={() => setPopupRowId(null)}
          onConfirm={(comment) => {
            patchRow(popupRow.id, { status: 'booked', comment })
            setPopupRowId(null)
          }}
          onReject={(comment) => {
            patchRow(popupRow.id, { status: 'rejected', comment })
            setPopupRowId(null)
          }}
        />
      )}

      {realtorProfile && (
        <RealtorProfileModal
          profile={realtorProfile}
          onClose={() => setRealtorProfile(null)}
        />
      )}
    </div>
  )
}

function RealtorAvatar({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const init = parts.length === 0
    ? '?'
    : parts.length === 1
      ? parts[0]!.charAt(0).toUpperCase()
      : (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase()
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  const hue = Math.abs(h) % 360
  return (
    <span
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-normal text-[#fcecc8] ring-1 ring-[rgba(242,207,141,0.18)] transition-shadow group-hover:ring-[rgba(230,195,100,0.6)]"
      style={{ background: `hsl(${hue}, 38%, 32%)` }}
    >
      {init}
    </span>
  )
}

function StatusBadge({ status }: { status: DevBookingStatus }) {
  const { t } = useI18n()
  const cfg: Record<DevBookingStatus, { cls: string; fallback: string }> = {
    in_progress: { cls: 'border-amber-800/50 bg-amber-900/40 text-amber-300', fallback: 'В процессе' },
    booked: { cls: 'border-[rgba(242,192,64,0.5)] bg-[rgba(242,192,64,0.15)] text-[#f7da6a]', fallback: 'Бронь' },
    expired: { cls: 'border-red-700/50 bg-red-900/30 text-[#ff5449]', fallback: 'Истекла' },
    rejected: { cls: 'border-red-800/40 bg-red-900/30 text-[#ffb4ab]', fallback: 'Отказ' },
    paid: { cls: 'border-purple-800/50 bg-purple-900/40 text-purple-300', fallback: 'Оплачена' },
  }
  const { cls, fallback } = cfg[status]
  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[16px] font-normal ${cls}`}>
      {t(`salesManagement.bookings.statuses.${status}`, fallback)}
    </span>
  )
}
