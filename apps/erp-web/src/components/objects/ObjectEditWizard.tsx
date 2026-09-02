import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BadgePercent,
  Building2,
  Check,
  FileText,
  Home,
  LayoutGrid,
  MapPin,
  Upload,
  X,
} from 'lucide-react'
import type {
  BooleanChoice,
  Property,
  PropertyDetails,
  PropertyType,
  SaleStatus,
  SellerType,
} from '@/components/management/my-properties/types'
import { AddressSearchInput } from '@/components/ui/AddressSearchInput'
import { MapPickerModal } from '@/components/ui/MapPickerModal'
import { useI18n } from '@/i18n'
import { propertyAssetsApi, getCreateIdempotencyKey, resetCreateIdempotencyKey } from '@/services/propertyAssetsApi'
import { uiPropertyTypeToAsset, mapPropertyAssetToUiProperty } from '@/lib/map-property-asset'

/* ─── Шаги ───────────────────────────────────────────────────────────── */

const STEPS = [
  { id: 1, label: 'Тип сделки', icon: Building2 },
  { id: 2, label: 'Расположение', icon: MapPin },
  { id: 3, label: 'Базовые параметры', icon: FileText },
  { id: 4, label: 'Характеристики', icon: Home },
  { id: 5, label: 'Дом и удобства', icon: LayoutGrid },
  { id: 6, label: 'Комиссия и статус', icon: BadgePercent },
]

const DEAL_TYPES = ['Продажа', 'Сдача в аренду']
const OBJECT_TYPES: PropertyType[] = ['Квартира', 'Апартаменты', 'Дом', 'Участок', 'Коммерция', 'Проект']

const COUNTRY_OPTIONS = ['Грузия', 'Таиланд', 'Турция', 'Индонезия', 'Польша']
const CITIES_BY_COUNTRY: Record<string, string[]> = {
  Грузия: ['Батуми', 'Тбилиси', 'Кобулети', 'Чакви', 'Гудаури'],
  Таиланд: ['Пхукет', 'Бангкок', 'Паттайя', 'Самуи'],
  Турция: ['Стамбул', 'Анталья', 'Аланья', 'Бодрум'],
  Индонезия: ['Бали', 'Джакарта', 'Ломбок'],
  Польша: ['Варшава', 'Краков', 'Гданьск'],
}

const ROOMS_OPTIONS = ['Студия', '1+1', '2+1', '3+1', '4+1'] as const
const ROOMS_TO_NUMBER: Record<string, number> = { 'Студия': 1, '1+1': 2, '2+1': 3, '3+1': 4, '4+1': 5 }

const RENOVATION_OPTIONS = ['Без ремонта', 'Черновая отделка', 'С ремонтом', 'Под ключ']
const CEILING_OPTIONS = ['2.5 м', '2.7 м', '2.8 м', '3.0 м', '3.2 м', '3.5 м', '4.0 м+']
const BATHROOM_TYPES = ['Совмещенный', 'Раздельный']
const BATHROOM_COUNTS = ['1', '2', '3', '4']
const VIEW_OPTIONS = ['На двор', 'На горы', 'На море', 'На город']

const BALCONY_OPTIONS = ['Лоджия', 'Балкон', 'Нет']
const ELEVATOR_OPTIONS = ['Пассажирский', 'Грузовой']
const PARKING_OPTIONS = ['Наземная', 'Подземная', 'Многоуровневая', 'Уличная']
const WALL_MATERIALS = ['Монолит-каркас', 'Монолит-кирпич', 'Кирпичный', 'Панельный', 'Блочный']
const WATER_OPTIONS = ['Центральное', 'Скважина', 'Нет']
const SEWAGE_OPTIONS = ['Центральная', 'Септик']
const SHORELINE_OPTIONS = ['1-я линия', '2-я линия', '3-я линия', 'Город']
const ROAD_OPTIONS = ['Асфальт', 'Грунтовка', 'Нет подъезда']
const AMENITIES_OPTIONS = [
  'Охрана', 'Детская площадка', 'Спортзал', 'Бассейн', 'Консьерж', 'Посудомоечная машина',
  'Школа рядом', 'Детский сад рядом', 'Терасса на крыше', 'Зона барбекю', 'Духовка', 'Ванна',
]

const SELLER_TYPES: { value: SellerType; label: string }[] = [
  { value: 'owner', label: 'Собственник' },
  { value: 'agent', label: 'Агент' },
  { value: 'developer', label: 'Застройщик' },
]

const COMMISSION_OPTIONS = [
  { value: '0', label: '0% — Без комиссии' },
  { value: '3', label: '3% — Минимальный уровень' },
  { value: '3.5', label: '3.5% — Чуть выше среднего' },
  { value: '4', label: '4% — Оптимальный баланс' },
  { value: '4.5', label: '4.5% — Повышенный интерес' },
  { value: '5', label: '5% — Максимальный приоритет' },
]

const MLS_SPLIT = [
  { key: 'buyer',    label: 'Сторона покупателя',          percent: 40, color: '#e6c364' },
  { key: 'seller',   label: 'Сторона продавца',            percent: 40, color: '#53c993' },
  { key: 'platform', label: 'Платформа',                   percent: 10, color: '#cf91d8' },
  { key: 'partner',  label: 'Партнёр города · арбитр MLS',  percent: 10, color: '#ef8d6b' },
] as const

const STATUS_OPTIONS: { value: SaleStatus; label: string }[] = [
  { value: 'for_sale', label: 'В продаже' },
  { value: 'draft', label: 'Черновик' },
  { value: 'sold', label: 'Продано' },
]

const EMPTY_DETAILS: PropertyDetails = {
  searchValue: '', summary: '', description: '', address: '', mapLocationLabel: '',
  mapLat: '', mapLng: '', views: [], roadType: '', shoreline: '', renovation: '',
  bathroomType: '', bathroomsCount: '', balconyType: '', ceilingHeight: '',
  planFileName: '', mediaFileNames: [], elevatorOptions: [], parkingOptions: [],
  propertyUsage: [], wallMaterial: '', gas: '', waterSupply: '', sewage: '',
  landType: '', electricity: '', amenities: [], commissionPercent: '',
  sellerType: 'agent', mortgageAvailable: false, installmentAvailable: false,
  priceOnRequest: false, isMls: false,
}

/* ─── Стили ──────────────────────────────────────────────────────────── */

const inputCls =
  'h-10 w-full rounded-md border border-[rgba(242,207,141,0.25)] bg-[rgba(0,0,0,0.35)] px-3 text-[16px] font-normal text-[#fcecc8] placeholder:text-[rgba(242,207,141,0.72)] outline-none focus:border-[rgba(242,207,141,0.5)] transition-colors'
const textareaCls =
  'w-full rounded-md border border-[rgba(242,207,141,0.25)] bg-[rgba(0,0,0,0.35)] px-3 py-2 text-[16px] font-normal text-[#fcecc8] placeholder:text-[rgba(242,207,141,0.72)] outline-none focus:border-[rgba(242,207,141,0.5)] transition-colors resize-none'
const labelCls = 'flex flex-col gap-1.5'
const labelTextCls = 'text-[16px] font-normal text-[rgba(242,207,141,0.85)]'
const sectionTitleCls = 'text-[18px] font-medium text-[#fcecc8]'

/* ─── Состояние формы ────────────────────────────────────────────────── */

interface WizardValues {
  dealType: string
  type: PropertyType
  country: string
  city: string
  address: string
  representativePhone: string
  mapLat: string
  mapLng: string
  title: string
  description: string
  area: string
  price: string
  pricePerM2: string
  priceOnRequest: boolean
  roomsLabel: string
  floor: string
  totalFloors: string
  renovation: string
  ceilingHeight: string
  bathroomType: string
  bathroomsCount: string
  views: string[]
  balconyType: string
  elevatorOptions: string[]
  parkingOptions: string[]
  wallMaterial: string
  gas: BooleanChoice
  waterSupply: string
  sewage: string
  shoreline: string
  roadType: string
  amenities: string[]
  sellerType: SellerType
  commissionPercent: string
  mortgageAvailable: boolean
  installmentAvailable: boolean
  isMls: boolean
  status: SaleStatus
}

function roomsToLabel(rooms: number): string {
  if (rooms <= 1) return 'Студия'
  if (rooms >= 5) return '4+1'
  return `${rooms - 1}+1`
}

function valuesFromProperty(property: Property): WizardValues {
  const d = property.details ?? EMPTY_DETAILS
  const rawAsset = (property as { rawAsset?: { representativePhone?: string } }).rawAsset
  return {
    dealType: property.category === 'rent' ? 'Сдача в аренду' : 'Продажа',
    type: property.type,
    country: property.country,
    city: property.city,
    address: property.street,
    representativePhone: rawAsset?.representativePhone || '+995500123456',
    mapLat: d.mapLat,
    mapLng: d.mapLng,
    title: property.title,
    description: d.description,
    area: property.area > 0 ? String(property.area) : '',
    price: property.price > 0 ? String(property.price) : '',
    pricePerM2: property.pricePerM2 > 0 ? String(property.pricePerM2) : '',
    priceOnRequest: d.priceOnRequest,
    roomsLabel: roomsToLabel(property.rooms),
    floor: property.floor > 0 ? String(property.floor) : '',
    totalFloors: property.totalFloors > 0 ? String(property.totalFloors) : '',
    renovation: d.renovation,
    ceilingHeight: d.ceilingHeight,
    bathroomType: d.bathroomType,
    bathroomsCount: d.bathroomsCount,
    views: d.views,
    balconyType: d.balconyType,
    elevatorOptions: d.elevatorOptions,
    parkingOptions: d.parkingOptions,
    wallMaterial: d.wallMaterial,
    gas: d.gas,
    waterSupply: d.waterSupply,
    sewage: d.sewage,
    shoreline: d.shoreline,
    roadType: d.roadType,
    amenities: d.amenities,
    sellerType: d.sellerType,
    commissionPercent: d.commissionPercent || '3',
    mortgageAvailable: d.mortgageAvailable,
    installmentAvailable: d.installmentAvailable,
    isMls: d.isMls,
    status: property.status,
  }
}

/* ─── Компонент ──────────────────────────────────────────────────────── */

interface ObjectEditWizardProps {
  property: Property
  mode?: 'create' | 'edit'
  onClose: () => void
  onSave: (next: Property) => void
}

export function ObjectEditWizard({ property, mode = 'edit', onClose, onSave }: ObjectEditWizardProps) {
  const { t } = useI18n()
  const [step, setStep] = useState(1)
  const [values, setValues] = useState<WizardValues>(() => {
    const initial = valuesFromProperty(property)
    if (mode === 'create' && initial.status === 'sold') initial.status = 'for_sale'
    return initial
  })
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isMapOpen, setIsMapOpen] = useState(false)
  const [photos, setPhotos] = useState<{ id: string; url: string; name: string }[]>(() =>
    property.photo ? [{ id: 'current', url: property.photo, name: 'Текущее фото' }] : [],
  )
  const objectUrlsRef = useRef<string[]>([])
  const dragIndexRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      objectUrlsRef.current = []
    }
  }, [])

  const cities = useMemo(() => CITIES_BY_COUNTRY[values.country] ?? [], [values.country])

  const statusOptions = mode === 'create'
    ? STATUS_OPTIONS.filter((option) => option.value !== 'sold')
    : STATUS_OPTIONS

  const mlsEligible = property.category === 'secondary' && values.dealType === 'Продажа'
  const mlsPool = (() => {
    const price = Number(values.price) || 0
    const pct = Number(values.commissionPercent) || 0
    return price > 0 && pct > 0 ? (price * pct) / 100 : 0
  })()
  const mlsAmount = (percent: number) =>
    mlsPool > 0 ? `$${Math.round((mlsPool * percent) / 100).toLocaleString('ru-RU')}` : ''

  function set<K extends keyof WizardValues>(key: K, value: WizardValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function toggleArr(key: 'views' | 'elevatorOptions' | 'parkingOptions' | 'amenities', value: string) {
    setValues((current) => {
      const list = current[key]
      return {
        ...current,
        [key]: list.includes(value) ? list.filter((item) => item !== value) : [...list, value],
      }
    })
  }

  function handlePhotosUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    const added = Array.from(files).map((file, index) => {
      const url = URL.createObjectURL(file)
      objectUrlsRef.current.push(url)
      return { id: `${Date.now()}-${index}-${file.name}`, url, name: file.name }
    })
    setPhotos((current) => [...current, ...added])
  }

  function movePhoto(targetIndex: number) {
    const fromIndex = dragIndexRef.current
    if (fromIndex === null || fromIndex === targetIndex) return
    setPhotos((current) => {
      const next = [...current]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })
    dragIndexRef.current = targetIndex
  }

  function removePhoto(id: string) {
    setPhotos((current) => current.filter((photo) => photo.id !== id))
  }

  const createAttemptRef = useRef<string>('')

  async function handleSave() {
    if (!values.title.trim()) {
      setStep(3)
      setError('Укажите название объявления')
      return
    }
    const area = Number(values.area)
    const price = Number(values.price)
    if (!values.priceOnRequest && (!price || price <= 0)) {
      setStep(3)
      setError('Укажите цену или включите «Цена по запросу»')
      return
    }
    if (!area || area <= 0) {
      setStep(3)
      setError('Укажите общую площадь')
      return
    }

    setIsSaving(true)
    setError('')

    // Одна попытка создания = один ключ. Повтор после сетевой ошибки уходит с
    // тем же ключом, иначе backend создаст второй объект.
    if (!createAttemptRef.current) {
      createAttemptRef.current = `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    }
    const attempt = createAttemptRef.current

    try {
      if (mode === 'create') {
        const phone = values.representativePhone.trim() || '+995500123456'
        const lng = Number(values.mapLng) || 41.64
        const lat = Number(values.mapLat) || 41.64

        const asset = await propertyAssetsApi.createAsset({
          propertyType: uiPropertyTypeToAsset(values.type),
          commercialSubtype: values.type === 'Коммерция' ? 'office' : undefined,
          location: {
            country: values.country || 'Грузия',
            city: values.city || 'Батуми',
            address: values.address || 'ул. Руставели, 1',
            geo: {
              type: 'Point',
              coordinates: [lng, lat],
            },
          },
          characteristics: {
            area,
            rooms: ROOMS_TO_NUMBER[values.roomsLabel] ?? 1,
            floor: Number(values.floor) || 1,
            totalFloors: Number(values.totalFloors) || 1,
          },
          representativePhone: phone,
        }, getCreateIdempotencyKey(`${attempt}:asset`))

        const dealType = values.dealType === 'Сдача в аренду' ? 'rent_long' : 'sale'
        const listing = await propertyAssetsApi.createListing(asset._id, {
          dealType,
          price: {
            amountMinorUnits: Math.round((price || 0) * 100),
            currency: 'USD',
          },
        }, getCreateIdempotencyKey(`${attempt}:listing`))

        // Создание прошло: следующая отправка формы — это новая сущность,
        // а не повтор той же, значит нужен новый ключ.
        resetCreateIdempotencyKey(`${attempt}:asset`)
        resetCreateIdempotencyKey(`${attempt}:listing`)
        createAttemptRef.current = ''

        let finalListing = listing
        if (values.status === 'for_sale') {
          try {
            finalListing = await propertyAssetsApi.activateListing(asset._id, listing._id)
          } catch (actErr) {
            console.warn('Listing activation failed:', actErr)
          }
        }

        const mapped = mapPropertyAssetToUiProperty(asset, [finalListing])
        mapped.title = values.title.trim()
        if (mapped.details) {
          mapped.details.description = values.description
          mapped.details.commissionPercent = values.commissionPercent
          mapped.details.sellerType = values.sellerType
          mapped.details.renovation = values.renovation
          mapped.details.amenities = values.amenities
        }
        objectUrlsRef.current = []
        onSave(mapped)
        onClose()
      } else {
        const pricePerM2 = Number(values.pricePerM2) || (area > 0 ? Math.round(price / area) : 0)
        const category =
          values.dealType === 'Сдача в аренду'
            ? 'rent'
            : values.type === 'Коммерция'
              ? 'commercial'
              : property.category === 'rent'
                ? 'secondary'
                : property.category

        const details: PropertyDetails = {
          ...(property.details ?? EMPTY_DETAILS),
          description: values.description,
          address: values.address,
          mapLocationLabel: values.address,
          mapLat: values.mapLat,
          mapLng: values.mapLng,
          views: values.views,
          roadType: values.roadType,
          shoreline: values.shoreline,
          renovation: values.renovation,
          bathroomType: values.bathroomType,
          bathroomsCount: values.bathroomsCount,
          balconyType: values.balconyType,
          ceilingHeight: values.ceilingHeight,
          elevatorOptions: values.elevatorOptions,
          parkingOptions: values.parkingOptions,
          wallMaterial: values.wallMaterial,
          gas: values.gas,
          waterSupply: values.waterSupply,
          sewage: values.sewage,
          amenities: values.amenities,
          mediaFileNames: photos.map((photo) => photo.name),
          commissionPercent: values.commissionPercent,
          sellerType: values.sellerType,
          mortgageAvailable: values.mortgageAvailable,
          installmentAvailable: values.installmentAvailable,
          isMls: property.category === 'secondary' && values.dealType === 'Продажа' ? values.isMls : false,
          priceOnRequest: values.priceOnRequest,
        }

        objectUrlsRef.current = []

        onSave({
          ...property,
          title: values.title.trim(),
          type: values.type,
          category,
          country: values.country,
          city: values.city,
          street: values.address,
          floor: Number(values.floor) || 0,
          totalFloors: Number(values.totalFloors) || 0,
          rooms: ROOMS_TO_NUMBER[values.roomsLabel] ?? 1,
          area,
          price: values.priceOnRequest ? property.price : price,
          pricePerM2,
          status: values.status,
          photo: photos[0]?.url ?? property.photo,
          photos: photos.map((p) => p.url),
          details,
        })
        onClose()
      }
    } catch (err: unknown) {
      const anyErr = err as {
        response?: { status?: number; data?: { message?: string; error?: { message?: string } } }
        message?: string
      }
      const msg =
        anyErr?.response?.data?.error?.message ||
        anyErr?.response?.data?.message ||
        (err instanceof Error ? err.message : 'Не удалось сохранить объект')
      setError(msg)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#06130f] font-['Montserrat',sans-serif]">
      {/* Шапка */}
      <div className="flex items-center gap-3 px-8 pb-4 pt-6">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-2 text-[16px] font-normal text-[rgba(242,207,141,0.7)] transition-colors hover:text-[#fcecc8]"
        >
          <ArrowLeft size={16} />
          {t('objects.objectEditWizard.объекты')}</button>
        <span className="text-[16px] text-[rgba(242,207,141,0.4)]">/</span>
        <span className="min-w-0 truncate text-[16px] font-normal text-[#fcecc8]">
          {mode === 'create' ? 'Новый объект' : `Редактировать: ${property.title}`}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('objects.objectEditWizard.закрыть')}
          className="ml-auto flex size-9 items-center justify-center rounded-md border border-[rgba(242,207,141,0.25)] text-[rgba(242,207,141,0.72)] transition-colors hover:border-[rgba(242,207,141,0.45)] hover:text-[#fcecc8]"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 gap-6 overflow-hidden px-8 pb-8">
        {/* Левая колонка — шаги */}
        <div className="flex w-56 shrink-0 flex-col gap-1 overflow-hidden">
          {STEPS.map((s) => {
            const active = step === s.id
            const Icon = s.icon
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors ${
                  active
                    ? 'bg-[rgba(201,168,76,0.15)] text-[#fcecc8]'
                    : 'text-[#c9a84c] hover:bg-[rgba(201,168,76,0.08)]'
                }`}
              >
                <div
                  className={`flex size-7 shrink-0 items-center justify-center rounded-md border transition-all ${
                    active
                      ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.15)] text-[#fcecc8]'
                      : 'border-[rgba(242,207,141,0.2)] text-[rgba(242,207,141,0.72)]'
                  }`}
                >
                  <Icon size={13} />
                </div>
                <span className="text-[16px] font-normal leading-tight">{s.label}</span>
                {active && <div className="ml-auto h-4 w-1 rounded-sm bg-[#c9a84c]" />}
              </button>
            )
          })}

          <div className="mt-auto flex flex-col gap-2 pt-4">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                className="flex items-center gap-2 rounded-md border border-[rgba(242,207,141,0.25)] px-3 py-2 text-[16px] font-normal text-[rgba(242,207,141,0.72)] transition-colors hover:border-[rgba(242,207,141,0.45)] hover:text-[#fcecc8]"
              >
                <ArrowLeft size={14} />
                {t('objects.objectEditWizard.назад')}</button>
            )}
            {step < STEPS.length && (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(STEPS.length, s + 1))}
                className="flex items-center justify-center gap-2 rounded-md border border-[#c9a84c] bg-[rgba(201,168,76,0.15)] px-3 py-2 text-[16px] font-normal text-[#fcecc8] transition-colors hover:bg-[rgba(201,168,76,0.25)]"
              >
                {t('objects.objectEditWizard.далее')}<ArrowRight size={14} />
              </button>
            )}
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="flex items-center justify-center gap-2 rounded-md bg-[#e6c364] px-3 py-2 text-[16px] font-normal text-[#072821] transition-colors hover:bg-[#e2c97e] disabled:opacity-50"
            >
              <Check size={14} />
              {isSaving ? 'Сохранение...' : mode === 'create' ? 'Создать объект' : 'Сохранить'}
            </button>
            <span className="text-center text-[16px] text-[rgba(242,207,141,0.72)]">
              {step} / {STEPS.length}
            </span>
          </div>
        </div>

        {/* Правая колонка — контент шага */}
        <div className="min-w-0 flex-1 overflow-y-auto pr-1">
          {error && (
            <div className="mb-4 rounded-md border border-[rgba(240,141,137,0.4)] bg-[rgba(240,141,137,0.1)] px-4 py-3 text-[16px] text-[#f08d89]">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-5">
              <span className={sectionTitleCls}>{t('objects.objectEditWizard.тип_сделки')}</span>
              <ChipRow options={DEAL_TYPES} selected={values.dealType} onSelect={(v) => set('dealType', v)} />
              <span className={sectionTitleCls}>{t('objects.objectEditWizard.тип_объекта')}</span>
              <ChipRow
                options={OBJECT_TYPES}
                selected={values.type}
                onSelect={(v) => set('type', v as PropertyType)}
              />
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <span className={sectionTitleCls}>{t('objects.objectEditWizard.расположение')}</span>
              <div className="grid max-w-2xl grid-cols-2 gap-4">
                <label className={labelCls}>
                  <span className={labelTextCls}>{t('objects.objectEditWizard.страна')}</span>
                  <select
                    value={values.country}
                    onChange={(event) => {
                      const country = event.target.value
                      set('country', country)
                      set('city', (CITIES_BY_COUNTRY[country] ?? [])[0] ?? '')
                    }}
                    className={inputCls}
                  >
                    {COUNTRY_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className={labelCls}>
                  <span className={labelTextCls}>{t('objects.objectEditWizard.город')}</span>
                  <select
                    value={values.city}
                    onChange={(event) => set('city', event.target.value)}
                    className={inputCls}
                  >
                    {[...new Set([values.city, ...cities])].filter(Boolean).map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={`${labelCls} max-w-2xl`}>
                <span className={labelTextCls}>{t('objects.objectEditWizard.адрес')}</span>
                <div className="flex gap-2">
                  <AddressSearchInput
                    className="flex-1"
                    value={values.address}
                    onChange={(value) => set('address', value)}
                    placeholder={t('objects.objectEditWizard.улица_дом')}
                  />
                  <button
                    type="button"
                    onClick={() => setIsMapOpen(true)}
                    title={t('objects.objectEditWizard.выбрать_на_карте')}
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-[rgba(242,207,141,0.3)] bg-[rgba(0,0,0,0.3)] px-3 text-[16px] font-normal text-[rgba(242,207,141,0.8)] transition-colors hover:border-[rgba(242,207,141,0.5)] hover:bg-[rgba(242,207,141,0.08)] hover:text-[#fcecc8]"
                  >
                    <MapPin size={14} />
                    {t('objects.objectEditWizard.карта')}</button>
                </div>
                {values.mapLat && values.mapLng && (
                  <span className="text-[16px] text-[rgba(242,207,141,0.72)]">
                    {t('objects.objectEditWizard.точка_на_карте')}{Number(values.mapLat).toFixed(5)}, {Number(values.mapLng).toFixed(5)}
                  </span>
                )}
              </div>
              <div className={`${labelCls} max-w-2xl`}>
                <span className={labelTextCls}>Телефон представителя</span>
                <input
                  type="tel"
                  value={values.representativePhone}
                  onChange={(event) => set('representativePhone', event.target.value)}
                  placeholder="+995500123456"
                  className={inputCls}
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex max-w-3xl flex-col gap-4">
              <span className={sectionTitleCls}>{t('objects.objectEditWizard.базовые_параметры')}</span>
              <label className={labelCls}>
                <span className={labelTextCls}>{t('objects.objectEditWizard.название_объявления')}</span>
                <input
                  value={values.title}
                  onChange={(event) => set('title', event.target.value)}
                  placeholder={t('objects.objectEditWizard.пример_1_1_на_новом')}
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                <span className={labelTextCls}>{t('objects.objectEditWizard.описание')}</span>
                <textarea
                  value={values.description}
                  onChange={(event) => set('description', event.target.value)}
                  rows={5}
                  placeholder={t('objects.objectEditWizard.расположение_инфраст')}
                  className={textareaCls}
                />
              </label>
              <div className="grid grid-cols-3 gap-4">
                <label className={labelCls}>
                  <span className={labelTextCls}>{t('objects.objectEditWizard.общая_площадь_м')}</span>
                  <input
                    value={values.area}
                    onChange={(event) => set('area', event.target.value.replace(/[^\d.]/g, ''))}
                    inputMode="decimal"
                    className={inputCls}
                  />
                </label>
                <label className={labelCls}>
                  <span className={labelTextCls}>{t('objects.objectEditWizard.цена')}</span>
                  <input
                    value={values.price}
                    onChange={(event) => set('price', event.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    disabled={values.priceOnRequest}
                    className={`${inputCls} disabled:opacity-50`}
                  />
                </label>
                <label className={labelCls}>
                  <span className={labelTextCls}>{t('objects.objectEditWizard.цена_за_м')}</span>
                  <input
                    value={values.pricePerM2}
                    onChange={(event) => set('pricePerM2', event.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    disabled={values.priceOnRequest}
                    className={`${inputCls} disabled:opacity-50`}
                  />
                </label>
              </div>
              <ChipMulti
                options={['Цена по запросу']}
                selected={values.priceOnRequest ? ['Цена по запросу'] : []}
                onToggle={() => set('priceOnRequest', !values.priceOnRequest)}
              />
              <span className={sectionTitleCls}>{t('objects.objectEditWizard.фото')}</span>
              <div className="flex flex-wrap gap-3">
                {photos.map((photo, index) => (
                  <div
                    key={photo.id}
                    draggable
                    onDragStart={() => { dragIndexRef.current = index }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragEnter={() => movePhoto(index)}
                    onDragEnd={() => { dragIndexRef.current = null }}
                    className={`group relative h-28 w-44 shrink-0 cursor-grab overflow-hidden rounded-md border bg-[rgba(0,0,0,0.35)] active:cursor-grabbing ${
                      index === 0
                        ? 'border-[#c9a84c] shadow-[0_0_0_1px_#c9a84c]'
                        : 'border-[rgba(242,207,141,0.25)]'
                    }`}
                  >
                    <img src={photo.url} alt="" className="size-full select-none object-cover" />
                    {index === 0 && (
                      <span className="absolute inset-x-0 bottom-0 bg-[rgba(201,168,76,0.92)] py-0.5 text-center text-[16px] font-normal text-[#072821]">
                        {t('objects.objectEditWizard.главное')}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-[rgba(0,0,0,0.7)] text-[#fcecc8] opacity-0 transition-opacity hover:bg-[rgba(240,141,137,0.8)] group-hover:opacity-100"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <label className="flex h-28 w-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[rgba(242,207,141,0.3)] bg-[rgba(0,0,0,0.2)] text-[rgba(242,207,141,0.72)] transition-colors hover:border-[#c9a84c] hover:bg-[rgba(201,168,76,0.06)] hover:text-[#fcecc8]">
                  <Upload size={18} />
                  <span className="text-center text-[16px] font-normal leading-tight">
                    {t('objects.objectEditWizard.загрузить_фото')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => {
                      handlePhotosUpload(event.target.files)
                      event.target.value = ''
                    }}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex max-w-3xl flex-col gap-4">
              <span className={sectionTitleCls}>{t('objects.objectEditWizard.характеристики_объек')}</span>
              <div className="grid grid-cols-3 gap-4">
                <div className={labelCls}>
                  <span className={labelTextCls}>{t('objects.objectEditWizard.комнатность')}</span>
                  <ChipRow
                    options={ROOMS_OPTIONS}
                    selected={values.roomsLabel}
                    onSelect={(v) => set('roomsLabel', v)}
                  />
                </div>
                <label className={labelCls}>
                  <span className={labelTextCls}>{t('objects.objectEditWizard.этаж')}</span>
                  <input
                    value={values.floor}
                    onChange={(event) => set('floor', event.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    className={inputCls}
                  />
                </label>
                <label className={labelCls}>
                  <span className={labelTextCls}>{t('objects.objectEditWizard.всего_этажей')}</span>
                  <input
                    value={values.totalFloors}
                    onChange={(event) => set('totalFloors', event.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    className={inputCls}
                  />
                </label>
              </div>
              <div className={labelCls}>
                <span className={labelTextCls}>{t('objects.objectEditWizard.ремонт')}</span>
                <ChipRow
                  options={RENOVATION_OPTIONS}
                  selected={values.renovation}
                  onSelect={(v) => set('renovation', v)}
                  allowDeselect
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className={labelCls}>
                  <span className={labelTextCls}>{t('objects.objectEditWizard.высота_потолков')}</span>
                  <select
                    value={values.ceilingHeight}
                    onChange={(event) => set('ceilingHeight', event.target.value)}
                    className={inputCls}
                  >
                    <option value="">{t('objects.objectEditWizard.не_указано')}</option>
                    {CEILING_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <div className={labelCls}>
                  <span className={labelTextCls}>{t('objects.objectEditWizard.балкон_лоджия')}</span>
                  <ChipRow
                    options={BALCONY_OPTIONS}
                    selected={values.balconyType}
                    onSelect={(v) => set('balconyType', v)}
                    allowDeselect
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className={labelCls}>
                  <span className={labelTextCls}>{t('objects.objectEditWizard.санузел')}</span>
                  <ChipRow
                    options={BATHROOM_TYPES}
                    selected={values.bathroomType}
                    onSelect={(v) => set('bathroomType', v)}
                    allowDeselect
                  />
                </div>
                <div className={labelCls}>
                  <span className={labelTextCls}>{t('objects.objectEditWizard.количество_санузлов')}</span>
                  <ChipRow
                    options={BATHROOM_COUNTS}
                    selected={values.bathroomsCount}
                    onSelect={(v) => set('bathroomsCount', v)}
                  />
                </div>
              </div>
              <div className={labelCls}>
                <span className={labelTextCls}>{t('objects.objectEditWizard.вид_из_окон')}</span>
                <ChipMulti
                  options={VIEW_OPTIONS}
                  selected={values.views}
                  onToggle={(v) => toggleArr('views', v)}
                />
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="flex max-w-3xl flex-col gap-4">
              <span className={sectionTitleCls}>{t('objects.objectEditWizard.дом_и_удобства')}</span>
              <div className="grid grid-cols-2 gap-4">
                <div className={labelCls}>
                  <span className={labelTextCls}>{t('objects.objectEditWizard.лифт')}</span>
                  <ChipMulti
                    options={ELEVATOR_OPTIONS}
                    selected={values.elevatorOptions}
                    onToggle={(v) => toggleArr('elevatorOptions', v)}
                  />
                </div>
                <div className={labelCls}>
                  <span className={labelTextCls}>{t('objects.objectEditWizard.парковка')}</span>
                  <ChipMulti
                    options={PARKING_OPTIONS}
                    selected={values.parkingOptions}
                    onToggle={(v) => toggleArr('parkingOptions', v)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className={labelCls}>
                  <span className={labelTextCls}>{t('objects.objectEditWizard.газ')}</span>
                  <ChipRow
                    options={['Да', 'Нет']}
                    selected={values.gas === 'yes' ? 'Да' : values.gas === 'no' ? 'Нет' : ''}
                    onSelect={(label) => set('gas', label === 'Да' ? 'yes' : 'no')}
                    allowDeselect
                  />
                </div>
                <div className={labelCls}>
                  <span className={labelTextCls}>{t('objects.objectEditWizard.водоснабжение')}</span>
                  <ChipRow
                    options={WATER_OPTIONS}
                    selected={values.waterSupply}
                    onSelect={(v) => set('waterSupply', v)}
                    allowDeselect
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className={labelCls}>
                  <span className={labelTextCls}>{t('objects.objectEditWizard.канализация')}</span>
                  <ChipRow
                    options={SEWAGE_OPTIONS}
                    selected={values.sewage}
                    onSelect={(v) => set('sewage', v)}
                    allowDeselect
                  />
                </div>
                <div className={labelCls}>
                  <span className={labelTextCls}>{t('objects.objectEditWizard.береговая_линия')}</span>
                  <ChipRow
                    options={SHORELINE_OPTIONS}
                    selected={values.shoreline}
                    onSelect={(v) => set('shoreline', v)}
                    allowDeselect
                  />
                </div>
                <div className={labelCls}>
                  <span className={labelTextCls}>{t('objects.objectEditWizard.дорога_к_объекту')}</span>
                  <ChipRow
                    options={ROAD_OPTIONS}
                    selected={values.roadType}
                    onSelect={(v) => set('roadType', v)}
                    allowDeselect
                  />
                </div>
                <label className={labelCls}>
                  <span className={labelTextCls}>{t('objects.objectEditWizard.материалы_стен')}</span>
                  <select
                    value={values.wallMaterial}
                    onChange={(event) => set('wallMaterial', event.target.value)}
                    className={`${inputCls} max-w-xs`}
                  >
                    <option value="">{t('objects.objectEditWizard.выберите')}</option>
                    {WALL_MATERIALS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={labelCls}>
                <span className={labelTextCls}>{t('objects.objectEditWizard.удобства')}</span>
                <ChipMulti
                  options={AMENITIES_OPTIONS}
                  selected={values.amenities}
                  onToggle={(v) => toggleArr('amenities', v)}
                />
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="flex max-w-3xl flex-col gap-5">
              <span className={sectionTitleCls}>{t('objects.objectEditWizard.комиссия_и_статус')}</span>
              <div className={labelCls}>
                <span className={labelTextCls}>{t('objects.objectEditWizard.тип_продавца')}</span>
                <ChipRow
                  options={SELLER_TYPES.map((option) => option.label)}
                  selected={SELLER_TYPES.find((option) => option.value === values.sellerType)?.label ?? ''}
                  onSelect={(label) => {
                    const found = SELLER_TYPES.find((option) => option.label === label)
                    if (found) set('sellerType', found.value)
                  }}
                />
              </div>
              <label className={`${labelCls} max-w-md`}>
                <span className={labelTextCls}>{t('objects.objectEditWizard.размер_комиссии')}</span>
                <select
                  value={values.commissionPercent}
                  onChange={(event) => set('commissionPercent', event.target.value)}
                  className={inputCls}
                >
                  {COMMISSION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              {mlsEligible && (
                <div className={labelCls}>
                  <span className={labelTextCls}>{t('objects.objectEditWizard.объект_mls')}</span>
                  <ChipRow
                    options={['Да, по правилам MLS', 'Нет']}
                    selected={values.isMls ? 'Да, по правилам MLS' : 'Нет'}
                    onSelect={(label) => set('isMls', label === 'Да, по правилам MLS')}
                  />
                  {values.isMls && (
                    <div className="mt-2 flex max-w-md flex-col gap-3 rounded-md border border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.25)] p-4">
                      <span className="text-[16px] font-medium text-[#fcecc8]">{t('objects.objectEditWizard.распределение_комисс')}</span>
                      <div className="flex h-7 gap-[3px] overflow-hidden rounded-[6px]">
                        {MLS_SPLIT.map((part) => (
                          <span
                            key={part.key}
                            className="min-w-0"
                            style={{ width: `${part.percent}%`, background: part.color }}
                            title={`${part.label} · ${part.percent}%`}
                          />
                        ))}
                      </div>
                      <div className="flex flex-col gap-2">
                        {MLS_SPLIT.map((part) => {
                          const amount = mlsAmount(part.percent)
                          return (
                            <div key={part.key} className="flex items-center justify-between gap-3 text-[16px] font-normal">
                              <span className="flex min-w-0 items-center gap-2.5">
                                <span
                                  className="size-3 shrink-0 rounded-[3px]"
                                  style={{ background: part.color }}
                                  aria-hidden
                                />
                                <span className="text-[rgba(242,207,141,0.85)]">{part.label}</span>
                              </span>
                              <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                                <span className="text-[#fcecc8]">{part.percent}%</span>
                                {amount && <span className="text-[rgba(242,207,141,0.72)]">{amount}</span>}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                      <p className="text-[16px] font-normal leading-relaxed text-[rgba(242,207,141,0.72)]">
                        {t('objects.objectEditWizard.размещая_объект_в_ml')}</p>
                      <p className="text-[16px] font-normal leading-relaxed text-[rgba(242,207,141,0.72)]">
                        {t('objects.objectEditWizard.объекты_mls_поднимаю')}</p>
                    </div>
                  )}
                </div>
              )}
              <div className={labelCls}>
                <span className={labelTextCls}>{t('objects.objectEditWizard.условия_покупки')}</span>
                <ChipMulti
                  options={['Ипотека', 'Рассрочка']}
                  selected={[
                    ...(values.mortgageAvailable ? ['Ипотека'] : []),
                    ...(values.installmentAvailable ? ['Рассрочка'] : []),
                  ]}
                  onToggle={(v) => {
                    if (v === 'Ипотека') set('mortgageAvailable', !values.mortgageAvailable)
                    if (v === 'Рассрочка') set('installmentAvailable', !values.installmentAvailable)
                  }}
                />
              </div>
              <div className={labelCls}>
                <span className={labelTextCls}>{t('objects.objectEditWizard.статус')}</span>
                <ChipRow
                  options={statusOptions.map((option) => option.label)}
                  selected={statusOptions.find((option) => option.value === values.status)?.label ?? ''}
                  onSelect={(label) => {
                    const found = statusOptions.find((option) => option.label === label)
                    if (found) set('status', found.value)
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {isMapOpen && (
        <MapPickerModal
          onClose={() => setIsMapOpen(false)}
          initialCenter={values.mapLng && values.mapLat ? [Number(values.mapLng), Number(values.mapLat)] : undefined}
          initialAddress={values.address}
          initialCity={values.city}
          initialCountry={values.country}
          onConfirm={(address: string, _polygon?: [number, number][], center?: [number, number]) => {
            if (center) {
              set('mapLng', String(center[0]))
              set('mapLat', String(center[1]))
            }
            if (address) set('address', address)
            setIsMapOpen(false)
          }}
        />
      )}
    </div>
  )
}

function ChipRow({
  options,
  selected,
  onSelect,
  allowDeselect = false,
}: {
  options: readonly string[]
  selected: string
  onSelect: (value: string) => void
  allowDeselect?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = selected === option
        return (
          <button
            key={option}
            type="button"
            onClick={() => onSelect(active && allowDeselect ? '' : option)}
            className={`h-9 rounded-md border px-3 text-[16px] font-normal transition-colors ${
              active
                ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.18)] text-[#fcecc8]'
                : 'border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.25)] text-[rgba(242,207,141,0.72)] hover:border-[rgba(242,207,141,0.4)] hover:text-[#fcecc8]'
            }`}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

function ChipMulti({
  options,
  selected,
  onToggle,
}: {
  options: readonly string[]
  selected: string[]
  onToggle: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = selected.includes(option)
        return (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className={`h-9 rounded-md border px-3 text-[16px] font-normal transition-colors ${
              active
                ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.18)] text-[#fcecc8]'
                : 'border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.25)] text-[rgba(242,207,141,0.72)] hover:border-[rgba(242,207,141,0.4)] hover:text-[#fcecc8]'
            }`}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
