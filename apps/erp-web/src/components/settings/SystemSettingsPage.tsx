import { useMemo, useState } from 'react'
import { AlertTriangle, Database, Filter, Link2, Server, Shield } from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { useI18n } from "@/i18n";

type IntStatus = 'ok' | 'pending' | 'error'

const ITEMS: Array<{ key: string; value: string; category: 'org' | 'locale' | 'security' }> = [
  { key: 'Профиль агентства', value: 'baza.sale Agency', category: 'org' },
  { key: 'Регион по умолчанию', value: 'Тбилиси', category: 'locale' },
  { key: 'Часовой пояс', value: 'UTC+4', category: 'locale' },
  { key: 'Язык интерфейса', value: 'Русский', category: 'locale' },
  { key: 'Политика хранения логов', value: '90 дней', category: 'security' },
  { key: '2FA для админов', value: 'Обязательна', category: 'security' },
]

const INTEGRATIONS: Array<{ id: string; name: string; status: IntStatus; lastSync: string; env: 'prod' | 'sandbox' }> = [
  { id: 'int-1', name: 'CRM API', status: 'ok', lastSync: '2026-04-08 09:12', env: 'prod' },
  { id: 'int-2', name: 'Телефония', status: 'pending', lastSync: '—', env: 'sandbox' },
  { id: 'int-3', name: 'Подписание документов', status: 'pending', lastSync: '—', env: 'sandbox' },
  { id: 'int-4', name: 'Почта (SMTP)', status: 'ok', lastSync: '2026-04-08 08:40', env: 'prod' },
  { id: 'int-5', name: 'Платёжный шлюз', status: 'error', lastSync: '2026-04-07 22:01', env: 'prod' },
]

const STATUS_LABEL: Record<IntStatus, string> = {
  ok: 'Подключено',
  pending: 'В очереди',
  error: 'Ошибка',
}

export default function SystemSettingsPage() {
    const { t } = useI18n();
  const [category, setCategory] = useState<'all' | 'org' | 'locale' | 'security'>('all')
  const [intFilter, setIntFilter] = useState<'all' | IntStatus>('all')

  const filteredItems = useMemo(() => {
    if (category === 'all') return ITEMS
    return ITEMS.filter((i) => i.category === category)
  }, [category])

  const filteredInt = useMemo(() => {
    if (intFilter === 'all') return INTEGRATIONS
    return INTEGRATIONS.filter((i) => i.status === intFilter)
  }, [intFilter])

  const kpi = useMemo(() => {
    const ok = INTEGRATIONS.filter((i) => i.status === 'ok').length
    const pend = INTEGRATIONS.filter((i) => i.status === 'pending').length
    const err = INTEGRATIONS.filter((i) => i.status === 'error').length
    return { ok, pend, err, params: ITEMS.length }
  }, [])

  return (
    <DashboardShell>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-6xl space-y-4">
          <div>
            <h1 className="text-xl font-normal text-[color:var(--theme-accent-heading)]">{t('settings.systemSettingsPage.настройки_системы')}</h1>
            <p className="mt-1 text-sm text-[color:var(--app-text-muted)]">
              {t('settings.systemSettingsPage.параметры_агентства')}</p>
          </div>

          <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)]/80 px-3 py-2 text-xs text-[color:var(--workspace-text-muted)]">
            <span className="font-normal text-[color:var(--theme-accent-heading)]">{t('settings.systemSettingsPage.среда')}</span> {t('settings.systemSettingsPage.production_критичные')}</div>

          <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <p className="text-[10px] uppercase text-[color:var(--app-text-subtle)]">{t('settings.systemSettingsPage.параметров')}</p>
              <p className="text-xl font-normal text-[color:var(--workspace-text)]">{kpi.params}</p>
            </div>
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <p className="text-[10px] uppercase text-[color:var(--app-text-subtle)]">{t('settings.systemSettingsPage.интеграции_ок')}</p>
              <p className="text-xl font-normal text-emerald-300">{kpi.ok}</p>
            </div>
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <p className="text-[10px] uppercase text-[color:var(--app-text-subtle)]">{t('settings.systemSettingsPage.в_очереди')}</p>
              <p className="text-xl font-normal text-amber-300">{kpi.pend}</p>
            </div>
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <p className="text-[10px] uppercase text-[color:var(--app-text-subtle)]">{t('settings.systemSettingsPage.с_ошибкой')}</p>
              <p className="text-xl font-normal text-red-300">{kpi.err}</p>
            </div>
          </section>

          <section className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
            <div className="mb-3 flex items-center gap-2">
              <Filter className="size-4 text-[color:var(--gold)]" />
              <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t('settings.systemSettingsPage.фильтры')}</h2>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof category)}
                className="rounded-md border border-[var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-2 py-2 text-sm text-[color:var(--workspace-text)]"
              >
                <option value="all">{t('settings.systemSettingsPage.параметры_все_группы')}</option>
                <option value="org">{t('settings.systemSettingsPage.организация')}</option>
                <option value="locale">{t('settings.systemSettingsPage.локаль')}</option>
                <option value="security">{t('settings.systemSettingsPage.безопасность')}</option>
              </select>
              <select
                value={intFilter}
                onChange={(e) => setIntFilter(e.target.value as 'all' | IntStatus)}
                className="rounded-md border border-[var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-2 py-2 text-sm text-[color:var(--workspace-text)]"
              >
                <option value="all">{t('settings.systemSettingsPage.интеграции_все_стату')}</option>
                <option value="ok">{t('settings.systemSettingsPage.подключено')}</option>
                <option value="pending">{t('settings.systemSettingsPage.в_очереди')}</option>
                <option value="error">{t('settings.systemSettingsPage.ошибка')}</option>
              </select>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <section className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <div className="mb-3 flex items-center gap-2">
                <Server className="size-4 text-[color:var(--gold)]" />
                <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t('settings.systemSettingsPage.базовые_параметры')}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--workspace-row-border)] text-left text-[11px] uppercase tracking-wide text-[color:var(--app-text-subtle)]">
                      <th className="px-2 py-2">{t('settings.systemSettingsPage.параметр')}</th>
                      <th className="px-2 py-2">{t('settings.systemSettingsPage.значение')}</th>
                      <th className="px-2 py-2">{t('settings.systemSettingsPage.группа')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => (
                      <tr key={item.key} className="border-b border-[color:var(--workspace-row-border)]">
                        <td className="px-2 py-2 text-xs text-[color:var(--app-text-subtle)]">{item.key}</td>
                        <td className="px-2 py-2 font-normal text-[color:var(--workspace-text)]">{item.value}</td>
                        <td className="px-2 py-2 text-[color:var(--workspace-text-muted)]">
                          {item.category === 'org' ? 'Орг.' : item.category === 'locale' ? 'Локаль' : 'Безопасн.'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <div className="mb-3 flex items-center gap-2">
                <Link2 className="size-4 text-[color:var(--gold)]" />
                <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t('settings.systemSettingsPage.интеграции')}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[400px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--workspace-row-border)] text-left text-[11px] uppercase tracking-wide text-[color:var(--app-text-subtle)]">
                      <th className="px-2 py-2">{t('settings.systemSettingsPage.сервис')}</th>
                      <th className="px-2 py-2">{t('settings.systemSettingsPage.статус')}</th>
                      <th className="px-2 py-2">{t('settings.systemSettingsPage.среда')}</th>
                      <th className="px-2 py-2">{t('settings.systemSettingsPage.синхр')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInt.map((item) => (
                      <tr key={item.id} className="border-b border-[color:var(--workspace-row-border)]">
                        <td className="px-2 py-2 font-normal text-[color:var(--workspace-text)]">{item.name}</td>
                        <td className="px-2 py-2">
                          <span
                            className={
                              item.status === 'ok'
                                ? 'text-emerald-300'
                                : item.status === 'error'
                                  ? 'text-red-300'
                                  : 'text-amber-300'
                            }
                          >
                            {STATUS_LABEL[item.status]}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-[color:var(--workspace-text-muted)]">{item.env === 'prod' ? 'Prod' : 'Sandbox'}</td>
                        <td className="px-2 py-2 text-xs text-[color:var(--workspace-text-muted)]">{item.lastSync}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-400" />
              <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t('settings.systemSettingsPage.требуют_внимания')}</h2>
            </div>
            <ul className="space-y-2">
              {INTEGRATIONS.filter((i) => i.status !== 'ok').map((i) => (
                <li
                  key={i.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-3 py-2 text-sm text-[color:var(--workspace-text)]"
                >
                  <Database className="size-3.5 text-[color:var(--gold)]" />
                  {i.name} — {STATUS_LABEL[i.status]}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <Shield className="size-4 text-[color:var(--gold)]" />
              <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t('settings.systemSettingsPage.ключи_api_и_интеграц')}</h2>
            </div>
            <p className="text-xs text-[color:var(--app-text-muted)]">
              {t('settings.systemSettingsPage.маски_и_срок_ротации')}</p>
            <div className="mt-2 rounded-md border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-3 py-2 font-mono text-xs text-[color:var(--workspace-text-muted)]">
              {t('settings.systemSettingsPage.crm_primary_last4_a7')}</div>
          </section>
        </div>
      </div>
    </DashboardShell>
  )
}
