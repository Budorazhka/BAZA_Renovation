import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { City, Country, Partner } from '@/types/dashboard'
import type { MailingAudience, MailingChannel, MailingScope } from '@/types/mailings'
import { cn } from '@/lib/utils'
import { useI18n } from "@/i18n";

export interface AudienceState {
  audience: MailingAudience
  scope: MailingScope
  scopeCityId: string
  scopeCountryId: string
  selectedPartnerIds: string[]
  channels: MailingChannel[]
}

interface AudienceSelectorProps {
  city: City
  country?: Country
  cities: City[]
  allPartners: Partner[]
  value: AudienceState
  onChange: (next: AudienceState) => void
  className?: string
}

export function getRecipientCount(
  audience: MailingAudience,
  scope: MailingScope,
  _scopeCityId: string,
  scopeCountryId: string,
  selectedPartnerIds: string[],
  city: City,
  cities: City[],
  allPartners: Partner[]
): number {
  if (audience === 'selected') {
    return selectedPartnerIds.length
  }
  if (audience === 'all_network') {
    return allPartners.length
  }
  if (scope === 'city') {
    return city.partners.length
  }
  if (scope === 'country' && scopeCountryId) {
    return cities.filter((c) => c.countryId === scopeCountryId).flatMap((c) => c.partners).length
  }
  return allPartners.length
}

export function AudienceSelector({
  city,
  country,
  cities,
  allPartners,
  value,
  onChange,
  className,
}: AudienceSelectorProps) {
    const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('')

  const filteredPartners = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return allPartners
    return allPartners.filter(
      (p) => p.name.toLowerCase().includes(q) || p.login.toLowerCase().includes(q)
    )
  }, [allPartners, searchQuery])

  const count = useMemo(() => {
    const c = getRecipientCount(
      value.audience,
      value.scope,
      value.scopeCityId,
      value.scopeCountryId,
      value.selectedPartnerIds,
      city,
      cities,
      allPartners
    )
    return c
  }, [value, city, cities, allPartners, country])

  const setAudience = (audience: MailingAudience) => {
    onChange({
      ...value,
      audience,
      scope: audience === 'all_partners' ? value.scope : 'city',
      scopeCityId: city.id,
      scopeCountryId: country?.id ?? '',
    })
  }

  const setScope = (scope: MailingScope) => {
    onChange({
      ...value,
      scope,
      scopeCityId: scope === 'city' ? city.id : value.scopeCityId,
      scopeCountryId: scope === 'country' ? country?.id ?? '' : value.scopeCountryId,
    })
  }

  const toggleChannel = (ch: MailingChannel) => {
    const next = value.channels.includes(ch)
      ? value.channels.filter((c) => c !== ch)
      : [...value.channels, ch]
    if (next.length === 0) return
    onChange({ ...value, channels: next })
  }

  const togglePartner = (partnerId: string) => {
    const next = value.selectedPartnerIds.includes(partnerId)
      ? value.selectedPartnerIds.filter((id) => id !== partnerId)
      : [...value.selectedPartnerIds, partnerId]
    onChange({ ...value, selectedPartnerIds: next })
  }

  const selectAllFiltered = () => {
    const ids = new Set(value.selectedPartnerIds)
    filteredPartners.forEach((p) => ids.add(p.id))
    onChange({ ...value, selectedPartnerIds: Array.from(ids) })
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="space-y-2">
        <Label className="text-base text-[color:var(--app-text-muted)]">{t('mailings.audienceSelector.кому')}</Label>
        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="audience"
              checked={value.audience === 'all_partners'}
              onChange={() => setAudience('all_partners')}
              className="size-4"
            />
            <span className="text-base text-[color:var(--app-text)]">{t('mailings.audienceSelector.всем_партн_рам')}</span>
          </label>
          {value.audience === 'all_partners' && (
            <div className="ml-6 flex flex-col gap-1.5 border-l-2 border-[var(--green-border)] pl-4">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="scope"
                  checked={value.scope === 'city'}
                  onChange={() => setScope('city')}
                  className="size-4"
                />
                <span className="text-sm text-[color:var(--app-text)]">{t('mailings.audienceSelector.по_городу')}{city.name})</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="scope"
                  checked={value.scope === 'country'}
                  onChange={() => setScope('country')}
                  className="size-4"
                />
                <span className="text-sm text-[color:var(--app-text)]">{t('mailings.audienceSelector.по_стране')}{country ? ` (${country.name})` : ''}</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="scope"
                  checked={value.scope === 'world'}
                  onChange={() => setScope('world')}
                  className="size-4"
                />
                <span className="text-sm text-[color:var(--app-text)]">{t('mailings.audienceSelector.по_всем_партн_рам_в')}</span>
              </label>
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="audience"
              checked={value.audience === 'all_network'}
              onChange={() => setAudience('all_network')}
              className="size-4"
            />
            <span className="text-base text-[color:var(--app-text)]">{t('mailings.audienceSelector.всем_участникам_сети')}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="audience"
              checked={value.audience === 'selected'}
              onChange={() => setAudience('selected')}
              className="size-4"
            />
            <span className="text-base text-[color:var(--app-text)]">{t('mailings.audienceSelector.выбрать')}</span>
          </label>
          {value.audience === 'selected' && (
            <div className="ml-6 space-y-2 rounded-md border border-[var(--green-border)] bg-[var(--green-deep)] p-3">
              <Input
                placeholder={t('mailings.audienceSelector.поиск_по_имени_или_e')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-base border-[var(--green-border)] bg-[var(--green-card)] text-[color:var(--app-text)] placeholder:text-[color:var(--app-text-subtle)]"
              />
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="text-sm text-[color:var(--theme-accent-heading)] hover:underline"
                >
                  {t('mailings.audienceSelector.выбрать_всех_в_списк')}</button>
                <span className="text-sm text-[color:var(--app-text-muted)]">
                  {t('mailings.audienceSelector.выбрано')}{value.selectedPartnerIds.length}
                </span>
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-[var(--green-border)] bg-[color-mix(in_srgb,var(--green-deep)_85%,transparent)] p-2">
                {filteredPartners.length === 0 ? (
                  <p className="py-2 text-center text-sm text-[color:var(--app-text-muted)]">
                    {t('mailings.audienceSelector.нет_участников_или_н')}</p>
                ) : (
                  filteredPartners.map((partner) => (
                    <label
                      key={partner.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-[var(--dropdown-hover)]"
                    >
                      <input
                        type="checkbox"
                        checked={value.selectedPartnerIds.includes(partner.id)}
                        onChange={() => togglePartner(partner.id)}
                        className="size-4 rounded border-input"
                      />
                      <span className="truncate text-sm text-[color:var(--app-text)]">{partner.name}</span>
                      <span className="truncate text-xs text-[color:var(--app-text-muted)]">{partner.login}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-base text-[color:var(--app-text-muted)]">{t('mailings.audienceSelector.куда_доставить')}</Label>
        <div className="flex flex-wrap gap-4">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={value.channels.includes('crm')}
              onChange={() => toggleChannel('crm')}
              className="size-4 rounded border-input"
            />
            <span className="text-base text-[color:var(--app-text)]">{t('mailings.audienceSelector.в_crm')}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={value.channels.includes('cabinet')}
              onChange={() => toggleChannel('cabinet')}
              className="size-4 rounded border-input"
            />
            <span className="text-base text-[color:var(--app-text)]">{t('mailings.audienceSelector.в_личный_кабинет')}</span>
          </label>
        </div>
      </div>

      <p className="text-base font-medium text-[color:var(--app-text-muted)]">
        {t('mailings.audienceSelector.будет_отправлено')}{count} {t('mailings.audienceSelector.получателям')}</p>
    </div>
  )
}
