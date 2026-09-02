import { useEffect, useMemo, useState } from 'react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  buildSchedulePayments,
  type InstallmentRowModel,
  type SchedulePayment,
} from '@/components/development/sales/salesInstallmentsShared'
import { formatUsd } from '@/lib/chessboard'
import { cn } from '@/lib/utils'
import { useI18n } from "@/i18n";

const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const MAX_COLUMNS_INLINE = 4
const MAX_COLUMNS_INLINE_MOBILE = 1

function useMaxInlineScheduleColumns(defaultMax: number, mobileMax: number): number {
  const [maxColumns, setMaxColumns] = useState(defaultMax)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const update = () => setMaxColumns(mq.matches ? mobileMax : defaultMax)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [defaultMax, mobileMax])

  return maxColumns
}

type ViewVariant = 'modal' | 'landing'

interface YearColumn {
  title: string
  payments: SchedulePayment[]
}

function groupByYear(payments: SchedulePayment[]): YearColumn[] {
  const sorted = [...payments].sort((a, b) => a.date.getTime() - b.date.getTime())
  const map = new Map<number, SchedulePayment[]>()

  for (const p of sorted) {
    const year = p.date.getFullYear()
    if (!map.has(year)) map.set(year, [])
    map.get(year)!.push(p)
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, ps]) => ({ title: String(year), payments: ps }))
}

function YearTable({
  col,
  showPvRow,
  formatAmount,
  variant,
}: {
  col: YearColumn
  showPvRow: boolean
  formatAmount: (n: number) => string
  variant: ViewVariant
}) {
    const { t } = useI18n();
  const isLanding = variant === 'landing'
  const downPayment = col.payments.find((p) => p.isDown)
  const byMonth = new Map<number, SchedulePayment>()
  for (const p of col.payments) {
    if (!p.isDown) byMonth.set(p.date.getMonth(), p)
  }

  return (
    <div
      className={cn(
        'overflow-hidden',
        isLanding
          ? 'installment-year-table min-w-0 w-full rounded-lg border backdrop-blur-sm'
          : 'min-w-[190px] rounded-[6px] bg-[#072821] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]',
      )}
    >
      <div
        className={cn(
          'font-medium uppercase tracking-[0.08em] text-[#e6c364]',
          isLanding
            ? 'installment-year-head border-b px-2.5 py-1.5 text-center text-xs'
            : 'bg-[#163824] px-3 py-2 text-[16px] text-[#e6c364]',
        )}
      >
        {col.title}
      </div>
      <table className="w-full border-collapse">
        <tbody>
          {showPvRow && (
            <tr className={isLanding ? 'installment-pv-row' : 'bg-[rgba(230,195,100,0.14)]'}>
              <td
                className={cn(
                  'whitespace-nowrap',
                  isLanding ? 'installment-month px-2 py-1 text-xs' : 'px-3 py-2 text-[16px] text-[#d0e8df]',
                )}
              >
                {t('inventory.unitInstallmentScheduleView.пв')}</td>
              <td
                className={cn(
                  'whitespace-nowrap text-right tabular-nums',
                  isLanding ? 'installment-amount px-2 py-1 text-xs' : 'px-3 py-2 text-[16px]',
                  !isLanding && (downPayment ? 'text-[#ffffff]' : 'text-[rgba(255,255,255,0.25)]'),
                )}
              >
                {downPayment ? formatAmount(downPayment.amount) : '—'}
              </td>
            </tr>
          )}
          {MONTH_SHORT.map((name, idx) => {
            const p = byMonth.get(idx)
            return (
              <tr key={idx} className={isLanding ? (idx % 2 === 0 ? 'installment-row-alt' : '') : idx % 2 === 0 ? 'bg-[#112d1c]/80' : 'bg-transparent'}>
                <td
                  className={cn(
                    'whitespace-nowrap',
                    isLanding ? 'installment-month px-2 py-1 text-xs' : 'px-3 py-2 text-[16px] text-[#d0e8df]',
                  )}
                >
                  {name}
                </td>
                <td
                  className={cn(
                    'whitespace-nowrap text-right tabular-nums',
                    isLanding ? 'installment-amount px-2 py-1 text-xs' : 'px-3 py-2 text-[16px]',
                    !isLanding && (p ? 'text-[#fcecc8]' : 'text-[rgba(255,255,255,0.22)]'),
                  )}
                >
                  {p ? formatAmount(p.amount) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TotalRow({
  payments,
  formatAmount,
  variant,
}: {
  payments: SchedulePayment[]
  formatAmount: (n: number) => string
  variant: ViewVariant
}) {
    const { t } = useI18n();
  const isLanding = variant === 'landing'
  const total = payments.reduce((sum, p) => sum + p.amount, 0)

  return (
    <div
      className={cn(
        'overflow-hidden',
        isLanding
          ? 'installment-total-row mt-3 rounded-lg border'
          : 'mt-3 rounded-[6px] bg-[rgba(230,195,100,0.10)] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.22)]',
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between font-medium uppercase tracking-[0.06em]',
          isLanding ? 'installment-total-inner px-3 py-2 text-sm' : 'px-3 py-2.5 text-[16px] text-[#e6c364]',
        )}
      >
        <span>{t('inventory.unitInstallmentScheduleView.итого')}</span>
        <span className="tabular-nums">{formatAmount(total)}</span>
      </div>
    </div>
  )
}

function ParamRow({
  label,
  value,
  variant,
}: {
  label: string
  value: string
  variant: ViewVariant
}) {
  const isLanding = variant === 'landing'

  if (isLanding) {
    return (
      <div className="installment-param-card rounded-lg border px-3 py-2.5">
        <div className="installment-label text-[10px] uppercase tracking-[0.1em]">{label}</div>
        <div className="installment-amount mt-0.5 text-sm tabular-nums">{value}</div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[104px_minmax(0,1fr)] items-baseline gap-3 rounded-[4px] bg-[#072821] px-3 py-2">
      <span className="text-[16px] font-medium uppercase tracking-[0.08em] text-[#e6c364]">{label}</span>
      <span className="min-w-0 text-[16px] text-[#ffffff]">{value}</span>
    </div>
  )
}

function InstallmentParams({
  row,
  listPrice,
  pricePerSqm,
  pricePerSqmLabel,
  paymentStep,
  onSetStep,
  formatAmount,
  variant,
}: {
  row: InstallmentRowModel
  listPrice: number
  pricePerSqm?: number | null
  pricePerSqmLabel?: string | null
  paymentStep: 'monthly' | 'quarterly'
  onSetStep: (step: 'monthly' | 'quarterly') => void
  formatAmount: (n: number) => string
  variant: ViewVariant
}) {
    const { t } = useI18n();
  const isLanding = variant === 'landing'
  const disc = row.discountPercent != null ? row.discountPercent : 0
  const afterDisc = listPrice * (1 - disc / 100)
  const downAmt = (afterDisc * row.downPaymentPercent) / 100

  const stepToggle = (
    <div className={cn('installment-step-toggle flex rounded-md border p-0.5', !isLanding && 'border-[rgba(201,168,76,0.18)] bg-[rgba(7,18,10,0.6)]')}>
      {(['monthly', 'quarterly'] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onSetStep(s)}
          className={cn(
            'installment-step-btn flex-1 rounded-[5px] font-normal transition-colors',
            isLanding ? 'px-2 py-1 text-xs' : 'px-2 py-1 text-[14px]',
            paymentStep === s
              ? isLanding
                ? 'is-active'
                : 'bg-[rgba(230,195,100,0.18)] text-[#fcecc8] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.35)]'
              : isLanding
                ? ''
                : 'text-[rgba(255,255,255,0.45)] hover:text-[rgba(255,255,255,0.72)]',
          )}
        >
          {s === 'monthly' ? 'Мес.' : 'Кварт.'}
        </button>
      ))}
    </div>
  )

  const hasDiscount = disc > 0

  if (isLanding) {
    return (
      <div className="space-y-3">
        <div className="installment-param-card rounded-lg border px-3 py-2.5">
          <div className="installment-label text-[10px] uppercase tracking-[0.1em]">{t('inventory.unitInstallmentScheduleView.стоимость')}</div>
          <div className="installment-price-row mt-0.5 flex min-h-[1.75rem] items-baseline gap-3">
            {hasDiscount && (
              <span className="installment-price-old shrink-0 text-sm tabular-nums line-through sm:text-base">
                {formatAmount(listPrice)}
              </span>
            )}
            <span className="installment-amount text-lg tabular-nums sm:text-xl">
              {formatAmount(hasDiscount ? afterDisc : listPrice)}
            </span>
          </div>
          {pricePerSqmLabel && (
            <div className="installment-label mt-1 text-xs tabular-nums">{pricePerSqmLabel}</div>
          )}
          {pricePerSqm != null && !pricePerSqmLabel && (
            <div className="installment-label mt-1 text-xs tabular-nums">${pricePerSqm} {t('inventory.unitInstallmentScheduleView.м')}</div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1 sm:grid-cols-3">
          <ParamRow label={t('inventory.unitInstallmentScheduleView.взнос')} value={`${row.downPaymentPercent}%`} variant={variant} />
          <ParamRow label={t('inventory.unitInstallmentScheduleView.взнос')} value={formatAmount(downAmt)} variant={variant} />
          <ParamRow label={t('inventory.unitInstallmentScheduleView.срок')} value={`${row.termMonths} мес.`} variant={variant} />
          <ParamRow label={t('inventory.unitInstallmentScheduleView.скидка')} value={`${disc}%`} variant={variant} />
          <div className="installment-param-card col-span-2 rounded-lg border px-3 py-2.5 max-sm:col-span-1 sm:col-span-1">
            <div className="installment-label text-[10px] uppercase tracking-[0.1em]">{t('inventory.unitInstallmentScheduleView.шаг')}</div>
            <div className="mt-1.5">{stepToggle}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-[4px] bg-[#072821] px-3 py-2">
        <div className="text-[12px] uppercase tracking-[0.08em] text-[rgba(242,207,141,0.5)]">{t('inventory.unitInstallmentScheduleView.стоимость')}</div>
        <div className="text-[20px] tabular-nums text-[#fcecc8]">{formatAmount(listPrice)}</div>
        {pricePerSqmLabel && (
          <div className="text-[13px] tabular-nums text-[rgba(242,207,141,0.55)]">{pricePerSqmLabel}</div>
        )}
        {pricePerSqm != null && !pricePerSqmLabel && (
          <div className="text-[13px] tabular-nums text-[rgba(242,207,141,0.55)]">${pricePerSqm} {t('inventory.unitInstallmentScheduleView.м')}</div>
        )}
      </div>
      <ParamRow label={t('inventory.unitInstallmentScheduleView.взнос')} value={`${row.downPaymentPercent}%`} variant={variant} />
      <ParamRow label={t('inventory.unitInstallmentScheduleView.взнос')} value={formatAmount(downAmt)} variant={variant} />
      <ParamRow label={t('inventory.unitInstallmentScheduleView.срок')} value={`${row.termMonths} мес.`} variant={variant} />
      <ParamRow label={t('inventory.unitInstallmentScheduleView.скидка')} value={`${disc}%`} variant={variant} />
      <div className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-3 rounded-[4px] bg-[#072821] px-3 py-2">
        <span className="text-[16px] font-medium uppercase tracking-[0.08em] text-[#e6c364]">{t('inventory.unitInstallmentScheduleView.шаг')}</span>
        {stepToggle}
      </div>
    </div>
  )
}

function ScheduleBlock({
  payments,
  formatAmount,
  variant,
  onShowAll,
  showAllButton,
}: {
  payments: SchedulePayment[]
  formatAmount: (n: number) => string
  variant: ViewVariant
  onShowAll?: () => void
  showAllButton?: boolean
}) {
    const { t } = useI18n();
  const isLanding = variant === 'landing'
  const maxInlineColumns = useMaxInlineScheduleColumns(MAX_COLUMNS_INLINE, MAX_COLUMNS_INLINE_MOBILE)
  const yearColumns = useMemo(() => groupByYear(payments), [payments])
  const visibleColumns = yearColumns.slice(0, isLanding ? maxInlineColumns : MAX_COLUMNS_INLINE)
  const showPvRow = visibleColumns.some((c) => c.payments.some((p) => p.isDown))

  const tables = visibleColumns.map((col, index) => (
    <YearTable
      key={`${col.title}-${index}`}
      col={col}
      showPvRow={showPvRow}
      formatAmount={formatAmount}
      variant={variant}
    />
  ))

  if (isLanding) {
    return (
      <div className="w-full">
        <div className="installment-schedule-label visit-section-label mb-3 text-[10px] uppercase tracking-[0.12em]">
          {t('inventory.unitInstallmentScheduleView.график_платежей')}</div>
        <div
          className="installment-schedule-grid grid w-full gap-2"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, visibleColumns.length)}, minmax(0, 1fr))` }}
        >
          {tables}
        </div>
        {showAllButton && onShowAll && (
          <button
            type="button"
            onClick={onShowAll}
            className="installment-show-all-btn mt-3 w-full rounded-lg border px-3 py-2.5 text-sm transition"
          >
            {t('inventory.unitInstallmentScheduleView.показать_весь_график')}</button>
        )}
      </div>
    )
  }

  return (
    <div className="min-w-[720px]">
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, visibleColumns.length)}, minmax(190px, 1fr))` }}
      >
        {tables}
      </div>
      <TotalRow payments={payments} formatAmount={formatAmount} variant={variant} />
      {showAllButton && onShowAll && (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-3 rounded-[4px] bg-[#112d1c] px-3 py-2 text-[16px] text-[#e6c364] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)] transition-colors hover:bg-[#163824]"
        >
          {t('inventory.unitInstallmentScheduleView.показать_весь_график')}</button>
      )}
    </div>
  )
}

export interface UnitInstallmentScheduleViewProps {
  rows: InstallmentRowModel[]
  listPrice: number
  pricePerSqm?: number | null
  /** Готовая подпись цены за м² (для визитки с валютой из URL). */
  pricePerSqmLabel?: string | null
  formatAmount?: (n: number) => string
  /** `landing` — компактная вёрстка для публичной визитки. */
  variant?: ViewVariant
}

export function UnitInstallmentScheduleView({
  rows,
  listPrice,
  pricePerSqm,
  pricePerSqmLabel,
  formatAmount = (n) => formatUsd(Math.round(n)),
  variant = 'modal',
}: UnitInstallmentScheduleViewProps) {
  const [previewBlock, setPreviewBlock] = useState<{ key: string; title: string } | null>(null)
  const [activeBlockKey, setActiveBlockKey] = useState<string | null>(null)
  const [paymentStep, setPaymentStep] = useState<'monthly' | 'quarterly'>('monthly')

  const isLanding = variant === 'landing'
  const allRows = rows
  const activeRow = useMemo(
    () => allRows.find((r) => r.id === activeBlockKey) ?? allRows[0] ?? null,
    [activeBlockKey, allRows],
  )
  const activeRowKey = activeRow?.id ?? null

  const payments = useMemo(() => {
    if (!activeRow) return []
    return buildSchedulePayments({ ...activeRow, paymentStep }, listPrice)
  }, [activeRow, listPrice, paymentStep])

  const yearColumns = useMemo(() => groupByYear(payments), [payments])
  const totalYears = yearColumns.length
  const maxInlineColumns = useMaxInlineScheduleColumns(MAX_COLUMNS_INLINE, MAX_COLUMNS_INLINE_MOBILE)

  const variantLabel = (row: InstallmentRowModel, index: number) =>
    row.label.trim() || (index === 0 ? 'Базовая' : `Вариант ${index + 1}`)

  const selectRow = (row: InstallmentRowModel) => {
    setActiveBlockKey(row.id)
    setPaymentStep(row.paymentStep)
  }

  if (allRows.length === 0) return null

  if (isLanding) {
    return (
      <div className="unit-installment-landing flex flex-col">
        <div className="installment-variant-tabs flex w-full shrink-0 overflow-x-auto border-b visit-border-b sm:grid sm:overflow-visible"
          style={{ gridTemplateColumns: allRows.length > 1 ? `repeat(${allRows.length}, minmax(0, 1fr))` : undefined }}
        >
          {allRows.map((row, index) => {
            const isActive = row.id === activeRowKey
            const isLast = index === allRows.length - 1
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => selectRow(row)}
                className={cn(
                  'installment-variant-tab flex min-h-[44px] min-w-[7.5rem] shrink-0 items-center justify-center px-3 py-2 text-center text-xs leading-snug transition sm:min-h-[48px] sm:min-w-0 sm:shrink sm:px-3 sm:py-2.5 sm:text-sm',
                  !isLast && 'border-r visit-border-b',
                  isActive ? 'is-active' : 'hover:opacity-90',
                )}
              >
                {variantLabel(row, index)}
              </button>
            )
          })}
        </div>

        {activeRow && (
          <div className="px-3 py-3 sm:px-4 sm:py-4">
            <InstallmentParams
              row={activeRow}
              listPrice={listPrice}
              pricePerSqm={pricePerSqm}
              pricePerSqmLabel={pricePerSqmLabel}
              paymentStep={paymentStep}
              onSetStep={setPaymentStep}
              formatAmount={formatAmount}
              variant={variant}
            />
            <div className="mt-5">
              <ScheduleBlock
                payments={payments}
                formatAmount={formatAmount}
                variant={variant}
                showAllButton={totalYears > maxInlineColumns}
                onShowAll={() =>
                  setPreviewBlock({ key: activeRow.id, title: activeRow.label || 'Базовая' })
                }
              />
            </div>
          </div>
        )}

        <PreviewDialog
          previewBlock={previewBlock}
          onClose={() => setPreviewBlock(null)}
          allRows={allRows}
          activeRow={activeRow}
          paymentStep={paymentStep}
          setPaymentStep={setPaymentStep}
          listPrice={listPrice}
          pricePerSqm={pricePerSqm}
          pricePerSqmLabel={pricePerSqmLabel}
          formatAmount={formatAmount}
          variant={variant}
        />
      </div>
    )
  }

  return (
    <div className="grid min-h-[360px] grid-cols-[300px_minmax(0,1fr)] bg-[#0c2018] max-lg:grid-cols-1">
      <div className="flex min-h-0 flex-col gap-4 bg-[#031d16] p-4 shadow-[inset_-1px_0_0_rgba(201,168,76,0.18)] max-lg:shadow-[inset_0_-1px_0_rgba(201,168,76,0.18)]">
        <div className="grid gap-2">
          {allRows.map((row, index) => {
            const isActive = row.id === activeRowKey
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => selectRow(row)}
                className={`rounded-[4px] px-3 py-3 text-left text-[18px] font-normal transition-colors ${
                  isActive
                    ? 'bg-[rgba(230,195,100,0.16)] text-[#ffffff] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.35)]'
                    : 'bg-[#072821] text-[rgba(255,255,255,0.72)] hover:bg-[#163824] hover:text-[#d0e8df]'
                }`}
              >
                {variantLabel(row, index)}
              </button>
            )
          })}
        </div>

        {activeRow && (
          <InstallmentParams
            row={activeRow}
            listPrice={listPrice}
            pricePerSqm={pricePerSqm}
            pricePerSqmLabel={pricePerSqmLabel}
            paymentStep={paymentStep}
            onSetStep={setPaymentStep}
            formatAmount={formatAmount}
            variant={variant}
          />
        )}
      </div>

      {activeRow && (
        <div className="min-w-0 overflow-auto p-4">
          <ScheduleBlock
            payments={payments}
            formatAmount={formatAmount}
            variant={variant}
            showAllButton={totalYears > maxInlineColumns}
            onShowAll={() =>
              setPreviewBlock({ key: activeRow.id, title: activeRow.label || 'Базовая' })
            }
          />
        </div>
      )}

      <PreviewDialog
        previewBlock={previewBlock}
        onClose={() => setPreviewBlock(null)}
        allRows={allRows}
        activeRow={activeRow}
        paymentStep={paymentStep}
        setPaymentStep={setPaymentStep}
        listPrice={listPrice}
        pricePerSqm={pricePerSqm}
        pricePerSqmLabel={pricePerSqmLabel}
        formatAmount={formatAmount}
        variant={variant}
      />
    </div>
  )
}

function PreviewDialog({
  previewBlock,
  onClose,
  allRows,
  activeRow,
  paymentStep,
  setPaymentStep,
  listPrice,
  pricePerSqm,
  pricePerSqmLabel,
  formatAmount,
  variant,
}: {
  previewBlock: { key: string; title: string } | null
  onClose: () => void
  allRows: InstallmentRowModel[]
  activeRow: InstallmentRowModel | null
  paymentStep: 'monthly' | 'quarterly'
  setPaymentStep: (step: 'monthly' | 'quarterly') => void
  listPrice: number
  pricePerSqm?: number | null
  pricePerSqmLabel?: string | null
  formatAmount: (n: number) => string
  variant: ViewVariant
}) {
  const isLanding = variant === 'landing'

  return (
    <Dialog open={previewBlock != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton
        className={cn(
          'flex max-h-[min(88vh,900px)] max-w-[calc(100vw-2rem)] flex-col gap-0 p-0 text-[#fcecc8]',
          isLanding
            ? 'rounded-2xl border border-[rgba(201,168,76,0.2)] bg-[#0f2318] sm:max-w-4xl'
            : 'rounded-[8px] border border-[rgba(242,207,141,0.22)] bg-[#072821] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)] sm:max-w-3xl',
        )}
      >
        {previewBlock && (() => {
          const pRow = allRows.find((r) => r.id === previewBlock.key) ?? activeRow
          const pPayments = pRow ? buildSchedulePayments({ ...pRow, paymentStep }, listPrice) : []
          const pCols = groupByYear(pPayments)
          const showPvRow = pCols.some((c) => c.payments.some((p) => p.isDown))

          return (
            <>
              <DialogHeader
                className={cn(
                  'shrink-0 px-5 py-4 text-left',
                  isLanding
                    ? 'border-b border-[rgba(201,168,76,0.12)]'
                    : 'shadow-[inset_0_-1px_0_rgba(201,168,76,0.18)]',
                )}
              >
                <DialogTitle className="text-lg font-normal text-[#fcecc8]">{previewBlock.title}</DialogTitle>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-auto px-5 pb-5 pt-4">
                {isLanding ? (
                  <div className="space-y-5">
                    {pRow && (
                      <InstallmentParams
                        row={pRow}
                        listPrice={listPrice}
                        pricePerSqm={pricePerSqm}
                        pricePerSqmLabel={pricePerSqmLabel}
                        paymentStep={paymentStep}
                        onSetStep={setPaymentStep}
                        formatAmount={formatAmount}
                        variant={variant}
                      />
                    )}
                    <div
                      className="installment-schedule-grid grid w-full gap-2"
                      style={{ gridTemplateColumns: `repeat(${Math.max(1, pCols.length)}, minmax(0, 1fr))` }}
                    >
                      {pCols.map((col, index) => (
                        <YearTable
                          key={`${col.title}-${index}`}
                          col={col}
                          showPvRow={showPvRow}
                          formatAmount={formatAmount}
                          variant={variant}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-6">
                    {pRow && (
                      <div className="w-[300px] shrink-0">
                        <InstallmentParams
                          row={pRow}
                          listPrice={listPrice}
                          pricePerSqm={pricePerSqm}
                          pricePerSqmLabel={pricePerSqmLabel}
                          paymentStep={paymentStep}
                          onSetStep={setPaymentStep}
                          formatAmount={formatAmount}
                          variant={variant}
                        />
                      </div>
                    )}
                    <div className="min-w-[720px] flex-1">
                      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
                        {pCols.map((col, index) => (
                          <YearTable
                            key={`${col.title}-${index}`}
                            col={col}
                            showPvRow={showPvRow}
                            formatAmount={formatAmount}
                            variant={variant}
                          />
                        ))}
                      </div>
                      <TotalRow payments={pPayments} formatAmount={formatAmount} variant={variant} />
                    </div>
                  </div>
                )}
              </div>
            </>
          )
        })()}
      </DialogContent>
    </Dialog>
  )
}
