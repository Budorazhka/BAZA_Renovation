import { Pencil, Trash2, RotateCcw, Network } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Property } from './types'
import type { ViewMode } from './Toolbar'
import { SaleStatusBadge, ConditionBadge, MlsBadge } from './StatusBadge'
import { PropertyCard } from './PropertyCard'
import { getConditionState, formatPrice, formatDate } from './utils'
import { useI18n } from "@/i18n";

function canOfferMls(property: Property, canPublishMls: boolean) {
  return canPublishMls && property.category === 'secondary' && property.status === 'for_sale'
}

// ─── Таблица: строка заголовков ───────────────────────────────────────────────

function TableHeader({ isArchive, showCheckbox, allSelected, onToggleAll }: {
  isArchive: boolean
  showCheckbox: boolean
  allSelected: boolean
  onToggleAll: () => void
}) {
    const { t } = useI18n();
  return (
    <div className={cn(
      'grid items-center gap-4 border-b border-[var(--green-border)] bg-[var(--rail-bg)]/80 px-4 py-2.5 text-xs font-normal uppercase tracking-wide text-[color:var(--app-text-subtle)]',
      showCheckbox
        ? 'grid-cols-[2rem_3.5rem_1fr_1fr_1fr_1fr_1fr_1fr_auto]'
        : 'grid-cols-[3.5rem_1fr_1fr_1fr_1fr_1fr_1fr_auto]',
    )}>
      {showCheckbox && (
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onToggleAll}
            className="accent-[var(--gold)] size-4 cursor-pointer"
          />
        </div>
      )}
      <div>{t('management.my-properties.propertyTable.фото')}</div>
      <div>{t('management.my-properties.propertyTable.название_тип')}</div>
      <div>{t('management.my-properties.propertyTable.расположение')}</div>
      <div>{t('management.my-properties.propertyTable.параметры')}</div>
      <div>{t('management.my-properties.propertyTable.цена')}</div>
      <div>{t('management.my-properties.propertyTable.размещено_статус')}</div>
      <div>{isArchive ? 'Обновлено' : 'Дата/Состояние'}</div>
      <div>{t('management.my-properties.propertyTable.действия')}</div>
    </div>
  )
}

// ─── Таблица: одна строка объекта ─────────────────────────────────────────────

interface PropertyRowProps {
  property: Property
  isArchive: boolean
  showCheckbox: boolean
  isSelected: boolean
  readOnly: boolean
  canPublishMls: boolean
  onToggleSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onRestore: () => void
  onMls: () => void
}

function PropertyRow({
  property, isArchive, showCheckbox, isSelected, readOnly, canPublishMls,
  onToggleSelect, onEdit, onDelete, onRestore, onMls,
}: PropertyRowProps) {
    const { t } = useI18n();
  const condition = getConditionState(property.updatedAt, property.category)
  const hasFloorData = property.floor > 0 || property.totalFloors > 0
  const priceOnRequest = property.details?.priceOnRequest
  const priceLabel = priceOnRequest ? 'Цена по запросу' : `$${formatPrice(property.price)}`
  const pricePerM2Label = priceOnRequest ? 'Прайс скрыт в витрине' : `$${formatPrice(property.pricePerM2)} за м²`

  return (
    <div
      className={cn(
        'group grid items-center gap-4 border-b border-[var(--green-border)] px-4 py-3 transition-colors last:border-0 hover:bg-[var(--hub-action-hover)]',
        showCheckbox
          ? 'grid-cols-[2rem_3.5rem_1fr_1fr_1fr_1fr_1fr_1fr_auto]'
          : 'grid-cols-[3.5rem_1fr_1fr_1fr_1fr_1fr_1fr_auto]',
        isSelected && 'bg-[var(--nav-item-bg-active)]',
      )}
    >
      {/* Checkbox — всегда в колонке, видно при ховере или если выбран */}
      {showCheckbox && (
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className={cn(
              'accent-[var(--gold)] size-4 cursor-pointer transition-opacity',
              isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            )}
          />
        </div>
      )}

      {/* Фото */}
      <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-[var(--rail-bg)]">
        {property.photo
          ? <img src={property.photo} alt={property.title} className="size-full object-cover" />
          : <div className="size-full bg-gradient-to-br from-[var(--gold)]/10 to-[var(--app-bg)]" />
        }
      </div>

      {/* Название / тип */}
      <div className="min-w-0">
        <p className="font-normal text-sm leading-snug line-clamp-2 text-[color:var(--workspace-text)]">{property.title}</p>
        <span className="mt-0.5 text-xs font-medium text-[color:var(--theme-accent-heading)]">{property.type}</span>
        {!readOnly && (
          <p className="mt-0.5 text-[10px] text-[color:var(--theme-accent-icon-dim)]">{property.agentName}</p>
        )}
      </div>

      {/* Адрес */}
      <div className="min-w-0 space-y-0.5 text-xs text-[color:var(--hub-stat-label)]">
        <p>{property.country}</p>
        <p>{property.city}</p>
        <p className="truncate">{property.street}</p>
      </div>

      {/* Параметры */}
      <div className="space-y-0.5 text-xs text-[color:var(--hub-stat-label)]">
        {hasFloorData && (
          <p>
            {property.floor > 0
              ? <>{t('management.my-properties.propertyTable.этаж')}<span className="text-[color:var(--workspace-text)] font-medium">{property.floor} {t('management.my-properties.propertyTable.из')}{property.totalFloors}</span></>
              : <>{t('management.my-properties.propertyTable.этажей')}<span className="text-[color:var(--workspace-text)] font-medium">{property.totalFloors}</span></>}
          </p>
        )}
        {property.rooms > 0 && (
          <p>{t('management.my-properties.propertyTable.комнат')}<span className="text-[color:var(--workspace-text)] font-medium">{property.rooms}+1</span></p>
        )}
        <p>{t('management.my-properties.propertyTable.площадь')}<span className="text-[color:var(--workspace-text)] font-medium">{property.area} {t('management.my-properties.propertyTable.м')}</span></p>
      </div>

      {/* Цена */}
      <div className="min-w-0">
        <p className="text-base font-normal text-[color:var(--workspace-text)]">{priceLabel}</p>
        <p className="text-xs text-[color:var(--hub-stat-label)]">{pricePerM2Label}</p>
      </div>

      {/* Дата размещения + статус продажи */}
      <div className="space-y-1.5">
        <p className="text-xs text-[color:var(--hub-stat-label)]">
          {t('management.my-properties.propertyTable.размещено')}<span className="text-[color:var(--theme-accent-link-dim)]">{formatDate(property.listedAt)}</span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <SaleStatusBadge status={property.status} />
          {property.details?.isMls && <MlsBadge />}
        </div>
      </div>

      {/* Дата обновления + состояние карточки */}
      <div className="space-y-1.5">
        <p className="text-xs text-[color:var(--hub-stat-label)]">
          {t('management.my-properties.propertyTable.обновлено')}<span className="text-[color:var(--theme-accent-link-dim)]">{formatDate(property.updatedAt)}</span>
        </p>
        {!isArchive && <ConditionBadge state={condition} />}
      </div>

      {/* Действия */}
      {isArchive ? (
        <div className="flex flex-col gap-2">
          <button
            onClick={onRestore}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-emerald-600/40 bg-emerald-950/40 px-3 py-1.5 text-xs font-normal text-emerald-300 hover:bg-emerald-900/30 transition-colors"
          >
            <RotateCcw className="size-3.5" />
            {t('management.my-properties.propertyTable.восстановить')}</button>
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/25 px-3 py-1.5 text-xs font-normal text-red-400/70 hover:bg-red-500/10 hover:text-red-300 transition-colors whitespace-nowrap"
          >
            <Trash2 className="size-3.5" />
            {t('management.my-properties.propertyTable.удалить')}</button>
        </div>
      ) : readOnly ? (
        <div className="text-xs text-[color:var(--theme-accent-icon-dim)] italic">{t('management.my-properties.propertyTable.только_просмотр')}</div>
      ) : (
        <div className="flex items-center gap-1">
          <ActionButton onClick={onEdit} icon={<Pencil className="size-3.5" />} label={t('management.my-properties.propertyTable.изменить')} />
          {canOfferMls(property, canPublishMls) && (
            <ActionButton
              onClick={onMls}
              icon={<Network className="size-3.5" />}
              label={property.details?.isMls ? 'В MLS' : 'Добавить в MLS'}
              active={Boolean(property.details?.isMls)}
            />
          )}
          <IconButton onClick={onDelete} icon={<Trash2 className="size-3.5" />} aria-label={t('management.my-properties.propertyTable.удалить')} danger />
        </div>
      )}
    </div>
  )
}

// ─── Компактная строка ───────────────────────────────────────────────────────

function CompactRow({
  property, isArchive, showCheckbox, isSelected, readOnly, canPublishMls,
  onToggleSelect, onEdit, onDelete, onRestore, onMls,
}: Omit<PropertyRowProps, 'isBulkMode'>) {
    const { t } = useI18n();
  const condition = getConditionState(property.updatedAt, property.category)
  const priceLabel = property.details?.priceOnRequest ? 'По запросу' : `$${formatPrice(property.price)}`

  return (
    <div
      className={cn(
        'group grid items-center gap-3 border-b border-[var(--green-border)] px-4 py-1.5 text-sm transition-colors last:border-0 hover:bg-[var(--hub-action-hover)]',
        showCheckbox
          ? 'grid-cols-[2rem_1fr_1fr_auto_auto_auto_auto]'
          : 'grid-cols-[1fr_1fr_auto_auto_auto_auto]',
        isSelected && 'bg-[var(--nav-item-bg-active)]',
      )}
    >
      {showCheckbox && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className={cn(
            'accent-[var(--gold)] size-4 cursor-pointer transition-opacity',
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        />
      )}
      <div className="min-w-0">
        <p className="font-medium truncate text-[color:var(--workspace-text)]">{property.title}</p>
        <p className="text-xs text-[color:var(--theme-accent-heading)]">{property.type}</p>
      </div>
      <div className="text-xs text-[color:var(--hub-stat-label)] truncate">{property.city}, {property.street}</div>
      <p className="font-normal whitespace-nowrap text-[color:var(--workspace-text)]">{priceLabel}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <SaleStatusBadge status={property.status} />
        {property.details?.isMls && <MlsBadge />}
      </div>
      {!isArchive && <ConditionBadge state={condition} />}
      {isArchive ? (
        <div className="flex gap-1">
          <button onClick={onRestore} className="rounded p-1 text-[color:var(--theme-accent-heading)] transition-colors hover:bg-[var(--nav-item-bg-active)]" title={t('management.my-properties.propertyTable.восстановить')}>
            <RotateCcw className="size-3.5" />
          </button>
          <button onClick={onDelete} className="rounded p-1 text-red-400/70 hover:bg-red-500/10 hover:text-red-300 transition-colors" title={t('management.my-properties.propertyTable.удалить')}>
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ) : readOnly ? null : (
        <div className="flex gap-1">
          <button onClick={onEdit} className="rounded p-1 text-[color:var(--theme-accent-heading)] transition-colors hover:bg-[var(--nav-item-bg-active)]" title={t('management.my-properties.propertyTable.изменить')}>
            <Pencil className="size-3.5" />
          </button>
          {canOfferMls(property, canPublishMls) && (
            <button
              onClick={onMls}
              className={cn(
                'rounded p-1 transition-colors',
                property.details?.isMls
                  ? 'text-[color:var(--gold)] bg-[color-mix(in_srgb,var(--gold)_14%,transparent)]'
                  : 'text-[color:var(--theme-accent-heading)] hover:bg-[var(--nav-item-bg-active)]',
              )}
              title={property.details?.isMls ? 'В MLS' : 'Добавить в MLS'}
            >
              <Network className="size-3.5" />
            </button>
          )}
          <button onClick={onDelete} className="rounded p-1 text-red-400/70 hover:bg-red-500/10 hover:text-red-300 transition-colors" title={t('management.my-properties.propertyTable.удалить')}>
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Мелкие вспомогательные кнопки ───────────────────────────────────────────

function ActionButton({ onClick, icon, label, active }: { onClick: () => void; icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 rounded px-2 py-1 text-base font-normal transition-colors',
        active
          ? 'text-[color:var(--gold)] bg-[color-mix(in_srgb,var(--gold)_14%,transparent)]'
          : 'text-[color:var(--theme-accent-heading)] hover:bg-[var(--nav-item-bg-active)]',
      )}
    >
      {icon}{label}
    </button>
  )
}

function IconButton({ onClick, icon, danger, 'aria-label': ariaLabel }: {
  onClick: () => void; icon: React.ReactNode; danger?: boolean; 'aria-label': string
}) {
  return (
    <button onClick={onClick} aria-label={ariaLabel}
      className={cn('rounded p-1.5 transition-colors',
        danger ? 'text-red-400/70 hover:bg-red-500/10 hover:text-red-300' : 'text-[color:var(--app-text-subtle)] hover:bg-[var(--nav-item-bg-active)] hover:text-[color:var(--workspace-text)]',
      )}>
      {icon}
    </button>
  )
}

// ─── Основной экспорт компонента ─────────────────────────────────────────────

interface PropertyTableProps {
  properties: Property[]
  isArchive: boolean
  isBulkMode: boolean
  selectedIds: Set<string>
  viewMode: ViewMode
  readOnly: boolean
  canPublishMls: boolean
  onToggleSelect: (id: string) => void
  onToggleAll: () => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onRestore: (id: string) => void
  onMls: (id: string) => void
}

export function PropertyTable({
  properties, isArchive, isBulkMode: _isBulkMode, selectedIds, viewMode, readOnly, canPublishMls,
  onToggleSelect, onToggleAll, onEdit, onDelete, onRestore, onMls,
}: PropertyTableProps) {
    const { t } = useI18n();
  if (properties.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-[color:var(--app-text-subtle)]">
        <p className="text-2xl mb-2">🏠</p>
        <p className="font-medium">{t('management.my-properties.propertyTable.объекты_не_найдены')}</p>
        <p className="text-sm mt-1">{t('management.my-properties.propertyTable.попробуйте_изменить')}</p>
      </div>
    )
  }

  // Чекбоксы показываем всегда для редактируемых строк (не архив, не readOnly)
  const showCheckbox = !readOnly && !isArchive
  const allSelected = properties.length > 0 && properties.every((p) => selectedIds.has(p.id))

  // ── вид сеткой ──
  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {properties.map((p) => (
          <PropertyCard
            key={p.id}
            property={p}
            readOnly={readOnly || isArchive}
            canPublishMls={canPublishMls}
            onEdit={() => onEdit(p.id)}
            onDelete={() => onDelete(p.id)}
            onMls={() => onMls(p.id)}
          />
        ))}
      </div>
    )
  }

  // ── компактный вид ──
  if (viewMode === 'compact') {
    return (
      <div className="overflow-hidden rounded-xl border border-[color:var(--hub-card-border)] bg-[var(--green-deep)] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.08)]">
        {properties.map((p) => (
          <CompactRow
            key={p.id}
            property={p}
            isArchive={isArchive}
            showCheckbox={showCheckbox}
            isSelected={selectedIds.has(p.id)}
            readOnly={readOnly}
            canPublishMls={canPublishMls}
            onToggleSelect={() => onToggleSelect(p.id)}
            onEdit={() => onEdit(p.id)}
            onDelete={() => onDelete(p.id)}
            onRestore={() => onRestore(p.id)}
            onMls={() => onMls(p.id)}
          />
        ))}
      </div>
    )
  }

  // ── табличный вид (по умолчанию) ──
  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--hub-card-border)] bg-[var(--green-deep)] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.08)]">
      <TableHeader
        isArchive={isArchive}
        showCheckbox={showCheckbox}
        allSelected={allSelected}
        onToggleAll={onToggleAll}
      />
      {properties.map((p) => (
        <PropertyRow
          key={p.id}
          property={p}
          isArchive={isArchive}
          showCheckbox={showCheckbox}
          isSelected={selectedIds.has(p.id)}
          readOnly={readOnly}
          canPublishMls={canPublishMls}
          onToggleSelect={() => onToggleSelect(p.id)}
          onEdit={() => onEdit(p.id)}
          onDelete={() => onDelete(p.id)}
          onRestore={() => onRestore(p.id)}
          onMls={() => onMls(p.id)}
        />
      ))}
    </div>
  )
}
