import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ImageOff, Loader2, Trash2, Upload, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { developmentApi, type CdnFileRef } from '@/services/developmentApi'
import { useI18n } from "@/i18n";

interface Props {
  /** Корпус лота — сюда загружаются новые изображения. */
  buildingId: string
  /** Все корпуса ЖК — из их пулов собирается общая библиотека планировок. */
  buildingIds: string[]
  /** Текущая привязка (CdnFile id), чтобы подсветить выбранный план. */
  currentImageFileId?: string
  /** Привязать выбранный план. */
  onSelect: (file: { id: string; url: string }) => Promise<void> | void
  /** Отвязать текущий план. */
  onDetach?: () => Promise<void> | void
  onClose: () => void
}

export function PlanImagePicker({
  buildingId,
  buildingIds,
  currentImageFileId,
  onSelect,
  onDetach,
  onClose,
}: Props) {
    const { t } = useI18n();
  const [files, setFiles] = useState<CdnFileRef[]>([])
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const ids = buildingIds.length > 0 ? buildingIds : [buildingId]

  const loadLibrary = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [planResponses, layoutResponses] = await Promise.all([
        Promise.all(ids.map((id) => developmentApi.getBuildingPlans(id))),
        Promise.all(ids.map((id) => developmentApi.getLayouts({ buildingId: id, limit: 500 }))),
      ])
      
      const byId = new Map<string, CdnFileRef>()
      for (const resp of planResponses) {
        if (!resp.success) continue
        for (const f of resp.data.apartmentsPlansFiles ?? []) {
          if (f?.id && !byId.has(f.id)) byId.set(f.id, f)
        }
      }
      setFiles(Array.from(byId.values()))

      const names = new Map<string, string>()
      for (const resp of layoutResponses) {
        if (!resp.success) continue
        for (const layout of resp.data?.items ?? []) {
          if (layout.planFileId && layout.name) names.set(layout.planFileId, layout.name)
        }
      }
      setNameMap(names)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить библиотеку планировок')
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')])

  useEffect(() => {
    void loadLibrary()
  }, [loadLibrary])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleUpload = async (list: FileList | null) => {
    const picked = list ? Array.from(list) : []
    if (picked.length === 0) return
    setIsUploading(true)
    setError(null)
    try {
      const resp = await developmentApi.uploadApartmentPlans(
        buildingId,
        picked,
        picked.map((f) => f.name),
      )
      if (!resp.success) throw new Error(resp.message || 'Не удалось загрузить изображение')
      await loadLibrary()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить изображение')
    } finally {
      setIsUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handlePick = async (file: CdnFileRef) => {
    setBusyId(file.id)
    setError(null)
    try {
      await onSelect({ id: file.id, url: file.url })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось привязать план')
      setBusyId(null)
    }
  }

  const handleDetach = async () => {
    if (!onDetach) return
    setBusyId('__detach__')
    setError(null)
    try {
      await onDetach()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отвязать план')
      setBusyId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative z-10 flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[rgba(201,168,76,0.25)] bg-[#10261c] shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
        <header className="flex shrink-0 items-center justify-between border-b border-[rgba(201,168,76,0.15)] bg-[#0f2318] px-5 py-4">
          <h2 className="text-[17px] font-normal text-[#fcecc8]">{t('inventory.planImagePicker.планировка_из_библио')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-md text-[rgba(242,207,141,0.5)] transition-colors hover:bg-[rgba(242,207,141,0.1)] hover:text-[#fcecc8]"
            aria-label={t('inventory.planImagePicker.закрыть')}
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[rgba(201,168,76,0.1)] px-5 py-3">
          <p className="text-xs text-[rgba(242,207,141,0.6)]">
            {t('inventory.planImagePicker.выберите_изображение')}</p>
          <div className="flex items-center gap-2">
            {currentImageFileId && onDetach && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleDetach}
                disabled={busyId !== null}
                className="border-rose-400/40 bg-transparent text-rose-200 hover:bg-rose-500/15"
              >
                {busyId === '__detach__' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {t('inventory.planImagePicker.открепить')}</Button>
            )}
            <Button
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
              className="bg-[#c9a84c] text-[#0a1f12] hover:bg-[#e2c97e]"
            >
              {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {t('inventory.planImagePicker.загрузить')}</Button>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
              multiple
              className="hidden"
              onChange={(e) => void handleUpload(e.target.files)}
            />
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-3 rounded-md border border-rose-400/40 bg-rose-500/10 p-2 text-xs text-rose-200">
            {error}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-[rgba(242,207,141,0.6)]">
              <Loader2 size={20} className="mr-2 animate-spin" />
              {t('inventory.planImagePicker.загрузка_библиотеки')}</div>
          ) : files.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-[rgba(242,207,141,0.5)]">
              <ImageOff size={40} strokeWidth={1.25} className="text-[rgba(201,168,76,0.3)]" />
              <p className="text-sm">{t('inventory.planImagePicker.в_библиотеке_пока_не')}</p>
              <p className="text-xs">{t('inventory.planImagePicker.загрузите_первое_изо')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {files.map((file) => {
                const isCurrent = file.id === currentImageFileId
                const isBusy = busyId === file.id
                return (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => void handlePick(file)}
                    disabled={busyId !== null}
                    title={file.name}
                    className={`group relative flex flex-col overflow-hidden rounded-lg border bg-[#0c2018] text-left transition-colors disabled:cursor-not-allowed ${
                      isCurrent
                        ? 'border-[#c9a84c] ring-2 ring-[#c9a84c]/40'
                        : 'border-[rgba(201,168,76,0.18)] hover:border-[#c9a84c]/60'
                    }`}
                  >
                    <div className="aspect-square w-full overflow-hidden bg-[#0a1a13]">
                      <img
                        src={file.url}
                        alt={file.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                    </div>
                    <div
                      className="line-clamp-2 px-2 py-1.5 text-xs leading-tight text-[rgba(242,207,141,0.85)]"
                      title={nameMap.get(file.id) ?? file.name ?? 'Без названия'}
                    >
                      {nameMap.get(file.id) ?? file.name ?? 'Без названия'}
                    </div>
                    {isCurrent && (
                      <span className="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-full bg-[#c9a84c] text-[#0a1f12]">
                        <Check size={14} strokeWidth={3} />
                      </span>
                    )}
                    {isBusy && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/45">
                        <Loader2 size={20} className="animate-spin text-[#fcecc8]" />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
