import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, ArrowLeft, CheckCircle2, LayoutGrid, Percent } from 'lucide-react'
import { ComplexCard, type ComplexCardData } from '@/components/ui/ComplexCard'
import { ComplexAboutModal } from '@/components/ui/ComplexAboutModal'
import { developmentApi, type NewBuildingItem } from '@/services/developmentApi'
import { promotionsToBadges, getPromotionText } from '@/lib/promotionBadges'
import { useModulePermissions } from '@/hooks/useModulePermissions'
import { useI18n } from '@/i18n'

// ── Types ────────────────────────────────────────────────────────────────

interface Complex extends ComplexCardData {
  images: string[]
  delivery: string
  priceFrom: string
  priceTo: string
  totalUnits: number
  freeUnits: number
  soldUnits: number
  city: string
  status: 'active' | 'archived'
  createdAt?: string
}

// ── Mock data (first 2 demo cards) ──────────────────────────────────────────

const MOCK_COMPLEXES: Complex[] = [
  // {
  //   id: 'c1',
  //   name: 'Residence Park',
  //   developer: 'Batumi Prime Dev',
  //   city: 'Батуми',
  //   images: NEW_BUILDINGS_DEMO_IMAGES.c1,
  //   delivery: 'Q3 2026',
  //   priceFrom: '$72 000',
  //   priceTo: '$210 000',
  //   totalUnits: 240,
  //   freeUnits: 88,
  //   soldUnits: 140,
  //   status: 'active',
  //   promos: [
  //     { kind: 'top' },
  //     { kind: 'banner', text: 'BMW в подарок', color: 'rgba(94, 224, 208, 0.95)' },
  //   ],
  // },
  // {
  //   id: 'c2',
  //   name: 'Sky Garden',
  //   developer: 'Global Realty',
  //   city: 'Батуми',
  //   images: NEW_BUILDINGS_DEMO_IMAGES.c2,
  //   delivery: 'Q1 2027',
  //   priceFrom: '$95 000',
  //   priceTo: '$340 000',
  //   totalUnits: 180,
  //   freeUnits: 110,
  //   soldUnits: 62,
  //   status: 'active',
  // },
]

function mapApiToComplex(item: NewBuildingItem): Complex {
  const promos = item.promotions?.length
    ? promotionsToBadges(item.promotions)
    : (item.promos ?? [])
  return {
    id: item.id,
    name: item.name.trim(),
    developer: item.developer || '',
    city: item.city,
    country: item.country === 'GE' ? 'Грузия' : item.country,
    address: item.address,
    images: item.images,
    delivery: item.delivery,
    priceFrom: item.priceFrom,
    priceTo: item.priceTo,
    totalUnits: item.totalUnits,
    freeUnits: item.freeUnits,
    soldUnits: item.soldUnits,
    floorsFrom: item.floorsFrom,
    floorsTo: item.floorsTo,
    areaFrom: item.areaFrom,
    areaTo: item.areaTo,
    apartments: item.totalUnits,
    promos,
    promoText: getPromotionText(item.promotions),
    status: item.status === 'active' ? 'active' : 'archived',
    createdAt: item.createdAt,
  }
}

// ── Chessboard booking flow ──────────────────────────────────────────────────

type UnitSaleStatus = 'free' | 'booked' | 'sold'

interface ChessUnit {
  id: string
  floor: number
  pos: number
  rooms: string
  area: number
  price: number
  status: UnitSaleStatus
}

// Генерируем мок-шахматку для любого ЖК (детерминированно по id)
function generateChessboard(complexId: string): ChessUnit[] {
  const hash = complexId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const floors = 8 + (hash % 6)
  const cols = 4 + (hash % 3)
  const roomsList: Array<{ rooms: string; area: number; basePrice: number }> = [
    { rooms: 'Студ.', area: 28, basePrice: 72000 },
    { rooms: '1+1',   area: 45, basePrice: 95000 },
    { rooms: '2+1',   area: 62, basePrice: 130000 },
    { rooms: '3+1',   area: 85, basePrice: 185000 },
  ]

  const units: ChessUnit[] = []
  for (let f = 1; f <= floors; f++) {
    for (let p = 0; p < cols; p++) {
      const idx = (f * 17 + p * 7 + hash) % roomsList.length
      const r = roomsList[idx]
      const priceVariation = 1 + ((f * 3 + p * 11 + hash) % 15) / 100
      const statusSeed = (f * 13 + p * 31 + hash) % 10
      const status: UnitSaleStatus = statusSeed < 5 ? 'free' : statusSeed < 8 ? 'booked' : 'sold'
      units.push({
        id: `${complexId}-f${f}-p${p}`,
        floor: f,
        pos: p,
        rooms: r.rooms,
        area: r.area,
        price: Math.round(r.basePrice * priceVariation / 1000) * 1000,
        status,
      })
    }
  }
  return units
}

// ── Booking flow modal ────────────────────────────────────────────────────────

type BookingFlowStep = 'chess' | 'form'

interface BookingSubmitData {
  complexId: string
  complexName: string
  unit: ChessUnit
  clientName: string
  startsAt: string
  expiresAt: string
  notes: string
}


function UnitCell({
  unit,
  selected,
  onClick,
}: {
  unit: ChessUnit
  selected: boolean
  onClick: () => void
}) {
    const { t } = useI18n();
  const [hovered, setHovered] = useState(false)

  const colors = {
    free: {
      bg: hovered ? 'var(--unit-free-bg-hover)' : 'var(--unit-free-bg)',
      border: selected ? 'rgba(230,195,100,1)' : hovered ? 'var(--unit-free-border-hover)' : 'var(--unit-free-border)',
      text: 'var(--unit-free-text)',
      sub: 'var(--unit-free-sub)',
    },
    booked: {
      bg: hovered ? 'rgba(242,192,64,0.26)' : 'rgba(242,192,64,0.16)',
      border: selected ? 'rgba(230,195,100,1)' : hovered ? 'rgba(242,192,64,0.9)' : 'rgba(242,192,64,0.5)',
      text: '#f7da6a',
      sub: 'rgba(247,218,106,0.7)',
    },
    sold: {
      bg: 'rgba(156,100,105,0.13)',
      border: 'rgba(156,100,105,0.35)',
      text: 'rgba(205,150,155,0.65)',
      sub: 'rgba(205,150,155,0.45)',
    },
  }
  const c = colors[unit.status]
  const canSelect = unit.status === 'free'

  return (
    <div
      onClick={canSelect ? onClick : undefined}
      onMouseEnter={() => canSelect && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 86, height: 64,
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 4,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        cursor: canSelect ? 'pointer' : 'default',
        transition: 'background 0.12s, border-color 0.12s',
        boxShadow: selected ? '0 0 0 2px rgba(230,195,100,0.5)' : 'none',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 400, color: c.text, lineHeight: 1.2 }}>{unit.rooms}</span>
      <span style={{ fontSize: 11, color: c.sub, lineHeight: 1.2 }}>{unit.area} {t('modules.newBuildingsListPage.м')}</span>
    </div>
  )
}

const pad2 = (n: number) => String(n).padStart(2, '0')

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}


// ── Booking form ─────────────────────────────────────────────────────────────

function BookingFormStep({
  complex,
  unit,
  onBack,
  onSubmit,
}: {
  complex: Complex
  unit: ChessUnit
  onBack: () => void
  onSubmit: (data: Omit<BookingSubmitData, 'complexId' | 'complexName' | 'unit'>) => void
}) {
    const { t } = useI18n();
  const now = useMemo(() => new Date(), [])
  const endsAt = useMemo(() => new Date(now.getTime() + 72 * 3_600_000), [now])

  const [clientName, setClientName] = useState('')
  const [notes, setNotes] = useState('')

  const startDt = `${toIsoDate(now)}T${pad2(now.getHours())}:${pad2(now.getMinutes())}:00`
  const endDt = `${toIsoDate(endsAt)}T${pad2(endsAt.getHours())}:${pad2(endsAt.getMinutes())}:00`
  const canSubmit = clientName.trim().length > 0

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    background: 'var(--modal-surface)',
    border: '1px solid var(--modal-border)',
    borderRadius: 4,
    color: 'var(--modal-text)',
    fontSize: 16,
    fontFamily: "'Montserrat', sans-serif",
    outline: 'none',
    boxSizing: 'border-box',
  }

  function fmtDt(d: Date) {
    return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '20px 28px 0', flexShrink: 0 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--modal-back)', fontSize: 13,
            fontFamily: "'Montserrat', sans-serif",
            padding: '0 0 14px',
          }}
        >
          <ArrowLeft size={16} /> {t('modules.newBuildingsListPage.назад_к_шахматке')}</button>

        {/* Title + unit pill in one row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--modal-chess-label)', marginBottom: 4 }}>
              {t('modules.newBuildingsListPage.заявка_на_бронирован')}</div>
            <div style={{ fontSize: 22, fontWeight: 400, color: 'var(--theme-accent-heading)' }}>
              {complex.name}
            </div>
          </div>
          <div style={{
            flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px',
            background: 'rgba(52,211,153,0.1)',
            border: '1px solid rgba(52,211,153,0.3)',
            borderRadius: 4,
          }}>
            <span style={{ fontSize: 14, color: 'var(--unit-free-text)' }}>{unit.rooms}</span>
            <span style={{ fontSize: 12, color: 'var(--unit-free-sub)' }}>{unit.area} {t('modules.newBuildingsListPage.м')}</span>
            <span style={{ fontSize: 12, color: 'var(--modal-floor-num)' }}>·</span>
            <span style={{ fontSize: 13, color: 'rgba(230,195,100,0.9)' }}>${unit.price.toLocaleString('ru-RU')}</span>
            <span style={{ fontSize: 11, color: 'var(--modal-floor-num)' }}>{t('modules.newBuildingsListPage.эт')}{unit.floor}</span>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '0 28px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 24 }}>

          {/* Client name */}
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--modal-text-label)', marginBottom: 7 }}>
              {t('modules.newBuildingsListPage.фио_клиента')}</div>
            <input
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              placeholder={t('modules.newBuildingsListPage.иванов_иван_иванович')}
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--modal-border-focus)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--modal-border)')}
            />
          </div>

          {/* Fixed booking range: now → +72h */}
          <div style={{
            padding: '14px 16px',
            background: 'var(--modal-info-bg)',
            border: '1px solid var(--modal-info-border)',
            borderRadius: 6,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 400, textTransform: 'uppercase',
                letterSpacing: '0.2em', color: 'var(--theme-accent-heading)',
              }}>
                {t('modules.newBuildingsListPage.срок_брони')}</span>
              <span style={{
                fontSize: 12, padding: '3px 10px', borderRadius: 3,
                background: 'rgba(230,195,100,0.12)',
                color: 'var(--theme-accent-heading)',
                letterSpacing: '0.06em',
              }}>
                {t('modules.newBuildingsListPage.72_часа')}</span>
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--modal-text-label)', marginBottom: 3 }}>{t('modules.newBuildingsListPage.с')}</div>
                <div style={{ fontSize: 16, color: 'var(--app-text)' }}>{fmtDt(now)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--modal-text-label)', marginBottom: 3 }}>{t('modules.newBuildingsListPage.по')}</div>
                <div style={{ fontSize: 16, color: 'var(--app-text)' }}>{fmtDt(endsAt)}</div>
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--modal-text-label)', marginBottom: 7 }}>{t('modules.newBuildingsListPage.комментарий_необязат')}</div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={t('modules.newBuildingsListPage.клиент_рассматривает')}
              rows={3}
              style={{ ...inputStyle, resize: 'none', lineHeight: 1.5 }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--modal-border-focus)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--modal-border)')}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        flexShrink: 0,
        padding: '16px 28px 28px',
        borderTop: '1px solid var(--modal-divider)',
      }}>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onSubmit({
            clientName: clientName.trim(),
            startsAt: startDt,
            expiresAt: endDt,
            notes: notes.trim(),
          })}
          style={{
            width: '100%',
            padding: '13px',
            borderRadius: 4,
            border: `1px solid ${canSubmit ? 'var(--gold)' : 'var(--modal-border)'}`,
            background: canSubmit ? 'rgba(230,195,100,0.15)' : 'var(--modal-info-bg)',
            color: canSubmit ? 'var(--theme-accent-heading)' : 'var(--modal-text-dim)',
            fontSize: 16,
            fontWeight: 400,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontFamily: "'Montserrat', sans-serif",
            letterSpacing: '0.04em',
            transition: 'background 0.15s, border-color 0.15s, color 0.15s',
          }}
        >
          {t('modules.newBuildingsListPage.отправить_заявку')}</button>
      </div>
    </div>
  )
}

function SuccessStep({ complex, unit, startsAt, expiresAt, onClose }: {
  complex: Complex
  unit: ChessUnit
  startsAt: string
  expiresAt: string
  onClose: () => void
}) {
    const { t } = useI18n();
  function fmtDt(iso: string) {
    const d = new Date(iso)
    return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', padding: '40px 32px', textAlign: 'center',
      fontFamily: "'Montserrat', sans-serif",
    }}>
      <CheckCircle2 size={52} color="var(--theme-accent-heading)" style={{ marginBottom: 24, opacity: 0.9 }} />
      <div style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--modal-chess-label)', marginBottom: 10 }}>
        {t('modules.newBuildingsListPage.заявка_отправлена')}</div>
      <div style={{ fontSize: 20, fontWeight: 400, color: 'var(--theme-accent-heading)', marginBottom: 8 }}>
        {complex.name}
      </div>
      <div style={{ fontSize: 15, color: 'var(--modal-text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
        {unit.rooms} · {unit.area} {t('modules.newBuildingsListPage.м_этаж')}{unit.floor}
      </div>
      <div style={{
        padding: '12px 20px',
        background: 'var(--modal-info-bg)',
        border: '1px solid var(--modal-info-border)',
        borderRadius: 6,
        fontSize: 13, color: 'var(--modal-selection-text)',
        lineHeight: 1.8, marginBottom: 28, textAlign: 'left',
      }}>
        <div>{t('modules.newBuildingsListPage.с')}<span style={{ color: 'var(--theme-accent-heading)' }}>{fmtDt(startsAt)}</span></div>
        <div>{t('modules.newBuildingsListPage.по')}<span style={{ color: 'var(--theme-accent-heading)' }}>{fmtDt(expiresAt)}</span></div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--modal-chess-label)', marginBottom: 28 }}>
        {t('modules.newBuildingsListPage.заявка_передана_заст')}</div>
      <button
        type="button"
        onClick={onClose}
        style={{
          padding: '11px 32px',
          borderRadius: 4,
          border: '1px solid var(--modal-border)',
          background: 'var(--modal-surface)',
          color: 'var(--modal-text-muted)',
          fontSize: 14,
          cursor: 'pointer',
          fontFamily: "'Montserrat', sans-serif",
        }}
      >
        {t('modules.newBuildingsListPage.закрыть')}</button>
    </div>
  )
}

function BookingChessStep({
  complex,
  onSelectUnit,
  onClose,
}: {
  complex: Complex
  onSelectUnit: (unit: ChessUnit) => void
  onClose: () => void
}) {
    const { t } = useI18n();
  const units = useMemo(() => generateChessboard(complex.id), [complex.id])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const floors = useMemo(() => {
    const map = new Map<number, ChessUnit[]>()
    for (const u of units) {
      if (!map.has(u.floor)) map.set(u.floor, [])
      map.get(u.floor)!.push(u)
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0])
  }, [units])

  const freeCount = units.filter(u => u.status === 'free').length
  const bookedCount = units.filter(u => u.status === 'booked').length
  const soldCount = units.filter(u => u.status === 'sold').length

  const selectedUnit = selectedId ? units.find(u => u.id === selectedId) ?? null : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header — single compact row */}
      <div style={{
        padding: '14px 16px 14px 20px',
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        {/* Title block */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 400, color: 'var(--theme-accent-heading)', whiteSpace: 'nowrap' }}>
            {complex.name}
          </span>
          <span style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--modal-chess-label)', whiteSpace: 'nowrap' }}>
            {t('modules.newBuildingsListPage.шахматка')}</span>
        </div>

        {/* Legend — inline */}
        <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
          {[
            { color: 'rgba(52,211,153,0.7)', label: `Своб. ${freeCount}` },
            { color: 'rgba(242,192,64,0.7)', label: `Бронь ${bookedCount}` },
            { color: 'rgba(156,100,105,0.6)', label: `Прод. ${soldCount}` },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--modal-chess-legend)', whiteSpace: 'nowrap' }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Selection card — fills remaining space */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
          {selectedUnit && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '5px 5px 5px 12px',
              background: 'rgba(230,195,100,0.06)',
              border: '1px solid rgba(230,195,100,0.25)',
              borderRadius: 5,
              maxWidth: '100%',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 14, color: 'var(--theme-accent-heading)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  ${selectedUnit.price.toLocaleString('ru-RU')}
                </span>
                <span style={{ fontSize: 11, color: 'var(--modal-selection-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {selectedUnit.rooms} · {selectedUnit.area} {t('modules.newBuildingsListPage.м_эт')}{selectedUnit.floor}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onSelectUnit(selectedUnit)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 3,
                  border: '1px solid var(--gold)',
                  background: 'rgba(230,195,100,0.2)',
                  color: 'var(--theme-accent-heading)',
                  fontSize: 12,
                  fontWeight: 400,
                  cursor: 'pointer',
                  fontFamily: "'Montserrat', sans-serif",
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.02em',
                  flexShrink: 0,
                }}
              >
                {t('modules.newBuildingsListPage.выбрать')}</button>
            </div>
          )}
        </div>

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--modal-close)', padding: 4,
            flexShrink: 0,
          }}
          aria-label={t('modules.newBuildingsListPage.закрыть')}
        >
          <X size={18} />
        </button>
      </div>

      <div style={{ width: '100%', height: 1, background: 'var(--modal-divider)', flexShrink: 0 }} />

      {/* Grid */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '16px 28px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {floors.map(([floor, floorUnits]) => (
            <div key={floor} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, flexShrink: 0,
                fontSize: 11, color: 'var(--modal-floor-num)',
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {floor}
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'nowrap' }}>
                {floorUnits.map(unit => (
                  <UnitCell
                    key={unit.id}
                    unit={unit}
                    selected={selectedId === unit.id}
                    onClick={() => setSelectedId(prev => prev === unit.id ? null : unit.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Booking modal wrapper ────────────────────────────────────────────────────

function BookingModal({
  complex,
  onClose,
}: {
  complex: Complex
  onClose: () => void
}) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const [step, setStep] = useState<BookingFlowStep>('chess')
  const [selectedUnit, setSelectedUnit] = useState<ChessUnit | null>(null)
  const [submittedStartsAt, setSubmittedStartsAt] = useState<string>('')
  const [submittedExpiresAt, setSubmittedExpiresAt] = useState<string>('')
  const [done, setDone] = useState(false)

  function handleSelectUnit(unit: ChessUnit) {
    setSelectedUnit(unit)
    setStep('form')
  }

  function handleSubmit(data: Omit<BookingSubmitData, 'complexId' | 'complexName' | 'unit'>) {
    setSubmittedStartsAt(data.startsAt)
    setSubmittedExpiresAt(data.expiresAt)
    setDone(true)
  }



  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9100,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Montserrat', sans-serif",
        padding: 'clamp(8px, 2vw, 24px)',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: step === 'chess' ? 820 : 740,
          height: '100%',
          maxHeight: '100%',
          background: 'var(--hub-card-bg)',
          border: '1px solid var(--hub-card-border-hover)',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minHeight: 0,
          transition: 'max-width 0.25s ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        {done && selectedUnit ? (
          <SuccessStep complex={complex} unit={selectedUnit} startsAt={submittedStartsAt} expiresAt={submittedExpiresAt} onClose={onClose} />
        ) : step === 'chess' ? (
          <BookingChessStep
            complex={complex}
            onSelectUnit={handleSelectUnit}
            onClose={onClose}
          />
        ) : selectedUnit ? (
          <BookingFormStep
            complex={complex}
            unit={selectedUnit}
            onBack={() => setStep('chess')}
            onSubmit={handleSubmit}
          />
        ) : null}
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

function CommissionsTable({
  complexes,
  commissionsByComplex,
}: {
  complexes: Complex[]
  commissionsByComplex: Map<string, CommissionRow>
}) {
    const { t } = useI18n();
  if (complexes.length === 0) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--workspace-text-muted)', fontSize: 16 }}>
        {t('modules.newBuildingsListPage.ничего_не_найдено')}</div>
    )
  }

  const cellStyle: React.CSSProperties = {
    padding: '14px 14px',
    fontSize: 16,
    color: 'var(--workspace-text)',
    borderBottom: '1px solid var(--hub-card-border)',
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'center',
  }
  const headStyle: React.CSSProperties = {
    padding: '12px 14px',
    fontSize: 12,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--gold)',
    textAlign: 'center',
    fontWeight: 500,
    borderBottom: '1px solid var(--hub-card-border)',
    background: 'rgba(201,168,76,0.06)',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  }
  const fmtPct = (n: number) => n.toFixed(2).replace('.', ',')

  return (
    <div style={{ flex: 1, padding: '0 32px 32px', overflowX: 'auto' }}>
      <div style={{
        border: '1px solid var(--hub-card-border)',
        borderRadius: 6,
        overflow: 'hidden',
        background: 'var(--hub-card-bg)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Montserrat', sans-serif", minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ ...headStyle, textAlign: 'left' }}>{t('modules.newBuildingsListPage.жк')}</th>
              <th style={{ ...headStyle, textAlign: 'left' }}>{t('modules.newBuildingsListPage.застройщик')}</th>
              <th style={{ ...headStyle, textAlign: 'left' }}>{t('modules.newBuildingsListPage.город')}</th>
              <th style={headStyle}>{t('modules.newBuildingsListPage.сдача')}</th>
              <th style={headStyle}>{t('modules.newBuildingsListPage.до_налогов')}</th>
              <th style={headStyle}>{t('modules.newBuildingsListPage.после_налогов')}</th>
              <th style={headStyle}>{t('modules.newBuildingsListPage.бонусы')}</th>
            </tr>
          </thead>
          <tbody>
            {complexes.map((c) => {
              const row = commissionsByComplex.get(c.id)
              return (
                <tr
                  key={c.id}
                  style={{ transition: 'background 0.12s', cursor: 'default' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--workspace-row-bg)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <td style={{ ...cellStyle, textAlign: 'left', color: 'var(--theme-accent-heading)' }}>{c.name}</td>
                  <td style={{ ...cellStyle, textAlign: 'left', color: 'var(--workspace-text-muted)' }}>{c.developer}</td>
                  <td style={{ ...cellStyle, textAlign: 'left', color: 'var(--workspace-text-muted)' }}>{c.city}</td>
                  <td style={cellStyle}>{c.delivery}</td>
                  <td style={{ ...cellStyle, color: 'var(--gold)', fontWeight: 500 }}>
                    {row ? `${fmtPct(row.beforeTax)}%` : '—'}
                  </td>
                  <td style={cellStyle}>
                    {row ? `${fmtPct(row.afterTax)}%` : '—'}
                  </td>
                  <td style={{ ...cellStyle, color: 'var(--workspace-text-muted)', fontSize: 16 }}>
                    {row?.bonus ?? '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

type ViewMode = 'cards' | 'commissions'

interface CommissionRow {
  beforeTax: number
  afterTax: number
  bonus?: string
}

const TAX_RATE = 0.13

function buildCommissions(c: Complex): CommissionRow {
  let h = 0
  for (let i = 0; i < c.id.length; i++) h = (h * 31 + c.id.charCodeAt(i)) | 0
  const seed = Math.abs(h)
  const beforeTax = +(2.4 + (seed % 28) / 10).toFixed(1)
  const afterTax = +(beforeTax * (1 - TAX_RATE)).toFixed(1)
  const bonusSeed = seed % 4
  const bonus =
    bonusSeed === 0 ? '+ BMW при 5 продажах' :
    bonusSeed === 1 ? '+ 0,5% за досрочное закрытие' :
    bonusSeed === 2 ? '+ персональный менеджер' :
    undefined
  return { beforeTax, afterTax, bonus }
}

function promosToLabels(promos?: ComplexCardData['promos']): string[] {
  return (promos ?? []).map((p) => {
    switch (p.kind) {
      case 'top': return 'В ТОПе выдачи'
      case 'premium': return 'Премиум-размещение'
      case 'hot': return p.text ?? 'Горячий лот'
      case 'banner': return p.text ?? 'Акция'
      default: return p.text ?? ''
    }
  }).filter(Boolean)
}

export default function NewBuildingsListPage() {
  const navigate = useNavigate()
  const { language, t } = useI18n()
  const { canView } = useModulePermissions()
  const canViewChessboard = canView('chessboard')
  const [search, setSearch] = useState('')
  const [bookingTarget, setBookingTarget] = useState<Complex | null>(null)
  const [aboutComplex, setAboutComplex] = useState<Complex | null>(null)
  const [view, setView] = useState<ViewMode>('cards')
  const [apiComplexes, setApiComplexes] = useState<Complex[]>([])

  useEffect(() => {
    let cancelled = false
    developmentApi.getNewBuildings({ page: 1, limit: 100 })
      .then((resp) => {
        if (!cancelled && resp.success) {
          const sorted = resp.data.items
            .map(mapApiToComplex)
            .sort((a, b) => {
              const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
              const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
              return dateB - dateA
            })
          setApiComplexes(sorted)

          Promise.all(
            sorted.map(async (complex) => {
              const stats = await developmentApi.getComplexUnitStats(complex.id)
              return stats ? { id: complex.id, stats } : null
            }),
          ).then((results) => {
            if (cancelled) return
            const statsById = new Map(
              results.filter(Boolean).map((entry) => [entry!.id, entry!.stats]),
            )
            if (statsById.size === 0) return
            setApiComplexes((prev) =>
              prev.map((complex) => {
                const stats = statsById.get(complex.id)
                return stats
                  ? {
                      ...complex,
                      totalUnits: stats.totalUnits,
                      freeUnits: stats.freeUnits,
                      soldUnits: stats.soldUnits,
                      apartments: stats.totalUnits,
                    }
                  : complex
              }),
            )
          }).catch((err) => {
            console.error('Failed to enrich complex unit stats:', err)
          })
        }
      })
      .catch((err) => {
        console.error('Failed to fetch new buildings:', err)
      })
    return () => { cancelled = true }
  }, [])

  const allComplexes = useMemo(() => [...MOCK_COMPLEXES, ...apiComplexes], [apiComplexes])

  const filtered = allComplexes.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.developer.toLowerCase().includes(search.toLowerCase()) ||
    c.city.toLowerCase().includes(search.toLowerCase())
  )

  const commissionsByComplex = useMemo<Map<string, CommissionRow>>(() => {
    return new Map(filtered.map((c) => [c.id, buildCommissions(c)]))
  }, [filtered])

  const filteredCountLabel = language === 'en'
    ? `${filtered.length} ${filtered.length === 1 ? 'property' : 'properties'}`
    : `${filtered.length} объект${filtered.length === 1 ? '' : filtered.length < 5 ? 'а' : 'ов'}`

  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        background: 'var(--app-bg)',
        fontFamily: "'Montserrat', sans-serif",
        overflowY: 'auto',
      }}
    >
      {/* ── Top bar ── */}
      <div style={{
        flexShrink: 0,
        padding: '24px 32px 0',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 400, color: 'var(--theme-accent-heading)', letterSpacing: '0.02em' }}>
            {t('modules.newBuildingsListPage.жилые_комплексы')}</h1>
          <div style={{ fontSize: 13, color: 'var(--workspace-text-muted)', marginTop: 6 }}>
            {filteredCountLabel}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>

          <div style={{
            display: 'inline-flex', gap: 2, padding: 2,
            background: 'var(--nb-tab-bg)',
            border: '1px solid var(--green-border)',
            borderRadius: 4,
          }}>
            {([
              { id: 'cards' as const, label: 'Карточки', icon: LayoutGrid },
              { id: 'commissions' as const, label: 'Комиссии', icon: Percent },
            ]).map(({ id, label, icon: Icon }) => {
              const active = view === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px',
                    borderRadius: 3,
                    border: 'none',
                    background: active ? 'color-mix(in srgb, var(--gold) 24%, transparent)' : 'transparent',
                    color: active ? 'var(--gold)' : 'var(--app-text-muted)',
                    fontFamily: "'Montserrat', sans-serif",
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  <Icon size={14} />
                  {label}
                </button>
              )
            })}
          </div>

          <div style={{ position: 'relative', width: 280 }}>
            <Search
              size={15}
              style={{
                position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--workspace-text-dim)', pointerEvents: 'none',
              }}
            />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('modules.newBuildingsListPage.поиск_по_жк_застройщ')}
              style={{
                width: '100%',
                padding: '11px 32px 11px 34px',
                background: 'var(--hub-card-bg)',
                border: '1px solid var(--hub-card-border)',
                borderRadius: 4,
                color: 'var(--workspace-text)',
                fontSize: 16,
                fontFamily: "'Montserrat', sans-serif",
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--hub-card-border-hover)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--hub-card-border)')}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--workspace-text-dim)', padding: 2, display: 'flex',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ height: 20 }} />

      {view === 'cards' ? (
        /* ── Grid: 1 column, горизонтальные карточки ── */
        <div style={{
          flex: 1,
          padding: '0 32px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--workspace-text-muted)', fontSize: 16 }}>
              {t('modules.newBuildingsListPage.ничего_не_найдено')}</div>
          ) : (
            filtered.map(c => (
              <ComplexCard
                key={c.id}
                complex={c}
                onAboutClick={() => setAboutComplex(c)}
                onChessboardClick={
                  canViewChessboard
                    ? () => navigate(`/dashboard/new-buildings/chessboard?project=${c.id}`, { state: { complexName: c.name } })
                    : undefined
                }
              />
            ))
          )}
        </div>
      ) : (
        <CommissionsTable
          complexes={filtered}
          commissionsByComplex={commissionsByComplex}
        />
      )}

      {bookingTarget && (
        <BookingModal
          complex={bookingTarget}
          onClose={() => setBookingTarget(null)}
        />
      )}

      {aboutComplex && (
        <ComplexAboutModal
          complexId={aboutComplex.id}
          fallback={{
            id: aboutComplex.id,
            name: aboutComplex.name,
            developer: aboutComplex.developer,
            city: aboutComplex.city,
            country: aboutComplex.country,
            address: aboutComplex.address,
            delivery: aboutComplex.delivery,
            priceFrom: aboutComplex.priceFrom,
            priceTo: aboutComplex.priceTo,
            totalUnits: aboutComplex.totalUnits,
            freeUnits: aboutComplex.freeUnits,
            soldUnits: aboutComplex.soldUnits,
            floorsFrom: aboutComplex.floorsFrom,
            floorsTo: aboutComplex.floorsTo,
            areaFrom: aboutComplex.areaFrom,
            areaTo: aboutComplex.areaTo,
            apartments: aboutComplex.apartments,
            commission: commissionsByComplex.get(aboutComplex.id),
            promos: promosToLabels(aboutComplex.promos),
          }}
          onClose={() => setAboutComplex(null)}
        />
      )}
    </div>
  )
}
