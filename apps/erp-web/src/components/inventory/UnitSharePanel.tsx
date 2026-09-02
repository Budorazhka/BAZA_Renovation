import { Check, Eye, Globe, Link2, Moon, Printer, Share2, Sun, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { IconChat, IconTelegram, IconWhatsApp } from '@/components/icons/IconMessengers'
import { LanguageFlag } from '@/components/icons/FlagIcons'
import { SelectionCustomizationPanel } from '@/components/selections/SelectionCustomizationPanel'
import {
  UNIT_SHARE_PRESETS,
  applyUnitSharePreset,
  detectUnitSharePresetId,
  resolveUnitShareCustomization,
  type DevSelectionBlockKey,
  type DevSelectionCustomization,
} from '@/config/dev-selection-customization'
import type { ToggleGroup } from '@/components/selections/SelectionCustomizationPanel'
import { SELECTION_CURRENCIES, SELECTION_LANGUAGES } from '@/lib/selection-display'
import { UNIT_VISIT_THEMES } from '@/lib/unit-visit-theme'
import { useI18n } from "@/i18n";

export type ShareGeneratingAction = 'preview' | 'link' | 'public-link' | 'chats' | 'wa' | 'tg' | 'pdf' | null

const THEME_ICONS: Record<string, typeof Moon> = { dark: Moon, light: Sun }
/** Только светлая и тёмная темы визитки доступны для выбора. */
const SELECTABLE_THEMES = UNIT_VISIT_THEMES.filter((option) => option.value === 'dark' || option.value === 'light')

const SEG_BASE =
  'flex flex-1 items-center justify-center gap-1.5 rounded-[4px] px-2 py-2 text-[16px] leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-60'
const SEG_ACTIVE = 'bg-[#c9a84c] text-[#0a1f12]'
const SEG_IDLE = 'text-[rgba(242,207,141,0.72)] hover:bg-[rgba(201,168,76,0.1)] hover:text-[#fcecc8]'

function GeneratingLabel() {
    const { t } = useI18n();
  const [dots, setDots] = useState(1)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDots((prev) => (prev % 3) + 1)
    }, 400)
    return () => window.clearInterval(timer)
  }, [])

  return <span>{t('inventory.unitSharePanel.генерируем')}{'.'.repeat(dots)}</span>
}

interface Props {
  customization: DevSelectionCustomization
  groups: ToggleGroup<DevSelectionBlockKey>[]
  pdfLoading?: boolean
  shareGeneratingAction?: ShareGeneratingAction
  onCustomizationChange: (next: DevSelectionCustomization) => void
  onPreview: () => void | Promise<void>
  onCopyLink: () => void | Promise<void>
  /** Ссылка на публичную страницу лота на baza.sale; undefined — лот не опубликован на маркетплейсе. */
  onCopyPublicLink?: () => void | Promise<void>
  onDownloadPdf: () => void | Promise<void>
  onShareToChats: () => void | Promise<void>
  onShareWhatsApp: () => void | Promise<void>
  onShareTelegram: () => void | Promise<void>
}


export function UnitSharePanel({
  customization,
  groups,
  pdfLoading = false,
  shareGeneratingAction = null,
  onCustomizationChange,
  onPreview,
  onCopyLink,
  onCopyPublicLink,
  onDownloadPdf,
  onShareToChats,
  onShareWhatsApp,
  onShareTelegram,
}: Props) {
    const { t } = useI18n();
  const [copied, setCopied] = useState(false)
  const [copiedPublic, setCopiedPublic] = useState(false)
  const [sharePopupOpen, setSharePopupOpen] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)
  const isBusy = shareGeneratingAction != null
  const activePresetId = detectUnitSharePresetId(customization)

  useEffect(() => {
    if (!sharePopupOpen) return
    function onOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setSharePopupOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [sharePopupOpen])

  async function copyLink() {
    if (isBusy) return
    await onCopyLink()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function copyPublicLink() {
    if (isBusy || !onCopyPublicLink) return
    await onCopyPublicLink()
    setCopiedPublic(true)
    setTimeout(() => setCopiedPublic(false), 2000)
  }

  const presetSelector = (
    <div className="flex flex-col gap-1.5">
      {UNIT_SHARE_PRESETS.map((preset) => {
        const active = activePresetId === preset.id
        return (
          <button
            key={preset.id}
            type="button"
            disabled={isBusy}
            title={preset.description}
            onClick={() => onCustomizationChange(applyUnitSharePreset(preset.id, customization))}
            className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[13px] font-normal transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              active
                ? 'bg-[#c9a84c] text-[#0a1f12] hover:bg-[#e2c97e]'
                : 'border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.14)] text-[rgba(242,207,141,0.7)] hover:border-[rgba(201,168,76,0.25)] hover:text-[#fcecc8]'
            }`}
          >
            {preset.label}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="unit-share-panel flex h-full min-h-0 flex-col overflow-y-auto bg-[#0c2018] p-4 pb-5 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.08)] lg:overflow-hidden lg:p-5 lg:pb-6">
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch lg:gap-5">
        <div className="unit-share-actions-shell flex min-h-0 flex-col gap-3 overflow-hidden">
          <div className="shrink-0 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void onPreview()}
              disabled={isBusy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#c9a84c] px-3 py-2.5 text-[15px] font-normal text-[#0a1f12] transition-colors hover:bg-[#e2c97e] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {shareGeneratingAction !== 'preview' && <Eye size={15} />}
              {shareGeneratingAction === 'preview' ? <GeneratingLabel /> : 'Предпросмотр визитки'}
            </button>

            {/* Кнопка Переслать + попап — сразу под предпросмотром */}
            <div className="relative">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setSharePopupOpen((v) => !v)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-[rgba(201,168,76,0.3)] bg-[rgba(201,168,76,0.1)] px-3 py-2.5 text-[13px] font-medium text-[#fcecc8] transition-colors hover:bg-[rgba(201,168,76,0.18)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Share2 size={14} />
                {t('inventory.unitSharePanel.переслать_презентаци')}</button>

              {sharePopupOpen && (
                <div
                  ref={popupRef}
                  className="absolute top-full left-0 z-50 mt-1 w-full overflow-hidden rounded-xl border border-[rgba(201,168,76,0.22)] bg-[#0d2419] shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
                >
                  <div className="flex items-center justify-between border-b border-[rgba(201,168,76,0.12)] px-3 py-2.5">
                    <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[rgba(242,207,141,0.5)]">
                      {t('inventory.unitSharePanel.отправить_клиенту')}</span>
                    <button
                      type="button"
                      onClick={() => setSharePopupOpen(false)}
                      className="text-[rgba(242,207,141,0.4)] hover:text-[#fcecc8]"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {[
                    {
                      id: 'link' as const,
                      label: copied ? 'Скопировано!' : 'Скопировать ссылку',
                      icon: copied ? Check : Link2,
                      iconClass: copied ? 'text-[#7ecfae]' : 'text-[#e6c364]',
                      onClick: () => { void copyLink() },
                    },
                    // Публичная витрина маркетплейса — без кастомизации и контактов агента
                    ...(onCopyPublicLink
                      ? [{
                          id: 'public-link' as const,
                          label: copiedPublic ? 'Скопировано!' : 'Ссылка на baza.sale',
                          icon: copiedPublic ? Check : Globe,
                          iconClass: copiedPublic ? 'text-[#7ecfae]' : 'text-[#e6c364]',
                          onClick: () => { void copyPublicLink() },
                        }]
                      : []),
                    {
                      id: 'chats' as const,
                      label: 'Перейти в Чаты',
                      icon: IconChat,
                      iconClass: 'text-[#d0e8df]',
                      onClick: () => { void onShareToChats(); setSharePopupOpen(false) },
                    },
                    {
                      id: 'wa' as const,
                      label: 'Отправить в WhatsApp',
                      icon: IconWhatsApp,
                      iconClass: '',
                      onClick: () => { void onShareWhatsApp(); setSharePopupOpen(false) },
                    },
                    {
                      id: 'tg' as const,
                      label: 'Отправить в Telegram',
                      icon: IconTelegram,
                      iconClass: '',
                      onClick: () => { void onShareTelegram(); setSharePopupOpen(false) },
                    },
                    {
                      id: 'pdf' as const,
                      label: pdfLoading && shareGeneratingAction !== 'pdf' ? 'Готовим PDF…' : 'Скачать PDF',
                      icon: Printer,
                      iconClass: 'text-[#e6c364]',
                      onClick: () => { void onDownloadPdf(); setSharePopupOpen(false) },
                    },
                  ].map(({ id, label, icon: Icon, iconClass, onClick }) => {
                    const isGenerating = shareGeneratingAction === id
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={isBusy}
                        onClick={onClick}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[rgba(230,195,100,0.08)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isGenerating
                          ? <span className="size-[15px] shrink-0" />
                          : <Icon size={15} className={`shrink-0 ${iconClass}`} />
                        }
                        <span className="flex-1 text-[13px] text-[#fcecc8]">
                          {isGenerating ? <GeneratingLabel /> : label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 flex flex-col gap-2">
            {/* Язык — флаг страны */}
            <div
              className="grid grid-cols-[1fr_2fr_1fr] gap-1 rounded-[6px] bg-[rgba(0,0,0,0.28)] p-1"
              style={{ boxShadow: 'inset 0 0 0 1px rgba(230,195,100,0.14)' }}
            >
              {SELECTION_LANGUAGES.map((option) => {
                const active = customization.language === option.value
                const isGeorgian = option.value === 'ka'
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={isBusy || isGeorgian}
                    title={option.label}
                    onClick={() => onCustomizationChange(resolveUnitShareCustomization({ ...customization, language: option.value }))}
                    className={`${SEG_BASE} min-w-0 ${active ? SEG_ACTIVE : SEG_IDLE}`}
                  >
                    <LanguageFlag lang={option.value} className="h-[18px] w-auto shrink-0 rounded-[2px]" />
                    {isGeorgian ? <span className="min-w-0 truncate text-[16px] leading-none">{t('inventory.unitSharePanel.в_разработке')}</span> : null}
                  </button>
                )
              })}
            </div>

            {/* Валюта */}
            <div
              className="flex gap-1 rounded-[6px] bg-[rgba(0,0,0,0.28)] p-1"
              style={{ boxShadow: 'inset 0 0 0 1px rgba(230,195,100,0.14)' }}
            >
              {SELECTION_CURRENCIES.map((option) => {
                const active = customization.currency === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={isBusy}
                    onClick={() => onCustomizationChange(resolveUnitShareCustomization({ ...customization, currency: option.value }))}
                    className={`${SEG_BASE} ${active ? SEG_ACTIVE : SEG_IDLE}`}
                  >
                    <span className={active ? '' : 'text-[#e6c364]'}>{option.symbol}</span>
                    <span>{option.value}</span>
                  </button>
                )
              })}
            </div>

            {/* Тема — только светлая и тёмная */}
            <div
              className="flex gap-1 rounded-[6px] bg-[rgba(0,0,0,0.28)] p-1"
              style={{ boxShadow: 'inset 0 0 0 1px rgba(230,195,100,0.14)' }}
            >
              {SELECTABLE_THEMES.map((option) => {
                const active = (customization.theme ?? 'dark') === option.value
                const Icon = THEME_ICONS[option.value]
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={isBusy}
                    onClick={() => onCustomizationChange(resolveUnitShareCustomization({ ...customization, theme: option.value }))}
                    className={`${SEG_BASE} ${active ? SEG_ACTIVE : SEG_IDLE}`}
                  >
                    {Icon ? <Icon size={15} /> : null}
                    <span>{option.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Пресеты — в самом низу */}
          <div className="shrink-0">
            <p className="mb-1.5 px-0.5 text-center text-[16px] font-medium uppercase tracking-[0.08em] text-[rgba(242,207,141,0.72)]">
              {t('inventory.unitSharePanel.презентация')}</p>
            {presetSelector}
          </div>
        </div>

        <div className="unit-share-customization-shell flex min-h-0 flex-col overflow-hidden">
          <SelectionCustomizationPanel
            value={customization}
            groups={groups}
            onChange={(next) => onCustomizationChange(resolveUnitShareCustomization({ ...customization, ...next }))}
            title={t('inventory.unitSharePanel.настройте_содержимое')}
            description={t('inventory.unitSharePanel.выберите_раздел_чтоб')}
            scrollable
            fillHeight
            switchVariant="gold"
            showSettings={false}
            drilldown
          />
        </div>
      </div>
    </div>
  )
}
