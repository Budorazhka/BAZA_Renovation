import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelectionsBasePath, useSelectionsMarket } from '@/hooks/useSelectionsBasePath'
import { Building2, Check, Home, Send, Trash2, Users, X } from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { cn } from '@/lib/utils'
import { useAgencyBranding } from '@/hooks/useAgencyBranding'
import { useAuth } from '@/context/AuthContext'
import { useLeads } from '@/context/LeadsContext'
import { mockPhoneForLead } from '@/lib/lead-contact-mock'
import { prependSelections } from '@/lib/selections-storage'
import {
  PRIMARY_COMPLEXES_MOCK,
  SECONDARY_LOTS_MOCK,
  type PrimaryComplex,
  type PrimaryLot,
  type SecondaryLot,
} from '@/data/selection-catalog-mock'
import { MARKET_COLORS, type Selection, type SelectionProperty } from '@/types/selections'
import { LEAD_STAGE_COLUMN } from '@/data/leads-mock'
import { FMT_USD } from '@/lib/format-currency'
import { SelectionCustomizationPanel } from '@/components/selections/SelectionCustomizationPanel'
import {
  AGENCY_CUSTOMIZATION_GROUPS,
  DEFAULT_AGENCY_CUSTOMIZATION,
  type AgencySelectionCustomization,
} from '@/config/agency-selection-customization'
import { saveSelectionCustomization } from '@/lib/selections-storage'
import { formatMoney, formatMoneyPerM2, t } from '@/lib/selection-display'
import { useTheme } from '@/context/ThemeContext'
import { useI18n } from "@/i18n";

type BasketPrimary = { kind: 'primary'; key: string; complex: PrimaryComplex; lot: PrimaryLot }
type BasketSecondary = { kind: 'secondary'; key: string; lot: SecondaryLot }
type BasketItem = BasketPrimary | BasketSecondary

function formatPriceUsd(n: number) {
  return FMT_USD.format(n)
}

function basketToSelectionProperties(items: BasketItem[]): SelectionProperty[] {
  return items.map((item) => {
    if (item.kind === 'primary') {
      const { complex, lot } = item
      return {
        id: item.key,
        propertyId: lot.id,
        address: `${complex.address}, ${lot.label}`,
        price: lot.price,
        rooms: lot.rooms,
        area: lot.area,
        floor: lot.floor,
        market: 'primary',
        building: complex.name,
        developer: complex.developer,
        imageUrl: lot.imageUrl,
        description: lot.description,
        isPromo: lot.isPromo,
      }
    }
    const { lot } = item
    return {
      id: item.key,
      propertyId: lot.propertyId,
      address: lot.address,
      price: lot.price,
      rooms: lot.rooms,
      area: lot.area,
      floor: lot.floor,
      market: 'secondary',
      imageUrl: lot.imageUrl,
      description: lot.description,
    }
  })
}

function newSelId() {
  return `sel-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function SelectionSendPreview({
  title,
  recipientLabel,
  basket,
  agencyName,
  logoDataUrl,
  c,
}: {
  title: string
  recipientLabel: string
  basket: BasketItem[]
  agencyName: string
  logoDataUrl: string | null
  c: AgencySelectionCustomization
}) {
    const { t: tApp } = useI18n();
  return (
    <div
      className="rounded-xl border border-[color:var(--hub-card-border)] bg-[var(--hub-card-bg)] text-[color:var(--app-text)] shadow-[inset_0_0_0_1px_var(--hub-card-border)]"
      style={{ fontFamily: "'Montserrat', system-ui, sans-serif" }}
    >
      <div className="border-b border-[color:var(--divider-subtle)] px-6 py-5">
        {logoDataUrl ? (
          <img src={logoDataUrl} alt="" className="max-h-14 max-w-[200px] object-contain object-left" />
        ) : (
          <div className="text-xs font-normal uppercase tracking-widest text-[color:var(--hub-desc)]">{tApp('selections.selectionsNewPage.логотип_агентства')}</div>
        )}
        <h2 className="mt-4 text-lg font-normal text-[color:var(--app-text)]">{title || 'Подборка объектов'}</h2>
        {recipientLabel && (
          <p className="mt-1 text-sm text-[color:var(--hub-body)]">{tApp('selections.selectionsNewPage.для')}{recipientLabel}</p>
        )}
      </div>

      <div className="space-y-0 px-6 py-4">
        {basket.length === 0 ? (
          <p className="py-8 text-center text-sm text-[color:var(--app-text-muted)]">{tApp('selections.selectionsNewPage.добавьте_лоты_из_пер')}</p>
        ) : (
          basket.map((item, i) => (
            <div key={item.key}>
              {i > 0 && <div className="my-6 border-t-2 border-dashed border-[color:var(--divider-subtle)]" aria-hidden />}
              {item.kind === 'primary' ? (
                <PrimaryLotPreview complex={item.complex} lot={item.lot} index={i + 1} c={c} />
              ) : (
                <SecondaryLotPreview lot={item.lot} index={i + 1} c={c} />
              )}
            </div>
          ))
        )}
      </div>

      {c.blocks.agentContacts && (
      <div className="border-t border-[color:var(--divider-subtle)] bg-[var(--green-deep)] px-6 py-4 text-center">
        <p className="text-xs font-normal uppercase tracking-[0.2em] text-[color:var(--hub-desc)]">
          {agencyName || 'Название агентства'}
        </p>
        <p className="mt-1 text-[11px] text-[color:var(--app-text-subtle)]">{tApp('selections.selectionsNewPage.подборка_сформирован')}</p>
      </div>
      )}
    </div>
  )
}

function ParamRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[color:var(--divider-subtle)] py-1.5 text-sm last:border-0">
      <span className="text-[color:var(--hub-body)]">{label}</span>
      <span className="text-right font-medium text-[color:var(--app-text)]">{value}</span>
    </div>
  )
}

function PrimaryLotPreview({ complex, lot, index, c }: { complex: PrimaryComplex; lot: PrimaryLot; index: number; c: AgencySelectionCustomization }) {
    const { t: tApp } = useI18n();
  const { language, currency, blocks } = c
  return (
    <article className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--hub-tile-icon-bg)] text-xs font-normal text-[color:var(--gold)]">
          {index}
        </span>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-base font-normal uppercase tracking-wide text-[color:var(--gold)]">{tApp('selections.selectionsNewPage.новостройка')}</p>
            {lot.isPromo && (
              <span className="inline-flex items-center rounded bg-[var(--gold)]/15 px-1.5 py-0.5 text-base font-medium uppercase tracking-wide text-[color:var(--gold)]">
                {tApp('selections.selectionsNewPage.акция')}
              </span>
            )}
          </div>
          <h3 className="text-base font-normal text-[color:var(--app-text)]">{complex.name}</h3>
          <p className="text-sm text-[color:var(--hub-body)]">{lot.label}</p>
        </div>
      </div>
      {blocks.photo && (
      <div className="overflow-hidden rounded-lg border border-[color:var(--green-border)] bg-[var(--green-card)]">
        <img src={lot.imageUrl} alt="" className="aspect-[16/10] w-full object-cover" />
      </div>
      )}
      {blocks.description && (
      <p className="text-sm leading-relaxed text-[color:var(--hub-body)]">{lot.description}</p>
      )}
      <div className="rounded-lg bg-[var(--green-card)] p-3 ring-1 ring-[color:var(--green-border)]">
        {blocks.developer && <ParamRow label={t(language, 'developer')} value={complex.developer} />}
        {blocks.address && <ParamRow label={t(language, 'address')} value={complex.address} />}
        {blocks.specs && <ParamRow label={t(language, 'rooms')} value={String(lot.rooms)} />}
        {blocks.specs && <ParamRow label={t(language, 'area')} value={`${lot.area} м²`} />}
        {blocks.specs && <ParamRow label={t(language, 'floor')} value={lot.floor} />}
        {blocks.price && <ParamRow label={t(language, 'price')} value={formatMoney(lot.price, currency, language)} />}
        {blocks.pricePerM2 && lot.area > 0 && (
          <ParamRow label={`${t(language, 'price')} / м²`} value={formatMoneyPerM2(lot.price / lot.area, currency, language)} />
        )}
      </div>
    </article>
  )
}

function SecondaryLotPreview({ lot, index, c }: { lot: SecondaryLot; index: number; c: AgencySelectionCustomization }) {
    const { t: tApp } = useI18n();
  const { language, currency, blocks } = c
  return (
    <article className="space-y-3">
      <div className="flex items-start gap-3">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-normal"
          style={{ background: 'rgba(96,165,250,0.15)', color: MARKET_COLORS.secondary }}
        >
          {index}
        </span>
        <div>
          <p className="text-xs font-normal uppercase tracking-wide" style={{ color: MARKET_COLORS.secondary }}>
            {tApp('selections.selectionsNewPage.вторичка')}</p>
          <h3 className="text-base font-normal text-[color:var(--app-text)]">{lot.address}</h3>
        </div>
      </div>
      {blocks.photo && (
      <div className="overflow-hidden rounded-lg border border-[color:var(--green-border)] bg-[var(--green-card)]">
        <img src={lot.imageUrl} alt="" className="aspect-[16/10] w-full object-cover" />
      </div>
      )}
      {blocks.description && (
      <p className="text-sm leading-relaxed text-[color:var(--hub-body)]">{lot.description}</p>
      )}
      <div className="rounded-lg bg-[var(--green-card)] p-3 ring-1 ring-[color:var(--green-border)]">
        {blocks.specs && <ParamRow label={t(language, 'rooms')} value={String(lot.rooms)} />}
        {blocks.specs && <ParamRow label={t(language, 'area')} value={`${lot.area} м²`} />}
        {blocks.specs && <ParamRow label={t(language, 'floor')} value={lot.floor} />}
        {blocks.price && <ParamRow label={t(language, 'price')} value={formatMoney(lot.price, currency, language)} />}
        {blocks.pricePerM2 && lot.area > 0 && (
          <ParamRow label={`${t(language, 'price')} / м²`} value={formatMoneyPerM2(lot.price / lot.area, currency, language)} />
        )}
      </div>
    </article>
  )
}

export function SelectionsNewPage() {
    const { t: tApp } = useI18n();
  const navigate = useNavigate()
  const selectionsBase = useSelectionsBasePath()
  const market = useSelectionsMarket()
  const { currentUser } = useAuth()
  const { state: leadsState } = useLeads()
  const branding = useAgencyBranding()
  const { isLightTheme } = useTheme()

  const [title, setTitle] = useState('')
  const [leadQuery, setLeadQuery] = useState('')
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set())
  const [complexId, setComplexId] = useState(PRIMARY_COMPLEXES_MOCK[0]?.id ?? '')
  const [basket, setBasket] = useState<BasketItem[]>([])
  const [secQuery, setSecQuery] = useState('')
  const [sentOk, setSentOk] = useState(false)
  const [customization, setCustomization] = useState<AgencySelectionCustomization>(DEFAULT_AGENCY_CUSTOMIZATION)

  const activeComplex = useMemo(
    () => PRIMARY_COMPLEXES_MOCK.find((c) => c.id === complexId) ?? PRIMARY_COMPLEXES_MOCK[0],
    [complexId],
  )

  const leadRecipients = useMemo(() => {
    const q = leadQuery.trim().toLowerCase()
    return leadsState.leadPool.filter((l) => {
      if (!l.name?.trim()) return false
      if (LEAD_STAGE_COLUMN[l.stageId] === 'rejection') return false
      if (q.length < 2) return true
      return l.name.toLowerCase().includes(q) || l.id.toLowerCase().includes(q)
    })
  }, [leadsState.leadPool, leadQuery])

  const secondaryFiltered = useMemo(() => {
    const q = secQuery.trim().toLowerCase()
    if (q.length < 2) return SECONDARY_LOTS_MOCK
    return SECONDARY_LOTS_MOCK.filter(
      (l) => l.address.toLowerCase().includes(q) || l.id.includes(q),
    )
  }, [secQuery])

  function toggleLead(id: string) {
    setSelectedLeadIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function addPrimaryLot(lot: PrimaryLot) {
    if (!activeComplex) return
    const key = `p:${activeComplex.id}:${lot.id}`
    setBasket((prev) => {
      if (prev.some((b) => b.key === key)) return prev
      return [...prev, { kind: 'primary', key, complex: activeComplex, lot }]
    })
  }

  function addSecondaryLot(lot: SecondaryLot) {
    const key = `s:${lot.id}`
    setBasket((prev) => {
      if (prev.some((b) => b.key === key)) return prev
      return [...prev, { kind: 'secondary', key, lot }]
    })
  }

  function removeBasket(i: number) {
    setBasket((prev) => prev.filter((_, idx) => idx !== i))
  }

  const recipientLabel = useMemo(() => {
    const names = leadsState.leadPool
      .filter((l) => selectedLeadIds.has(l.id))
      .map((l) => l.name ?? l.id)
    if (names.length === 0) return ''
    if (names.length <= 2) return names.join(', ')
    return `${names.slice(0, 2).join(', ')} и ещё ${names.length - 2}`
  }, [leadsState.leadPool, selectedLeadIds])

  function handleSend() {
    if (!title.trim() || basket.length === 0) return
    const hasPrimary = basket.some((b) => b.kind === 'primary')
    const hasSecondary = basket.some((b) => b.kind === 'secondary')
    if (market === 'newbuild' && hasSecondary) return
    if (market === 'secondary' && hasPrimary) return
    const props = basketToSelectionProperties(basket)
    const agentId = currentUser?.id ?? 'agent'
    const agentName = currentUser?.name ?? 'Агент'
    const now = new Date().toISOString()
    const created: Selection[] = []

    if (selectedLeadIds.size === 0) {
      // Подборка без привязки к клиенту
      created.push({
        id: newSelId(),
        title: title.trim(),
        clientId: '',
        clientName: '',
        clientPhone: '',
        agentId,
        agentName,
        status: 'draft',
        properties: props,
        portalUrl: `https://portal.baza.sale/s/${newSelId().slice(-12)}`,
        createdAt: now,
        viewCount: 0,
        customization,
      })
    } else {
      for (const leadId of selectedLeadIds) {
        const lead = leadsState.leadPool.find((l) => l.id === leadId)
        if (!lead?.name) continue
        created.push({
          id: newSelId(),
          title: title.trim(),
          clientId: leadId,
          clientName: lead.name,
          clientPhone: mockPhoneForLead(leadId),
          agentId,
          agentName,
          status: 'sent',
          properties: props.map((p) => ({ ...p, id: `${p.id}-${leadId.slice(-6)}` })),
          portalUrl: `https://portal.baza.sale/s/${newSelId().slice(-12)}`,
          createdAt: now,
          sentAt: now,
          viewCount: 0,
          customization,
        })
      }
    }

    if (created.length === 0) return
    prependSelections(created)
    created.forEach((s) => saveSelectionCustomization(s.id, customization))
    setSentOk(true)
    const target = market === 'newbuild' ? selectionsBase : `${selectionsBase}/list`
    setTimeout(() => navigate(target), 600)
  }

  const canSend =
    title.trim().length > 0 &&
    basket.length > 0 &&
    !(market === 'newbuild' && basket.some((b) => b.kind === 'secondary')) &&
    !(market === 'secondary' && basket.some((b) => b.kind === 'primary'))

  return (
    <DashboardShell hideSidebar>
      <div
        className="min-h-full w-full max-w-[1600px] box-border bg-[var(--app-bg)] px-6 py-8 text-[color:var(--app-text)]"
        style={{ fontFamily: "'Montserrat', system-ui, sans-serif" }}
      >
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-[color:var(--divider-subtle)] pb-6">
          <div>
            <h1 className="text-2xl font-normal tracking-tight text-[color:var(--app-text)]">
              {market === 'newbuild' ? 'Новая подборка · новостройки' : 'Новая подборка · вторичка'}
            </h1>
          </div>
          {sentOk && <span className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{tApp('selections.selectionsNewPage.сохранено_переход_к')}</span>}
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_min(440px,42vw)]">
          <div className="space-y-8">
            <section className="rounded-xl border border-[color:var(--hub-card-border)] bg-[var(--hub-card-bg)] p-5 shadow-[inset_0_0_0_1px_var(--hub-card-border)]">
              <label className="block text-xs font-normal uppercase tracking-wider text-[color:var(--hub-desc)]">
                {tApp('selections.selectionsNewPage.название_подборки')}</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={tApp('selections.selectionsNewPage.2к_у_метро_до_8m')}
                className="mt-2 w-full rounded-lg border border-[color:var(--green-border)] bg-[var(--green-deep)] px-3 py-2.5 text-sm text-[color:var(--app-text)] outline-none placeholder:text-[color:var(--app-text-subtle)] focus:border-[color:var(--hub-card-border-hover)]"
              />
            </section>

            {market !== 'newbuild' ? (
            <section className="rounded-xl border border-[color:var(--hub-card-border)] bg-[var(--hub-card-bg)] p-5 shadow-[inset_0_0_0_1px_var(--hub-card-border)]">
              <div className="flex items-center gap-2 text-[color:var(--theme-accent-heading)]">
                <Users className="size-5" />
                <h2 className="text-sm font-normal uppercase tracking-wide">{tApp('selections.selectionsNewPage.получатели_из_лидов')}</h2>
              </div>
              <input
                value={leadQuery}
                onChange={(e) => setLeadQuery(e.target.value)}
                placeholder={tApp('selections.selectionsNewPage.поиск_по_имени_или_i')}
                className="mt-3 w-full rounded-lg border border-[color:var(--green-border)] bg-[var(--green-deep)] px-3 py-2 text-sm text-[color:var(--app-text)] outline-none placeholder:text-[color:var(--app-text-subtle)] focus:border-[color:var(--hub-card-border-hover)]"
              />
              <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-[color:var(--green-border)]">
                {leadRecipients.length === 0 ? (
                  <p className="p-4 text-center text-sm text-[color:var(--app-text-muted)]">{tApp('selections.selectionsNewPage.никого_не_найдено')}</p>
                ) : (
                  leadRecipients.slice(0, 80).map((l) => (
                    <label
                      key={l.id}
                      className="flex cursor-pointer items-center gap-3 border-b border-[color:var(--divider-subtle)] px-3 py-2 last:border-0 hover:bg-[var(--dropdown-hover)]"
                    >
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.has(l.id)}
                        onChange={() => toggleLead(l.id)}
                        className="size-4 accent-[var(--gold)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[color:var(--app-text)]">{l.name}</span>
                      <span className="shrink-0 text-[10px] uppercase text-[color:var(--app-text-subtle)]">{l.id}</span>
                    </label>
                  ))
                )}
              </div>
              <p className="mt-2 text-xs text-[color:var(--app-text-muted)]">{tApp('selections.selectionsNewPage.выбрано')}{selectedLeadIds.size}</p>
            </section>
            ) : null}

            {market !== 'secondary' ? (
            <section className="rounded-xl border border-[color:var(--hub-card-border)] bg-[var(--hub-card-bg)] p-5 shadow-[inset_0_0_0_1px_var(--hub-card-border)]">
              <div className="flex items-center gap-2 text-[color:var(--theme-accent-heading)]">
                <Building2 className="size-5" />
                <h2 className="text-sm font-normal uppercase tracking-wide">{tApp('selections.selectionsNewPage.лоты_новостроек')}</h2>
              </div>

              {/* ЖК-табы */}
              <div className="mt-3 flex flex-wrap gap-2">
                {PRIMARY_COMPLEXES_MOCK.map((c) => {
                  const active = c.id === complexId
                  const countInBasket = basket.filter(
                    (b) => b.kind === 'primary' && b.complex.id === c.id,
                  ).length
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setComplexId(c.id)}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
                        active
                          ? 'border-[color:var(--hub-card-border-hover)] bg-[var(--nav-item-bg-active)] text-[color:var(--theme-accent-heading)]'
                          : 'border-[color:var(--green-border)] bg-transparent text-[color:var(--app-text-muted)] hover:bg-[var(--dropdown-hover)]',
                      )}
                    >
                      <span>{c.name}</span>
                      {countInBasket > 0 && (
                        <span className="rounded bg-[var(--gold)]/20 px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--gold)]">
                          {countInBasket}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Шапка ЖК */}
              {activeComplex && (
                <p className="mt-3 text-xs text-[color:var(--app-text-subtle)]">
                  {activeComplex.developer} · {activeComplex.address}
                </p>
              )}

              {/* Шахматочная сетка лотов */}
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {activeComplex?.lots.map((lot) => {
                  const key = `p:${activeComplex.id}:${lot.id}`
                  const inBasket = basket.some((b) => b.key === key)
                  return (
                    <button
                      key={lot.id}
                      type="button"
                      onClick={() => (inBasket ? setBasket((prev) => prev.filter((b) => b.key !== key)) : addPrimaryLot(lot))}
                      className={cn(
                        'group flex flex-col gap-1 rounded-md border bg-[var(--green-deep)] p-2.5 text-left transition-colors',
                        inBasket
                          ? 'border-[color:var(--gold)] bg-[var(--gold)]/10'
                          : 'border-[color:var(--green-border)] hover:border-[color:var(--hub-card-border-hover)]',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-normal text-[color:var(--app-text)]">{lot.label}</span>
                        {inBasket && <Check className="size-3.5 text-[color:var(--gold)]" />}
                      </div>
                      <span className="text-xs text-[color:var(--hub-body)]">
                        {lot.rooms}{tApp('selections.selectionsNewPage.к')}{lot.area} {tApp('selections.selectionsNewPage.м')}{lot.floor}
                      </span>
                      <span className="text-xs font-medium text-[color:var(--gold)]">{formatPriceUsd(lot.price)}</span>
                      {lot.isPromo && (
                        <span className="mt-1 inline-flex w-fit items-center rounded bg-[var(--gold)]/15 px-1.5 py-0.5 text-base font-medium uppercase tracking-wide text-[color:var(--gold)]">
                          {tApp('selections.selectionsNewPage.акция')}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>
            ) : null}

            {market !== 'newbuild' ? (
            <section className="rounded-xl border border-[color:var(--hub-card-border)] bg-[var(--hub-card-bg)] p-5 shadow-[inset_0_0_0_1px_var(--hub-card-border)]">
              <div className="flex items-center gap-2" style={{ color: MARKET_COLORS.secondary }}>
                <Home className="size-5" />
                <h2 className="text-sm font-normal uppercase tracking-wide">{tApp('selections.selectionsNewPage.вторичка_квартиры')}</h2>
              </div>
              <input
                value={secQuery}
                onChange={(e) => setSecQuery(e.target.value)}
                placeholder={tApp('selections.selectionsNewPage.поиск_по_адресу')}
                className="mt-3 w-full rounded-lg border border-[color:var(--green-border)] bg-[var(--green-deep)] px-3 py-2 text-sm text-[color:var(--app-text)] outline-none placeholder:text-[color:var(--app-text-subtle)] focus:border-[color:var(--hub-card-border-hover)]"
              />
              <div className="mt-4 space-y-3">
                {secondaryFiltered.map((lot) => {
                  const key = `s:${lot.id}`
                  const inBasket = basket.some((b) => b.key === key)
                  return (
                    <div
                      key={lot.id}
                      className="flex gap-3 rounded-lg border border-[color:var(--green-border)] bg-[var(--green-deep)] p-3"
                    >
                      <img src={lot.imageUrl} alt="" className="size-20 shrink-0 rounded-md object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-normal text-[color:var(--app-text)]">{lot.address}</p>
                        <p className="text-xs text-[color:var(--hub-body)]">
                          {lot.rooms}{tApp('selections.selectionsNewPage.к')}{lot.area} {tApp('selections.selectionsNewPage.м')}{lot.floor}
                        </p>
                        <p className="text-xs font-medium text-[color:var(--gold)]">{formatPriceUsd(lot.price)}</p>
                        <button
                          type="button"
                          disabled={inBasket}
                          onClick={() => addSecondaryLot(lot)}
                          className="mt-2 rounded-md border border-sky-500/40 px-3 py-1 text-[11px] font-normal uppercase tracking-wide text-sky-300 hover:bg-sky-500/10 disabled:opacity-40"
                        >
                          {inBasket ? 'В подборке' : 'Добавить'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
            ) : null}

            <section className="rounded-xl border border-[color:var(--hub-card-border)] bg-[var(--hub-card-bg)] p-5 shadow-[inset_0_0_0_1px_var(--hub-card-border)]">
              <h2 className="text-sm font-normal uppercase tracking-wide text-[color:var(--app-text)]">{tApp('selections.selectionsNewPage.порядок_в_подборке')}{basket.length})</h2>
              {basket.length === 0 ? (
                <p className="mt-4 text-sm text-[color:var(--app-text-muted)]">{tApp('selections.selectionsNewPage.пока_пусто')}</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {basket.map((item, i) => (
                    <li
                      key={item.key}
                      className="flex items-center gap-2 rounded-lg border border-[color:var(--green-border)] bg-[var(--green-deep)] px-3 py-2 text-sm text-[color:var(--app-text)]"
                    >
                      <span className="text-xs text-[color:var(--app-text-subtle)]">{i + 1}.</span>
                      <span className="min-w-0 flex-1 truncate">
                        {item.kind === 'primary'
                          ? `${item.complex.name} — ${item.lot.label}`
                          : item.lot.address}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeBasket(i)}
                        className="shrink-0 rounded p-1 text-red-400/80 hover:bg-red-500/10"
                        aria-label={tApp('selections.selectionsNewPage.убрать')}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="flex flex-wrap gap-3 pb-8">
              <button
                type="button"
                disabled={!canSend}
                onClick={handleSend}
                className="alphabase-section-primary disabled:pointer-events-none"
              >
                <Send className="size-4" />
                {market === 'newbuild' ? 'Сохранить подборку' : 'Сформировать и отправить'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setBasket([])
                  setSelectedLeadIds(new Set())
                  setTitle('')
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--green-border)] px-4 py-3 text-sm text-[color:var(--app-text-muted)] hover:bg-[var(--dropdown-hover)]"
              >
                <X className="size-4" />
                {tApp('selections.selectionsNewPage.очистить')}</button>
            </div>
          </div>

          <div className="lg:sticky lg:top-4 lg:self-start space-y-4">
            <SelectionCustomizationPanel
              value={customization}
              groups={AGENCY_CUSTOMIZATION_GROUPS}
              variant={isLightTheme ? 'light' : 'dark'}
              onChange={setCustomization}
            />
            <p className="mb-2 text-center text-[10px] font-normal uppercase tracking-widest text-[color:var(--hub-desc)]">
              {tApp('selections.selectionsNewPage.предпросмотр_письма')}</p>
            <SelectionSendPreview
              title={title}
              recipientLabel={recipientLabel}
              basket={basket}
              agencyName={branding.name || 'Ваше агентство'}
              logoDataUrl={branding.logoDataUrl}
              c={customization}
            />
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}
