import { useState } from 'react'
import { Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useI18n } from "@/i18n";

function FeltInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-[color:var(--hub-stat-label)] uppercase tracking-wide">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[color:var(--hub-card-border)] bg-[rgba(0,0,0,0.25)] px-4 py-2.5 text-sm text-[color:var(--app-text)] placeholder:text-[color:var(--theme-accent-icon-dim)] outline-none focus:border-[color:var(--hub-card-border-hover)] focus:ring-1 focus:ring-[color:var(--hub-card-border)] transition-all"
      />
    </div>
  )
}

export function CompanyTab() {
    const { t } = useI18n();
  const [legal,   setLegal]   = useState('ООО «Премьер»')
  const [inn,     setInn]     = useState('7712345678')
  const [address, setAddress] = useState('г. Москва, ул. Тверская, 12')
  const [site,    setSite]    = useState('premier-estate.ru')
  const [phone,   setPhone]   = useState('+7 (495) 123-45-67')
  const [saved,   setSaved]   = useState(false)

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-8 max-w-xl">
      <p className="rounded-xl border border-[color:var(--hub-tile-icon-border)] bg-[var(--hub-action-hover)] px-4 py-3 text-xs leading-relaxed text-[color:var(--hub-desc)]">
        {t('settings.companyTab.название_и_логотип_д')}{' '}
        <Link to="/dashboard/settings/branding" className="font-normal text-[rgba(201,168,76,0.85)] underline-offset-2 hover:underline">
          {t('settings.companyTab.брендинг_агентства')}</Link>
        .
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FeltInput label={t('settings.companyTab.юридическое_название')} value={legal} onChange={setLegal} placeholder={t('settings.companyTab.ооо_полное_название')} />
        <FeltInput label={t('settings.companyTab.инн')} value={inn} onChange={setInn} placeholder="7712345678" />
        <div className="sm:col-span-2">
          <FeltInput label={t('settings.companyTab.адрес_офиса')} value={address} onChange={setAddress} placeholder={t('settings.companyTab.г_город_ул_улица_д_1')} />
        </div>
        <FeltInput label={t('settings.companyTab.сайт')} value={site} onChange={setSite} placeholder="example.ru" />
        <FeltInput label={t('settings.companyTab.телефон_компании')} value={phone} onChange={setPhone} type="tel" placeholder="+7 (___) ___-__-__" />
      </div>

      <button
        onClick={handleSave}
        className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-normal text-white hover:bg-emerald-500 transition-colors"
      >
        {saved ? <><Check className="size-4" /> {t('settings.companyTab.сохранено')}</> : 'Сохранить'}
      </button>
    </div>
  )
}
