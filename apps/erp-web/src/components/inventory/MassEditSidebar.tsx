import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Gift, Maximize2, Minimize2, Percent, Sparkles, Trash2, Upload, Wallet, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { installmentsKey } from '@/components/development/sales/salesManagementStorage'
import {
  formatSalesInstallmentRuDate,
  type InstallmentRowModel,
} from '@/components/development/sales/salesInstallmentsShared'
import { resolveProjectInstallmentRows } from '@/lib/installment-display'
import { FloorPlanEditor } from '@/components/inventory/FloorPlanEditor'
import { PasswordConfirmModal } from '@/components/common/PasswordConfirmModal'
import { formatArea, formatPrice, formatPricePerSqm, getCurrencySymbol } from '@/lib/chessboard'
import { normalizeFinishPrices, resolveFinishTypesForEditing } from '@/lib/unit-finish-pricing'
import { ROOM_TYPE_OPTIONS, normalizeRooms, optionLabel } from '@/lib/project-options'
import { useCoreStore } from '@/store/useCoreStore'
import { useInstallmentStore } from '@/store/useInstallmentStore'
import { useAuth } from '@/context/AuthContext'
import type { FinishType, InstallmentTerm, IUnit, UnitFinishPrices } from '@/types/core'
import type { IInstallmentPlan } from '@/types/installment'
import type { NewInstallmentPlan } from '@/types/installment'
import { useI18n } from "@/i18n";

const ALL_ROOM_CHOICES: readonly string[] = [
  ...ROOM_TYPE_OPTIONS,
  'open_plan',
  'commercial',
  'office',
  'shop',
]

type UnitStatus = IUnit['status']

const STATUS_OPTIONS: ReadonlyArray<{ value: UnitStatus; label: string; activeClass: string }> = [
  {
    value: 'free',
    label: 'В продаже',
    activeClass: 'bg-emerald-500/80 text-emerald-50 border-emerald-400',
  },
  {
    value: 'booked',
    label: 'Бронь',
    activeClass: 'bg-[#f2c040] text-[#2b1f05] border-[#f7da6a]',
  },
  {
    value: 'sold',
    label: 'Продано',
    activeClass: 'bg-[rgba(205,145,150,0.85)] text-[#2b1215] border-[rgba(225,170,175,0.95)]',
  },
  {
    value: 'withdrawn',
    label: 'Снято',
    activeClass: 'bg-slate-500/80 text-slate-50 border-slate-400',
  },
]

const INPUT_CLASS =
  'h-10 rounded-md border border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.3)] px-3 text-[16px] font-normal text-[#fcecc8] placeholder:text-[rgba(242,207,141,0.35)] outline-none transition-colors focus:border-[rgba(242,207,141,0.5)]'

function installmentRowTitle(row: InstallmentRowModel, index: number): string {
  return row.label.trim() || (index === 0 ? 'Базовая' : `Вариант ${index + 1}`)
}

function installmentRowMeta(row: InstallmentRowModel): string {
  const step = row.paymentStep === 'monthly' ? 'ежемесячно' : 'ежеквартально'
  const discount = row.discountPercent != null && row.discountPercent > 0 ? ` · скидка ${row.discountPercent}%` : ''
  const validUntil = row.validUntil ? ` · до ${formatSalesInstallmentRuDate(row.validUntil)}` : ''
  return `ПВ ${row.downPaymentPercent}% · ${row.termMonths} мес. · ${step}${discount}${validUntil}`
}

function loadDeveloperInstallmentRows(
  projectId: string,
  project?: {
    installmentPlans?: IInstallmentPlan[] | null
    installmentTerms?: InstallmentTerm[] | null
  } | null,
): InstallmentRowModel[] {
  return resolveProjectInstallmentRows({
    projectId,
    projectPlans: project?.installmentPlans,
    projectTerms: project?.installmentTerms,
  })
}

interface Props {
  selectedUnits: IUnit[]
  onClose: () => void
  onOpenDetail: (unit: IUnit) => void
}

type ModalMode = 'floor' | 'layout'

export function MassEditSidebar({ selectedUnits, onClose, onOpenDetail }: Props) {
    const { t } = useI18n();
  const updateUnitsBulk = useCoreStore((s) => s.updateUnitsBulk)
  const updateUnitsBulkEntries = useCoreStore((s) => s.updateUnitsBulkEntries)
  const applyBulkPriceChange = useCoreStore((s) => s.applyBulkPriceChange)
  const applyBulkPromotion = useCoreStore((s) => s.applyBulkPromotion)
  const clearBulkPromotion = useCoreStore((s) => s.clearBulkPromotion)
  const setUnitsLayoutImage = useCoreStore((s) => s.setUnitsLayoutImage)
  const allBuildings = useCoreStore((s) => s.allBuildings)
  const allProjects = useCoreStore((s) => s.projects)
  const createInstallmentPlan = useInstallmentStore((s) => s.create)
  const { currentUser } = useAuth()

  const [expanded, setExpanded] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode | null>(null)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)

  function gate(fn: () => void) {
    if (currentUser?.role === 'manager') {
      setPendingAction(() => fn)
    } else {
      fn()
    }
  }

  const unitIds = useMemo(() => selectedUnits.map((u) => u._id), [selectedUnits])

  const [pricePerSqm, setPricePerSqm] = useState('')
  const [areaValue, setAreaValue] = useState('')
  const [roomsValue, setRoomsValue] = useState('')
  const [selectedFinishType, setSelectedFinishType] = useState<FinishType | null>(null)
  const [finishPricePerSqm, setFinishPricePerSqm] = useState('')

  // bulk price change
  const [priceChangeValue, setPriceChangeValue] = useState('')
  const [priceChangeType, setPriceChangeType] = useState<'percentage' | 'fixed'>('percentage')

  useEffect(() => {
    if (selectedUnits.length === 1) {
      setRoomsValue(selectedUnits[0].rooms ? normalizeRooms(selectedUnits[0].rooms) || selectedUnits[0].rooms : '')
      setAreaValue(selectedUnits[0].area != null ? String(selectedUnits[0].area) : '')
    } else {
      setRoomsValue('')
      setAreaValue('')
    }
  }, [selectedUnits])

  // price_discount slot
  const [discountPercent, setDiscountPercent] = useState('')
  const [discountLabel, setDiscountLabel] = useState('')
  const [discountExpires, setDiscountExpires] = useState('')

  // installment plan slot
  const [selectedInstallmentRowId, setSelectedInstallmentRowId] = useState<string | null>(null)
  const [installmentStorageTick, setInstallmentStorageTick] = useState(0)

  // gift slot
  const [giftText, setGiftText] = useState('')
  const [giftLabel, setGiftLabel] = useState('')
  const [giftExpires, setGiftExpires] = useState('')

  type PromoType = 'discount' | 'installment' | 'gift'
  const [promoType, setPromoType] = useState<PromoType | null>(null)

  const [toast, setToast] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 1800)
    return () => window.clearTimeout(timer)
  }, [toast])

  const aggregates = useMemo(() => {
    const statuses = new Set(selectedUnits.map((u) => u.status))
    const totalArea = selectedUnits.reduce((acc, u) => acc + (u.area ?? 0), 0)
    const totalValue = selectedUnits.reduce((acc, u) => {
      if (typeof u.pricePerSqm === 'number' && typeof u.area === 'number') {
        return acc + u.pricePerSqm * u.area
      }
      return acc + (u.price ?? 0)
    }, 0)
    return { statuses, totalArea, totalValue }
  }, [selectedUnits])

  const targetBuildingId = selectedUnits[0]?.building ?? ''
  const targetFloor = selectedUnits[0]?.floor ?? 1
  const targetBuilding = useMemo(
    () => allBuildings.find((b) => b._id === targetBuildingId) ?? null,
    [allBuildings, targetBuildingId],
  )

  const buildingProjectById = useMemo(() => {
    const map = new Map<string, string>()
    allBuildings.forEach((building) => map.set(building._id, building.project))
    return map
  }, [allBuildings])

  const selectedProjectIds = useMemo(
    () => Array.from(new Set(selectedUnits.map((unit) => buildingProjectById.get(unit.building)).filter((id): id is string => Boolean(id)))),
    [selectedUnits, buildingProjectById],
  )

  const selectedProjectId = selectedProjectIds.length === 1 ? selectedProjectIds[0] : null
  const selectedProject = useMemo(
    () => allProjects.find((project) => project._id === selectedProjectId) ?? null,
    [allProjects, selectedProjectId],
  )

  const massEditCurrency = selectedUnits[0]?.currency || selectedProject?.currency || 'USD'
  const massEditCurrencySymbol = getCurrencySymbol(massEditCurrency)

  const availableFinishTypes = useMemo(() => {
    const existingPrices = selectedUnits.reduce<UnitFinishPrices>((prices, unit) => {
      return { ...prices, ...normalizeFinishPrices(unit.finishPrices) }
    }, {})
    return resolveFinishTypesForEditing(selectedProject?.finishTypes, existingPrices)
  }, [selectedProject?.finishTypes, selectedUnits])

  const activeFinishType =
    selectedFinishType && availableFinishTypes.includes(selectedFinishType)
      ? selectedFinishType
      : availableFinishTypes[0]

  const finishPriceRows = useMemo(() => {
    return availableFinishTypes.map((finishType) => {
      const values = selectedUnits.map((unit) => normalizeFinishPrices(unit.finishPrices)?.[finishType])
      const offeredValues = values.filter((value): value is number => typeof value === 'number')
      if (offeredValues.length === 0) {
        return { finishType, state: 'none' as const, label: 'не предлагается' }
      }
      if (offeredValues.length !== selectedUnits.length || new Set(offeredValues).size > 1) {
        return { finishType, state: 'mixed' as const, label: `разные · ${offeredValues.length}/${selectedUnits.length}` }
      }
      return { finishType, state: 'set' as const, label: formatPricePerSqm(offeredValues[0], massEditCurrency) }
    })
  }, [availableFinishTypes, selectedUnits, massEditCurrency])

  useEffect(() => {
    if (!selectedProjectId) return
    const key = installmentsKey(selectedProjectId)
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) setInstallmentStorageTick((tick) => tick + 1)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [selectedProjectId])

  const availableInstallmentRows = useMemo(
    () =>
      selectedProjectId
        ? loadDeveloperInstallmentRows(
            selectedProjectId,
            allProjects.find((p) => p._id === selectedProjectId),
          )
        : [],
    [selectedProjectId, allProjects, installmentStorageTick],
  )

  const selectedInstallmentRow = useMemo(() => {
    if (availableInstallmentRows.length === 0) return null
    const found = selectedInstallmentRowId
      ? availableInstallmentRows.find((row) => row.id === selectedInstallmentRowId)
      : null
    return found ?? availableInstallmentRows[0] ?? null
  }, [availableInstallmentRows, selectedInstallmentRowId])

  const selectedInstallmentIndex = selectedInstallmentRow
    ? availableInstallmentRows.findIndex((row) => row.id === selectedInstallmentRow.id)
    : -1

  const runBulkSave = async (action: () => Promise<{ ok: number; fail: number }>, successMessage: string) => {
    if (saving) return
    setSaving(true)
    try {
      const { ok, fail } = await action()
      if (fail > 0) {
        setToast(`Сохранено: ${ok}, ошибок: ${fail}`)
      } else {
        setToast(successMessage)
      }
    } catch {
      setToast('Не удалось сохранить изменения')
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = (status: UnitStatus) => {
    void runBulkSave(
      () => updateUnitsBulk(unitIds, { status }),
      `Статус: ${STATUS_OPTIONS.find((s) => s.value === status)?.label.toLowerCase()}`,
    )
  }

  const handlePriceApply = () => {
    const parsed = Number(pricePerSqm.replace(/\s+/g, '').replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed <= 0) return
    void runBulkSave(async () => {
      const result = await updateUnitsBulkEntries(
        selectedUnits.map((u) => ({
          unitId: u._id,
          updatedData: {
            pricePerSqm: Math.round(parsed),
            price: u.area != null ? Math.round(parsed * u.area) : u.price,
          },
        })),
      )
      setPricePerSqm('')
      return result
    }, `Цена за м² обновлена для ${unitIds.length} лот${unitIds.length === 1 ? 'а' : 'ов'}`)
  }

  const handleAreaApply = () => {
    const parsed = Number(areaValue.replace(/\s+/g, '').replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed <= 0) return
    const roundedArea = Math.round(parsed * 100) / 100
    void runBulkSave(async () => {
      const result = await updateUnitsBulkEntries(
        selectedUnits.map((u) => {
          const effectivePricePerSqm =
            u.pricePerSqm ?? (u.price && u.area ? Math.round(u.price / u.area) : undefined)
          const newPrice =
            typeof effectivePricePerSqm === 'number'
              ? Math.round(effectivePricePerSqm * roundedArea)
              : u.price
          return {
            unitId: u._id,
            updatedData: {
              area: roundedArea,
              price: newPrice,
              pricePerSqm: effectivePricePerSqm,
            },
          }
        }),
      )
      return result
    }, `Площадь обновлена: ${roundedArea} м² для ${unitIds.length} лот${unitIds.length === 1 ? 'а' : 'ов'}`)
  }

  const handleRoomsApply = () => {
    if (!roomsValue) return
    void runBulkSave(
      () => updateUnitsBulk(unitIds, { rooms: roomsValue }),
      `Планировка / комнатность обновлена: ${optionLabel(t, 'rooms', roomsValue)} для ${unitIds.length} лот${unitIds.length === 1 ? 'а' : 'ов'}`,
    )
  }

  const handleFinishPriceApply = () => {
    if (!activeFinishType) return
    const parsed = Number(finishPricePerSqm.replace(/\s+/g, '').replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed <= 0) return

    void runBulkSave(async () => {
      const roundedPrice = Math.round(parsed)
      const result = await updateUnitsBulkEntries(
        selectedUnits.map((unit) => ({
          unitId: unit._id,
          updatedData: {
            finishPrices: {
              ...(normalizeFinishPrices(unit.finishPrices) ?? {}),
              [activeFinishType]: roundedPrice,
            },
          },
        })),
      )
      setFinishPricePerSqm('')
      return result
    }, `Цена «${activeFinishType}» обновлена для ${unitIds.length} лот${unitIds.length === 1 ? 'а' : 'ов'}`)
  }

  const handleFinishPriceClear = () => {
    if (!activeFinishType) return

    void runBulkSave(async () => {
      const result = await updateUnitsBulkEntries(
        selectedUnits.map((unit) => {
          const nextFinishPrices = { ...(normalizeFinishPrices(unit.finishPrices) ?? {}) }
          delete nextFinishPrices[activeFinishType]
          return {
            unitId: unit._id,
            updatedData: {
              finishPrices: Object.keys(nextFinishPrices).length > 0 ? nextFinishPrices : undefined,
            },
          }
        }),
      )
      setFinishPricePerSqm('')
      return result
    }, `Кондиция «${activeFinishType}» снята с предложения`)
  }

  const handlePriceChangeApply = () => {
    const parsed = Number(priceChangeValue.replace(/\s+/g, '').replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed === 0) return
    void runBulkSave(async () => {
      const result = await applyBulkPriceChange(unitIds, parsed, priceChangeType)
      setPriceChangeValue('')
      return result
    }, `Цена изменена для ${unitIds.length} лот${unitIds.length === 1 ? 'а' : 'ов'}`)
  }

  const handleDiscountApply = () => {
    const pct = Number(discountPercent.replace(/\s+/g, '').replace(',', '.'))
    if (!discountLabel.trim() || !Number.isFinite(pct) || pct <= 0) return
    applyBulkPromotion(unitIds, {
      kind: 'price_discount',
      discountPercent: pct,
      label: discountLabel.trim(),
      expiresAt: discountExpires.trim() || undefined,
    })
    setToast(`Скидка применена к ${unitIds.length} лот${unitIds.length === 1 ? 'у' : 'ам'}`)
    setDiscountPercent('')
    setDiscountLabel('')
    setDiscountExpires('')
  }

  const handleInstallmentApply = () => {
    if (!selectedProjectId || !selectedInstallmentRow) return
    const title = installmentRowTitle(selectedInstallmentRow, Math.max(0, selectedInstallmentIndex))
    const discountPercent =
      selectedInstallmentRow.discountPercent != null && selectedInstallmentRow.discountPercent > 0
        ? selectedInstallmentRow.discountPercent
        : undefined

    let createdCount = 0
    selectedUnits.forEach((unit) => {
      const projectId = buildingProjectById.get(unit.building)
      if (projectId !== selectedProjectId) return

      const data: NewInstallmentPlan = {
        title,
        isActive: true,
        applyTo: 'unit',
        projectId,
        unitId: unit._id,
        downPaymentType: 'percent',
        downPaymentValue: selectedInstallmentRow.downPaymentPercent,
        termType: 'months_from_current_date',
        termMonths: selectedInstallmentRow.termMonths,
        paymentFrequency: selectedInstallmentRow.paymentStep,
        useDiscount: discountPercent != null && discountPercent > 0,
        discountFromDownPayment: discountPercent != null && discountPercent > 0,
        discountPercent: discountPercent != null && discountPercent > 0 ? discountPercent : undefined,
        description: `Программа застройщика: ${installmentRowMeta(selectedInstallmentRow)}`,
      }
      createInstallmentPlan(data)
      createdCount += 1
    })

    if (createdCount === 0) return
    applyBulkPromotion(unitIds, {
      kind: 'installment',
      label: title,
      downPaymentPercent: selectedInstallmentRow.downPaymentPercent,
      installmentMonths: selectedInstallmentRow.termMonths,
      expiresAt: selectedInstallmentRow.validUntil ?? undefined,
    })
    setToast(`Рассрочка «${title}» применена к ${createdCount} лот${createdCount === 1 ? 'у' : 'ам'}`)
  }

  const handleGiftApply = () => {
    if (!giftLabel.trim()) return
    applyBulkPromotion(unitIds, {
      kind: 'gift',
      giftText: giftText.trim() || undefined,
      label: giftLabel.trim(),
      expiresAt: giftExpires.trim() || undefined,
    })
    setToast(`Подарок применён к ${unitIds.length} лот${unitIds.length === 1 ? 'у' : 'ам'}`)
    setGiftText('')
    setGiftLabel('')
    setGiftExpires('')
  }

  const handlePromotionClear = () => {
    clearBulkPromotion(unitIds)
    setToast('Акция снята')
  }

  const canApplyPrice = pricePerSqm.trim().length > 0
  const canApplyArea = areaValue.trim().length > 0 && Number(areaValue.replace(/\s+/g, '').replace(',', '.')) > 0
  const canApplyRooms = Boolean(roomsValue.trim().length > 0)
  const canApplyFinishPrice = Boolean(activeFinishType && finishPricePerSqm.trim().length > 0)
  const canClearFinishPrice = Boolean(
    activeFinishType &&
      selectedUnits.some((unit) => typeof normalizeFinishPrices(unit.finishPrices)?.[activeFinishType] === 'number'),
  )
  const canApplyPriceChange = priceChangeValue.trim().length > 0
  const canApplyDiscount = discountLabel.trim().length > 0 && discountPercent.trim().length > 0
  const canApplyInstallment = Boolean(selectedProjectId && selectedInstallmentRow)
  const canApplyGift = giftLabel.trim().length > 0

  const modalShellClassName =
    modalMode !== null || expanded
      ? 'h-[calc(100vh-40px)] w-[calc(100vw-40px)]'
      : 'h-[min(900px,calc(100vh-56px))] w-[min(1180px,calc(100vw-56px))]'

  return (
  <>
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(2,8,6,0.72)] p-5 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
    <div
      className={`pointer-events-auto relative flex overflow-hidden rounded-xl border border-[rgba(242,207,141,0.2)] bg-[#031d16] shadow-[0_32px_120px_rgba(0,0,0,0.62)] transition-[width,height] duration-200 ${modalShellClassName}`}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* ── Inline left panel ── */}
      {modalMode !== null && targetBuilding && (
        <div className="flex min-w-0 flex-1 flex-col border-r border-[rgba(242,207,141,0.15)]">
          <div className="flex shrink-0 items-center justify-between border-b border-[rgba(242,207,141,0.15)] px-4 py-3">
            <span className="text-xs font-normal text-[#fcecc8]">
              {modalMode === 'layout'
                ? `Планировки · ${selectedUnits.length === 1 ? selectedUnits[0].number : `${selectedUnits.length} лотов`}`
                : `План этажа · ${targetBuilding.name}`}
            </span>
            <button
              type="button"
              onClick={() => setModalMode(null)}
              className="rounded-md p-1.5 text-[rgba(242,207,141,0.5)] transition-colors hover:bg-[rgba(242,207,141,0.1)] hover:text-[#fcecc8]"
            >
              <X size={14} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden p-4">
            {modalMode === 'floor' ? (
              <FloorPlanEditor
                initialBuildingId={targetBuildingId}
                initialFloor={targetFloor}
                fullscreen
              />
            ) : (
              <UnitLayoutPanel
                key={targetBuildingId}
                buildingId={targetBuildingId}
                onSave={(url, unitIds) => setUnitsLayoutImage(unitIds, url)}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Controls panel (right) ── */}
      <div className={`flex min-w-0 flex-col ${modalMode !== null ? 'w-[420px] shrink-0' : 'flex-1'}`}>
        <header className="flex shrink-0 items-start justify-between border-b border-[rgba(242,207,141,0.15)] px-5 py-4">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[20px] font-normal text-[#fcecc8]">
              {t('inventory.massEditSidebar.выбрано_лотов')} {selectedUnits.length}
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {selectedUnits.slice(0, 30).map((u) => (
                <span
                  key={u._id}
                  className="rounded-md px-2 py-0.5 text-[14px] font-normal bg-[rgba(242,207,141,0.1)] border border-[rgba(242,207,141,0.2)] text-[rgba(242,207,141,0.85)]"
                >
                  {u.number}
                </span>
              ))}
              {selectedUnits.length > 30 && (
                <span className="rounded px-1.5 py-0.5 text-[14px] text-[rgba(242,207,141,0.5)]">
                  +{selectedUnits.length - 30}
                </span>
              )}
            </div>
            <p className="text-[16px] font-normal text-[rgba(242,207,141,0.6)]">
              {t('inventory.massEditSidebar.площадь')} {aggregates.totalArea.toFixed(1)} {t('inventory.massEditSidebar.м_итого')} {formatPrice(aggregates.totalValue, massEditCurrency)}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {modalMode === null && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                title={expanded ? 'Свернуть' : 'Расширить'}
                className="rounded-md p-1.5 text-[rgba(242,207,141,0.5)] transition-colors hover:bg-[rgba(242,207,141,0.1)] hover:text-[#fcecc8]"
              >
                {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-[rgba(242,207,141,0.5)] transition-colors hover:bg-[rgba(242,207,141,0.1)] hover:text-[#fcecc8]"
              aria-label={t('inventory.massEditSidebar.снять_выделение')}
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div className={`flex-1 overflow-y-auto px-5 py-4 space-y-6 ${modalMode === null ? 'mx-auto w-full max-w-[820px]' : ''}`}>

          <section>
            <h3 className="mb-2 text-[16px] font-medium uppercase tracking-[0.08em] text-[rgba(242,207,141,0.55)]">{t('inventory.massEditSidebar.статус')}</h3>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map((option) => {
                const isActive =
                  aggregates.statuses.size === 1 && aggregates.statuses.has(option.value)
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={saving}
                    onClick={() => gate(() => handleStatusChange(option.value))}
                    className={`h-11 rounded-md border text-[17px] font-normal transition-colors ${
                      isActive
                        ? option.activeClass
                        : 'border-[rgba(242,207,141,0.2)] bg-[rgba(255,255,255,0.04)] text-[rgba(242,207,141,0.8)] hover:border-[rgba(242,207,141,0.5)] hover:text-[#fcecc8]'
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
            {aggregates.statuses.size > 1 ? (
              <p className="mt-2 text-[15px] text-[rgba(242,207,141,0.5)]">{t('inventory.massEditSidebar.у_выделенных_разные')}</p>
            ) : null}
          </section>

          <section>
            <h3 className="mb-2 text-[16px] font-medium uppercase tracking-[0.08em] text-[rgba(242,207,141,0.55)]">{t('inventory.massEditSidebar.цена_за_м')}</h3>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                value={pricePerSqm}
                onChange={(e) => setPricePerSqm(e.target.value)}
                placeholder={t('inventory.massEditSidebar.новая_цена')}
                className={`${INPUT_CLASS} flex-1`}
              />
              <Button
                size="sm"
                disabled={!canApplyPrice || saving}
                onClick={() => gate(handlePriceApply)}
                className="bg-[#c9a84c] text-[#0a1f12] hover:bg-[#e2c97e]"
              >
                <Check size={14} />
                {t('inventory.massEditSidebar.применить')}</Button>
            </div>
            <p className="mt-1.5 text-[15px] text-[rgba(242,207,141,0.5)]">
              {t('inventory.massEditSidebar.итоговая_стоимость_п')}</p>

            <div className="mt-3 flex gap-2">
              <div className="flex rounded-md border border-[rgba(242,207,141,0.2)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPriceChangeType('percentage')}
                  className={`px-3 py-1.5 text-xs transition-colors ${priceChangeType === 'percentage' ? 'bg-[rgba(201,168,76,0.2)] text-[#fcecc8]' : 'text-[rgba(242,207,141,0.55)] hover:text-[#fcecc8]'}`}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => setPriceChangeType('fixed')}
                  className={`px-3 py-1.5 text-xs transition-colors ${priceChangeType === 'fixed' ? 'bg-[rgba(201,168,76,0.2)] text-[#fcecc8]' : 'text-[rgba(242,207,141,0.55)] hover:text-[#fcecc8]'}`}
                >
                  {massEditCurrencySymbol}
                </button>
              </div>
              <input
                type="number"
                value={priceChangeValue}
                onChange={(e) => setPriceChangeValue(e.target.value)}
                placeholder={priceChangeType === 'percentage' ? 'Изменить на %, напр. -5' : `Изменить на ${massEditCurrencySymbol}, напр. -1000`}
                className={`${INPUT_CLASS} flex-1`}
              />
              <Button
                size="sm"
                disabled={!canApplyPriceChange || saving}
                onClick={() => gate(handlePriceChangeApply)}
                className="bg-[#c9a84c] text-[#0a1f12] hover:bg-[#e2c97e]"
              >
                <Check size={14} />
              </Button>
            </div>
          </section>

          {/* ── Площадь ── */}
          <section>
            <h3 className="mb-2 text-[16px] font-medium uppercase tracking-[0.08em] text-[rgba(242,207,141,0.55)]">
              {t('inventory.massEditSidebar.площадь_заголовок', 'Площадь, м²')}
            </h3>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="0.1"
                value={areaValue}
                onChange={(e) => setAreaValue(e.target.value)}
                placeholder={
                  selectedUnits.length === 1 && selectedUnits[0].area != null
                    ? `${selectedUnits[0].area} м²`
                    : t('inventory.massEditSidebar.новая_площадь', 'Новая площадь, м²')
                }
                className={`${INPUT_CLASS} flex-1`}
              />
              <Button
                size="sm"
                disabled={!canApplyArea || saving}
                onClick={() => gate(handleAreaApply)}
                className="bg-[#c9a84c] text-[#0a1f12] hover:bg-[#e2c97e]"
              >
                <Check size={14} />
                {t('inventory.massEditSidebar.применить', 'Применить')}
              </Button>
            </div>
            <p className="mt-1.5 text-[15px] text-[rgba(242,207,141,0.5)]">
              {t('inventory.massEditSidebar.итоговая_стоимость_п', 'Итоговая стоимость пересчитается автоматически.')}
            </p>
          </section>

          {/* ── Планировка / комнатность ── */}
          <section>
            <h3 className="mb-2 text-[16px] font-medium uppercase tracking-[0.08em] text-[rgba(242,207,141,0.55)]">
              {t('inventory.massEditSidebar.планировка_комнатность', 'Планировка / комнатность')}
            </h3>
            <div className="flex gap-2">
              <select
                value={roomsValue}
                onChange={(e) => setRoomsValue(e.target.value)}
                className={`${INPUT_CLASS} flex-1`}
              >
                <option value="">
                  {selectedUnits.length === 1 && selectedUnits[0].rooms
                    ? optionLabel(t, 'rooms', selectedUnits[0].rooms)
                    : t('inventory.massEditSidebar.выберите_комнатность', 'Выберите комнатность / тип...')}
                </option>
                {ALL_ROOM_CHOICES.map((r) => (
                  <option key={r} value={r}>
                    {optionLabel(t, 'rooms', r)}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                disabled={!canApplyRooms || saving}
                onClick={() => gate(handleRoomsApply)}
                className="bg-[#c9a84c] text-[#0a1f12] hover:bg-[#e2c97e]"
              >
                <Check size={14} />
                {t('inventory.massEditSidebar.применить', 'Применить')}
              </Button>
            </div>
            {targetBuilding && (
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModalMode('layout')}
                  className="h-9 border-[rgba(242,207,141,0.3)] bg-[rgba(255,255,255,0.04)] text-[15px] font-normal text-[#d0e8df] hover:bg-[rgba(242,207,141,0.1)]"
                >
                  <Upload size={14} className="mr-1.5" />
                  {t('inventory.massEditSidebar.привязать_планировку_картинку', 'Привязать изображение планировки')}
                </Button>
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-[16px] font-medium uppercase tracking-[0.08em] text-[rgba(255,255,255,0.72)]">
              {t('inventory.massEditSidebar.цены_по_кондициям')}</h3>
            <div className="rounded-md bg-[#112d1c] p-3 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                <label className="flex min-w-0 flex-col gap-2 text-[16px] font-medium text-[#d0e8df]">
                  {t('inventory.massEditSidebar.кондиция_отделки')}<select
                    aria-label={t('inventory.massEditSidebar.кондиция_для_массово')}
                    value={activeFinishType ?? ''}
                    onChange={(event) => setSelectedFinishType(event.target.value as FinishType)}
                    disabled={saving || availableFinishTypes.length === 0}
                    className={`${INPUT_CLASS} min-w-0`}
                  >
                    {availableFinishTypes.map((finishType) => (
                      <option key={finishType} value={finishType}>
                        {optionLabel(t, 'finishTypes', finishType)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex min-w-0 flex-col gap-2 text-[16px] font-medium text-[#d0e8df]">
                  {t('inventory.massEditSidebar.цена_за_м')}<input
                    type="number"
                    min="0"
                    value={finishPricePerSqm}
                    onChange={(event) => setFinishPricePerSqm(event.target.value)}
                    placeholder={t('inventory.massEditSidebar.например_3500')}
                    aria-label={t('inventory.massEditSidebar.цена_выбранной_конди')}
                    className={`${INPUT_CLASS} min-w-0`}
                  />
                </label>

                <Button
                  size="sm"
                  disabled={!canApplyFinishPrice || saving}
                  onClick={() => gate(handleFinishPriceApply)}
                  aria-label={t('inventory.massEditSidebar.применить_цену_выбра')}
                  className="h-10 bg-[#e6c364] text-[16px] font-medium text-[#072821] hover:bg-[#e2c97e]"
                >
                  <Check size={16} />
                  {t('inventory.massEditSidebar.применить')}</Button>
              </div>

              {availableFinishTypes.length === 0 ? (
                <p className="mt-3 text-[16px] font-normal text-[rgba(255,255,255,0.72)]">
                  {t('inventory.massEditSidebar.в_проекте_не_настрое')}</p>
              ) : (
                <>
                  <div className="mt-3 flex flex-col gap-1">
                    {finishPriceRows.map((row) => {
                      const isActive = row.finishType === activeFinishType
                      return (
                        <button
                          key={row.finishType}
                          type="button"
                          onClick={() => setSelectedFinishType(row.finishType)}
                          aria-pressed={isActive}
                          className={`flex items-center justify-between gap-3 rounded-[4px] px-3 py-2 text-left text-[16px] transition-colors ${
                            isActive
                              ? 'bg-[rgba(201,168,76,0.16)]'
                              : 'bg-[rgba(0,0,0,0.18)] hover:bg-[rgba(201,168,76,0.08)]'
                          }`}
                        >
                          <span className="min-w-0 truncate font-normal text-[#d0e8df]">{optionLabel(t, 'finishTypes', row.finishType)}</span>
                          <span
                            className={`shrink-0 font-medium ${
                              row.state === 'set' ? 'text-[#e6c364]' : 'text-[rgba(255,255,255,0.72)]'
                            }`}
                          >
                            {row.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!canClearFinishPrice || saving}
                      onClick={() => gate(handleFinishPriceClear)}
                      aria-label={t('inventory.massEditSidebar.убрать_выбранную_кон')}
                      className="h-10 border-[#e6c364] bg-transparent text-[16px] font-medium text-[#e6c364] hover:bg-[#163824] hover:text-[#e2c97e]"
                    >
                      <Trash2 size={16} />
                      {t('inventory.massEditSidebar.не_предлагать')}</Button>
                  </div>
                </>
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-[16px] font-medium uppercase tracking-[0.08em] text-[rgba(242,207,141,0.55)]">{t('inventory.massEditSidebar.акции')}</h3>

            <div className="rounded-lg border border-[rgba(242,207,141,0.12)] bg-[rgba(0,0,0,0.3)] p-3">
              {/* Type selector */}
              <div className="flex flex-wrap gap-1.5">
                {([
                  ['discount',    'Скидка',    Percent],
                  ['installment', 'Рассрочка', Wallet],
                  ['gift',        'Подарок',   Gift],
                ] as const).map(([k, lbl, Icon]) => {
                  const active = promoType === k
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setPromoType(active ? null : k)}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-[16px] font-normal transition-colors ${
                        active
                          ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.18)] text-[#fcecc8]'
                          : 'border-[rgba(242,207,141,0.18)] bg-[rgba(255,255,255,0.03)] text-[rgba(242,207,141,0.6)] hover:border-[rgba(242,207,141,0.35)] hover:text-[rgba(242,207,141,0.95)]'
                      }`}
                    >
                      <Icon size={12} />
                      {lbl}
                    </button>
                  )
                })}
              </div>

              {/* Active type form */}
              {promoType && (
                <>
                  <div className="my-3 border-t border-[rgba(242,207,141,0.08)]" />

                  {promoType === 'discount' && (
                    <div className="flex flex-col gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={discountPercent}
                        onChange={(e) => setDiscountPercent(e.target.value)}
                        placeholder={t('inventory.massEditSidebar.размер_скидки')}
                        className={INPUT_CLASS}
                      />
                      <input
                        type="text"
                        value={discountLabel}
                        onChange={(e) => setDiscountLabel(e.target.value)}
                        placeholder={t('inventory.massEditSidebar.подпись_акции_для_кл')}
                        className={INPUT_CLASS}
                      />
                      <input
                        type="date"
                        value={discountExpires}
                        onChange={(e) => setDiscountExpires(e.target.value)}
                        title={t('inventory.massEditSidebar.действует_до')}
                        className={`${INPUT_CLASS} text-[rgba(242,207,141,0.6)]`}
                      />
                      <Button
                        size="sm"
                        disabled={!canApplyDiscount}
                        onClick={() => gate(handleDiscountApply)}
                        className="bg-[#c9a84c] text-[#0a1f12] hover:bg-[#e2c97e]"
                      >
                        <Sparkles size={13} />
                        {t('inventory.massEditSidebar.применить')}</Button>
                    </div>
                  )}

                  {promoType === 'installment' && (
                    <div className="flex flex-col gap-2">
                      {!selectedProjectId ? (
                        <p className="rounded-md bg-[#10261c] px-3 py-3 text-[16px] text-[rgba(255,255,255,0.72)] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.12)]">
                          {t('inventory.massEditSidebar.выберите_лоты_одного')}</p>
                      ) : availableInstallmentRows.length === 0 ? (
                        <p className="rounded-md bg-[#10261c] px-3 py-3 text-[16px] text-[rgba(255,255,255,0.72)] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.12)]">
                          {t('inventory.massEditSidebar.у_застройщика_нет_ак')}</p>
                      ) : (
                        <>
                          <div className="grid gap-2">
                            {availableInstallmentRows.map((row, index) => {
                              const selected = row.id === selectedInstallmentRow?.id
                              return (
                                <button
                                  key={row.id}
                                  type="button"
                                  onClick={() => setSelectedInstallmentRowId(row.id)}
                                  className={`rounded-md px-3 py-3 text-left transition-colors ${
                                    selected
                                      ? 'bg-[rgba(201,168,76,0.18)] text-[#fcecc8] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.4)]'
                                      : 'bg-[#10261c] text-[rgba(255,255,255,0.72)] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.12)] hover:bg-[#163824] hover:text-[#d0e8df]'
                                  }`}
                                >
                                  <span className="block text-[17px] font-normal">{installmentRowTitle(row, index)}</span>
                                  <span className="mt-1 block text-[16px] text-[#d0e8df]">{installmentRowMeta(row)}</span>
                                </button>
                              )
                            })}
                          </div>

                          {selectedInstallmentRow ? (
                            <div className="grid grid-cols-2 gap-2 rounded-md bg-[#10261c] p-3 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.12)]">
                              <div>
                                <span className="block text-[16px] font-medium uppercase tracking-[0.08em] text-[rgba(242,207,141,0.72)]">
                                  {t('inventory.massEditSidebar.взнос')}</span>
                                <span className="mt-1 block text-[16px] text-[#fcecc8]">
                                  {selectedInstallmentRow.downPaymentPercent}%
                                </span>
                              </div>
                              <div>
                                <span className="block text-[16px] font-medium uppercase tracking-[0.08em] text-[rgba(242,207,141,0.72)]">
                                  {t('inventory.massEditSidebar.срок')}</span>
                                <span className="mt-1 block text-[16px] text-[#fcecc8]">
                                  {selectedInstallmentRow.termMonths} {t('inventory.massEditSidebar.мес')}</span>
                              </div>
                              <div>
                                <span className="block text-[16px] font-medium uppercase tracking-[0.08em] text-[rgba(242,207,141,0.72)]">
                                  {t('inventory.massEditSidebar.шаг')}</span>
                                <span className="mt-1 block text-[16px] text-[#fcecc8]">
                                  {selectedInstallmentRow.paymentStep === 'monthly' ? 'Раз в месяц' : 'Раз в квартал'}
                                </span>
                              </div>
                              <div>
                                <span className="block text-[16px] font-medium uppercase tracking-[0.08em] text-[rgba(242,207,141,0.72)]">
                                  {t('inventory.massEditSidebar.скидка')}</span>
                                <span className="mt-1 block text-[16px] text-[#fcecc8]">
                                  {selectedInstallmentRow.discountPercent != null ? `${selectedInstallmentRow.discountPercent}%` : '—'}
                                </span>
                              </div>
                            </div>
                          ) : null}
                        </>
                      )}

                      <Button
                        size="sm"
                        disabled={!canApplyInstallment}
                        onClick={() => gate(handleInstallmentApply)}
                        className="bg-[#c9a84c] text-[#0a1f12] hover:bg-[#e2c97e]"
                      >
                        <Sparkles size={13} />
                        {t('inventory.massEditSidebar.применить')}</Button>
                    </div>
                  )}

                  {promoType === 'gift' && (
                    <div className="flex flex-col gap-1.5">
                      <input
                        type="text"
                        value={giftText}
                        onChange={(e) => setGiftText(e.target.value)}
                        placeholder={t('inventory.massEditSidebar.описание_подарка_опц')}
                        className={INPUT_CLASS}
                      />
                      <input
                        type="text"
                        value={giftLabel}
                        onChange={(e) => setGiftLabel(e.target.value)}
                        placeholder={t('inventory.massEditSidebar.подпись_акции_для_кл')}
                        className={INPUT_CLASS}
                      />
                      <input
                        type="date"
                        value={giftExpires}
                        onChange={(e) => setGiftExpires(e.target.value)}
                        title={t('inventory.massEditSidebar.действует_до')}
                        className={`${INPUT_CLASS} text-[rgba(242,207,141,0.6)]`}
                      />
                      <Button
                        size="sm"
                        disabled={!canApplyGift}
                        onClick={() => gate(handleGiftApply)}
                        className="bg-[#c9a84c] text-[#0a1f12] hover:bg-[#e2c97e]"
                      >
                        <Sparkles size={13} />
                        {t('inventory.massEditSidebar.применить')}</Button>
                    </div>
                  )}
                </>
              )}
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => gate(handlePromotionClear)}
              className="mt-3 border-[rgba(242,207,141,0.3)] bg-transparent text-[#e8dcc4] hover:bg-[rgba(242,207,141,0.1)]"
            >
              <Trash2 size={14} />
              {t('inventory.massEditSidebar.снять_все_акции')}</Button>
          </section>

          {selectedUnits.length === 1 ? (
            <section className="rounded-md border border-[rgba(242,207,141,0.15)] bg-[rgba(0,0,0,0.25)] p-4">
              <h3 className="mb-2 text-xs font-normal uppercase tracking-wide text-[rgba(242,207,141,0.55)]">
                {selectedUnits[0].number}
              </h3>
              <div className="space-y-1 text-xs text-[rgba(242,207,141,0.75)]">
                <div>{t('inventory.massEditSidebar.комнатность')} {selectedUnits[0].rooms ? optionLabel(t, 'rooms', selectedUnits[0].rooms) : '—'}</div>
                <div>{t('inventory.massEditSidebar.площадь')} {formatArea(selectedUnits[0].area)}</div>
                <div>{t('inventory.massEditSidebar.цена')} {formatPricePerSqm(selectedUnits[0].pricePerSqm, massEditCurrency)}</div>
                {selectedUnits[0].promotion ? (
                  <div className="text-[#e2c97e]">{t('inventory.massEditSidebar.акция')} {selectedUnits[0].promotion.label}</div>
                ) : null}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 w-full border-[rgba(242,207,141,0.3)] bg-transparent text-[#e8dcc4] hover:bg-[rgba(242,207,141,0.1)]"
                onClick={() => onOpenDetail(selectedUnits[0])}
              >
                {t('inventory.massEditSidebar.открыть_подробно')}</Button>
            </section>
          ) : null}

          {toast ? (
            <div className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-xs text-emerald-100">
              {toast}
            </div>
          ) : null}
        </div>
      </div>
    </div>
    </div>

    {pendingAction && (
      <PasswordConfirmModal
        onConfirm={() => {
          pendingAction()
          setPendingAction(null)
        }}
        onCancel={() => setPendingAction(null)}
      />
    )}
  </>
  )
}

interface UnitLayoutPanelProps {
  buildingId: string
  onSave: (imageUrl: string, unitIds: string[]) => void
}

function UnitLayoutPanel({ buildingId, onSave }: UnitLayoutPanelProps) {
    const { t } = useI18n();
  const allUnits = useCoreStore((s) => s.allUnits)

  const buildingUnits = useMemo(
    () => allUnits.filter((u) => u.building === buildingId),
    [allUnits, buildingId],
  )

  // group by floor, sorted by unit number within each floor
  const unitsByFloor = useMemo(() => {
    const map = new Map<number, IUnit[]>()
    buildingUnits.forEach((u) => {
      if (!map.has(u.floor)) map.set(u.floor, [])
      map.get(u.floor)!.push(u)
    })
    map.forEach((units) =>
      units.sort((a, b) => a.number.localeCompare(b.number, 'ru', { numeric: true })),
    )
    return map
  }, [buildingUnits])

  const allFloors = useMemo(
    () => Array.from(unitsByFloor.keys()).sort((a, b) => a - b),
    [unitsByFloor],
  )

  const maxUnitsPerFloor = useMemo(
    () => Math.max(0, ...Array.from(unitsByFloor.values()).map((u) => u.length)),
    [unitsByFloor],
  )

  const colIndices = useMemo(
    () => Array.from({ length: maxUnitsPerFloor }, (_, i) => i),
    [maxUnitsPerFloor],
  )

  const [selectedFloors, setSelectedFloors] = useState<Set<number>>(() => new Set(allFloors))
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set())
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [savedCount, setSavedCount] = useState<number | null>(null)
  const [hoverPreview, setHoverPreview] = useState<
    { unitId: string; rect: { top: number; left: number; right: number; bottom: number } } | null
  >(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const hoverOpenTimer = useRef<number | null>(null)
  const hoverCloseTimer = useRef<number | null>(null)
  const singleUploadInputRef = useRef<HTMLInputElement>(null)
  const singleUploadUnitIdRef = useRef<string | null>(null)

  const visibleFloors = useMemo(
    () => allFloors.filter((f) => selectedFloors.has(f)).sort((a, b) => b - a),
    [allFloors, selectedFloors],
  )

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      setImageUrl(e.target?.result as string)
      // Auto-select units without an existing layout (on visible floors) as a sensible default
      setSelectedUnitIds((prev) => {
        if (prev.size > 0) return prev
        const next = new Set<string>()
        buildingUnits.forEach((u) => {
          if (!u.layoutImageUrl) next.add(u._id)
        })
        return next
      })
    }
    reader.readAsDataURL(file)
  }, [buildingUnits])

  const selectEmpties = () => {
    setSelectedUnitIds(() => {
      const next = new Set<string>()
      buildingUnits.forEach((u) => {
        if (!u.layoutImageUrl) next.add(u._id)
      })
      return next
    })
  }

  const selectFilled = () => {
    setSelectedUnitIds(() => {
      const next = new Set<string>()
      buildingUnits.forEach((u) => {
        if (u.layoutImageUrl) next.add(u._id)
      })
      return next
    })
  }

  const clearSelection = () => setSelectedUnitIds(new Set())

  const toggleFloor = (floor: number) => {
    setSelectedFloors((prev) => {
      const next = new Set(prev)
      if (next.has(floor)) next.delete(floor)
      else next.add(floor)
      return next
    })
  }

  const toggleUnit = (unitId: string) => {
    setSelectedUnitIds((prev) => {
      const next = new Set(prev)
      if (next.has(unitId)) next.delete(unitId)
      else next.add(unitId)
      return next
    })
  }

  const toggleRow = (floor: number) => {
    const units = unitsByFloor.get(floor) ?? []
    const allSel = units.length > 0 && units.every((u) => selectedUnitIds.has(u._id))
    setSelectedUnitIds((prev) => {
      const next = new Set(prev)
      if (allSel) units.forEach((u) => next.delete(u._id))
      else units.forEach((u) => next.add(u._id))
      return next
    })
  }

  // стояк — same position index across all visible floors
  const toggleColumn = (colIdx: number) => {
    const colUnits = visibleFloors
      .map((f) => unitsByFloor.get(f)?.[colIdx])
      .filter((u): u is IUnit => u !== undefined)
    const allSel = colUnits.length > 0 && colUnits.every((u) => selectedUnitIds.has(u._id))
    setSelectedUnitIds((prev) => {
      const next = new Set(prev)
      if (allSel) colUnits.forEach((u) => next.delete(u._id))
      else colUnits.forEach((u) => next.add(u._id))
      return next
    })
  }

  const handleApply = () => {
    if (!imageUrl || selectedUnitIds.size === 0) return
    const ids = Array.from(selectedUnitIds)
    onSave(imageUrl, ids)
    setSavedCount(ids.length)
    setTimeout(() => setSavedCount(null), 2500)
  }

  const openHoverFor = (unitId: string, el: HTMLElement) => {
    if (hoverCloseTimer.current) {
      window.clearTimeout(hoverCloseTimer.current)
      hoverCloseTimer.current = null
    }
    if (hoverOpenTimer.current) window.clearTimeout(hoverOpenTimer.current)
    const r = el.getBoundingClientRect()
    hoverOpenTimer.current = window.setTimeout(() => {
      setHoverPreview({ unitId, rect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom } })
    }, 220)
  }

  const scheduleHoverClose = () => {
    if (hoverOpenTimer.current) {
      window.clearTimeout(hoverOpenTimer.current)
      hoverOpenTimer.current = null
    }
    if (hoverCloseTimer.current) window.clearTimeout(hoverCloseTimer.current)
    hoverCloseTimer.current = window.setTimeout(() => setHoverPreview(null), 160)
  }

  const keepHoverOpen = () => {
    if (hoverCloseTimer.current) {
      window.clearTimeout(hoverCloseTimer.current)
      hoverCloseTimer.current = null
    }
  }

  useEffect(() => {
    return () => {
      if (hoverOpenTimer.current) window.clearTimeout(hoverOpenTimer.current)
      if (hoverCloseTimer.current) window.clearTimeout(hoverCloseTimer.current)
    }
  }, [])

  const uploadSingleUnit = (unitId: string, file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      onSave(e.target?.result as string, [unitId])
      setSavedCount(1)
      setTimeout(() => setSavedCount(null), 2500)
    }
    reader.readAsDataURL(file)
  }

  const triggerSingleUpload = (unitId: string) => {
    singleUploadUnitIdRef.current = unitId
    singleUploadInputRef.current?.click()
  }

  const hoverUnit = useMemo(
    () => (hoverPreview ? buildingUnits.find((u) => u._id === hoverPreview.unitId) ?? null : null),
    [hoverPreview, buildingUnits],
  )

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className="flex h-full gap-5 min-h-0">
      {/* Left column: upload + actions */}
      <div className="w-52 shrink-0 flex flex-col gap-3">
        {imageUrl ? (
          <div className="overflow-hidden rounded-xl border border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.3)]" style={{ height: 190 }}>
            <img src={imageUrl} alt={t('inventory.massEditSidebar.планировка')} className="h-full w-full object-contain" />
          </div>
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleFileDrop}
            onClick={() => inputRef.current?.click()}
            style={{ height: 190 }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
              isDragging
                ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.08)]'
                : 'border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.2)] hover:border-[rgba(242,207,141,0.4)]'
            }`}
          >
            <Upload className="size-7 text-[rgba(242,207,141,0.3)]" />
            <div>
              <p className="text-xs font-medium text-[#fcecc8]">{t('inventory.massEditSidebar.загрузить_планировку')}</p>
              <p className="mt-0.5 text-[10px] text-[rgba(242,207,141,0.4)]">PNG, JPG</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
          </div>
        )}

        {imageUrl && (
          <label className="inline-flex cursor-pointer items-center gap-1.5 self-start rounded-md border border-[rgba(242,207,141,0.2)] px-2 py-1 text-[10px] text-[rgba(242,207,141,0.6)] transition-colors hover:text-[#fcecc8]">
            <Upload size={10} />
            {t('inventory.massEditSidebar.заменить')}<input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </label>
        )}

        <div className="text-xs text-[rgba(242,207,141,0.55)]">
          {t('inventory.massEditSidebar.выбрано')}{' '}
          <span className={selectedUnitIds.size > 0 ? 'font-normal text-[#fcecc8]' : ''}>
            {selectedUnitIds.size}
          </span>{' '}
          {t('inventory.massEditSidebar.лотов')}</div>

        <Button
          size="sm"
          disabled={!imageUrl || selectedUnitIds.size === 0}
          onClick={handleApply}
          className="bg-[#c9a84c] text-[#0a1f12] hover:bg-[#e2c97e] disabled:opacity-40"
        >
          {t('inventory.massEditSidebar.применить_к')}{selectedUnitIds.size > 0 ? `${selectedUnitIds.size} лот${selectedUnitIds.size === 1 ? 'у' : 'ам'}` : 'лотам'}
        </Button>

        {savedCount !== null && (
          <div className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-200">
            {t('inventory.massEditSidebar.сохранено_для')}{savedCount} {t('inventory.massEditSidebar.лотов')}</div>
        )}

        <div className="mt-auto rounded-md border border-[rgba(242,207,141,0.1)] bg-[rgba(0,0,0,0.2)] px-3 py-2 text-[10px] leading-relaxed text-[rgba(242,207,141,0.4)]">
          {t('inventory.massEditSidebar.кликните_по_заголовк')}<b className="text-[rgba(242,207,141,0.6)]">{t('inventory.massEditSidebar.этажа')}</b> {t('inventory.massEditSidebar.выбрать_вс_кликните')}<b className="text-[rgba(242,207,141,0.6)]">{t('inventory.massEditSidebar.стояка')}</b> {t('inventory.massEditSidebar.выбрать_столбец')}</div>
      </div>

      {/* Right column: floor chips + unit grid */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* Floor filter chips */}
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[10px] text-[rgba(242,207,141,0.4)]">{t('inventory.massEditSidebar.этажи')}</span>
          {[...allFloors].reverse().map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => toggleFloor(f)}
              className={`h-6 min-w-[1.75rem] rounded px-1.5 text-[10px] font-medium transition-colors ${
                selectedFloors.has(f)
                  ? 'bg-[#c9a84c] text-[#0a1f12]'
                  : 'border border-[rgba(242,207,141,0.2)] text-[rgba(242,207,141,0.5)] hover:border-[rgba(242,207,141,0.4)] hover:text-[rgba(242,207,141,0.8)]'
              }`}
            >
              {f}
            </button>
          ))}
          {allFloors.length > 1 && (
            <button
              type="button"
              onClick={() => setSelectedFloors(new Set(allFloors))}
              className="ml-1 h-6 rounded border border-[rgba(242,207,141,0.15)] px-2 text-[10px] text-[rgba(242,207,141,0.4)] transition-colors hover:text-[rgba(242,207,141,0.7)]"
            >
              {t('inventory.massEditSidebar.все')}</button>
          )}
          {selectedFloors.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedFloors(new Set())}
              className="h-6 rounded border border-[rgba(242,207,141,0.15)] px-2 text-[10px] text-[rgba(242,207,141,0.4)] transition-colors hover:text-rose-300"
            >
              {t('inventory.massEditSidebar.снять')}</button>
          )}
        </div>

        {/* Quick selection buttons */}
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[10px] text-[rgba(242,207,141,0.4)]">{t('inventory.massEditSidebar.быстро')}</span>
          <button
            type="button"
            onClick={selectEmpties}
            className="inline-flex h-6 items-center gap-1 rounded border border-[rgba(242,207,141,0.2)] px-2 text-[10px] text-[rgba(242,207,141,0.65)] transition-colors hover:border-[#c9a84c]/60 hover:text-[#fcecc8]"
          >
            {t('inventory.massEditSidebar.пустые')}</button>
          <button
            type="button"
            onClick={selectFilled}
            className="inline-flex h-6 items-center gap-1 rounded border border-emerald-400/30 px-2 text-[10px] text-emerald-300/80 transition-colors hover:border-emerald-400/70 hover:text-emerald-200"
          >
            <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.7)]" />
            {t('inventory.massEditSidebar.с_планировкой')}</button>
          {selectedUnitIds.size > 0 && (
            <button
              type="button"
              onClick={clearSelection}
              className="h-6 rounded border border-[rgba(242,207,141,0.15)] px-2 text-[10px] text-[rgba(242,207,141,0.4)] transition-colors hover:text-rose-300"
            >
              {t('inventory.massEditSidebar.снять_выбор')}</button>
          )}
        </div>

        {/* Unit grid */}
        {visibleFloors.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-xs text-[rgba(242,207,141,0.3)]">
            {t('inventory.massEditSidebar.выберите_этажи')}</div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-[#0e1a12] px-3 py-1 text-left text-[10px] font-normal text-[rgba(242,207,141,0.35)]">
                    {t('inventory.massEditSidebar.эт')}</th>
                  {colIndices.map((i) => (
                    <th
                      key={i}
                      onClick={() => toggleColumn(i)}
                      title={`Стояк ${i + 1}`}
                      className="cursor-pointer px-1 py-1 text-center text-[10px] font-medium text-[rgba(242,207,141,0.45)] transition-colors hover:text-[#c9a84c]"
                    >
                      {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleFloors.map((floor) => {
                  const units = unitsByFloor.get(floor) ?? []
                  const allRowSel = units.length > 0 && units.every((u) => selectedUnitIds.has(u._id))
                  return (
                    <tr key={floor}>
                      <td
                        onClick={() => toggleRow(floor)}
                        className={`sticky left-0 z-10 cursor-pointer bg-[#0e1a12] px-3 py-0.5 text-[10px] font-normal transition-colors ${
                          allRowSel
                            ? 'text-[#c9a84c]'
                            : 'text-[rgba(242,207,141,0.55)] hover:text-[#c9a84c]'
                        }`}
                      >
                        {floor}
                      </td>
                      {colIndices.map((i) => {
                        const unit = units[i]
                        if (!unit) return <td key={i} className="px-1 py-0.5" />
                        const sel = selectedUnitIds.has(unit._id)
                        const hasLayout = !!unit.layoutImageUrl
                        let cls: string
                        if (sel && hasLayout) {
                          cls = 'bg-[#c9a84c] font-normal text-[#0a1f12] ring-2 ring-emerald-400/80 shadow-[0_0_10px_2px_rgba(52,211,153,0.55)]'
                        } else if (sel) {
                          cls = 'bg-[#c9a84c] font-normal text-[#0a1f12]'
                        } else if (hasLayout) {
                          cls = 'border border-emerald-400/60 bg-emerald-500/15 text-emerald-200 shadow-[0_0_8px_0_rgba(52,211,153,0.45)] animate-pulse hover:bg-emerald-500/25'
                        } else {
                          cls = 'border border-[rgba(242,207,141,0.15)] text-[rgba(242,207,141,0.5)] hover:border-[rgba(242,207,141,0.4)] hover:text-[rgba(242,207,141,0.9)]'
                        }
                        return (
                          <td key={i} className="px-1 py-0.5">
                            <button
                              type="button"
                              onClick={() => toggleUnit(unit._id)}
                              onMouseEnter={(e) => openHoverFor(unit._id, e.currentTarget)}
                              onMouseLeave={scheduleHoverClose}
                              title={hasLayout ? `${unit.number} · планировка уже загружена` : unit.number}
                              className={`rounded px-1.5 py-0.5 text-[10px] whitespace-nowrap transition-colors ${cls}`}
                            >
                              {unit.number}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {hoverPreview && hoverUnit && (() => {
        const POPOVER_W = 220
        const POPOVER_H = 220
        const margin = 8
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
        const vh = typeof window !== 'undefined' ? window.innerHeight : 800
        const rightSpace = vw - hoverPreview.rect.right
        const showRight = rightSpace >= POPOVER_W + margin
        const left = showRight
          ? hoverPreview.rect.right + margin
          : Math.max(margin, hoverPreview.rect.left - margin - POPOVER_W)
        let top = hoverPreview.rect.top - 4
        if (top + POPOVER_H + margin > vh) top = Math.max(margin, vh - POPOVER_H - margin)
        if (top < margin) top = margin
        const has = !!hoverUnit.layoutImageUrl
        return (
          <div
            onMouseEnter={keepHoverOpen}
            onMouseLeave={scheduleHoverClose}
            className="fixed z-[100] rounded-xl border border-[rgba(242,207,141,0.3)] bg-[rgba(10,20,14,0.97)] p-2.5 shadow-[0_18px_45px_-15px_rgba(0,0,0,0.75)] backdrop-blur-md"
            style={{ top, left, width: POPOVER_W }}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-normal text-[#fcecc8]">{hoverUnit.number}</span>
              <span className="text-[9px] uppercase tracking-wider text-[rgba(242,207,141,0.4)]">
                {has ? 'Планировка' : 'Нет планировки'}
              </span>
            </div>
            {has ? (
              <>
                <div className="overflow-hidden rounded-lg border border-[rgba(242,207,141,0.15)] bg-[rgba(0,0,0,0.4)]">
                  <img
                    src={hoverUnit.layoutImageUrl}
                    alt={`Планировка ${hoverUnit.number}`}
                    className="h-32 w-full object-contain"
                    draggable={false}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => triggerSingleUpload(hoverUnit._id)}
                  className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[rgba(242,207,141,0.25)] bg-transparent px-2 py-1.5 text-[10px] font-medium text-[rgba(242,207,141,0.8)] transition-colors hover:bg-[rgba(242,207,141,0.08)] hover:text-[#fcecc8]"
                >
                  <Upload size={11} />
                  {t('inventory.massEditSidebar.заменить')}</button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => triggerSingleUpload(hoverUnit._id)}
                className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[rgba(242,207,141,0.25)] bg-[rgba(0,0,0,0.25)] p-3 text-center transition-colors hover:border-[#c9a84c]/60 hover:bg-[rgba(201,168,76,0.08)]"
              >
                <Upload size={16} className="text-[rgba(242,207,141,0.5)]" />
                <span className="text-[11px] font-medium text-[#fcecc8]">{t('inventory.massEditSidebar.загрузить_планировку')}</span>
                <span className="text-[9px] text-[rgba(242,207,141,0.4)]">{t('inventory.massEditSidebar.только_для')}{hoverUnit.number}</span>
              </button>
            )}
          </div>
        )
      })()}

      <input
        ref={singleUploadInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          const uid = singleUploadUnitIdRef.current
          if (f && uid) uploadSingleUnit(uid, f)
          e.target.value = ''
          singleUploadUnitIdRef.current = null
        }}
      />
    </div>
  )
}
