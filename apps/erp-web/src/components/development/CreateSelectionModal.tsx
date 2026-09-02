import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronDown, Layers, Search, Sliders, User, X } from 'lucide-react'

import { useDevSelectionsStore } from '@/store/useDevSelectionsStore'
import { useCoreStore } from '@/store/useCoreStore'
import { useLeads } from '@/context/LeadsContext'
import { useTheme } from '@/context/ThemeContext'
import { SelectionCustomizationPanel } from '@/components/selections/SelectionCustomizationPanel'
import { buildSelectionShareUrl } from '@/lib/selection-share'
import {
  DEFAULT_DEV_CUSTOMIZATION,
  DEV_CUSTOMIZATION_GROUPS,
  resolveDevCustomization,
  type DevSelectionCustomization,
} from '@/config/dev-selection-customization'
import { useI18n } from "@/i18n";

interface Props {
  unitIds: string[]
  onClose: () => void
}

export function CreateSelectionModal({ unitIds, onClose }: Props) {
    const { t } = useI18n();
  const createSelection = useDevSelectionsStore((s) => s.create)
  const allUnits = useCoreStore((s) => s.allUnits)
  const navigate = useNavigate()
  const { state: leadsState } = useLeads()
  const { isLightTheme } = useTheme()

  const leads = leadsState.leadPool.filter((l) => l.name)

  const [title, setTitle] = useState('')
  const [leadId, setLeadId] = useState<string | null>(null)
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [leadSearch, setLeadSearch] = useState('')
  const [leadDropOpen, setLeadDropOpen] = useState(false)
  const leadDropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!leadDropOpen) return
    function out(e: MouseEvent) {
      if (leadDropRef.current && !leadDropRef.current.contains(e.target as Node)) setLeadDropOpen(false)
    }
    document.addEventListener('mousedown', out)
    return () => document.removeEventListener('mousedown', out)
  }, [leadDropOpen])

  const filteredLeads = leads
    .filter((l) => !leadSearch || l.name!.toLowerCase().includes(leadSearch.toLowerCase()))
    .slice(0, 8)

  const selectedLead = leadId ? leads.find((l) => l.id === leadId) : null

  const handleSelectLead = (l: typeof leads[0]) => {
    setLeadId(l.id)
    setClientName(l.name ?? '')
    setClientPhone(l.phone ?? '')
    setLeadDropOpen(false)
    setLeadSearch('')
  }

  const handleClearLead = () => {
    setLeadId(null)
    setClientName('')
    setClientPhone('')
  }
  const [agentNote, setAgentNote] = useState('')
  const [customization, setCustomization] = useState<DevSelectionCustomization>(DEFAULT_DEV_CUSTOMIZATION)
  const [showCustom, setShowCustom] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const selectedUnits = unitIds
    .map((id) => allUnits.find((u) => u._id === id))
    .filter(Boolean)

  const autoTitle = `Подборка ${selectedUnits.length} кв.${clientName ? ` — ${clientName}` : ''}`

  const handleCreate = () => {
    const sel = createSelection({
      title: title.trim() || autoTitle,
      unitIds,
      leadId: leadId ?? undefined,
      clientName: clientName.trim() || undefined,
      clientPhone: clientPhone.trim() || undefined,
      agentNote: agentNote.trim() || undefined,
      customization,
    })
    const url = buildSelectionShareUrl(sel)
    setDone(url)
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
        <div
          className="w-full max-w-sm rounded-2xl border border-[var(--hub-card-border)] bg-[var(--green-card)] p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
              <Check size={28} className="text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-normal text-[var(--app-text)]">{t('development.createSelectionModal.подборка_создана')}</h3>
              <p className="mt-1 text-xs text-[var(--app-text-muted)]">{t('development.createSelectionModal.отправьте_ссылку_кли')}</p>
            </div>

            <div className="w-full rounded-xl border border-[color-mix(in_srgb,var(--hub-card-border)_75%,transparent)] bg-[color-mix(in_srgb,var(--app-bg)_10%,var(--green-card))] px-3 py-2">
              <code className="block truncate text-xs text-[var(--app-text)]">{done}</code>
            </div>

            <div className="flex w-full flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(done)
                  onClose()
                }}
                className="w-full rounded-xl bg-[var(--gold)] py-2.5 text-sm font-normal text-[var(--gold-btn-text)] hover:bg-[var(--gold-light)]"
              >
                {t('development.createSelectionModal.скопировать_ссылку_и')}</button>
              <button
                type="button"
                onClick={() => { onClose(); navigate('/dashboard/development/selections') }}
                className="w-full rounded-xl border border-[var(--hub-card-border)] py-2.5 text-sm text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
              >
                {t('development.createSelectionModal.открыть_в_подборках')}</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-5 overflow-y-auto rounded-lg border border-[var(--hub-card-border)] bg-[var(--green-card)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-normal text-[var(--app-text)]">{t('development.createSelectionModal.создать_подборку')}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--app-text-subtle)] hover:text-[var(--app-text)]">
            <X size={18} />
          </button>
        </div>

        {/* Selected units preview */}
        <div className="rounded-xl border border-[color-mix(in_srgb,var(--hub-card-border)_60%,transparent)] bg-[color-mix(in_srgb,var(--app-bg)_8%,var(--green-card))] px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-[var(--app-text-muted)]">
            <Layers size={14} className="text-[var(--gold)]" />
            <span className="font-medium text-[var(--app-text)]">{selectedUnits.length}</span>
            {t('development.createSelectionModal.квартир_в_подборке')}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {selectedUnits.slice(0, 10).map((u) => (
              <span key={u!._id} className="rounded-md border border-[color-mix(in_srgb,var(--hub-card-border)_75%,transparent)] bg-[color-mix(in_srgb,var(--app-bg)_10%,var(--green-card))] px-2 py-0.5 text-[11px] text-[var(--app-text-muted)]">
                {u!.number}
                {u!.area != null && <span className="text-[var(--app-text-subtle)]"> {u!.area}{t('development.createSelectionModal.м')}</span>}
              </span>
            ))}
            {selectedUnits.length > 10 && (
              <span className="rounded-md border border-[color-mix(in_srgb,var(--hub-card-border)_50%,transparent)] px-2 py-0.5 text-[11px] text-[var(--app-text-subtle)]">
                +{selectedUnits.length - 10} {t('development.createSelectionModal.ещ')}</span>
            )}
          </div>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--app-text-muted)]">{t('development.createSelectionModal.название_подборки')}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={autoTitle}
              className="w-full rounded-xl border border-[var(--hub-card-border)] bg-[color-mix(in_srgb,var(--app-bg)_10%,var(--green-card))] px-3 py-2.5 text-sm text-[var(--app-text)] placeholder:text-[var(--app-text-subtle)] outline-none focus:border-[var(--gold)]"
            />
          </div>
          {/* Lead picker */}
          <div>
            <label className="mb-1 block text-xs text-[var(--app-text-muted)]">{t('development.createSelectionModal.клиент_лид')}</label>
            <div className="relative" ref={leadDropRef}>
              {selectedLead ? (
                <div className="flex items-center gap-2 rounded-xl border border-[var(--gold)]/50 bg-[color-mix(in_srgb,var(--gold)_8%,transparent)] px-3 py-2.5">
                  <User size={14} className="shrink-0 text-[var(--gold)]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--app-text)]">{selectedLead.name}</p>
                    {selectedLead.phone && (
                      <p className="text-xs text-[var(--app-text-muted)]">{selectedLead.phone}</p>
                    )}
                  </div>
                  <button type="button" onClick={handleClearLead}
                    className="shrink-0 rounded p-0.5 text-[var(--app-text-subtle)] hover:text-[var(--app-text)]">
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setLeadDropOpen((v) => !v)}
                  className="flex w-full items-center gap-2 rounded-xl border border-[var(--hub-card-border)] bg-[color-mix(in_srgb,var(--app-bg)_10%,var(--green-card))] px-3 py-2.5 text-sm text-[var(--app-text-subtle)] hover:border-[var(--hub-card-border-hover)]"
                >
                  <User size={14} className="shrink-0" />
                  <span className="flex-1 text-left">{t('development.createSelectionModal.выбрать_лид')}</span>
                  <ChevronDown size={13} className={`shrink-0 transition-transform ${leadDropOpen ? 'rotate-180' : ''}`} />
                </button>
              )}

              {leadDropOpen && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-[var(--hub-card-border)] bg-[var(--green-card)] shadow-2xl">
                  <div className="flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--hub-card-border)_50%,transparent)] px-3 py-2">
                    <Search size={12} className="shrink-0 text-[var(--app-text-subtle)]" />
                    <input
                      autoFocus
                      value={leadSearch}
                      onChange={(e) => setLeadSearch(e.target.value)}
                      placeholder={t('development.createSelectionModal.поиск_по_имени')}
                      className="flex-1 bg-transparent text-xs text-[var(--app-text)] outline-none placeholder:text-[var(--app-text-subtle)]"
                    />
                  </div>
                  <div className="max-h-44 overflow-y-auto py-1">
                    {filteredLeads.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-[var(--app-text-subtle)]">{t('development.createSelectionModal.ничего_не_найдено')}</p>
                    ) : filteredLeads.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => handleSelectLead(l)}
                        className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-[var(--dropdown-hover)]"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--gold)_12%,transparent)] text-xs font-normal text-[var(--gold)]">
                          {l.name!.charAt(0)}
                        </div>
                        <div className="min-w-0 text-left">
                          <p className="truncate text-xs font-medium text-[var(--app-text)]">{l.name}</p>
                          {l.phone && <p className="text-[11px] text-[var(--app-text-subtle)]">{l.phone}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--app-text-muted)]">{t('development.createSelectionModal.сопроводительное_соо')}</label>
            <textarea
              value={agentNote}
              onChange={(e) => setAgentNote(e.target.value)}
              placeholder={t('development.createSelectionModal.подобрал_для_вас_нес')}
              rows={3}
              className="w-full resize-none rounded-xl border border-[var(--hub-card-border)] bg-[color-mix(in_srgb,var(--app-bg)_10%,var(--green-card))] px-3 py-2.5 text-sm text-[var(--app-text)] placeholder:text-[var(--app-text-subtle)] outline-none focus:border-[var(--gold)]"
            />
          </div>
        </div>

        {/* Кастомизация */}
        <div>
          <button
            type="button"
            onClick={() => setShowCustom((v) => !v)}
            className="flex w-full items-center gap-2 rounded-md border border-[var(--hub-card-border)] bg-[color-mix(in_srgb,var(--app-bg)_10%,var(--green-card))] px-3 py-2.5 text-[16px] text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
          >
            <Sliders size={15} className="shrink-0 text-[var(--gold)]" />
            <span className="flex-1 text-left">{t('development.createSelectionModal.кастомизация_подборк')}</span>
            <ChevronDown size={15} className={`shrink-0 transition-transform ${showCustom ? 'rotate-180' : ''}`} />
          </button>
          {showCustom && (
            <div className="mt-3">
              <SelectionCustomizationPanel
                value={customization}
                groups={DEV_CUSTOMIZATION_GROUPS}
                variant={isLightTheme ? 'light' : 'dark'}
                onChange={(next) => setCustomization(resolveDevCustomization({ ...customization, ...next }))}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-xl border border-[var(--hub-card-border)] py-2.5 text-sm text-[var(--app-text-muted)] hover:text-[var(--app-text)]">
            {t('development.createSelectionModal.отмена')}</button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={unitIds.length === 0}
            className="flex-1 rounded-xl bg-[var(--gold)] py-2.5 text-sm font-normal text-[var(--gold-btn-text)] hover:bg-[var(--gold-light)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('development.createSelectionModal.создать_подборку')}</button>
        </div>
      </div>
    </div>
  )
}
