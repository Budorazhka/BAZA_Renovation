import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Eye, ImagePlus, Rocket, Send, Sparkles, ThumbsDown, ThumbsUp, Timer, X } from 'lucide-react'

import type { IProject } from '@/types/core'
import { useI18n, type Translate } from '@/i18n'

import { broadcastStorageKey } from './salesManagementStorage'
import { developmentApi } from '@/services/developmentApi'
import {
  PROMO_DURATIONS,
  type PromoDurationId,
  promoDurationFactor,
  promoDurationLabel,
} from '@/lib/promoActivations'

// Услуга «Обращение к риелторам» из общего каталога продвижения — цена за 24 ч
const REALTOR_OUTREACH_SERVICE_ID = 'realtor_outreach'
const REALTOR_OUTREACH_PRICE_PER_24H = 10

const SUBJECT_MAX = 120
const BODY_MAX = 800
const SEND_COOLDOWN_MS = 24 * 60 * 60 * 1000
const MAX_IMAGES = 3

// ---------- Типы ----------

export type BroadcastType = 'news' | 'promo' | 'object'

export interface BroadcastRow {
  id: string
  type: BroadcastType
  subject: string
  body: string
  images: string[]
  createdAt: string
  views: number
  likes: number
  dislikes: number
}

// ---------- Моки ----------

const UNSPLASH = (id: string) => `https://images.unsplash.com/photo-${id}?w=800&q=80`

function seedBroadcasts(projectId: string): BroadcastRow[] {
  const rows: BroadcastRow[] = [
    {
      id: 'bc-seed-1',
      type: 'news',
      subject: 'Старт продаж второй очереди ЖК «Панорама»',
      body: 'Рады сообщить об открытии продаж второй очереди нашего флагманского проекта. В новом корпусе 180 квартир — от студий до четырёхкомнатных пентхаусов. Ранняя бронь до 30 числа — с фиксацией цены.',
      images: [UNSPLASH('1486325212027-8081e485255e'), UNSPLASH('1512917774080-9991f1c4c750')],
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      views: 214,
      likes: 38,
      dislikes: 2,
    },
    {
      id: 'bc-seed-2',
      type: 'promo',
      subject: 'Акция: рассрочка 0% на 24 месяца без переплат',
      body: 'До конца месяца действует специальная программа рассрочки без процентов на 24 месяца. Первоначальный взнос — от 20%. Ограниченное число квартир. Успейте зафиксировать условия.',
      images: [UNSPLASH('1545324418-cc1a3fa10c00')],
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      views: 189,
      likes: 52,
      dislikes: 4,
    },
    {
      id: 'bc-seed-3',
      type: 'object',
      subject: 'Обзор лота №42 — угловая квартира с видом на парк',
      body: 'Представляем эксклюзивный лот: 87 м², 2 спальни, угловое остекление на 3 стороны. Вид на центральный парк. Отделка white box. Сдача ключей — Q2 2025. Материалы по объекту — в приложении.',
      images: [UNSPLASH('1560448204-e02f11c3d0e2'), UNSPLASH('1502005229762-053b91ad9b68'), UNSPLASH('1512917774080-9991f1c4c750')],
      createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
      views: 301,
      likes: 77,
      dislikes: 1,
    },
    {
      id: 'bc-seed-4',
      type: 'news',
      subject: 'Получено разрешение на ввод в эксплуатацию корпуса А',
      body: 'Корпус А официально введён в эксплуатацию. Передача ключей начнётся с 15 числа следующего месяца. Просим риэлторов согласовать с клиентами удобное время приёмки квартиры.',
      images: [UNSPLASH('1486325212027-8081e485255e')],
      createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      views: 412,
      likes: 94,
      dislikes: 3,
    },
    {
      id: 'bc-seed-5',
      type: 'promo',
      subject: 'Спецпредложение для агентств: повышенная комиссия 4%',
      body: 'На период старта продаж второй очереди устанавливаем повышенную агентскую комиссию 4% для партнёров, заключивших от 2 сделок в текущем квартале. Подробности — в личном кабинете.',
      images: [],
      createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      views: 178,
      likes: 61,
      dislikes: 0,
    },
  ]
  try {
    localStorage.setItem(broadcastStorageKey(projectId), JSON.stringify(rows))
  } catch { /* ignore */ }
  return rows
}

// ---------- Хранилище ----------

function migrateBroadcastRow(raw: unknown): BroadcastRow | null {
  const r = raw as Partial<BroadcastRow>
  if (!r.id || typeof r.subject !== 'string') return null
  const type: BroadcastType = r.type === 'promo' || r.type === 'object' ? r.type : 'news'
  return {
    id: r.id,
    type,
    subject: r.subject,
    body: typeof r.body === 'string' ? r.body : '',
    images: Array.isArray(r.images)
      ? r.images.filter((x): x is string => typeof x === 'string').slice(0, MAX_IMAGES)
      : [],
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
    views: typeof r.views === 'number' ? r.views : Math.floor(Math.random() * 40 + 5),
    likes: typeof r.likes === 'number' ? r.likes : Math.floor(Math.random() * 12),
    dislikes: typeof r.dislikes === 'number' ? r.dislikes : Math.floor(Math.random() * 3),
  }
}

function loadBroadcasts(projectId: string): BroadcastRow[] {
  try {
    const raw = localStorage.getItem(broadcastStorageKey(projectId))
    if (!raw) return seedBroadcasts(projectId)
    const rows = JSON.parse(raw) as unknown[]
    if (!Array.isArray(rows) || rows.length === 0) return seedBroadcasts(projectId)
    return rows.map(migrateBroadcastRow).filter((r): r is BroadcastRow => r != null)
  } catch {
    return []
  }
}

function saveBroadcasts(projectId: string, rows: BroadcastRow[]) {
  try {
    localStorage.setItem(broadcastStorageKey(projectId), JSON.stringify(rows))
  } catch { /* ignore */ }
}

// ---------- Стили ----------

const inputClass =
  'w-full rounded-[4px] border border-[rgba(201,168,76,0.22)] bg-[rgba(0,0,0,0.28)] px-3 py-2.5 text-[16px] text-[#ffffff] outline-none placeholder:text-[rgba(255,255,255,0.72)] focus:border-[rgba(201,168,76,0.5)] transition-colors'

const TYPE_VALUES: BroadcastType[] = ['news', 'promo', 'object']

const TYPE_FALLBACK_LABELS: Record<BroadcastType, string> = {
  news: 'Новость',
  promo: 'Акция',
  object: 'Объект',
}

function typeLabel(type: BroadcastType, t: Translate): string {
  return t(`salesManagement.notifications.types.${type}`, TYPE_FALLBACK_LABELS[type])
}

// ---------- Утилиты ----------

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}

// ---------- Модалка просмотра ----------

function PostModal({ row, onClose }: { row: BroadcastRow; onClose: () => void }) {
  const { t } = useI18n()
  const [activeImg, setActiveImg] = useState(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[8px] bg-[#112d1c] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18),0_8px_32px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Закрыть */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close', 'Закрыть')}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-[4px] bg-[rgba(0,0,0,0.50)] text-[rgba(255,255,255,0.72)] transition-colors hover:bg-[rgba(0,0,0,0.70)] hover:text-[#ffffff]"
        >
          <X size={16} />
        </button>

        {/* Галерея */}
        {row.images.length > 0 && (
          <div>
            <div className="relative overflow-hidden rounded-t-[8px]" style={{ aspectRatio: '16/9' }}>
              <img src={row.images[activeImg]} alt="" className="h-full w-full object-cover" />
              <span className="absolute left-3 top-3 rounded-[4px] bg-[rgba(7,40,33,0.82)] px-2 py-1 text-[16px] font-medium uppercase tracking-[0.08em] text-[#e6c364] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.35)]">
                {typeLabel(row.type, t)}
              </span>
            </div>
            {row.images.length > 1 && (
              <div className="flex gap-2 px-4 pt-3">
                {row.images.map((src, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveImg(idx)}
                    className={`h-14 w-20 shrink-0 overflow-hidden rounded-[4px] transition-all ${
                      activeImg === idx
                        ? 'shadow-[inset_0_0_0_2px_#e6c364]'
                        : 'opacity-50 hover:opacity-80'
                    }`}
                  >
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="p-5">
          {/* Тег если нет фото */}
          {row.images.length === 0 && (
            <span className="mb-3 inline-block rounded-[4px] bg-[rgba(230,195,100,0.12)] px-2 py-1 text-[16px] font-medium uppercase tracking-[0.08em] text-[#e6c364] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.28)]">
              {typeLabel(row.type, t)}
            </span>
          )}

          <time className="block text-[13px] text-[rgba(255,255,255,0.72)]" dateTime={row.createdAt}>
            {formatDate(row.createdAt)}
          </time>

          <h2 className="mt-2 text-[20px] font-medium leading-snug tracking-[-0.02em] text-[#fcecc8]">
            {row.subject}
          </h2>

          <p className="mt-3 whitespace-pre-wrap text-[16px] leading-relaxed text-[rgba(255,255,255,0.72)]">
            {row.body}
          </p>

          <div className="mt-5 flex items-center gap-5 text-[16px]">
            <span className="flex items-center gap-1.5 text-[rgba(255,255,255,0.72)]">
              <Eye size={16} />
              {row.views}
            </span>
            <span className="flex items-center gap-1.5 text-[rgba(100,210,140,0.85)]">
              <ThumbsUp size={16} />
              {row.likes}
            </span>
            <span className="flex items-center gap-1.5 text-[rgba(255,130,120,0.85)]">
              <ThumbsDown size={16} />
              {row.dislikes}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- Карточка в ленте ----------

function BroadcastCard({ row, onClick }: { row: BroadcastRow; onClick: () => void }) {
  const { t } = useI18n()
  const cover = row.images[0]

  return (
    <article
      className="cursor-pointer overflow-hidden rounded-[6px] bg-[#112d1c] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.12)] transition-colors hover:bg-[#163824]"
      onClick={onClick}
    >
      {cover && (
        <div className="relative overflow-hidden" style={{ aspectRatio: '16/9' }}>
          <img src={cover} alt="" className="h-full w-full object-cover" />
          <span className="absolute left-3 top-3 rounded-[4px] bg-[rgba(7,40,33,0.82)] px-2 py-1 text-[16px] font-medium uppercase tracking-[0.08em] text-[#e6c364] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.35)]">
            {typeLabel(row.type, t)}
          </span>
        </div>
      )}

      <div className="p-4">
        {!cover && (
          <span className="mb-2 inline-block rounded-[4px] bg-[rgba(230,195,100,0.10)] px-2 py-0.5 text-[16px] font-medium uppercase tracking-[0.08em] text-[#e6c364] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.28)]">
            {typeLabel(row.type, t)}
          </span>
        )}

        <h3 className="text-[17px] font-medium leading-snug tracking-[-0.02em] text-[#fcecc8]">
          {row.subject}
        </h3>

        {row.body && (
          <p
            className="mt-2 text-[16px] leading-relaxed text-[rgba(255,255,255,0.72)]"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {row.body}
          </p>
        )}

        <div className="mt-3 flex items-center gap-4 text-[16px]">
          <time className="text-[rgba(255,255,255,0.72)]" dateTime={row.createdAt}>
            {formatDate(row.createdAt)}
          </time>
          <span className="ml-auto flex items-center gap-1.5 text-[rgba(255,255,255,0.72)]">
            <Eye size={15} />
            {row.views}
          </span>
          <span className="flex items-center gap-1.5 text-[rgba(100,210,140,0.85)]">
            <ThumbsUp size={15} />
            {row.likes}
          </span>
          <span className="flex items-center gap-1.5 text-[rgba(255,130,120,0.85)]">
            <ThumbsDown size={15} />
            {row.dislikes}
          </span>
        </div>
      </div>
    </article>
  )
}

// ---------- Главный компонент ----------

export function RealtorNotificationsPanel({ project, readOnly }: { project: IProject; readOnly: boolean }) {
  const { t } = useI18n()
  const [postType, setPostType] = useState<BroadcastType>('news')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [history, setHistory] = useState<BroadcastRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [modalRow, setModalRow] = useState<BroadcastRow | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmDuration, setConfirmDuration] = useState<PromoDurationId>('24h')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setHistory(loadBroadcasts(project._id))
    setSubject('')
    setBody('')
    setImages([])
    setPostType('news')
    setError(null)
  }, [project._id])

  const blockedUntil = useMemo(() => {
    if (!history.length) return null
    const lastSent = new Date(history[0]!.createdAt).getTime()
    const next = lastSent + SEND_COOLDOWN_MS
    return Date.now() < next ? next : null
  }, [history])

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      if (readOnly) return
      const arr = Array.from(files).filter((f) => f.type.startsWith('image/'))
      const remaining = MAX_IMAGES - images.length
      if (remaining <= 0) return
      const toProcess = arr.slice(0, remaining)
      const b64s = await Promise.all(toProcess.map(fileToBase64))
      setImages((prev) => [...prev, ...b64s].slice(0, MAX_IMAGES))
    },
    [images.length, readOnly],
  )

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx))
  }

  const validateBeforeSend = (): boolean => {
    if (readOnly) return false
    setError(null)
    const trimmedSubject = subject.trim()
    const trimmedBody = body.trim()
    if (!trimmedSubject || !trimmedBody) {
      setError(t('salesManagement.notifications.errors.fillRequired', 'Заполните тему и текст публикации.'))
      return false
    }
    if (blockedUntil) {
      setError(t('salesManagement.notifications.errors.nextSendAfter', 'Следующая отправка доступна после {date}.').replace('{date}', new Date(blockedUntil).toLocaleString('ru-RU')))
      return false
    }
    return true
  }

  const openSendConfirm = () => {
    if (!validateBeforeSend()) return
    setConfirmDuration('24h')
    setConfirmOpen(true)
  }

  const [activating, setActivating] = useState(false)

  const confirmAndSend = async () => {
    if (activating) return
    setActivating(true)
    setError(null)
    try {
      const resp = await developmentApi.activatePromotion(project._id, {
        serviceId: REALTOR_OUTREACH_SERVICE_ID,
        durationId: confirmDuration,
      })
      if (!resp.success) throw new Error(resp.message || t('salesManagement.notifications.errors.activateFailed', 'Не удалось активировать услугу'))
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || t('salesManagement.notifications.errors.activateFailedOutreach', 'Не удалось активировать услугу «Обращение к риелторам».'))
      setActivating(false)
      return
    }
    setActivating(false)
    setConfirmOpen(false)
    send()
  }

  const send = () => {
    if (readOnly) return
    setError(null)
    const trimmedSubject = subject.trim()
    const trimmedBody = body.trim()
    if (!trimmedSubject || !trimmedBody) {
      setError(t('salesManagement.notifications.errors.fillRequired', 'Заполните тему и текст публикации.'))
      return
    }
    if (blockedUntil) {
      setError(t('salesManagement.notifications.errors.nextSendAfter', 'Следующая отправка доступна после {date}.').replace('{date}', new Date(blockedUntil).toLocaleString('ru-RU')))
      return
    }
    const row: BroadcastRow = {
      id: `bc-${Date.now()}`,
      type: postType,
      subject: trimmedSubject,
      body: trimmedBody,
      images: [...images],
      createdAt: new Date().toISOString(),
      views: 0,
      likes: 0,
      dislikes: 0,
    }
    const next = [row, ...history]
    saveBroadcasts(project._id, next)
    setHistory(next)
    setSubject('')
    setBody('')
    setImages([])
    setPostType('news')
  }

  const enhanceText = async () => {
    if (readOnly || !body.trim() || isEnhancing) return
    setIsEnhancing(true)
    setError(null)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const enhancedPrefix = t('salesManagement.notifications.enhancedPrefix', '✨ [Улучшено AI]:')
    const enhancedSuffix = t('salesManagement.notifications.enhancedSuffix', 'Свяжитесь с нами для подробностей!')
    const enhanced = `${enhancedPrefix} ${body.trim()}\n\n${enhancedSuffix}`
    setBody(enhanced.slice(0, BODY_MAX))
    setIsEnhancing(false)
  }

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,1.1fr)]">
        {/* Форма создания */}
        <div className="min-w-0 rounded-[6px] bg-[rgba(0,0,0,0.18)] p-4 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]">
          <div className="grid gap-4">
            {/* Тип публикации */}
            <div className="grid gap-1">
              <span className="text-[16px] text-[rgba(242,207,141,0.72)]">{t('salesManagement.notifications.postTypeLabel', 'Тип публикации')}</span>
              <div className="flex rounded-[4px] border border-[rgba(201,168,76,0.22)] bg-[#031d16] p-0.5">
                {TYPE_VALUES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    disabled={readOnly}
                    onClick={() => setPostType(value)}
                    className={`flex-1 rounded-[3px] px-3 py-2 text-[16px] font-normal transition-colors disabled:cursor-not-allowed ${
                      postType === value
                        ? 'bg-[rgba(230,195,100,0.18)] text-[#fcecc8] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.45)]'
                        : 'text-[rgba(255,255,255,0.72)] hover:text-[rgba(255,255,255,0.9)]'
                    }`}
                  >
                    {typeLabel(value, t)}
                  </button>
                ))}
              </div>
            </div>

            {/* Загрузка фото */}
            <div className="grid gap-2">
              <span className="text-[16px] text-[rgba(242,207,141,0.72)]">
                {t('salesManagement.notifications.photoLabel', 'Фото')}{' '}
                <span className="text-[rgba(255,255,255,0.72)]">
                  ({images.length}/{MAX_IMAGES})
                </span>
              </span>

              {images.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {images.map((src, idx) => (
                    <div
                      key={idx}
                      className="group relative overflow-hidden rounded-[4px]"
                      style={{ aspectRatio: '16/9' }}
                    >
                      <img src={src} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        aria-label={t('salesManagement.notifications.removePhotoAria', 'Удалить фото')}
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-[4px] bg-[rgba(0,0,0,0.60)] text-[rgba(255,255,255,0.9)] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[rgba(0,0,0,0.80)]"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {images.length < MAX_IMAGES && !readOnly && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setIsDragOver(true)
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setIsDragOver(false)
                    void processFiles(e.dataTransfer.files)
                  }}
                  className={`flex cursor-pointer select-none flex-col items-center justify-center gap-2 rounded-[4px] border border-dashed py-5 text-[16px] outline-none transition-colors focus-visible:border-[rgba(201,168,76,0.55)] ${
                    isDragOver
                      ? 'border-[rgba(201,168,76,0.60)] bg-[rgba(201,168,76,0.08)] text-[#e6c364]'
                      : 'border-[rgba(201,168,76,0.22)] bg-[rgba(0,0,0,0.15)] text-[rgba(242,207,141,0.72)] hover:border-[rgba(201,168,76,0.40)] hover:text-[#e6c364]'
                  }`}
                >
                  <ImagePlus size={20} />
                  <span>{t('salesManagement.notifications.addPhoto', 'Добавить фото')}</span>
                  <span className="text-[rgba(255,255,255,0.72)]">{t('salesManagement.notifications.orDragHere', 'или перетащите сюда')}</span>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) void processFiles(e.target.files)
                }}
              />
            </div>

            {/* Тема */}
            <label className="grid gap-1 text-[16px] text-[rgba(242,207,141,0.72)]">
              {t('salesManagement.notifications.subjectLabel', 'Тема')}
              <input
                value={subject}
                disabled={readOnly}
                onChange={(e) => setSubject(e.target.value.slice(0, SUBJECT_MAX))}
                className={inputClass}
                autoComplete="off"
              />
              <span className="text-right text-[13px] text-[rgba(255,255,255,0.72)]">
                {subject.length} / {SUBJECT_MAX}
              </span>
            </label>

            {/* Текст */}
            <label className="grid gap-1 text-[16px] text-[rgba(242,207,141,0.72)]">
              {t('salesManagement.notifications.bodyLabel', 'Текст')}
              <textarea
                value={body}
                disabled={readOnly || isEnhancing}
                onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
                rows={6}
                className={`${inputClass} resize-y`}
              />
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={enhanceText}
                  disabled={readOnly || isEnhancing || !body.trim()}
                  className="inline-flex items-center gap-1.5 text-[16px] text-[#e6c364] transition-colors hover:text-[#fcecc8] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Sparkles size={15} className={isEnhancing ? 'animate-pulse' : ''} />
                  {isEnhancing
                    ? t('salesManagement.notifications.enhancing', 'Улучшаем...')
                    : t('salesManagement.notifications.enhanceText', 'Улучшить текст')}
                </button>
                <span className="text-[13px] text-[rgba(255,255,255,0.72)]">
                  {body.length} / {BODY_MAX}
                </span>
              </div>
            </label>
          </div>

          {error && (
            <p className="mt-3 rounded-[4px] bg-[rgba(255,180,171,0.1)] px-3 py-2 text-[16px] text-[#ffb4ab] shadow-[inset_0_0_0_1px_rgba(255,180,171,0.25)]">
              {error}
            </p>
          )}

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={readOnly || Boolean(blockedUntil)}
              onClick={openSendConfirm}
              className="inline-flex items-center gap-2 rounded-[4px] bg-[#e6c364] px-4 py-2 text-[16px] text-[#072821] outline-none transition hover:bg-[#e2c97e] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Send size={16} />
              {t('salesManagement.notifications.send', 'Отправить')}
            </button>
            <span className="text-[16px] text-[rgba(255,255,255,0.72)]">
              {t('salesManagement.notifications.sendLimitNote', 'не чаще 1 раза в 24 ч')}
            </span>
          </div>
        </div>

        {/* Лента публикаций */}
        <div className="min-w-0 rounded-[6px] bg-[rgba(0,0,0,0.18)] p-4 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]">
          <div className="mb-3 text-[16px] font-medium uppercase tracking-[0.08em] text-[rgba(242,207,141,0.72)]">
            {t('salesManagement.notifications.historyTitle', 'История публикаций')}
          </div>

          <div className="max-h-[600px] overflow-y-auto">
            {history.length === 0 && (
              <div className="rounded-[6px] bg-[rgba(255,255,255,0.03)] px-4 py-10 text-center text-[16px] text-[rgba(255,255,255,0.72)] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.08)]">
                {t('salesManagement.notifications.historyEmpty', 'Публикаций пока нет')}
              </div>
            )}

            <div className="grid gap-3">
              {history.map((row) => (
                <BroadcastCard key={row.id} row={row} onClick={() => setModalRow(row)} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {modalRow && <PostModal row={modalRow} onClose={() => setModalRow(null)} />}

      {confirmOpen && (() => {
        const price = REALTOR_OUTREACH_PRICE_PER_24H * promoDurationFactor(confirmDuration)
        return (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={() => setConfirmOpen(false)}
          >
            <div
              className="w-full max-w-[480px] overflow-hidden rounded-[6px] bg-[#0a2418] shadow-[0_24px_64px_rgba(0,0,0,0.55),inset_0_0_0_1px_rgba(201,168,76,0.3)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 shadow-[inset_0_-1px_0_rgba(201,168,76,0.18)]">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-[4px] bg-[rgba(230,195,100,0.14)] text-[#e6c364] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.4)]">
                    <Send size={18} strokeWidth={1.6} />
                  </span>
                  <div>
                    <div className="text-[16px] font-medium uppercase tracking-[0.08em] text-[#e6c364]">{t('salesManagement.notifications.confirmModal.eyebrow', 'Подтверждение отправки')}</div>
                    <div className="text-[18px] tracking-[-0.01em] text-[#ffffff]">{t('salesManagement.notifications.confirmModal.title', 'Обращение к риелторам')}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-[4px] text-[rgba(255,255,255,0.72)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#ffffff]"
                  aria-label={t('common.close', 'Закрыть')}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="px-5 py-5">
                <p className="text-[16px] leading-snug text-[rgba(255,255,255,0.72)]">
                  {t('salesManagement.notifications.confirmModal.description', 'Рассылка отправится по партнёрской сети и активирует услугу «Обращение к риелторам» в продвижении.')}
                </p>

                <div className="mt-4">
                  <div className="mb-2 text-[16px] font-medium uppercase tracking-[0.08em] text-[rgba(242,207,141,0.72)]">
                    {t('salesManagement.notifications.confirmModal.durationLabel', 'Длительность активации')}
                  </div>
                  <div className="inline-flex items-center gap-1 rounded-[4px] bg-[rgba(0,0,0,0.25)] p-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]">
                    {PROMO_DURATIONS.map((d) => {
                      const selected = confirmDuration === d.id
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setConfirmDuration(d.id)}
                          className={`rounded-[4px] px-3 py-1.5 text-[15px] transition-colors ${
                            selected
                              ? 'bg-[rgba(230,195,100,0.16)] text-[#e6c364] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.4)]'
                              : 'text-[rgba(255,255,255,0.72)] hover:text-[#ffffff]'
                          }`}
                          aria-pressed={selected}
                        >
                          {d.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 rounded-[6px] bg-[rgba(208,232,223,0.06)] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(208,232,223,0.18)]">
                  <div className="flex items-center gap-2 text-[15px] text-[rgba(255,255,255,0.72)]">
                    <Timer size={14} className="text-[#d0e8df]" />
                    {promoDurationLabel(confirmDuration)}
                  </div>
                  <div className="text-[22px] font-medium tabular-nums text-[#e6c364]">${price}</div>
                </div>

                <p className="mt-3 text-[16px] leading-snug text-[rgba(255,255,255,0.72)]">
                  {t('salesManagement.notifications.confirmModal.minActiveNote', 'После подтверждения услуга будет активна минимум 24 часа — раньше отключить нельзя.')}
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 px-5 py-4 shadow-[inset_0_1px_0_rgba(201,168,76,0.18)]">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className="rounded-[4px] px-4 py-2 text-[16px] text-[rgba(255,255,255,0.72)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#ffffff]"
                >
                  {t('common.cancel', 'Отмена')}
                </button>
                <button
                  type="button"
                  disabled={activating}
                  onClick={() => void confirmAndSend()}
                  className="flex items-center gap-2 rounded-[4px] bg-[#e6c364] px-4 py-2 text-[16px] font-medium text-[#072821] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.6)] hover:bg-[rgba(230,195,100,0.9)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Rocket size={15} strokeWidth={2} className={activating ? 'animate-pulse' : ''} />
                  {activating
                    ? t('salesManagement.notifications.confirmModal.activating', 'Активируем…')
                    : t('salesManagement.notifications.confirmModal.activateAndSend', 'Активировать и отправить')}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}
