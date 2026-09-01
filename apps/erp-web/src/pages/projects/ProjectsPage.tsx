import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Building2, MapPin, Plus, RefreshCw, X } from 'lucide-react'
import { developersApi, type DeveloperPayload, type DeveloperProfile } from '@/services/developersApi'
import { developmentsApiV2, type DevelopmentV2 } from '@/services/developmentsApiV2'
import { useRolePermissions } from '@/hooks/useRolePermissions'
import { optionLabel } from '@/lib/project-options'
import { useI18n } from "@/i18n";

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })

function formatDate(value: string | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return DATE_FMT.format(d)
}

const STATUS_LABEL: Record<DevelopmentV2['status'], string> = {
  draft: 'Черновик',
  active: 'Активен',
  archived: 'В архиве',
}

const STATUS_DOT: Record<DevelopmentV2['status'], string> = {
  draft: 'bg-[color:var(--app-text-muted)]',
  active: 'bg-[var(--gold)]',
  archived: 'bg-[color:var(--mint,#b4ccc3)]',
}

/**
 * D-02 (26.08.2026): список ЖК читает НАПРЯМУЮ из developmentsApiV2.list()
 * (НЕ через useCoreStore.fetchProjects — тот подмешивает PROJECTS_MOCK и
 * возвращает legacy IProject с полями, которых в Development нет). Карточка
 * показывает только реальные поля нового Development-агрегата: name,
 * city/address, status, classType, даты (при наличии).
 */
export function ProjectsPage() {
  const { t } = useI18n();
  const { isManagementPosition } = useRolePermissions()
  const navigate = useNavigate()

  const [projects, setProjects] = useState<DevelopmentV2[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadTrigger, setReloadTrigger] = useState<number>(0)
  const isMountedRef = useRef(true)

  // Профиль компании (developer-запись команды) — не связан с Development,
  // отдельный legacy-эндпоинт, кнопка «Профиль компании» вне scope этой задачи.
  const [companyProfile, setCompanyProfile] = useState<DeveloperProfile | null>(null)
  const [companyOpen, setCompanyOpen] = useState(false)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const loadProjects = useCallback(() => {
    setLoading(true)
    setError(null)
    developmentsApiV2
      .list({ limit: 100 })
      .then(({ items }) => {
        if (!isMountedRef.current) return
        setProjects(items)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (!isMountedRef.current) return
        setProjects([])
        const anyErr = err as { response?: { data?: { error?: { message?: string }; message?: string } }; message?: string }
        const msg =
          anyErr?.response?.data?.error?.message ??
          anyErr?.response?.data?.message ??
          (err instanceof Error ? err.message : 'Не удалось загрузить список ЖК')
        setError(msg)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects, reloadTrigger])

  useEffect(() => {
    void developersApi
      .me()
      .then((profile) => setCompanyProfile(profile))
      .catch(() => {
        /* API застройщиков недоступен — кнопка профиля просто не показывается */
      })
  }, [])

  function handleRetry() {
    setReloadTrigger((v) => v + 1)
  }

  function openCreateComplex() {
    navigate('/dashboard/development/projects/new')
  }

  return (
    <div className="felt-content">
      <div className="flex flex-col gap-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[44px] font-normal tracking-[-0.02em] text-[color:var(--installments-text)]">{t('projects.projectsPage.объекты_жк')}</h1>
            <p className="mt-1 text-[19px] font-normal text-[color:var(--installments-text-muted)]">
              {loading ? 'Загрузка…' : projects.length > 0 ? `${projects.length} объект${projects.length === 1 ? '' : projects.length < 5 ? 'а' : 'ов'}` : 'Нет добавленных объектов'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isManagementPosition && companyProfile && (
              <button
                type="button"
                onClick={() => setCompanyOpen(true)}
                className="flex items-center gap-2 rounded-md border border-[color:var(--installments-border-inactive)] bg-transparent px-5 py-3 text-[19px] font-normal text-[color:var(--installments-text)] hover:bg-[var(--installments-empty-bg)]"
              >
                <Building2 className="size-4" />
                Профиль компании</button>
            )}
            {isManagementPosition && (
              <button
                type="button"
                onClick={openCreateComplex}
                className="flex items-center gap-2 rounded-md border border-[color:var(--installments-border-inactive)] bg-[var(--installments-btn-hover-bg)] px-5 py-3 text-[19px] font-normal text-[color:var(--installments-text)] hover:bg-[var(--installments-empty-bg)]"
              >
                <Plus className="size-4" />
                {t('projects.projectsPage.добавить_жк')}</button>
            )}
          </div>
        </div>

        {/* Состояния: loading / error / empty / список */}
        {loading ? (
          <div
            data-testid="projects-loading"
            className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-md bg-[var(--installments-empty-bg)] p-12 text-center border border-[color:var(--installments-border-inactive)]"
          >
            <div className="relative size-10">
              <span className="absolute inset-0 rounded-full border-2 border-[color:color-mix(in_srgb,var(--gold)_20%,transparent)]" />
              <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--gold)]" />
            </div>
            <p className="text-[19px] font-normal text-[color:var(--installments-text-muted)]">Загрузка объектов…</p>
          </div>
        ) : error ? (
          <div
            data-testid="projects-error"
            className="flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-md bg-[var(--installments-empty-bg)] p-12 text-center border border-[color:var(--installments-border-inactive)]"
          >
            <div className="flex size-12 items-center justify-center rounded-full bg-rose-500/15 text-rose-300">
              <AlertCircle className="size-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-[19px] font-normal text-[color:var(--installments-text)]">Ошибка загрузки объектов</h2>
              <p className="max-w-md text-[16px] font-normal text-[color:var(--installments-text-muted)]">{error}</p>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="flex items-center gap-2 rounded-md border border-[color:var(--gold)] bg-[color-mix(in_srgb,var(--gold)_20%,transparent)] px-5 py-3 text-[16px] font-medium text-[color:var(--installments-text)] hover:bg-[color-mix(in_srgb,var(--gold)_30%,transparent)]"
            >
              <RefreshCw className="size-4" />
              Повторить
            </button>
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-md bg-[var(--installments-empty-bg)] p-12 text-center border border-[color:var(--installments-border-inactive)]">
            <Building2 className="mx-auto size-12 text-[color:var(--installments-text-muted)]" />
            <p className="mt-3 text-[19px] font-normal text-[color:var(--installments-text)]">{t('projects.projectsPage.нет_добавленных_объе')}</p>
            {isManagementPosition && (
              <button
                type="button"
                onClick={openCreateComplex}
                className="mt-3 text-[17px] font-normal text-[color:var(--installments-text-muted)] hover:text-[color:var(--installments-text)] hover:underline"
              >
                {t('projects.projectsPage.добавить_первый_жк')}</button>
            )}
          </div>
        ) : (
          <div data-testid="projects-list" className="flex flex-col gap-4">
            {projects.map((project) => (
              <DevelopmentCard
                key={project._id}
                t={t}
                development={project}
                onManage={(id) => navigate(`/dashboard/development/projects/${id}/management-v2`)}
              />
            ))}
          </div>
        )}
      </div>

      {companyOpen && companyProfile && (
        <CompanyProfileModal
          profile={companyProfile}
          onClose={() => setCompanyOpen(false)}
          onSaved={(updated) => {
            setCompanyProfile(updated)
            setCompanyOpen(false)
          }}
        />
      )}
    </div>
  )
}

// ─── Карточка ЖК (только реальные поля Development) ─────────────────────────

function DevelopmentCard({ development, t, onManage }: {
  development: DevelopmentV2
  t: ReturnType<typeof useI18n>['t']
  onManage: (developmentId: string) => void
}) {
  const cityLabel = optionLabel(t, 'cities', development.location.city) || development.location.city
  const countryLabel = optionLabel(t, 'countries', development.location.country) || development.location.country
  const addressLine = development.location.address
    ? `${countryLabel}, ${cityLabel}, ${development.location.address}`
    : `${countryLabel}, ${cityLabel}`

  return (
    <div className="rounded-md bg-[var(--green-card)] p-5 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--gold)_14%,transparent)] text-[color:var(--gold)]">
            <Building2 className="size-5" />
          </div>
          <div>
            <h2 className="text-[24px] font-medium tracking-[-0.02em] text-[color:var(--app-text)]">{development.name}</h2>
            <p className="mt-1 flex items-center gap-1.5 text-[16px] font-normal text-[color:var(--app-text-muted)]">
              <MapPin className="size-4 shrink-0" />
              {addressLine}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-sm bg-[rgba(3,29,22,0.5)] px-3 py-1.5">
          <span className={`size-3 rounded-full ${STATUS_DOT[development.status]}`} />
          <span className="text-[16px] font-normal text-[color:var(--app-text)]">{STATUS_LABEL[development.status]}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-[16px] font-normal text-[color:var(--app-text-muted)]">
        {development.classType && (
          <span>Класс: <span className="text-[color:var(--app-text)]">{optionLabel(t, 'classTypes', development.classType) || development.classType}</span></span>
        )}
        {development.startDate && <span>Старт: <span className="text-[color:var(--app-text)]">{formatDate(development.startDate)}</span></span>}
        {development.completionDate && <span>Сдача: <span className="text-[color:var(--app-text)]">{formatDate(development.completionDate)}</span></span>}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => onManage(development._id)}
          className="flex items-center gap-2 rounded-sm border border-[color:var(--green-border)] bg-transparent px-4 py-2 text-[16px] font-normal text-[color:var(--app-text-muted)] hover:bg-[color-mix(in_srgb,var(--gold)_10%,transparent)] hover:text-[color:var(--app-text)]"
        >
          Управление структурой
        </button>
      </div>
    </div>
  )
}

// ─── Профиль компании (developer-запись команды) ────────────────────────────

const cpLabel: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 500, color: 'var(--workspace-text-dim)', marginBottom: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }
const cpInput: React.CSSProperties = { height: 34, width: '100%', borderRadius: 4, border: '1px solid var(--green-border)', background: 'var(--green-deep)', color: 'var(--workspace-text)', fontSize: 12, padding: '0 10px', outline: 'none' }

/** Без схемы URL невалиден для бэкенда (`new URL()`) — дописываем http://. */
function normalizeWebsite(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
}

// Те же ограничения, что валидирует бэкенд (validateImageFile).
const LOGO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const LOGO_MAX_SIZE = 5 * 1024 * 1024 // 5MB

/**
 * Попап редактирования профиля компании — все поля developer-записи, кроме
 * системных (created/updated/rating/author). Стиль — как у формы сотрудника
 * на странице «Команда».
 */
function CompanyProfileModal({ profile, onClose, onSaved }: {
  profile: DeveloperProfile
  onClose: () => void
  onSaved: (updated: DeveloperProfile) => void
}) {
  const [form, setForm] = useState({
    title: profile.title ?? '',
    email: profile.email ?? '',
    contactPhone: profile.contactPhone ?? '',
    contactTelegram: profile.contactTelegram ?? '',
    contactWhatsapp: profile.contactWhatsapp ?? '',
    website: profile.website ?? '',
    description: profile.description ?? '',
  })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string>(profile.image ?? '')
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!LOGO_MIME_TYPES.includes(file.type)) {
      setError('Логотип: только JPEG, PNG, GIF или WebP')
      return
    }
    if (file.size > LOGO_MAX_SIZE) {
      setError('Логотип: файл больше 5 МБ')
      return
    }
    setError(null)
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  async function save() {
    if (!form.title.trim()) { setError('Название компании обязательно'); return }
    if (!form.email.trim()) { setError('Email обязателен'); return }
    setSaving(true)
    setError(null)
    try {
      const payload: DeveloperPayload = {
        title: form.title.trim(),
        email: form.email.trim(),
        contactPhone: form.contactPhone.trim(),
        contactTelegram: form.contactTelegram.trim(),
        contactWhatsapp: form.contactWhatsapp.trim(),
        website: normalizeWebsite(form.website),
        description: form.description.trim(),
      }
      const updated = await developersApi.update(profile._id, payload, logoFile)
      onSaved(updated)
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Не удалось сохранить профиль компании')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: 24 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(680px, 94vw)', maxHeight: '92vh', background: 'var(--green-card)', borderRadius: 8, boxShadow: 'inset 0 0 0 1px rgba(201,168,76,0.18), 0 12px 48px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {/* Шапка */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', background: 'var(--green-deep)' }}>
          <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 8, background: 'color-mix(in srgb, var(--gold) 14%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold)' }}>
            <Building2 size={18} />
          </div>
          <span style={{ flex: 1, fontSize: 16, fontWeight: 500, color: 'var(--workspace-text)' }}>Профиль компании</span>
          <button type="button" onClick={onClose} aria-label="Закрыть" style={{ padding: 6, color: 'var(--workspace-text-dim)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Тело */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={cpLabel}>Название компании *</label>
              <input style={cpInput} value={form.title} onChange={set('title')} placeholder="Development Group" />
            </div>
            <div>
              <label style={cpLabel}>Email *</label>
              <input style={cpInput} type="email" value={form.email} onChange={set('email')} placeholder="info@company.com" />
            </div>
            <div>
              <label style={cpLabel}>Телефон</label>
              <input style={cpInput} value={form.contactPhone} onChange={set('contactPhone')} placeholder="+995 ..." />
            </div>
            <div>
              <label style={cpLabel}>Telegram</label>
              <input style={cpInput} value={form.contactTelegram} onChange={set('contactTelegram')} placeholder="@company" />
            </div>
            <div>
              <label style={cpLabel}>WhatsApp</label>
              <input style={cpInput} value={form.contactWhatsapp} onChange={set('contactWhatsapp')} placeholder="+995 ..." />
            </div>
            <div>
              <label style={cpLabel}>Сайт</label>
              <input
                style={cpInput}
                value={form.website}
                onChange={set('website')}
                onBlur={() => setForm((prev) => ({ ...prev, website: normalizeWebsite(prev.website) }))}
                placeholder="company.com"
              />
            </div>
          </div>
          <div>
            <label style={cpLabel}>Логотип</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Логотип компании"
                  style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--green-border)', background: 'var(--green-deep)' }}
                />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: 8, border: '1px dashed var(--green-border)', background: 'var(--green-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--workspace-text-dim)' }}>
                  <Building2 size={22} />
                </div>
              )}
              <input ref={logoInputRef} type="file" accept={LOGO_MIME_TYPES.join(',')} onChange={pickLogo} style={{ display: 'none' }} />
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                style={{ height: 34, padding: '0 14px', borderRadius: 4, border: '1px solid var(--green-border)', background: 'transparent', color: 'var(--workspace-text)', fontSize: 12, cursor: 'pointer' }}
              >
                Загрузить
              </button>
              <span style={{ fontSize: 11, color: 'var(--workspace-text-dim)' }}>JPEG, PNG, GIF или WebP, до 5 МБ</span>
            </div>
          </div>
          <div>
            <label style={cpLabel}>Описание</label>
            <textarea
              style={{ ...cpInput, height: 88, padding: '8px 10px', resize: 'vertical' }}
              value={form.description}
              onChange={set('description')}
              placeholder="Коротко о компании"
            />
          </div>
          {error && <div style={{ fontSize: 12, color: '#ffb4ab' }}>{error}</div>}
        </div>

        {/* Футер */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--hub-card-border)', background: 'var(--green-deep)' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ height: 38, padding: '0 16px', borderRadius: 4, border: '1px solid var(--green-border)', background: 'transparent', color: 'var(--workspace-text-dim)', fontSize: 14, cursor: 'pointer' }}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            style={{ height: 38, padding: '0 18px', borderRadius: 4, border: '1px solid var(--gold)', background: saving ? 'transparent' : 'var(--gold)', color: saving ? 'var(--gold)' : 'var(--gold-btn-text, #1a1a1a)', fontSize: 14, fontWeight: 500, cursor: saving ? 'default' : 'pointer' }}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}
