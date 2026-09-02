import { ChevronRight, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  SELECTION_CURRENCIES,
  SELECTION_LANGUAGES,
  type SelectionCurrency,
  type SelectionLanguage,
} from '@/lib/selection-display'
import { UNIT_VISIT_THEMES, type UnitVisitTheme } from '@/lib/unit-visit-theme'
import { cn } from '@/lib/utils'
import { useI18n } from "@/i18n";

export interface ToggleGroup<K extends string> {
  title: string
  items: { key: K; label: string }[]
  /** Иконка карточки в режиме drilldown. */
  icon?: LucideIcon
}

export interface SelectionCustomizationValue<K extends string> {
  language: SelectionLanguage
  currency: SelectionCurrency
  theme?: UnitVisitTheme
  blocks: Record<K, boolean>
}

interface Props<K extends string> {
  value: SelectionCustomizationValue<K>
  groups: ToggleGroup<K>[]
  onChange: (next: SelectionCustomizationValue<K>) => void
  /** Заголовок панели; по умолчанию «Кастомизация». */
  title?: string
  description?: string
  variant?: 'dark' | 'light'
  /** Фиксирует шапку, список переключателей прокручивается отдельно. */
  scrollable?: boolean
  /** Явный лимит высоты прокручиваемого списка блоков. */
  scrollMaxHeight?: string
  /** Растянуть на высоту родителя; скролл только у списка блоков. */
  fillHeight?: boolean
  /** Колонки переключателей — компактнее для длинных списков. */
  columns?: 1 | 2 | 3 | 4
  /** Золотой стиль свитчей под тёмную панель визитки. */
  switchVariant?: 'default' | 'gold'
  /** Селектор темы визитки (только для шаринга лота). */
  showTheme?: boolean
  /** Показать блок язык/валюта/тема. */
  showSettings?: boolean
  /** Скрыть названия групп переключателей. */
  hideGroupTitles?: boolean
  /** Визуальный стиль групп */
  groupVariant?: 'default' | 'card'
  /** Свернуть группы в карточки-разделы; свитчи открываются в модалке поверх. */
  drilldown?: boolean
  /** Кастомный блок под заголовком и над свитчами. */
  headerSlot?: ReactNode
  /** Ключи переключателей, которые заблокированы (серые, некликабельные). */
  disabledKeys?: K[]
}

function CustomizationSelect<T extends string>({
  options,
  value,
  onChange,
  variant = 'dark',
  compact = false,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  variant?: 'dark' | 'light'
  compact?: boolean
}) {
  const isLight = variant === 'light'

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size={compact ? 'sm' : 'default'}
        className={cn(
          'w-full min-w-0 shadow-none focus-visible:ring-0',
          compact ? 'h-8 text-[12px]' : 'h-9 text-[13px]',
          isLight
            ? 'border-black/10 bg-white text-[#111]'
            : 'border-[rgba(201,168,76,0.28)] bg-[rgba(0,0,0,0.35)] text-[#fcecc8] hover:bg-[rgba(0,0,0,0.45)]',
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        className={cn(
          'z-[100]',
          isLight
            ? 'border-black/10 bg-white text-[#111]'
            : 'border-[rgba(201,168,76,0.22)] bg-[#0c2018] text-[#fcecc8]',
        )}
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className={cn(
              isLight
                ? 'focus:bg-black/5 focus:text-[#111]'
                : 'focus:bg-[rgba(201,168,76,0.14)] focus:text-[#fcecc8]',
            )}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function SettingField({
  label,
  children,
  variant,
  compact,
}: {
  label: string
  children: ReactNode
  variant: 'dark' | 'light'
  compact: boolean
}) {
  const isLight = variant === 'light'

  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 flex-col gap-1.5 rounded-lg border',
        compact ? 'px-2.5 py-2' : 'gap-2 px-3 py-2',
        isLight ? 'border-black/10 bg-white/40' : 'border-[rgba(255,255,255,0.1)] bg-[rgba(0,0,0,0.15)]',
      )}
    >
      <span
        className={cn(
          'shrink-0',
          isLight ? 'text-[15px] text-[#111]' : compact ? 'text-[12px] text-[#fcecc8]' : 'text-[13px] text-[#fcecc8]',
        )}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

function CustomizationSwitch({
  checked,
  onCheckedChange,
  variant = 'default',
  compact = false,
  disabled = false,
}: {
  checked: boolean
  onCheckedChange: (on: boolean) => void
  variant?: 'default' | 'gold'
  compact?: boolean
  disabled?: boolean
}) {
  if (variant === 'gold') {
    return (
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={cn(
          'border border-transparent shadow-none data-[state=checked]:border-[rgba(201,168,76,0.45)] data-[state=checked]:bg-[#c9a84c] data-[state=unchecked]:bg-[rgba(255,255,255,0.1)]',
          compact
            ? 'h-[22px] w-[40px] [&_[data-slot=switch-thumb]]:h-4 [&_[data-slot=switch-thumb]]:w-4 data-[state=checked]:[&_[data-slot=switch-thumb]]:translate-x-[18px] data-[state=unchecked]:[&_[data-slot=switch-thumb]]:translate-x-[2px]'
            : 'h-[22px] w-[40px] [&_[data-slot=switch-thumb]]:h-4 [&_[data-slot=switch-thumb]]:w-4 data-[state=checked]:[&_[data-slot=switch-thumb]]:translate-x-[18px] data-[state=unchecked]:[&_[data-slot=switch-thumb]]:translate-x-[2px]',
          '[&_[data-slot=switch-thumb]]:shadow-[0_1px_4px_rgba(0,0,0,0.28)]',
          disabled && 'cursor-not-allowed opacity-40',
        )}
      />
    )
  }
  return <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
}

export function SelectionCustomizationPanel<K extends string>({
  value,
  groups,
  onChange,
  title = 'Кастомизация',
  description = 'Что увидит клиент в подборке',
  variant = 'dark',
  scrollable = false,
  scrollMaxHeight,
  fillHeight = false,
  columns = 1,
  switchVariant = 'default',
  showTheme = false,
  showSettings = true,
  hideGroupTitles = false,
  groupVariant = 'default',
  drilldown = false,
  headerSlot,
  disabledKeys = [],
}: Props<K>) {
    const { t } = useI18n();
  const [activeGroupIndex, setActiveGroupIndex] = useState(0)
  const defaultScrollMaxHeight =
    'calc(min(920px, 100vh - 2rem) - 68px - 88px - 44px - 17rem)'
  const setBlock = (key: K, on: boolean) =>
    onChange({ ...value, blocks: { ...value.blocks, [key]: on } })

  const isLight = variant === 'light'
  const isCard = groupVariant === 'card'

  const isGoldSwitch = switchVariant === 'gold'
  const multiColumn = columns > 1
  const isCompact = multiColumn && isGoldSwitch
  const gridColsClass =
    columns === 4 ? 'grid-cols-4' : columns === 3 ? 'grid-cols-3' : columns === 2 ? 'grid-cols-2' : null

  const renderRow = (item: { key: K; label: string }, groupTitle: string) => {
    const on = value.blocks[item.key]
    const isDisabled = disabledKeys.includes(item.key)
    return (
      <label
        key={`${groupTitle}-${item.key}-${item.label}`}
        className={cn(
          'flex items-center justify-between gap-2',
          isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          isGoldSwitch
            ? cn(
                'rounded-lg border transition-colors',
                isCompact ? 'px-2.5 py-2' : 'px-2.5 py-2',
                on && !isDisabled
                  ? 'border-[rgba(201,168,76,0.32)] bg-[rgba(201,168,76,0.1)]'
                  : 'border-[rgba(255,255,255,0.07)] bg-[rgba(0,0,0,0.14)]',
                !isDisabled && !on && 'hover:border-[rgba(255,255,255,0.12)]',
              )
            : cn(
                'gap-3 border-b py-3 last:border-b-0',
                isLight ? 'border-black/6' : 'border-[rgba(255,255,255,0.06)]',
              ),
        )}
      >
        <span
          className={cn(
            'min-w-0 leading-snug',
            isLight ? 'text-[15px] text-[#111]' : 'text-[#fcecc8]',
            isGoldSwitch ? (isCompact ? 'text-[12px]' : 'text-[13px]') : 'text-[16px]',
          )}
        >
          {item.label}
        </span>
        <CustomizationSwitch
          variant={switchVariant}
          compact={isCompact}
          checked={on}
          disabled={isDisabled}
          onCheckedChange={(next) => setBlock(item.key, next)}
        />
      </label>
    )
  }

  const groupsBlock = groups.map((group, groupIndex) => (
    <div
      key={group.title || `group-${groupIndex}`}
      className={cn(
        isCard
          ? 'border border-[rgba(201,168,76,0.15)] bg-[rgba(10,27,20,0.5)] rounded-xl p-5 mb-5 last:mb-0'
          : cn('first:mt-0', isCompact ? 'mt-0 first:mt-0' : cn('mt-4 first:mt-0', multiColumn && 'mt-0 first:mt-0')),
      )}
    >
      {group.title && !hideGroupTitles ? (
        <p
          className={cn(
            isLight ? 'text-[15px] font-semibold text-[#111]' : 'text-[13px] font-medium uppercase tracking-[0.08em] text-[#e6c364]',
            isCard ? 'mb-4' : (isCompact ? 'mb-1.5 text-[12px]' : multiColumn && 'mb-2'),
          )}
        >
          {group.title}
        </p>
      ) : null}
      <div
        className={cn(
          gridColsClass ? cn('grid', gridColsClass, isCard ? 'gap-x-8 gap-y-4' : 'gap-2') : 'mt-2 flex flex-col',
        )}
      >
        {group.items.map((item) => renderRow(item, group.title))}
      </div>
    </div>
  ))

  const safeActiveIndex = groups.length ? Math.min(activeGroupIndex, groups.length - 1) : 0
  const activeGroup = groups[safeActiveIndex] ?? null
  const ActiveIcon = activeGroup?.icon

  const drilldownLayout = (
    <div
      className={cn(
        'grid min-h-0 grid-cols-1 gap-3 lg:grid-cols-[clamp(232px,32%,308px)_minmax(0,1fr)]',
        fillHeight && 'flex-1',
      )}
    >
      {/* Левая колонка — список разделов */}
      <div className="share-custom-scroll flex min-h-0 flex-col gap-2 overflow-y-auto pr-1">
        {groups.map((group, groupIndex) => {
          const total = group.items.length
          const onCount = group.items.filter((item) => value.blocks[item.key]).length
          const allOff = onCount === 0
          const isActive = groupIndex === safeActiveIndex
          const Icon = group.icon
          const groupTitle = group.title || 'Прочее'
          return (
            <button
              type="button"
              key={group.title || `group-${groupIndex}`}
              onClick={() => setActiveGroupIndex(groupIndex)}
              className={cn(
                'group flex min-h-[64px] flex-1 items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
                isActive
                  ? 'border-[rgba(201,168,76,0.5)] bg-[rgba(201,168,76,0.12)]'
                  : 'border-[rgba(201,168,76,0.16)] bg-[rgba(10,27,20,0.55)] hover:border-[rgba(201,168,76,0.4)] hover:bg-[rgba(10,27,20,0.78)]',
              )}
            >
              <span
                className={cn(
                  'flex size-11 shrink-0 items-center justify-center rounded-full',
                  isActive ? 'bg-[rgba(201,168,76,0.2)] text-[#f4d27a]' : 'bg-[rgba(201,168,76,0.12)] text-[#e6c364]',
                )}
              >
                {Icon ? <Icon size={20} /> : null}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[16px] leading-snug text-[#fcecc8]">{groupTitle}</span>
                <span className={cn('text-[13px]', allOff ? 'text-[rgba(242,207,141,0.45)]' : 'text-[#e6c364]')}>
                  {onCount} {t('selections.selectionCustomizationPanel.из')}{total} {t('selections.selectionCustomizationPanel.включено')}</span>
              </span>
              <ChevronRight
                size={18}
                className={cn(
                  'shrink-0 transition-colors',
                  isActive ? 'text-[#e6c364]' : 'text-[rgba(242,207,141,0.4)] group-hover:text-[#e6c364]',
                )}
              />
            </button>
          )
        })}
      </div>

      {/* Правая колонка — свитчи выбранного раздела */}
      <div
        className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-[rgba(0,0,0,0.2)]"
        style={{ boxShadow: 'inset 0 0 0 1px rgba(230,195,100,0.14)' }}
      >
        {activeGroup ? (
          <>
            <div className="flex shrink-0 items-center gap-2.5 px-4 pt-4 pb-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[rgba(201,168,76,0.14)] text-[#e6c364]">
                {ActiveIcon ? <ActiveIcon size={16} /> : null}
              </span>
              <span className="truncate text-[16px] text-[#fcecc8]">{activeGroup.title || 'Прочее'}</span>
            </div>
            <div
              className={cn(
                'share-custom-scroll grid min-h-0 flex-1 content-start gap-2 overflow-y-auto px-4 pb-4',
                activeGroup.items.length > 6 ? 'sm:grid-cols-2' : 'grid-cols-1',
              )}
            >
              {activeGroup.items.map((item) => renderRow(item, activeGroup.title))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )

  return (
    <div
      className={cn(
        isLight ? 'rounded-2xl bg-[#ececec] p-5 text-[#111]' : 'rounded-md bg-[rgba(0,0,0,0.22)]',
        isCompact ? 'p-3' : 'p-4',
        fillHeight && scrollable && 'flex h-full min-h-0 flex-col overflow-hidden',
      )}
      style={isLight ? undefined : { boxShadow: 'inset 0 0 0 1px rgba(230,195,100,0.18)' }}
    >
      <div className={cn(fillHeight && scrollable && 'shrink-0')}>
      {title ? (
        <h3
          className={cn(
            isLight ? 'text-[22px] font-semibold text-[#111]' : 'font-normal text-[#fcecc8]',
            isCompact ? 'text-[16px]' : 'text-[18px]',
          )}
        >
          {title}
        </h3>
      ) : null}
      {description ? (
        <p className={isLight ? 'mt-1 text-[14px] leading-relaxed text-[#666]' : 'mt-1 text-[16px] text-[rgba(242,207,141,0.72)]'}>
          {description}
        </p>
      ) : null}

      {headerSlot ? <div className={cn(title || description ? 'mt-4' : 'mt-0')}>{headerSlot}</div> : null}

      {showSettings ? (
        <div
          className={cn(
            'items-stretch border-b',
            showTheme ? 'grid grid-cols-3' : 'flex flex-wrap',
            isCompact ? cn('gap-1.5 pb-2', title || description || headerSlot ? 'mt-2' : 'mt-0') : cn('gap-2 pb-3 sm:gap-3', title || description || headerSlot ? 'mt-4' : 'mt-0'),
            isLight ? 'border-black/8' : 'border-[rgba(255,255,255,0.08)]',
          )}
        >
          <SettingField label={t('selections.selectionCustomizationPanel.язык')} variant={variant} compact={isCompact}>
            <CustomizationSelect
              options={SELECTION_LANGUAGES}
              value={value.language}
              onChange={(language) => onChange({ ...value, language })}
              variant={variant}
              compact={isCompact}
            />
          </SettingField>
          <SettingField label={t('selections.selectionCustomizationPanel.валюта')} variant={variant} compact={isCompact}>
            <CustomizationSelect
              options={SELECTION_CURRENCIES}
              value={value.currency}
              onChange={(currency) => onChange({ ...value, currency })}
              variant={variant}
              compact={isCompact}
            />
          </SettingField>
          {showTheme ? (
            <SettingField label={t('selections.selectionCustomizationPanel.тема')} variant={variant} compact={isCompact}>
              <CustomizationSelect
                options={UNIT_VISIT_THEMES}
                value={value.theme ?? 'dark'}
                onChange={(theme) => onChange({ ...value, theme })}
                variant={variant}
                compact={isCompact}
              />
            </SettingField>
          ) : null}
        </div>
      ) : null}
      </div>

      {drilldown ? (
        <div className={cn(fillHeight ? 'mt-3 flex min-h-0 flex-1 flex-col' : 'mt-4')}>
          {drilldownLayout}
        </div>
      ) : scrollable ? (
        <div
          className={cn(
            'share-custom-scroll overflow-y-auto overscroll-contain pr-1',
            fillHeight ? (isCompact ? 'mt-1.5 min-h-0 flex-1 pb-0.5' : 'mt-3 min-h-0 flex-1 pb-1') : 'mt-4 pb-4',
          )}
          style={{
            scrollbarGutter: 'stable',
            ...(fillHeight ? {} : { maxHeight: scrollMaxHeight ?? defaultScrollMaxHeight }),
          }}
        >
          {groupsBlock}
        </div>
      ) : (
        groupsBlock
      )}
    </div>
  )
}
