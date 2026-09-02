import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Edit2, Layers, Loader2, Plus, Trash2, Upload, X } from 'lucide-react'
import { useCoreStore } from '@/store/useCoreStore'
import { developmentApi } from '@/services/developmentApi'
import type { ILayout } from '@/types/core'
import { normalizeRooms, optionLabel } from '@/lib/project-options'
import { useI18n } from "@/i18n";

interface LayoutLibraryViewProps {
  buildingId: string
}

/** Поиск по номеру лота: `?` — любая одна цифра (напр. `??11` → лоты с номером 11 на любом этаже). */
function unitMatchesQuery(number: string, query: string): boolean {
  const q = query.trim()
  if (!q) return true
  const pattern = q
    .split('')
    .map((ch) => (ch === '?' ? '\\d' : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('')
  try {
    return new RegExp(pattern, 'i').test(number)
  } catch {
    return number.toLowerCase().includes(q.toLowerCase())
  }
}

export function LayoutLibraryView({ buildingId }: LayoutLibraryViewProps) {
    const { t } = useI18n();
  const layouts = useCoreStore((s) => s.layouts)
  const addLayout = useCoreStore((s) => s.addLayout)
  const updateLayout = useCoreStore((s) => s.updateLayout)
  const deleteLayout = useCoreStore((s) => s.deleteLayout)
  const allUnits = useCoreStore((s) => s.allUnits)
  const attachLayoutToUnits = useCoreStore((s) => s.attachLayoutToUnits)

  const [isAdding, setIsAdding] = useState(false)
  const [editingLayout, setEditingLayout] = useState<ILayout | null>(null)
  const [assignLayout, setAssignLayout] = useState<ILayout | null>(null)
  const [assignSelected, setAssignSelected] = useState<Set<string>>(new Set())
  const [assignQuery, setAssignQuery] = useState('')
  const [applying, setApplying] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDelete(layout: ILayout) {
    if (deletingId) return
    if (!confirm('Удалить планировку?')) return
    setDeleteError(null)
    setDeletingId(layout._id)
    try {
      await deleteLayout(layout._id)
    } catch (error) {
      setDeleteError(`Не удалось удалить «${layout.name}»: ${errMessage(error)}`)
    } finally {
      setDeletingId(null)
    }
  }

  const buildingUnits = useMemo(
    () =>
      allUnits
        .filter((u) => u.building === buildingId)
        .sort((a, b) => (a.floor - b.floor) || a.number.localeCompare(b.number, 'ru', { numeric: true })),
    [allUnits, buildingId],
  )

  const filteredAssignUnits = useMemo(
    () => buildingUnits.filter((u) => unitMatchesQuery(u.number, assignQuery)),
    [buildingUnits, assignQuery],
  )

  function openAssign(layout: ILayout) {
    setAssignLayout(layout)
    setAssignSelected(new Set())
    setAssignQuery('')
    setAssignError(null)
  }

  function toggleAssignUnit(id: string) {
    setAssignSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function applyAssign() {
    if (!assignLayout || assignSelected.size === 0 || applying) return
    setApplying(true)
    setAssignError(null)
    try {
      const { ok, failed } = await attachLayoutToUnits(Array.from(assignSelected), assignLayout)
      if (failed > 0) {
        setAssignError(`Привязано ${ok} из ${ok + failed}. Не удалось обновить ${failed} лот(ов).`)
        return
      }
      setAssignLayout(null)
      setAssignSelected(new Set())
    } catch (error) {
      setAssignError(errMessage(error))
    } finally {
      setApplying(false)
    }
  }

  const allAssignChecked =
    filteredAssignUnits.length > 0 && filteredAssignUnits.every((u) => assignSelected.has(u._id))
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set())
  const [imageUrl, setImageUrl] = useState('')
  const [imageFileId, setImageFileId] = useState<string | null>(null)
  const [tagsInput, setTagsInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const errMessage = (error: unknown) =>
    (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ||
    (error as { message?: string })?.message ||
    'Не удалось сохранить планировку'

  // Sync the image field whenever the add/edit modal opens.
  useEffect(() => {
    if (isAdding) setImageUrl('')
    else if (editingLayout) setImageUrl(editingLayout.imageUrl ?? '')
    setImageFileId(editingLayout?.planFileId ?? null)
    setTagsInput(isAdding ? '' : (editingLayout?.tags ?? []).join(', '))
    setUploadError(null)
    setUploading(false)
    setFormError(null)
  }, [isAdding, editingLayout])

  // Normalize the comma/newline separated tags field into a clean string[].
  const parseTags = (value: string) =>
    Array.from(new Set(value.split(/[,\n]/).map((t) => t.trim()).filter(Boolean)))

  // Upload the picked image to the CDN (via the apartment-plans endpoint) and
  // store the returned URL. Falls back to a base64 preview if the upload fails.
  const handleImageFile = async (file: File) => {
    setUploadError(null)
    setUploading(true)
    setImageFileId(null)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
      setImageUrl(dataUrl)
    } catch {
      /* ignore preview failure */
    }
    try {
      const resp = await developmentApi.uploadApartmentPlans(buildingId, [file], [file.name])
      const uploaded = resp.success ? resp.data.uploaded?.[0] : undefined
      if (uploaded?.url) {
        setImageUrl(uploaded.url)
        setImageFileId(uploaded.id)
      } else {
        setUploadError(resp.message || 'Сервер не вернул загруженный файл')
      }
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ||
        (error as { message?: string })?.message ||
        'Не удалось загрузить изображение на сервер'
      setUploadError(message)
    } finally {
      setUploading(false)
    }
  }

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setFormError(null)
    try {
      await addLayout(buildingId, {
        name: fd.get('name') as string,
        rooms: fd.get('rooms') as string,
        area: parseFloat(fd.get('area') as string) || 0,
        isEuro: fd.get('isEuro') === 'on',
        imageUrl,
        planFileId: imageFileId ?? undefined,
        tags: parseTags(tagsInput),
      })
      setIsAdding(false)
    } catch (error) {
      setFormError(errMessage(error))
    }
  }

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingLayout) return
    const fd = new FormData(e.currentTarget)
    setFormError(null)
    try {
      await updateLayout(editingLayout._id, {
        buildingId: editingLayout.buildingId,
        name: fd.get('name') as string,
        rooms: fd.get('rooms') as string,
        area: parseFloat(fd.get('area') as string) || 0,
        isEuro: fd.get('isEuro') === 'on',
        imageUrl,
        planFileId: imageFileId ?? undefined,
        tags: parseTags(tagsInput),
      })
      setEditingLayout(null)
    } catch (error) {
      setFormError(errMessage(error))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="text-[18px] font-normal text-[#fcecc8]">{t('inventory.layoutLibraryView.библиотека_планирово')}</h3>
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center gap-2 rounded-md bg-[#c9a84c] px-4 py-2 text-[14px] font-medium text-[#0a1f12] hover:bg-[#e2c97e] transition-colors"
        >
          <Plus size={16} />
          {t('inventory.layoutLibraryView.добавить_планировку')}</button>
      </div>

      {deleteError && (
        <div className="flex items-start gap-2 rounded-md border border-rose-400/45 bg-rose-500/10 px-3 py-2 text-[16px] text-[#ffb4ab]">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">{deleteError}</span>
          <button
            type="button"
            onClick={() => setDeleteError(null)}
            className="ml-auto shrink-0 text-[rgba(255,180,171,0.7)] hover:text-[#ffdad6]"
            aria-label={t('inventory.layoutLibraryView.скрыть_ошибку')}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {layouts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.1)] py-12 text-center">
          <p className="text-[16px] text-[rgba(242,207,141,0.5)]">{t('inventory.layoutLibraryView.в_этом_корпусе_ещ_не')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {layouts.map((layout) => (
            <div
              key={layout._id}
              className="group relative flex flex-col overflow-hidden rounded-lg border border-[rgba(242,207,141,0.12)] bg-[rgba(0,0,0,0.25)] transition-all hover:border-[rgba(242,207,141,0.3)]"
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/40">
                {layout.imageUrl && !brokenImages.has(layout._id) ? (
                  <img
                    src={layout.imageUrl}
                    alt={layout.name}
                    className="h-full w-full cursor-pointer object-contain transition-transform group-hover:scale-105"
                    onClick={() => setPreview(layout.imageUrl!)}
                    onError={() => setBrokenImages((prev) => new Set(prev).add(layout._id))}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[rgba(242,207,141,0.3)]">
                    {t('inventory.layoutLibraryView.нет_изображения')}</div>
                )}
                <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => setEditingLayout(layout)}
                    className="rounded-md bg-black/60 p-1.5 text-[rgba(242,207,141,0.8)] hover:text-[#fcecc8]"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => void handleDelete(layout)}
                    disabled={deletingId === layout._id}
                    className="rounded-md bg-black/60 p-1.5 text-[#ffb4ab] hover:text-[#ffdad6] disabled:opacity-50"
                  >
                    {deletingId === layout._id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              </div>
              <div className="flex flex-col p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-[#fcecc8]">{layout.name}</span>
                  <span className="shrink-0 text-[13px] text-[rgba(242,207,141,0.6)]">
                    {optionLabel(t, 'rooms', layout.rooms)} {layout.isEuro ? 'Е' : ''}
                  </span>
                </div>
                <div className="mt-1 text-[13px] text-[rgba(242,207,141,0.5)]">
                  {layout.area} {t('inventory.layoutLibraryView.м')}</div>
                <button
                  type="button"
                  onClick={() => openAssign(layout)}
                  className="mt-3 inline-flex items-center justify-center gap-2 rounded-[4px] bg-[rgba(230,195,100,0.12)] px-3 py-2 text-[16px] font-normal text-[#e6c364] transition-colors hover:bg-[rgba(230,195,100,0.2)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Layers size={16} />
                  {t('inventory.layoutLibraryView.применить_к_лотам')}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {(isAdding || editingLayout) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-lg border border-[rgba(242,207,141,0.2)] bg-[#0b1a0e] p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h4 className="text-[20px] font-medium text-[#fcecc8]">
                {isAdding ? 'Добавление планировки' : 'Редактирование планировки'}
              </h4>
              <button
                onClick={() => { setIsAdding(false); setEditingLayout(null) }}
                className="text-[rgba(242,207,141,0.6)] hover:text-[#fcecc8]"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={isAdding ? handleAdd : handleUpdate} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] text-[rgba(242,207,141,0.6)]">{t('inventory.layoutLibraryView.название')}</label>
                <input
                  name="name"
                  required
                  defaultValue={editingLayout?.name}
                  placeholder={t('inventory.layoutLibraryView.например_1_комнатная')}
                  className="rounded-md border border-[rgba(242,207,141,0.15)] bg-black/20 px-3 py-2 text-[#fcecc8] outline-none focus:border-[rgba(201,168,76,0.4)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] text-[rgba(242,207,141,0.6)]">{t('inventory.layoutLibraryView.комнатность')}</label>
                  <select
                    name="rooms"
                    defaultValue={normalizeRooms(editingLayout?.rooms) || '1+1'}
                    className="rounded-md border border-[rgba(242,207,141,0.15)] bg-black/20 px-3 py-2 text-[#fcecc8] outline-none focus:border-[rgba(201,168,76,0.4)]"
                  >
                    <option value="studio">{optionLabel(t, 'rooms', 'studio')}</option>
                    <option value="1+1">{optionLabel(t, 'rooms', '1+1')}</option>
                    <option value="2+1">{optionLabel(t, 'rooms', '2+1')}</option>
                    <option value="3+1">{optionLabel(t, 'rooms', '3+1')}</option>
                    <option value="4+">{optionLabel(t, 'rooms', '4+')}</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] text-[rgba(242,207,141,0.6)]">{t('inventory.layoutLibraryView.площадь_м')}</label>
                  <input
                    name="area"
                    type="number"
                    step="0.1"
                    required
                    defaultValue={editingLayout?.area}
                    className="rounded-md border border-[rgba(242,207,141,0.15)] bg-black/20 px-3 py-2 text-[#fcecc8] outline-none focus:border-[rgba(201,168,76,0.4)]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="isEuro"
                  id="isEuro"
                  defaultChecked={editingLayout?.isEuro}
                  className="accent-[#c9a84c]"
                />
                <label htmlFor="isEuro" className="cursor-pointer text-[14px] text-[#fcecc8]">{t('inventory.layoutLibraryView.европланировка')}</label>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] text-[rgba(242,207,141,0.6)]">{t('inventory.layoutLibraryView.теги')}</label>
                <input
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder={t('inventory.layoutLibraryView.например_угловая_с_т')}
                  className="rounded-md border border-[rgba(242,207,141,0.15)] bg-black/20 px-3 py-2 text-[#fcecc8] outline-none focus:border-[rgba(201,168,76,0.4)]"
                />
                <span className="text-[11px] text-[rgba(242,207,141,0.4)]">{t('inventory.layoutLibraryView.через_запятую')}</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] text-[rgba(242,207,141,0.6)]">{t('inventory.layoutLibraryView.изображение_планиров')}</label>

                {imageUrl && !uploading ? (
                  <div className="relative overflow-hidden rounded-lg border border-[rgba(242,207,141,0.18)] bg-black/30">
                    <img src={imageUrl} alt={t('inventory.layoutLibraryView.превью_планировки')} className="max-h-52 w-full object-contain" />
                    <div className="absolute right-2 top-2 flex gap-1.5">
                      <label className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-black/60 px-2.5 py-1.5 text-[12px] text-[#fcecc8] backdrop-blur transition-colors hover:bg-black/80">
                        <Upload size={12} />
                        {t('inventory.layoutLibraryView.заменить')}<input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) void handleImageFile(file)
                            e.target.value = ''
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => { setImageUrl(''); setImageFileId(null) }}
                        className="inline-flex items-center rounded-md bg-black/60 px-2 py-1.5 text-[12px] text-[#ffb4ab] backdrop-blur transition-colors hover:bg-black/80"
                        aria-label={t('inventory.layoutLibraryView.удалить_изображение')}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <label
                    className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.2)] px-4 py-7 text-center transition-colors hover:border-[rgba(242,207,141,0.4)] hover:bg-[rgba(0,0,0,0.3)]"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const file = e.dataTransfer.files?.[0]
                      if (file) void handleImageFile(file)
                    }}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="size-7 animate-spin text-[#e2c97e]" />
                        <p className="text-[13px] font-medium text-[#fcecc8]">{t('inventory.layoutLibraryView.загрузка_на_сервер')}</p>
                      </>
                    ) : (
                      <>
                        <Upload className="size-7 text-[rgba(242,207,141,0.35)]" />
                        <div>
                          <p className="text-[13px] font-medium text-[#fcecc8]">{t('inventory.layoutLibraryView.загрузить_планировку')}</p>
                          <p className="mt-0.5 text-[12px] text-[rgba(242,207,141,0.45)]">
                            {t('inventory.layoutLibraryView.перетащите_или_кликн')}</p>
                          <p className="text-[11px] text-[rgba(242,207,141,0.28)]">PNG, JPG, SVG</p>
                        </div>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) void handleImageFile(file)
                        e.target.value = ''
                      }}
                    />
                  </label>
                )}

                {uploadError && (
                  <span className="inline-flex items-start gap-1.5 text-[12px] text-[#ffb4ab]">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {t('inventory.layoutLibraryView.показано_локально_но')}{uploadError}
                  </span>
                )}
              </div>

              {formError && (
                <div className="flex items-start gap-2 rounded-md border border-rose-400/45 bg-rose-500/10 px-3 py-2 text-[12px] text-[#ffb4ab]">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span className="min-w-0 break-words">{formError}</span>
                </div>
              )}

              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => { setIsAdding(false); setEditingLayout(null) }}
                  className="flex-1 rounded-md border border-[rgba(242,207,141,0.2)] py-2.5 text-[15px] text-[rgba(242,207,141,0.8)] hover:bg-white/5"
                >
                  {t('inventory.layoutLibraryView.отмена')}</button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="flex-1 rounded-md bg-[#c9a84c] py-2.5 text-[15px] font-medium text-[#0a1f12] hover:bg-[#e2c97e] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploading ? 'Загрузка…' : isAdding ? 'Добавить' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {assignLayout && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,8,5,0.7)] p-4 backdrop-blur-[20px]"
          onClick={() => setAssignLayout(null)}
        >
          <div
            className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[8px] bg-[#112d1c] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-3 px-5 py-4 shadow-[inset_0_-1px_0_rgba(201,168,76,0.12)]">
              <div className="flex min-w-0 items-center gap-3">
                {assignLayout.imageUrl && (
                  <img src={assignLayout.imageUrl} alt="" className="h-10 w-12 shrink-0 rounded-[4px] object-cover" />
                )}
                <div className="min-w-0">
                  <div className="truncate text-[18px] font-medium text-[#fcecc8]">{assignLayout.name}</div>
                  <div className="text-[16px] text-[rgba(255,255,255,0.72)]">
                    {optionLabel(t, 'rooms', assignLayout.rooms)}{assignLayout.isEuro ? ' Е' : ''} · {assignLayout.area} {t('inventory.layoutLibraryView.м')}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAssignLayout(null)}
                className="inline-flex size-9 items-center justify-center rounded-[4px] text-[rgba(255,255,255,0.72)] transition-colors hover:bg-[#163824] hover:text-[#fcecc8]"
                aria-label={t('inventory.layoutLibraryView.закрыть')}
              >
                <X size={18} />
              </button>
            </header>

            <div className="flex items-center gap-3 px-5 py-3 shadow-[inset_0_-1px_0_rgba(201,168,76,0.12)]">
              <span className="shrink-0 text-[16px] text-[rgba(255,255,255,0.72)]">{t('inventory.layoutLibraryView.выбрано')}{assignSelected.size}</span>
              <input
                type="text"
                inputMode="numeric"
                value={assignQuery}
                onChange={(e) => setAssignQuery(e.target.value)}
                placeholder={t('inventory.layoutLibraryView.номер_лота_любая_циф')}
                title={t('inventory.layoutLibraryView.любая_одна_цифра_на')}
                className="min-w-0 flex-1 rounded-[4px] bg-[#0d2417] px-3 py-1.5 text-[16px] text-[#fcecc8] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)] outline-none transition-shadow placeholder:text-[rgba(255,255,255,0.72)] focus:shadow-[inset_0_0_0_1px_rgba(201,168,76,0.45)]"
              />
              <button
                type="button"
                onClick={() =>
                  setAssignSelected((prev) => {
                    const next = new Set(prev)
                    if (allAssignChecked) filteredAssignUnits.forEach((u) => next.delete(u._id))
                    else filteredAssignUnits.forEach((u) => next.add(u._id))
                    return next
                  })
                }
                className="shrink-0 text-[16px] text-[#e6c364] transition-colors hover:text-[#e2c97e]"
              >
                {allAssignChecked ? 'Снять все' : 'Выбрать все'}
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {buildingUnits.length === 0 ? (
                <div className="px-5 py-10 text-center text-[16px] text-[rgba(255,255,255,0.72)]">{t('inventory.layoutLibraryView.в_корпусе_нет_лотов')}</div>
              ) : filteredAssignUnits.length === 0 ? (
                <div className="px-5 py-10 text-center text-[16px] text-[rgba(255,255,255,0.72)]">{t('inventory.layoutLibraryView.ничего_не_найдено')}</div>
              ) : (
                filteredAssignUnits.map((unit, i) => {
                  const checked = assignSelected.has(unit._id)
                  return (
                    <button
                      key={unit._id}
                      type="button"
                      onClick={() => toggleAssignUnit(unit._id)}
                      className={`flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors ${
                        checked
                          ? 'bg-[#163824]'
                          : i % 2 === 1
                            ? 'bg-[rgba(7,40,33,0.5)] hover:bg-[rgba(22,56,36,0.5)]'
                            : 'hover:bg-[rgba(22,56,36,0.5)]'
                      }`}
                    >
                      <span
                        className={`flex size-5 shrink-0 items-center justify-center rounded-[4px] ${
                          checked ? 'bg-[#e6c364] text-[#072821]' : 'shadow-[inset_0_0_0_1px_rgba(201,168,76,0.35)]'
                        }`}
                      >
                        {checked && <Check size={14} />}
                      </span>
                      <span className="w-16 shrink-0 text-[16px] text-[#fcecc8]">{unit.number}</span>
                      <span className="w-20 shrink-0 text-[16px] text-[rgba(255,255,255,0.72)]">{unit.floor} {t('inventory.layoutLibraryView.этаж')}</span>
                      <span className="flex-1 truncate text-[16px] text-[rgba(255,255,255,0.72)]">
                        {[unit.rooms ? optionLabel(t, 'rooms', unit.rooms) : null, unit.area != null ? `${unit.area} м²` : null].filter(Boolean).join(' · ')}
                      </span>
                      {unit.layoutImageUrl && <span className="shrink-0 text-[16px] text-[#d0e8df]">{t('inventory.layoutLibraryView.есть_план')}</span>}
                    </button>
                  )
                })
              )}
            </div>

            <footer className="flex items-center justify-end gap-3 px-5 py-4 shadow-[inset_0_1px_0_rgba(201,168,76,0.12)]">
              {assignError && (
                <span className="mr-auto inline-flex items-start gap-1.5 text-[14px] text-[#ffb4ab]">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  {assignError}
                </span>
              )}
              <button
                type="button"
                onClick={() => setAssignLayout(null)}
                disabled={applying}
                className="rounded-[4px] px-4 py-2.5 text-[16px] text-[rgba(255,255,255,0.72)] transition-colors hover:text-[#fcecc8] disabled:opacity-50"
              >
                {t('inventory.layoutLibraryView.отмена')}</button>
              <button
                type="button"
                onClick={applyAssign}
                disabled={assignSelected.size === 0 || applying}
                className="inline-flex items-center gap-2 rounded-[4px] bg-[#e6c364] px-5 py-2.5 text-[16px] font-medium text-[#072821] transition-colors hover:bg-[#e2c97e] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {applying ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {applying ? 'Привязка…' : `Применить${assignSelected.size > 0 ? ` (${assignSelected.size})` : ''}`}
              </button>
            </footer>
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setPreview(null)}>
          <img src={preview} alt={t('inventory.layoutLibraryView.превью')} className="max-h-full max-w-full object-contain" />
          <button className="absolute right-4 top-4 text-white hover:text-[#c9a84c]">
            <X size={32} />
          </button>
        </div>
      )}
    </div>
  )
}
