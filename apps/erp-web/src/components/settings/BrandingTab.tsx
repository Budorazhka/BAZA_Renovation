import { useRef, useState } from 'react'
import { Check, Upload } from 'lucide-react'
import { getBranding, saveBranding, type AgencyBranding } from '@/store/agencyStore'
import { useI18n } from "@/i18n";

export function BrandingTab() {
    const { t } = useI18n();
  const initial = getBranding()
  const [name, setName] = useState(initial.name)
  const [logo, setLogo] = useState<string | null>(initial.logoDataUrl)
  const [description, setDescription] = useState(initial.description ?? '')
  const [saved, setSaved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setLogo(ev.target?.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleSave() {
    const data: AgencyBranding = { name: name.trim(), logoDataUrl: logo, description: description.trim() }
    saveBranding(data)
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
  }

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <p className="mb-1 text-xs uppercase tracking-widest text-[color:var(--hub-stat-label)]">{t('settings.brandingTab.оформление')}</p>
        <h2 className="mb-2 text-xl font-normal text-[color:var(--app-text)]">{t('settings.brandingTab.брендинг_агентства')}</h2>
        <p className="text-sm text-[color:var(--hub-stat-label)]">
          {t('settings.brandingTab.название_и_логотип_п')}</p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-medium uppercase tracking-wide text-[color:var(--hub-stat-label)]">
          {t('settings.brandingTab.название_компании_ка')}</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('settings.brandingTab.например_премьер_нед')}
          className="w-full rounded-xl border border-[color:var(--hub-card-border)] bg-[rgba(0,0,0,0.25)] px-4 py-2.5 text-sm text-[color:var(--app-text)] placeholder:text-[color:var(--theme-accent-icon-dim)] outline-none transition-all focus:border-[color:var(--hub-card-border-hover)] focus:ring-1 focus:ring-[color:var(--hub-card-border)]"
        />
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--hub-stat-label)]">{t('settings.brandingTab.логотип')}</p>
        <div className="flex flex-wrap items-start gap-4">
          <div
            className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-[color:var(--hub-tile-icon-border)]"
            style={{
              background: 'repeating-conic-gradient(#e2e8f0 0% 25%, #f8fafc 0% 50%) 50% / 12px 12px',
            }}
          >
            {logo ? (
              <img src={logo} alt={t('settings.brandingTab.логотип')} className="max-h-full max-w-full object-contain p-1" />
            ) : (
              <span className="px-2 text-center text-[10px] text-slate-500">{t('settings.brandingTab.превью')}</span>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 rounded-xl border border-[color:var(--hub-card-border)] px-4 py-2 text-sm font-medium text-[color:var(--theme-accent-link-dim)] transition-colors hover:border-[color:var(--hub-card-border-hover)] hover:text-[color:var(--app-text)]"
            >
              <Upload className="size-4" />
              {t('settings.brandingTab.загрузить_изображени')}</button>
            {logo && (
              <button
                type="button"
                onClick={() => setLogo(null)}
                className="block text-xs text-[color:var(--hub-stat-label)] underline-offset-2 hover:text-[color:var(--app-text-muted)] hover:underline"
              >
                {t('settings.brandingTab.удалить_логотип')}</button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/svg+xml,image/webp,image/jpeg"
              className="hidden"
              onChange={handleFile}
            />
            <p className="text-xs leading-relaxed text-[color:var(--workspace-text-muted)]">
              {t('settings.brandingTab.загрузите_файл_на')}{' '}
              <span className="text-[color:var(--hub-badge-soon-fg)]">{t('settings.brandingTab.прозрачном_фоне')}</span>
              {' '}{t('settings.brandingTab.удобный_формат_png')}{' '}
              <a
                href="https://www.remove.bg"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[rgba(201,168,76,0.85)] underline-offset-2 hover:underline"
              >
                remove.bg
              </a>
              {t('settings.brandingTab.так_знак_нормально')}</p>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-base text-[color:var(--hub-stat-label)]">
          {t('settings.brandingTab.описание_застройщика')}</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={4}
          placeholder={t('settings.brandingTab.коротко_о_застройщик')}
          className="w-full resize-y rounded border border-[color:var(--hub-card-border)] bg-[rgba(0,0,0,0.25)] px-4 py-2.5 text-base leading-relaxed text-[color:var(--app-text)] placeholder:text-[color:var(--theme-accent-icon-dim)] outline-none transition-all focus:border-[color:var(--hub-card-border-hover)] focus:ring-1 focus:ring-[color:var(--hub-card-border)]"
        />
      </div>

      <button
        type="button"
        onClick={handleSave}
        className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-normal text-white transition-colors hover:bg-emerald-500"
      >
        {saved ? (
          <>
            <Check className="size-4" /> {t('settings.brandingTab.сохранено')}</>
        ) : (
          'Сохранить'
        )}
      </button>
    </div>
  )
}
