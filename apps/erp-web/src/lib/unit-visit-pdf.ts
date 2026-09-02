import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

import { compactRoomsLabel } from '@/lib/chessboard'
import { optionLabelRu } from '@/lib/project-options'
import { resolveUnitCeilingHeight, resolveUnitConditionLabel } from '@/lib/apartment-labels'
import { ALL_NEW_BUILDINGS_STOCK_IMAGES, NEW_BUILDINGS_DEMO_IMAGES } from '@/lib/newbuildings-catalog-images'
import { resolveDevCustomization, type DevSelectionCustomization } from '@/config/dev-selection-customization'
import { collectInstallmentOptions, formatInstallmentSummary } from '@/lib/installment-display'
import { formatMoney, t } from '@/lib/selection-display'
import { resolveFinishDisplayOptions } from '@/lib/unit-finish-pricing'
import type { PublicUnitInstallmentDto } from '@/services/developmentApi'
import type { UnitShareAgent } from '@/lib/unit-share'
import type { IBuilding, IProject, IUnit } from '@/types/core'

export type UnitVisitPdfParams = {
  unit: IUnit
  building?: IBuilding
  project?: IProject
  agent?: UnitShareAgent & { avatarUrl?: string }
  customization?: DevSelectionCustomization
  installment?: PublicUnitInstallmentDto | null
  heroImages?: string[]
  galleryImages?: string[]
}

const A4_WIDTH_PX = 794
const CANVAS_SCALE = 3

/** Лого BAZA.sale (пальмы + название) — повторяет BazaSaleBrandLogo с веб-визитки. */
const BAZA_LOGO_LOCKUP = `
  <div class="hero-brand">
    <svg viewBox="0 0 381 295" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M101.532 86.0918C91.0936 96.1918 96.5386 102.931 110.496 98.9388C143.609 89.4698 200.725 76.2418 226.723 88.6748C226.723 88.6748 150.69 148.929 162.15 268.088C163.537 282.545 174.377 294.103 184.815 294.103C195.258 294.103 202.198 282.393 202.166 267.865C202.101 235.029 207.659 173.84 240.968 98.5358C240.968 98.5358 265.743 131.094 273.189 166.622C276.17 180.834 281.712 182.825 285.574 168.819C289.8 153.437 291.138 132.241 278.77 110.028C278.77 110.028 326.074 135.673 356.886 168.726C366.791 179.348 372.681 177.559 368.819 163.559C360.698 134.166 336.75 88.5428 266.162 74.9678C266.162 74.9678 293.341 61.7238 326.302 63.0348C340.813 63.6058 345.584 56.8018 332.66 50.1718C316.936 42.0948 290.078 36.6828 246.44 49.2308C246.44 49.2308 225.413 -2.03818 157.479 0.0618185C142.968 0.512818 142.337 7.63282 155.385 13.9908C177.919 24.9718 209.058 42.6708 215.215 59.0918C215.224 59.0928 145.207 43.8198 101.532 86.0918Z" fill="currentColor" />
      <path d="M162.917 172.349C169.022 178.256 165.837 182.197 157.675 179.862C138.309 174.324 104.906 166.588 89.702 173.86C89.702 173.86 134.168 209.098 127.466 278.785C126.655 287.24 120.315 293.999 114.211 293.999C108.104 293.999 104.045 287.151 104.064 278.655C104.102 259.451 100.851 223.666 81.3712 179.627C81.3712 179.627 66.8821 198.667 62.5275 219.445C60.7841 227.757 57.543 228.921 55.2844 220.73C52.8129 211.734 52.0304 199.338 59.2635 186.347C59.2635 186.347 31.5989 201.345 13.5792 220.676C7.78648 226.888 4.34184 225.841 6.60045 217.654C11.3498 200.464 25.3553 173.782 66.637 165.843C66.637 165.843 50.742 158.098 31.4655 158.865C22.9791 159.198 20.1889 155.219 27.7472 151.342C36.943 146.618 52.6503 143.453 78.171 150.792C78.171 150.792 90.4682 120.808 130.198 122.036C138.684 122.3 139.053 126.464 131.422 130.182C118.244 136.604 100.033 146.955 96.4322 156.559C96.427 156.559 137.375 147.627 162.917 172.349Z" fill="currentColor" />
    </svg>
    <span class="hero-brand-label">BAZA.sale</span>
  </div>
`

const PDF_STYLES = `
  * { box-sizing: border-box; }
  .visit-pdf-root {
    width: ${A4_WIDTH_PX}px;
    background: #07120a;
    color: #fcecc8;
    font-family: Montserrat, Inter, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: geometricPrecision;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    width: 100%;
    padding: 28px;
    display: flex;
    flex-direction: column;
    gap: 0;
    background: #07120a;
  }
  .hero {
    position: relative; height: 220px; overflow: hidden; border-radius: 10px;
    background: #0a1f12;
  }
  .hero-bg {
    position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
  }
  .hero::after {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(0deg, rgba(7,18,10,.95) 8%, rgba(7,18,10,.35) 55%, rgba(7,18,10,.5) 100%);
  }
  .hero-brand {
    position: absolute; top: 16px; left: 20px; z-index: 3;
    display: flex; align-items: center; gap: 7px; color: #fcecc8;
  }
  .hero-brand svg { width: 22px; height: 22px; display: block; }
  .hero-brand-label { font-size: 16px; font-weight: 500; letter-spacing: .01em; color: #fcecc8; }
  .hero-content {
    position: absolute; left: 20px; right: 20px; bottom: 18px; z-index: 2;
  }
  .hero-loc { font-size: 12px; color: rgba(242,207,141,.75); letter-spacing: .02em; line-height: 1.3; }
  .hero-title { margin: 6px 0 0; font-size: 28px; font-weight: 500; line-height: 1.15; color: #fcecc8; }
  .hero-dev { margin-top: 6px; font-size: 13px; color: rgba(242,207,141,.65); line-height: 1.3; }
  .main {
    display: grid; grid-template-columns: 1.15fr .85fr; gap: 16px; margin-top: 16px;
  }
  .plan-panel {
    border-radius: 10px; border: 1px solid rgba(201,168,76,.15);
    background: #0e2a1f;
    background-image:
      linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px);
    background-size: 14px 14px;
    display: flex; flex-direction: column; min-height: 420px;
  }
  .plan-head {
    padding: 14px 16px 0; font-size: 18px; font-weight: 500; color: #fcecc8;
  }
  .plan-body {
    flex: 1; display: flex; align-items: center; justify-content: center; padding: 14px;
  }
  .plan-body img { max-width: 100%; max-height: 320px; object-fit: contain; }
  .plan-empty { font-size: 13px; color: rgba(242,207,141,.4); text-align: center; }
  .plan-figs { flex: 1; display: flex; gap: 12px; padding: 14px; }
  .plan-fig { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
  .plan-fig .fig-img {
    flex: 1; display: flex; align-items: center; justify-content: center; min-height: 0;
  }
  .plan-fig .fig-img img { max-width: 100%; max-height: 300px; object-fit: contain; }
  .plan-fig .fig-cap {
    font-size: 10px; text-transform: uppercase; letter-spacing: .05em; /* design-ok: подпись плана в печатном PDF, шкала как у spec-label */
    color: rgba(242,207,141,.55); text-align: center;
  }
  .specs-bar {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
    padding: 14px 16px; border-top: 1px solid rgba(201,168,76,.12); background: #0f2318;
  }
  .spec-item .spec-label {
    display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .05em;
    color: rgba(242,207,141,.55);
  }
  .spec-item .spec-value { display: block; margin-top: 2px; font-size: 15px; color: #fcecc8; }
  .side { display: flex; flex-direction: column; gap: 14px; }
  .price-card {
    border-radius: 10px; border: 1px solid rgba(201,168,76,.22);
    background: rgba(16,38,28,.85); padding: 18px;
  }
  .price-head { display: flex; flex-direction: column; align-items: flex-start; gap: 0; }
  .price-big { font-size: 32px; font-weight: 500; color: #fcecc8; line-height: 1; margin: 0; }
  .price-sub { margin-top: 6px; font-size: 13px; color: rgba(242,207,141,.6); line-height: 1.35; }
  .details {
    border-radius: 10px; border: 1px solid rgba(242,207,141,.1);
    overflow: hidden;
  }
  .details-title {
    padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em;
    color: rgba(242,207,141,.55); background: rgba(0,0,0,.2);
  }
  .details-grid { display: grid; grid-template-columns: 1fr 1fr; }
  .detail-row {
    display: flex; justify-content: space-between; gap: 10px; padding: 10px 12px;
    font-size: 12px; border-bottom: 1px solid rgba(242,207,141,.08);
    background: rgba(0,0,0,.25);
  }
  .detail-row .l { color: rgba(242,207,141,.55); }
  .detail-row .v { color: #fcecc8; text-align: right; font-weight: 500; }
  .gallery { margin-top: 16px; }
  .gallery-title {
    margin-bottom: 10px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em;
    color: rgba(242,207,141,.55);
  }
  .gallery-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .gallery-row img {
    width: 100%; height: 110px; object-fit: cover; border-radius: 8px;
    border: 1px solid rgba(201,168,76,.15);
  }
  .section-block {
    margin-top: 14px; border-radius: 10px; border: 1px solid rgba(242,207,141,.1);
    overflow: hidden;
  }
  .section-block .section-title {
    padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em;
    color: rgba(242,207,141,.55); background: rgba(0,0,0,.2);
  }
  .section-block .section-body {
    padding: 12px; font-size: 12px; line-height: 1.55; color: rgba(242,207,141,.78);
    background: rgba(0,0,0,.25);
  }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px; background: rgba(0,0,0,.25); }
  .tag {
    padding: 5px 10px; border-radius: 999px; border: 1px solid rgba(242,207,141,.15);
    font-size: 11px; color: rgba(242,207,141,.85);
  }
  .installment-list {
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 12px; background: rgba(0,0,0,.25);
  }
  .installment-item {
    border-radius: 8px; border: 1px solid rgba(201,168,76,.18); background: #072821; padding: 10px 12px;
  }
  .installment-label { font-size: 13px; color: #fcecc8; font-weight: 500; }
  .installment-meta { margin-top: 4px; font-size: 11px; line-height: 1.35; color: rgba(242,207,141,.7); }
  .agent-card {
    border-radius: 10px; border: 1px solid rgba(201,168,76,.22);
    background: rgba(16,38,28,.85); padding: 14px;
  }
  .agent-name { font-size: 16px; color: #fcecc8; font-weight: 500; }
  .agent-meta { margin-top: 4px; font-size: 12px; color: rgba(242,207,141,.55); }
  .agent-phone { margin-top: 8px; font-size: 13px; color: #e6c364; }
`

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function unitPrice(unit: IUnit): number | undefined {
  return unit.price ?? (unit.pricePerSqm && unit.area ? Math.round(unit.pricePerSqm * unit.area) : undefined)
}

export function resolveVisitPdfHeroImages(project?: IProject | null): string[] {
  const renders = (project?.renders ?? []).filter(Boolean)
  if (renders.length) return renders.slice(0, 3)
  const demo = project?._id ? NEW_BUILDINGS_DEMO_IMAGES[project._id] : undefined
  if (demo?.length) return demo.slice(0, 3)
  return ALL_NEW_BUILDINGS_STOCK_IMAGES.slice(0, 3)
}

function pickSrc(url: string | undefined | null, map: Map<string, string>): string | undefined {
  if (!url) return undefined
  return map.get(url) ?? url
}

type ImageEncodeFormat = 'jpeg' | 'png'

async function imageToDataUrl(src: string, format: ImageEncodeFormat = 'jpeg'): Promise<string | null> {
  if (!src || src.startsWith('data:')) return src

  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('image load failed'))
      img.src = src
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || 1
    canvas.height = img.naturalHeight || 1
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    if (format === 'jpeg') {
      ctx.fillStyle = '#07120a'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(img, 0, 0)
    return format === 'png'
      ? canvas.toDataURL('image/png')
      : canvas.toDataURL('image/jpeg', 0.97)
  } catch {
    try {
      const res = await fetch(src, { mode: 'cors' })
      if (!res.ok) return null
      const blob = await res.blob()
      return await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    } catch {
      return null
    }
  }
}

async function resolvePdfImages(
  urls: string[],
  opts?: { pngUrls?: Set<string> },
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const pngUrls = opts?.pngUrls ?? new Set<string>()
  await Promise.all(
    urls.map(async (url) => {
      const format: ImageEncodeFormat = pngUrls.has(url) ? 'png' : 'jpeg'
      const data = await imageToDataUrl(url, format)
      if (data) map.set(url, data)
    }),
  )
  return map
}

function buildUnitVisitPdfMarkup(
  params: UnitVisitPdfParams,
  imageMap: Map<string, string>,
): string {
  const { unit, building, project, agent } = params
  const { language, currency, blocks } = resolveDevCustomization(params.customization)
  const loc = (ru: string, en: string, ka: string) =>
    language === 'en' ? en : language === 'ka' ? ka : ru
  const money = (n?: number) => (n != null ? formatMoney(n, currency, language) : '—')
  const sqm = t(language, 'sqm')
  const heroImage = pickSrc(params.heroImages?.[0] ?? resolveVisitPdfHeroImages(project)[0], imageMap)
  const galleryFrom = (urls: (string | undefined | null)[]) =>
    urls.filter(Boolean).slice(0, 3).map((src) => pickSrc(src, imageMap)).filter(Boolean) as string[]
  const gallery = blocks.projectGallery
    ? galleryFrom(params.galleryImages ?? project?.renders ?? [])
    : []
  // Ход строительства и галерея района — как в веб-визитке (под галереей проекта).
  const construction = blocks.constructionProgress ? galleryFrom(project?.constructionProgress ?? []) : []
  const district = blocks.projectGallery ? galleryFrom(project?.districtGallery ?? []) : []
  const planUrl = blocks.unitPlan ? pickSrc(unit.layoutImageUrl, imageMap) : null
  const floorPlanUrl = blocks.unitPlan ? pickSrc(unit.floorPlanUrl ?? building?.floorPlanUrl, imageMap) : null
  const price = blocks.unitPrice ? unitPrice(unit) : undefined
  const pricePerSqm = blocks.unitPrice
    ? unit.pricePerSqm ?? (price && unit.area ? Math.round(price / unit.area) : undefined)
    : undefined
  const roomsCanonical = unit.rooms ? compactRoomsLabel(unit.rooms) : ''
  const roomsLabel = roomsCanonical ? loc(optionLabelRu('rooms', roomsCanonical), roomsCanonical, roomsCanonical) : '—'
  const location = [project?.city, project?.country].filter(Boolean).join(', ') || project?.location || ''
  const lotTitle = `${t(language, 'aptNumber')} ${unit.number}`
  const ceilingHeight = resolveUnitCeilingHeight({
    customCeiling: unit.customFields?.['Потолки'],
    projectCeiling: project?.ceilingHeight,
  })
  // Кондиция = ручной override лота, иначе базовый каркас из отделки ЖК (как в карточке и оффере).
  const baseFinishType = resolveFinishDisplayOptions(project?.finishTypes, unit).find((o) => o.isBase)?.finishType
  const conditionLabel =
    resolveUnitConditionLabel({ customFinish: unit.customFields?.Отделка }) ??
    (baseFinishType ? loc(optionLabelRu('finishTypes', baseFinishType), baseFinishType, baseFinishType) : undefined)

  const specBarItems = blocks.unitSpecs
    ? [
        { label: t(language, 'block'), value: building?.name ?? '—' },
        { label: t(language, 'floorLabel'), value: String(unit.floor) },
        { label: t(language, 'area'), value: unit.area != null ? `${unit.area} ${sqm}` : '—' },
        { label: t(language, 'roomsLabel'), value: roomsLabel },
        ceilingHeight ? { label: t(language, 'ceilings'), value: ceilingHeight } : null,
        conditionLabel ? { label: t(language, 'condition'), value: conditionLabel } : null,
        unit.viewType?.trim() ? { label: t(language, 'windowView'), value: loc(optionLabelRu('views', unit.viewType), unit.viewType.trim(), unit.viewType.trim()) } : null,
      ].filter(Boolean) as { label: string; value: string }[]
    : []

  const detailSpecs = blocks.unitSpecs
    ? [
        { label: t(language, 'block'), value: building?.name },
        { label: t(language, 'floorLabel'), value: unit.floor ? String(unit.floor) : null },
        { label: t(language, 'area'), value: unit.area != null ? `${unit.area} ${sqm}` : null },
        { label: t(language, 'roomsLabel'), value: roomsLabel },
        { label: t(language, 'ceilings'), value: ceilingHeight },
        { label: t(language, 'condition'), value: conditionLabel },
        { label: t(language, 'windowView'), value: unit.viewType?.trim() ? loc(optionLabelRu('views', unit.viewType), unit.viewType.trim(), unit.viewType.trim()) : null },
        { label: t(language, 'completion'), value: building?.completionDate || project?.completionDate },
      ].filter((s) => s.value)
    : []

  const amenities = blocks.amenities
    ? [
        ...(project?.amenities ?? []),
        ...(project?.infrastructureInternal ?? []),
        ...(project?.infrastructureExternal ?? []),
      ].filter(Boolean)
    : []

  const payments = blocks.paymentPlans ? (project?.paymentTypes ?? []).filter(Boolean) : []
  const installmentOptions = blocks.paymentPlans ? collectInstallmentOptions(params.installment) : []

  const showPlanPanel = blocks.unitPlan || blocks.unitSpecs
  const showSideColumn = blocks.unitPrice || detailSpecs.length > 0 || blocks.agentContacts
  const mainColumns = showPlanPanel && showSideColumn ? '1.15fr .85fr' : '1fr'

  const perM2Suffix = language === 'en' ? '/m²' : language === 'ka' ? '/მ²' : '/м²'

  return `
    <style>${PDF_STYLES}</style>
    <div class="visit-pdf-root">
      <main class="page">
        <header class="hero">
          ${heroImage ? `<img class="hero-bg" src="${esc(heroImage)}" alt="" crossorigin="anonymous" />` : ''}
          ${blocks.bazasaleLogo ? BAZA_LOGO_LOCKUP : ''}
          <div class="hero-content">
            ${location ? `<div class="hero-loc">${esc(location)}</div>` : ''}
            <h1 class="hero-title">${esc(project?.name ?? t(language, 'primary'))}</h1>
            ${project?.developer ? `<div class="hero-dev">${esc(project.developer)}</div>` : ''}
          </div>
        </header>

        ${showPlanPanel || showSideColumn ? `
        <div class="main" style="grid-template-columns: ${mainColumns};">
          ${showPlanPanel ? `
          <section class="plan-panel">
            <div class="plan-head">${esc(lotTitle)}</div>
            ${blocks.unitPlan ? `
            <div class="plan-figs">
              <figure class="plan-fig">
                <div class="fig-img">
                  ${planUrl
                    ? `<img src="${esc(planUrl)}" alt="${esc(t(language, 'layoutPlan'))} ${esc(unit.number)}" crossorigin="anonymous" />`
                    : `<div class="plan-empty">${esc(t(language, 'layoutNotUploaded'))}</div>`}
                </div>
                ${floorPlanUrl ? `<figcaption class="fig-cap">${esc(loc('Планировка', 'Floor plan', 'გეგმა'))}</figcaption>` : ''}
              </figure>
              ${floorPlanUrl ? `
              <figure class="plan-fig">
                <div class="fig-img">
                  <img src="${esc(floorPlanUrl)}" alt="${esc(loc('На этаже', 'On the floor', 'სართულზე'))}" crossorigin="anonymous" />
                </div>
                <figcaption class="fig-cap">${esc(loc('На этаже', 'On the floor', 'სართულზე'))}</figcaption>
              </figure>` : ''}
            </div>` : ''}
            ${specBarItems.length > 0 ? `
            <div class="specs-bar">
              ${specBarItems.map(({ label, value }) => `
                <div class="spec-item">
                  <span class="spec-label">${esc(label)}</span>
                  <span class="spec-value">${esc(value)}</span>
                </div>`).join('')}
            </div>` : ''}
          </section>` : ''}

          ${showSideColumn ? `
          <aside class="side">
            ${blocks.unitPrice ? `
            <div class="price-card">
              <div class="price-head">
                <div class="price-big">${esc(price != null ? money(price) : formatMoney(null, currency, language))}</div>
                ${pricePerSqm != null ? `<div class="price-sub">${esc(money(pricePerSqm))}${perM2Suffix}</div>` : ''}
                ${project?.completionDate ? `<div class="price-sub">${esc(t(language, 'completion'))}: ${esc(project.completionDate)}</div>` : ''}
              </div>
            </div>` : ''}

            ${detailSpecs.length > 0 ? `
            <div class="details">
              <div class="details-title">${esc(t(language, 'characteristics'))}</div>
              <div class="details-grid">
                ${detailSpecs.map(({ label, value }) => `
                  <div class="detail-row">
                    <span class="l">${esc(label)}</span>
                    <span class="v">${esc(value)}</span>
                  </div>`).join('')}
              </div>
            </div>` : ''}

            ${blocks.agentContacts && agent && (agent.name || agent.phone || agent.company || agent.role) ? `
            <div class="agent-card">
              <div class="agent-name">${esc(agent.name ?? t(language, 'consultant'))}</div>
              ${(agent.role || agent.company) ? `<div class="agent-meta">${esc([agent.role, agent.company].filter(Boolean).join(' · '))}</div>` : ''}
              ${agent.phone ? `<div class="agent-phone">${esc(agent.phone)}</div>` : ''}
            </div>` : ''}
          </aside>` : ''}
        </div>` : ''}

        ${blocks.projectDescription && project?.description ? `
        <section class="section-block">
          <div class="section-title">${esc(t(language, 'aboutComplex'))}</div>
          <div class="section-body">${esc(project.description)}</div>
        </section>` : ''}

        ${amenities.length > 0 ? `
        <section class="section-block">
          <div class="section-title">${esc(t(language, 'amenitiesSection'))}</div>
          <div class="tags">
            ${amenities.map((item) => `<span class="tag">${esc(item)}</span>`).join('')}
          </div>
        </section>` : ''}

        ${payments.length > 0 ? `
        <section class="section-block">
          <div class="section-title">${esc(t(language, 'paymentsSection'))}</div>
          <div class="tags">
            ${payments.map((item) => `<span class="tag">${esc(item)}</span>`).join('')}
          </div>
        </section>` : ''}

        ${installmentOptions.length > 0 ? `
        <section class="section-block">
          <div class="section-title">${esc(t(language, 'installmentSection'))}</div>
          <div class="installment-list">
            ${installmentOptions.map((opt) => `
              <div class="installment-item">
                <div class="installment-label">${esc(opt.label)}</div>
                <div class="installment-meta">${esc(formatInstallmentSummary(language, opt))}${
                  opt.discountPercent != null && opt.discountPercent > 0
                    ? ` · ${esc(t(language, 'discount'))} ${opt.discountPercent}%`
                    : ''
                }</div>
              </div>`).join('')}
          </div>
        </section>` : ''}

        ${gallery.length > 0 ? `
        <section class="gallery">
          <div class="gallery-title">${esc(loc('Галерея проекта', 'Project gallery', 'პროექტის გალერეა'))}</div>
          <div class="gallery-row">
            ${gallery.map((src) => `<img src="${esc(src)}" alt="" crossorigin="anonymous" />`).join('')}
          </div>
        </section>` : ''}

        ${construction.length > 0 ? `
        <section class="gallery">
          <div class="gallery-title">${esc(loc('Ход строительства', 'Construction progress', 'მშენებლობის მიმდინარეობა'))}</div>
          <div class="gallery-row">
            ${construction.map((src) => `<img src="${esc(src)}" alt="" crossorigin="anonymous" />`).join('')}
          </div>
        </section>` : ''}

        ${district.length > 0 ? `
        <section class="gallery">
          <div class="gallery-title">${esc(loc('Атмосфера района', 'District atmosphere', 'რაიონის ატმოსფერო'))}</div>
          <div class="gallery-row">
            ${district.map((src) => `<img src="${esc(src)}" alt="" crossorigin="anonymous" />`).join('')}
          </div>
        </section>` : ''}
      </main>
    </div>
  `
}

function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'))
  if (!images.length) return Promise.resolve()
  return Promise.all(
    images.map(
      (img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true })
              img.addEventListener('error', () => resolve(), { once: true })
            }),
    ),
  ).then(() => undefined)
}

function saveCanvasToPdf(canvas: HTMLCanvasElement, fileName: string): void {
  const pdf = new jsPDF('p', 'mm', 'a4')
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const imgData = canvas.toDataURL('image/png')
  const imgHeight = (canvas.height * pageWidth) / canvas.width

  let heightLeft = imgHeight
  let position = 0

  pdf.addImage(imgData, 'PNG', 0, position, pageWidth, imgHeight, undefined, 'FAST')
  heightLeft -= pageHeight

  while (heightLeft > 0) {
    position -= pageHeight
    pdf.addPage()
    pdf.addImage(imgData, 'PNG', 0, position, pageWidth, imgHeight, undefined, 'FAST')
    heightLeft -= pageHeight
  }

  pdf.save(fileName)
}

/** Скачивает PDF-файл на диск (без всплывающих окон). */
export async function downloadUnitVisitPdf(params: UnitVisitPdfParams): Promise<boolean> {
  const heroImages = params.heroImages ?? resolveVisitPdfHeroImages(params.project)
  const galleryImages = (params.galleryImages ?? params.project?.renders ?? []).filter(Boolean).slice(0, 3)
  const constructionImages = (params.project?.constructionProgress ?? []).filter(Boolean).slice(0, 3)
  const districtImages = (params.project?.districtGallery ?? []).filter(Boolean).slice(0, 3)
  const floorPlanImage = params.unit.floorPlanUrl ?? params.building?.floorPlanUrl

  const imageMap = await resolvePdfImages(
    [
      heroImages[0],
      params.unit.layoutImageUrl,
      floorPlanImage,
      ...galleryImages,
      ...constructionImages,
      ...districtImages,
    ].filter(Boolean) as string[],
  )

  const markup = buildUnitVisitPdfMarkup(params, imageMap)

  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = '-10000px'
  host.style.top = '0'
  host.style.zIndex = '-1'
  host.style.pointerEvents = 'none'
  host.innerHTML = markup
  document.body.appendChild(host)

  try {
    const root = host.querySelector('.visit-pdf-root') as HTMLElement | null
    if (!root) return false

    if (document.fonts?.ready) await document.fonts.ready
    await waitForImages(root)
    await new Promise((resolve) => setTimeout(resolve, 200))

    const canvas = await html2canvas(root, {
      scale: CANVAS_SCALE,
      useCORS: true,
      backgroundColor: '#07120a',
      logging: false,
      imageTimeout: 15000,
    })

    const safeComplex = (params.project?.name ?? 'lot').replace(/[^\wа-яА-ЯёЁ.-]+/gi, '_').slice(0, 40)
    const fileName = `${safeComplex}_лот_${params.unit.number}.pdf`
    saveCanvasToPdf(canvas, fileName)
    return true
  } catch (error) {
    console.error('[unit-visit-pdf] download failed:', error)
    return false
  } finally {
    document.body.removeChild(host)
  }
}

/** @deprecated используйте downloadUnitVisitPdf */
export async function openUnitVisitPdf(params: UnitVisitPdfParams): Promise<boolean> {
  return downloadUnitVisitPdf(params)
}
