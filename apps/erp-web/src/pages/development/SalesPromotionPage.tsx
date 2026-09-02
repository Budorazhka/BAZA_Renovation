import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, Check, Loader2, X } from 'lucide-react'

import { useNavigate } from 'react-router-dom'

import { useCoreStore } from '@/store/useCoreStore'
import { SALES_PROJECT_ID_KEY } from '@/components/development/sales/salesManagementStorage'
import { developmentApi, type PromotionActivation } from '@/services/developmentApi'
import {
  PROMO_DURATIONS as DURATIONS,
  PROMO_MIN_LOCK_MS as MIN_LOCK_MS,
  type PromoDurationId as DurationId,
  promoDurationFactor as durationFactor,
  promoDurationLabel as durationLabel,
} from '@/lib/promoActivations'
import { useI18n } from "@/i18n";

/** Активации текущего проекта в виде map serviceId → запись. */
type ActivationMap = Record<string, PromotionActivation>

type PromoConfig =
  | { kind: 'text'; maxLen: number; placeholder: string; hint: string }
  | { kind: 'mark'; hint: string; options: string[] }

interface PromoService {
  id: string
  label: string
  /** Полноценный маркетинговый ответ на вопрос «зачем тратить на это деньги». */
  pitch: string
  pricePer24h: number
  /** Услуга требует ввода надписи или выбора метки перед активацией. */
  config?: PromoConfig
}

interface PromoGroup {
  id: string
  label: string
  services: PromoService[]
}

const SERVICE_GROUPS: PromoGroup[] = [
  {
    id: 'visibility',
    label: 'Видимость и размещение',
    services: [
      {
        id: 'boost',
        label: 'Поднять в выдаче',
        pitch: 'Свежая карточка тонет среди сотен других — поднятие выводит её в топ выдачи маркетплейса и ERP. В первые сутки это кратно больше показов и заявок, пока интерес к объекту максимальный.',
        pricePer24h: 1,
      },
      {
        id: 'top4_main',
        label: 'Топ-4 на главной',
        pitch: 'Первые четыре слота главной видит каждый посетитель площадки. Это самый тёплый трафик: он доходит до карточки и до контакта заметно чаще, чем из любого другого блока.',
        pricePer24h: 1,
      },
      {
        id: 'main_banner',
        label: 'Большой баннер на главной',
        pitch: 'Полноширинный баннер 1280×400 в карусели — максимальный охват площадки и витрина под ключевой запуск проекта. Формат, который невозможно пролистать мимо.',
        pricePer24h: 5,
      },
      {
        id: 'map_marker',
        label: 'Отметка с графиком на карте',
        pitch: 'Покупатель, выбирающий район, видит вашу динамическую метку прямо на карте поиска. Гео-запросы дают высокую конверсию — человек уже определился с локацией.',
        pricePer24h: 3,
      },
    ],
  },
  {
    id: 'sections',
    label: 'Тематические разделы',
    services: [
      {
        id: 'section_promo',
        label: 'Раздел «Акции»',
        pitch: 'Блок скидок на главной собирает самый горячий трафик — тех, кто пришёл за выгодой и готов к сделке. Конверсия в заявку здесь выше средней по площадке.',
        pricePer24h: 1,
      },
      {
        id: 'section_invest',
        label: 'Раздел «Для инвесторов»',
        pitch: 'Точечный показ аудитории с готовым бюджетом и коротким циклом решения. Инвестор считает доходность, а не выбирает планировку — такие сделки закрываются быстрее.',
        pricePer24h: 2,
      },
      {
        id: 'section_launch',
        label: 'Раздел «Старт продаж»',
        pitch: 'Блок новинок и предстартовых лотов создаёт ажиотаж ещё до открытия продаж. Вы собираете предзаявки и контактную базу, чтобы стартовать с очередью, а не с нуля.',
        pricePer24h: 1,
      },
    ],
  },
  {
    id: 'card',
    label: 'Оформление карточки',
    services: [
      {
        id: 'custom_text',
        label: 'Надпись на карточке',
        pitch: 'Крупная надпись поверх фото цепляет глаз в ленте и поднимает CTR на 30–40% против обычной карточки. Больше кликов при том же бюджете — дешевле каждая заявка.',
        pricePer24h: 10,
        config: {
          kind: 'text',
          maxLen: 12,
          placeholder: 'СУПЕР ЦЕНА',
          hint: 'Текст появится крупно поверх фото карточки. До 12 символов.',
        },
      },
      {
        id: 'object_mark',
        label: 'Метка на объекте',
        pitch: 'Цветная метка «Супер цена» или другая по выбору — визуальный якорь, который выделяет карточку среди десятков соседних предложений. Глаз цепляется за неё первой.',
        pricePer24h: 1,
        config: {
          kind: 'mark',
          hint: 'Метка появится в углу карточки объекта.',
          options: ['Супер цена', 'Хит продаж', 'Новинка', 'Последние лоты', 'Скидка', 'Подарок при покупке'],
        },
      },
    ],
  },
  {
    id: 'brand',
    label: 'Брендинг и партнёры',
    services: [
      {
        id: 'white_header',
        label: 'Белый хедер',
        pitch: 'Брендовая полоса в верхней панели платформы работает на всех страницах 24/7. Постоянное присутствие формирует узнаваемость и доверие к застройщику.',
        pricePer24h: 10,
      },
      {
        id: 'developer_logo',
        label: 'Логотип застройщика в хедере',
        pitch: 'Логотип закреплён в навигации площадки — премиум-имидж и узнаваемость во всех разделах. Клиент видит бренд раньше, чем конкретный объект.',
        pricePer24h: 5,
      },
      {
        id: 'realtor_outreach',
        label: 'Обращение к риелторам',
        pitch: 'Адресная рассылка по партнёрской сети BAZA активирует риелторов, у которых уже есть клиенты на ваш сегмент. Это сделки от тех, кто готов покупать прямо сейчас.',
        pricePer24h: 10,
      },
    ],
  },
]

const SERVICES: PromoService[] = SERVICE_GROUPS.flatMap((g) => g.services)

// Компактный обратный отсчёт HH:MM:SS (с префиксом «Nд» при сроке больше суток)
function formatCountdown(targetMs: number, now: number): string {
  const totalSec = Math.max(0, Math.floor((targetMs - now) / 1000))
  const days = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  const hms = `${pad(h)}:${pad(m)}:${pad(s)}`
  return days > 0 ? `${days}д ${hms}` : hms
}

const GRID_COLS = 'grid-cols-[minmax(160px,1fr)_minmax(320px,2.7fr)_minmax(120px,0.62fr)_minmax(80px,0.4fr)_minmax(190px,0.95fr)]'

export function SalesPromotionPage() {
    const { t } = useI18n();
  const projects = useCoreStore((s) => s.projects)
  const navigate = useNavigate()

  const displayProjects = useMemo(() => {
    const active = projects.filter((p) => p.status !== 'draft')
    return active.length > 0 ? active : projects
  }, [projects])

  const [projectId, setProjectId] = useState(() => {
    const stored = localStorage.getItem(SALES_PROJECT_ID_KEY)
    if (stored && displayProjects.some((p) => p._id === stored)) return stored
    return displayProjects[0]?._id ?? ''
  })

  useEffect(() => {
    if (projectId) localStorage.setItem(SALES_PROJECT_ID_KEY, projectId)
  }, [projectId])

  const project = useMemo(
    () => displayProjects.find((p) => p._id === projectId) ?? displayProjects[0] ?? null,
    [projectId, displayProjects],
  )

  const [activations, setActivations] = useState<ActivationMap>({})
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busyService, setBusyService] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [selectedDur, setSelectedDur] = useState<Record<string, DurationId>>({})
  const [now, setNow] = useState(() => Date.now())
  const [confirmServiceId, setConfirmServiceId] = useState<string | null>(null)
  const [configValue, setConfigValue] = useState('')

  const openConfirm = (serviceId: string) => {
    setActionError(null)
    setConfigValue('')
    setConfirmServiceId(serviceId)
  }

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  // Загрузка активных услуг проекта с бэкенда.
  const reload = useCallback(async (complexId: string) => {
    setLoading(true)
    setLoadError(null)
    try {
      const resp = await developmentApi.getPromotions(complexId)
      if (!resp.success) throw new Error(resp.message || 'Не удалось загрузить услуги')
      const map: ActivationMap = {}
      for (const rec of resp.data.activations) map[rec.serviceId] = rec
      setActivations(map)
    } catch (err: any) {
      setActivations({})
      setLoadError(err?.response?.data?.message || err?.message || 'Не удалось загрузить услуги продвижения')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!project?._id) return
    void reload(project._id)
  }, [project?._id, reload])

  // Локально убираем истёкшие активации (бэкенд их тоже не отдаёт после TTL).
  useEffect(() => {
    setActivations((prev) => {
      const survivors = Object.fromEntries(
        Object.entries(prev).filter(([, rec]) => new Date(rec.expiresAt).getTime() > now),
      )
      return Object.keys(survivors).length === Object.keys(prev).length ? prev : survivors
    })
  }, [now])

  const projectActivations = activations

  const getSelDur = (serviceId: string): DurationId => selectedDur[serviceId] ?? '24h'

  const setSelDurFor = (serviceId: string, dur: DurationId) => {
    setSelectedDur((prev) => ({ ...prev, [serviceId]: dur }))
  }

  // До активации — просто выбор длительности (локально). Для активной услуги —
  // PATCH на бэкенд, который пересчитывает срок и цену.
  const changeDuration = async (serviceId: string, dur: DurationId) => {
    const rec = projectActivations[serviceId]
    if (!rec || !project) {
      setSelDurFor(serviceId, dur)
      return
    }
    setBusyService(serviceId)
    setActionError(null)
    try {
      const resp = await developmentApi.changePromotionDuration(project._id, serviceId, dur)
      if (!resp.success) throw new Error(resp.message || 'Не удалось изменить длительность')
      setActivations((prev) => ({ ...prev, [serviceId]: resp.data }))
    } catch (err: any) {
      setActionError(err?.response?.data?.message || err?.message || 'Не удалось изменить длительность')
    } finally {
      setBusyService(null)
    }
  }

  const activate = async (serviceId: string, config?: string) => {
    if (!project) return
    setBusyService(serviceId)
    setActionError(null)
    try {
      const resp = await developmentApi.activatePromotion(project._id, {
        serviceId,
        durationId: getSelDur(serviceId),
        ...(config ? { config } : {}),
      })
      if (!resp.success) throw new Error(resp.message || 'Не удалось активировать услугу')
      setActivations((prev) => ({ ...prev, [serviceId]: resp.data }))
      setConfirmServiceId(null)
    } catch (err: any) {
      setActionError(err?.response?.data?.message || err?.message || 'Не удалось активировать услугу')
    } finally {
      setBusyService(null)
    }
  }

  const deactivate = async (serviceId: string) => {
    if (!project) return
    const rec = projectActivations[serviceId]
    if (!rec) return
    const activatedMs = new Date(rec.activatedAt).getTime()
    if (now < activatedMs + MIN_LOCK_MS) return
    setBusyService(serviceId)
    setActionError(null)
    try {
      const resp = await developmentApi.deactivatePromotion(project._id, serviceId)
      if (!resp.success) throw new Error(resp.message || 'Не удалось отключить услугу')
      setActivations((prev) => {
        const next = { ...prev }
        delete next[serviceId]
        return next
      })
    } catch (err: any) {
      setActionError(err?.response?.data?.message || err?.message || 'Не удалось отключить услугу')
    } finally {
      setBusyService(null)
    }
  }

  if (!project) {
    return (
      <div className="flex h-64 items-center justify-center rounded-[6px] border border-[color:var(--installments-border-inactive)] bg-[var(--installments-empty-bg)] text-[16px] text-[color:var(--installments-text-muted)]">
        {t('development.salesPromotionPage.нет_доступных_проект')}</div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 rounded-[6px] border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] p-4">
        <Building2 size={18} className="shrink-0 text-[color:var(--gold)]" />
        <span className="text-[16px] text-[color:var(--installments-text-muted)]">{t('development.salesPromotionPage.объект')}</span>
        <select
          value={project._id}
          onChange={(e) => setProjectId(e.target.value)}
          className="h-10 rounded-[4px] border border-[color:var(--installments-select-border)] bg-[var(--installments-select-bg)] px-3 text-[16px] text-[color:var(--installments-text)] outline-none focus:border-[color:var(--cb-ctrl-border-hover)]"
        >
          {displayProjects.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <h2 className="text-[24px] font-normal leading-tight tracking-[-0.02em] text-[color:var(--installments-text)]">{t('development.salesPromotionPage.продвижение')}</h2>
        {loading && <Loader2 size={18} className="animate-spin text-[color:var(--gold)]" />}
      </div>

      {loadError && (
        <div className="rounded-[6px] bg-[rgba(255,180,171,0.1)] px-4 py-3 text-[16px] text-[#ffb4ab] shadow-[inset_0_0_0_1px_rgba(255,180,171,0.25)]">
          {loadError}
        </div>
      )}

      {actionError && (
        <div className="rounded-[6px] bg-[rgba(255,180,171,0.1)] px-4 py-3 text-[16px] text-[#ffb4ab] shadow-[inset_0_0_0_1px_rgba(255,180,171,0.25)]">
          {actionError}
        </div>
      )}

      <div className="overflow-x-auto rounded-[6px] border border-[color:var(--workspace-row-border)]">
        <div className={`grid ${GRID_COLS} min-w-[1140px] items-stretch bg-[var(--promo-table-header-bg)] border-b border-[color:var(--workspace-row-border)]`}>
          <div className="flex items-center justify-center px-4 py-3.5 text-[16px] font-normal uppercase tracking-[0.08em] text-[color:var(--theme-accent-heading)] border-r border-[color:var(--workspace-row-border)]">{t('development.salesPromotionPage.услуга')}</div>
          <div className="flex items-center justify-center px-4 py-3.5 text-[16px] font-normal uppercase tracking-[0.08em] text-[color:var(--theme-accent-heading)] border-r border-[color:var(--workspace-row-border)]">{t('development.salesPromotionPage.зачем_это_нужно')}</div>
          <div className="flex items-center justify-center px-4 py-3.5 text-[16px] font-normal uppercase tracking-[0.08em] text-[color:var(--theme-accent-heading)] border-r border-[color:var(--workspace-row-border)]">{t('development.salesPromotionPage.длительность')}</div>
          <div className="flex items-center justify-center px-4 py-3.5 text-[16px] font-normal uppercase tracking-[0.08em] text-[color:var(--theme-accent-heading)] border-r border-[color:var(--workspace-row-border)]">{t('development.salesPromotionPage.цена')}</div>
          <div className="flex items-center justify-center px-4 py-3.5 text-[16px] font-normal uppercase tracking-[0.08em] text-[color:var(--theme-accent-heading)]">{t('development.salesPromotionPage.активация')}</div>
        </div>

        <div className="min-w-[1140px]">
          {SERVICE_GROUPS.map((group, groupIdx) => (
            <Fragment key={group.id}>
              {groupIdx > 0 && (
                <div className="flex items-center gap-3 border-y border-[color:var(--workspace-row-border)] bg-[var(--promo-group-bg)] px-4 py-3.5">
                  <span className="h-3 w-1 rounded-full bg-[color:var(--gold)]" aria-hidden />
                  <span className="text-[15px] font-normal uppercase tracking-[0.1em] text-[color:var(--promo-group-text)]">{group.label}</span>
                </div>
              )}
              {group.services.map((svc, svcIdx) => {
                const idx = groupIdx * 100 + svcIdx
                const rec = projectActivations[svc.id]
                const isActive = Boolean(rec)
                const dur: DurationId = isActive ? rec!.durationId : getSelDur(svc.id)
                const price = isActive ? rec!.priceUsd : svc.pricePer24h * durationFactor(dur)
                const activatedMs = rec ? new Date(rec.activatedAt).getTime() : 0
                const expiresMs = rec ? new Date(rec.expiresAt).getTime() : 0
                const unlockAt = activatedMs + MIN_LOCK_MS
                const locked = isActive && now < unlockAt
                const busy = busyService === svc.id

                return (
                  <div
                    key={svc.id}
                    className={`promo-row group/row grid ${GRID_COLS} min-h-[108px] items-center border-b border-[color:var(--workspace-row-border)] ${idx % 2 === 0 ? 'bg-[var(--promo-row-odd)]' : 'bg-[var(--promo-row-even)]'}`}
                  >
                    <div className="flex items-center px-4 py-4 border-r border-[color:var(--workspace-row-border)]">
                      <span className="text-[18px] tracking-[-0.01em] text-[color:var(--installments-text)]">{svc.label}</span>
                    </div>

                    <div className="flex items-center px-4 py-4 border-r border-[color:var(--workspace-row-border)]">
                      <p className="line-clamp-3 text-[16px] leading-snug text-[color:var(--installments-text-muted)]">{svc.pitch}</p>
                    </div>

                    <div className="flex items-center justify-center px-4 py-4 border-r border-[color:var(--workspace-row-border)]">
                      <select
                        value={dur}
                        disabled={busy || loading}
                        onChange={(e) => void changeDuration(svc.id, e.target.value as DurationId)}
                        className="h-10 w-full max-w-[112px] rounded-[4px] border border-[color:var(--installments-select-border)] bg-[var(--installments-select-bg)] px-2.5 text-[16px] text-[color:var(--installments-text)] outline-none focus:border-[color:var(--cb-ctrl-border-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {DURATIONS.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center justify-center px-4 py-4 border-r border-[color:var(--workspace-row-border)]">
                      <div className="text-[22px] font-normal tabular-nums text-[color:var(--gold)]">${price}</div>
                    </div>

                    <div className="flex items-center justify-center px-4 py-4">
                      {isActive ? (
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex items-center gap-2">
                            <span className="promo-active-check flex h-6 w-6 items-center justify-center rounded-full bg-[#e6c364] text-[#072821]">
                              <Check size={15} strokeWidth={3} />
                            </span>
                            <span className="text-[18px] font-normal leading-none text-[color:var(--installments-text)]">{t('development.salesPromotionPage.активно')}</span>
                          </div>
                          <span className="text-[20px] tabular-nums leading-none text-[color:var(--gold)]">{formatCountdown(expiresMs, now)}</span>
                          {rec?.config && (
                            <span className="max-w-[180px] truncate text-[16px] text-[color:var(--installments-text-muted)]">«{rec.config}»</span>
                          )}
                          {locked ? null : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void deactivate(svc.id)}
                              className="flex items-center gap-1.5 text-[18px] font-medium text-[#e6c364] underline-offset-4 transition-colors hover:text-[rgba(230,195,100,0.8)] hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {busy && <Loader2 size={15} className="animate-spin" />}
                              {t('development.salesPromotionPage.отключить')}</button>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={busy || loading}
                          onClick={() => {
                            if (svc.id === 'realtor_outreach') {
                              navigate(`/dashboard/development/management/broadcasts?project=${project._id}`)
                            } else {
                              openConfirm(svc.id)
                            }
                          }}
                          className="flex w-full items-center justify-center gap-2 rounded-[6px] bg-transparent px-4 py-3.5 text-[18px] font-medium text-[#e6c364] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.35)] transition-all hover:bg-[rgba(230,195,100,0.06)] hover:shadow-[inset_0_0_0_1px_rgba(201,168,76,0.75)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {busy && <Loader2 size={16} className="animate-spin" />}
                          {t('development.salesPromotionPage.активировать')}</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {confirmServiceId && (() => {
        const svc = SERVICES.find((s) => s.id === confirmServiceId)
        if (!svc) return null
        const dur = getSelDur(svc.id)
        const price = svc.pricePer24h * durationFactor(dur)
        const trimmed = configValue.trim()
        const configReady = !svc.config || trimmed.length > 0
        const busy = busyService === svc.id
        return (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={() => setConfirmServiceId(null)}
          >
            <div
              className="w-full max-w-[460px] overflow-hidden rounded-[6px] border border-[color:var(--installments-border-active)] bg-[var(--promo-modal-bg)] shadow-[0_24px_64px_rgba(0,0,0,0.35)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[color:var(--workspace-row-border)] px-5 py-4">
                <div>
                  <div className="text-[12px] font-normal uppercase tracking-[0.08em] text-[color:var(--gold)]">{t('development.salesPromotionPage.подтверждение')}</div>
                  <div className="text-[20px] tracking-[-0.01em] text-[color:var(--installments-text)]">{svc.label}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmServiceId(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-[4px] text-[color:var(--installments-text-muted)] hover:bg-[var(--installments-btn-hover-bg)] hover:text-[color:var(--installments-text)]"
                  aria-label={t('development.salesPromotionPage.закрыть')}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="px-5 py-5">
                {svc.config && (
                  <div className="mt-4">
                    {svc.config.kind === 'text' ? (
                      <>
                        <label className="mb-2 block text-[16px] text-[color:var(--installments-text-muted)]">{t('development.salesPromotionPage.надпись_на_карточке')}</label>
                        <input
                          type="text"
                          value={configValue}
                          maxLength={svc.config.maxLen}
                          placeholder={svc.config.placeholder}
                          onChange={(e) => setConfigValue(e.target.value)}
                          className="h-11 w-full rounded-[4px] border border-[color:var(--installments-select-border)] bg-[var(--installments-select-bg)] px-3 text-[18px] uppercase tracking-[0.04em] text-[color:var(--installments-text)] outline-none transition-colors placeholder:normal-case placeholder:tracking-normal placeholder:text-[color:var(--installments-label)] focus:border-[color:var(--cb-ctrl-border-hover)]"
                        />
                        <div className="mt-2 flex items-center justify-between text-[16px] text-[color:var(--installments-text-muted)]">
                          <span>{svc.config.hint}</span>
                          <span className="tabular-nums">{configValue.length}/{svc.config.maxLen}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <label className="mb-2 block text-[16px] text-[color:var(--installments-text-muted)]">{t('development.salesPromotionPage.выберите_метку')}</label>
                        <div className="flex flex-wrap gap-2">
                          {svc.config.options.map((opt) => {
                            const selected = configValue === opt
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => setConfigValue(opt)}
                                className={`rounded-[4px] border px-3.5 py-2 text-[16px] transition-colors ${
                                  selected
                                    ? 'border-[color:var(--installments-border-active)] bg-[color-mix(in_srgb,var(--gold)_12%,transparent)] text-[color:var(--gold)]'
                                    : 'border-[color:var(--installments-border-inactive)] text-[color:var(--installments-text-muted)] hover:text-[color:var(--installments-text)]'
                                }`}
                              >
                                {opt}
                              </button>
                            )
                          })}
                        </div>
                        <div className="mt-2 text-[16px] text-[color:var(--installments-text-muted)]">{svc.config.hint}</div>
                      </>
                    )}
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between gap-3 rounded-[6px] border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-4 py-3">
                  <div className="text-[16px] text-[color:var(--installments-text-muted)]">{t('development.salesPromotionPage.длительность')}</div>
                  <div className="text-[18px] font-normal tabular-nums text-[color:var(--installments-text)]">{durationLabel(dur)}</div>
                </div>

                <div className="mt-2 flex items-center justify-between gap-3 rounded-[6px] border border-[color:var(--installments-border-active)] bg-[color-mix(in_srgb,var(--gold)_6%,transparent)] px-4 py-3">
                  <div className="text-[16px] text-[color:var(--installments-text-muted)]">{t('development.salesPromotionPage.к_списанию')}</div>
                  <div className="text-[24px] font-normal tabular-nums text-[color:var(--gold)]">${price}</div>
                </div>

                {actionError && (
                  <p className="mt-3 rounded-[4px] bg-[rgba(255,180,171,0.1)] px-3 py-2 text-[16px] text-[#ffb4ab] shadow-[inset_0_0_0_1px_rgba(255,180,171,0.25)]">
                    {actionError}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[color:var(--workspace-row-border)] px-5 py-4">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmServiceId(null)}
                  className="rounded-[4px] px-4 py-2 text-[16px] text-[color:var(--installments-text-muted)] hover:bg-[var(--installments-btn-hover-bg)] hover:text-[color:var(--installments-text)] disabled:cursor-not-allowed disabled:opacity-[0.45]"
                >
                  {t('development.salesPromotionPage.отмена')}</button>
                <button
                  type="button"
                  disabled={!configReady || busy}
                  onClick={() => void activate(svc.id, svc.config ? trimmed : undefined)}
                  className="flex items-center gap-2 rounded-[4px] bg-[#e6c364] px-4 py-2 text-[16px] font-normal text-[#072821] transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-[0.45]"
                >
                  {busy && <Loader2 size={16} className="animate-spin" />}
                  {t('development.salesPromotionPage.активировать_за')}{price}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
