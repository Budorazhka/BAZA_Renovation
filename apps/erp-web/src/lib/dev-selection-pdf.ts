import type { DevSelection } from '@/types/dev-selection'
import type { IBuilding, IProject, IUnit } from '@/types/core'
import sargonLogo from '@/assets/sargon-logo.png'
import {
  resolveDevCustomization,
  type DevSelectionCustomization,
} from '@/config/dev-selection-customization'
import { formatMoney } from '@/lib/selection-display'
import { compactRoomsLabel } from '@/lib/chessboard'

type SelectionPdfItem = {
  unit: IUnit
  building?: IBuilding
  project?: IProject
  agentNote?: string
}

type OpenSelectionPdfParams = {
  selection: DevSelection
  items: SelectionPdfItem[]
  customization?: DevSelectionCustomization
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}


function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso))
}

function unitPrice(unit: IUnit): number | undefined {
  return unit.price ?? (unit.pricePerSqm && unit.area ? Math.round(unit.pricePerSqm * unit.area) : undefined)
}

function pluralVariant(count: number): string {
  if (count % 10 === 1 && count % 100 !== 11) return 'вариант'
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return 'варианта'
  return 'вариантов'
}

function buildPdfHtml({ selection, items, customization }: OpenSelectionPdfParams): string {
  const { language, currency, blocks } = resolveDevCustomization(customization)
  const L = (ru: string, en: string) => (language === 'ru' ? ru : en)
  const money = (n?: number) => formatMoney(n, currency, language)

  const project = items.find((item) => item.project)?.project
  const prices = items.map((item) => unitPrice(item.unit)).filter((price): price is number => Boolean(price))
  const minPrice = prices.length ? Math.min(...prices) : undefined
  const maxPrice = prices.length ? Math.max(...prices) : undefined
  const priceRange = minPrice && maxPrice
    ? minPrice === maxPrice ? money(minPrice) : `${money(minPrice)} - ${money(maxPrice)}`
    : L('Цена по запросу', 'Price on request')

  const heroImage = blocks.projectGallery ? project?.renders?.[0] : undefined

  const cards = items.map(({ unit, building, agentNote }) => {
    const details = blocks.unitSpecs
      ? [
          building?.name,
          compactRoomsLabel(unit.rooms),
          unit.area != null ? `${unit.area} м2` : null,
          unit.floor ? `${unit.floor} ${L('этаж', 'floor')}` : null,
          unit.viewType,
        ].filter(Boolean)
      : []

    return `
      <article class="unit-card">
        <div class="plan">
          ${blocks.unitPlan && unit.layoutImageUrl
            ? `<img src="${esc(unit.layoutImageUrl)}" alt="${esc(unit.number)}" />`
            : `<div class="plan-empty">${esc(L('Планировка', 'Floor plan'))}</div>`}
        </div>
        <div class="unit-body">
          <div class="unit-top">
            <div>
              <div class="muted">${esc(building?.name ?? L('Корпус', 'Building'))}</div>
              <h2>${esc(unit.number)}</h2>
            </div>
            ${blocks.unitPrice ? `<strong>${esc(money(unitPrice(unit)))}</strong>` : ''}
          </div>
          <div class="chips">
            ${details.map((detail) => `<span>${esc(detail)}</span>`).join('')}
          </div>
          ${agentNote ? `<p class="note">${esc(agentNote)}</p>` : ''}
        </div>
      </article>
    `
  }).join('')

  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8" />
  <title>${esc(selection.title)} - PDF</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f6f1e7;
      color: #142116;
      font-family: Inter, Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page { max-width: 960px; margin: 0 auto; background: #fffaf0; min-height: 100vh; }
    .hero {
      position: relative;
      min-height: 230px;
      padding: 28px;
      color: #fcecc8;
      background: #102316;
      overflow: hidden;
    }
    .hero::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, rgba(7,18,10,.92), rgba(7,18,10,.54));
    }
    .hero-bg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .hero-content { position: relative; z-index: 1; max-width: 620px; }
    .eyebrow { margin: 0 0 10px; color: rgba(242,207,141,.72); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
    h1 { margin: 0; font-size: 30px; line-height: 1.12; }
    .project { margin-top: 10px; color: rgba(252,236,200,.78); font-size: 13px; }
    .stats { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 22px; }
    .stat { border: 1px solid rgba(242,207,141,.25); border-radius: 10px; padding: 8px 12px; background: rgba(0,0,0,.2); }
    .stat b { display: block; font-size: 15px; }
    .stat span { display: block; margin-top: 2px; color: rgba(252,236,200,.58); font-size: 10px; }
    .section { padding: 24px 28px; }
    .client { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; border-bottom: 1px solid #e7dbc3; }
    .label { color: #7b6d54; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
    .value { margin-top: 4px; font-weight: 700; }
    .message { grid-column: 1 / -1; margin-top: 10px; padding: 12px; border-radius: 10px; background: #f0e4cd; color: #433929; font-size: 13px; }
    .unit-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .unit-card { overflow: hidden; break-inside: avoid; border: 1px solid #e2d2b4; border-radius: 12px; background: #fff; }
    .plan { height: 170px; display: flex; align-items: center; justify-content: center; background: #f1eadc; }
    .plan img { max-width: 100%; max-height: 100%; object-fit: contain; padding: 10px; }
    .plan-empty { color: #9a8b73; font-size: 12px; }
    .unit-body { padding: 14px; }
    .unit-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .muted { color: #82745f; font-size: 11px; }
    h2 { margin: 3px 0 0; font-size: 18px; }
    .unit-top strong { color: #8b6b17; font-size: 16px; white-space: nowrap; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
    .chips span { border: 1px solid #eadbbf; border-radius: 8px; padding: 4px 7px; color: #504430; font-size: 11px; }
    .note { margin: 12px 0 0; color: #6a5b43; font-size: 12px; font-style: italic; }
    .footer { padding: 18px 28px 24px; color: #82745f; font-size: 11px; border-top: 1px solid #e7dbc3; }
    @media print {
      body { background: #fff; }
      .page { max-width: none; }
      .unit-grid { gap: 10px; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="hero">
      ${heroImage ? `<img class="hero-bg" src="${esc(heroImage)}" alt="" />` : ''}
      <div class="hero-content">
        <p class="eyebrow">${esc(L('Персональная подборка', 'Personal selection'))}</p>
        <h1>${esc(selection.title)}</h1>
        <div class="project">${esc(project?.name ?? 'BAZA.sale Development')}${project?.location ? ` · ${esc(project.location)}` : ''}</div>
        <div class="stats">
          <div class="stat"><b>${items.length}</b><span>${esc(language === 'ru' ? pluralVariant(items.length) : 'options')}</span></div>
          ${blocks.unitPrice ? `<div class="stat"><b>${esc(priceRange)}</b><span>${esc(L('Диапазон цен', 'Price range'))}</span></div>` : ''}
          <div class="stat"><b>${esc(fmtDate(selection.createdAt))}</b><span>${esc(L('Дата подборки', 'Selection date'))}</span></div>
        </div>
      </div>
    </header>
    <section class="section client">
      <div>
        <div class="label">${esc(L('Клиент', 'Client'))}</div>
        <div class="value">${esc(selection.clientName ?? L('Не указан', 'Not specified'))}</div>
      </div>
      <div>
        <div class="label">${esc(L('Телефон', 'Phone'))}</div>
        <div class="value">${esc(selection.clientPhone ?? L('Не указан', 'Not specified'))}</div>
      </div>
      ${selection.agentNote ? `<div class="message">${esc(selection.agentNote)}</div>` : ''}
    </section>
    <section class="section">
      <div class="unit-grid">${cards}</div>
    </section>
    <footer class="footer">${esc(L('Наличие и цены актуальны на момент формирования подборки.', 'Availability and prices are accurate as of the moment this selection was generated.'))}</footer>
  </main>
  <script>
    const images = Array.from(document.images);
    const ready = images.length
      ? Promise.all(images.map((img) => img.complete ? Promise.resolve() : new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        })))
      : Promise.resolve();
    ready.then(() => setTimeout(() => window.print(), 250));
  </script>
</body>
</html>`
}

export function openDevSelectionPdf(params: OpenSelectionPdfParams): boolean {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1024,height=768')
  if (!printWindow) return false

  printWindow.document.open()
  printWindow.document.write(buildPdfHtml(params))
  printWindow.document.close()
  return true
}

/* ─────────────────────────────────────────────
   PDF одного лота — брошюра (жёсткие листы A4)
   ───────────────────────────────────────────── */

type UnitPdfParams = {
  unit: IUnit
  building?: IBuilding
  project?: IProject
  agentNote?: string
  manager?: { name?: string; phone?: string; avatarUrl?: string; company?: string; role?: string; telegram?: string; whatsapp?: string }
  customization?: DevSelectionCustomization
}

/** Инициалы для аватара-заглушки, если фото агента нет. */
function initials(name: string | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '—'
}

function buildUnitPdfHtml({ unit, building, project, manager, agentNote, customization }: UnitPdfParams, logoSrc: string): string {
  const { language, currency, blocks } = resolveDevCustomization(customization)
  const L = (ru: string, en: string) => language === 'ru' ? ru : en
  const money = (n?: number) => n ? formatMoney(n, currency, language) : L('Цена по запросу', 'Price on request')
  const price = unitPrice(unit)
  const renders = project?.renders ?? []
  const heroImage = renders[0]
  const bannerImage = renders[1] ?? renders[0]
  const fillImage = renders[2] ?? renders[1] ?? renders[0]
  const photoSheets = renders.slice(3, 11)
  const plan = unit.layoutImageUrl

  // «Когда сдастся» может лежать на корпусе или на проекте — берём что заполнено.
  const completion = building?.completionDate || project?.completionDate || ''

  const coverChips = [
    project?.developer,
    project?.classType ? `${L('Класс', 'Class')}: ${project.classType}` : null,
    completion ? `${L('Сдача', 'Handover')}: ${completion}` : null,
    project?.finishTypes?.length ? `${L('Отделка', 'Finish')}: ${project.finishTypes.join(', ')}` : null,
  ].filter(Boolean) as string[]

  const specInline = [
    compactRoomsLabel(unit.rooms),
    unit.area != null ? `${unit.area} м²` : null,
    unit.floor ? `${unit.floor} ${L('этаж', 'floor')}` : null,
    unit.viewType,
  ].filter(Boolean).join(' · ')

  const specs = [
    { l: L('Корпус', 'Building'), v: building?.name },
    { l: L('Этаж', 'Floor'), v: unit.floor ? String(unit.floor) : null },
    { l: L('Комнатность', 'Rooms'), v: compactRoomsLabel(unit.rooms) || null },
    { l: L('Класс жилья', 'Class'), v: project?.classType },
    { l: L('Срок сдачи', 'Handover'), v: completion || null },
    { l: L('Застройщик', 'Developer'), v: project?.developer || null },
    { l: L('Потолки', 'Ceiling height'), v: project?.ceilingHeight },
    { l: L('Площадь общая', 'Total area'), v: unit.area != null ? `${unit.area} м²` : null },
    { l: L('Жилая', 'Living area'), v: unit.areaLiving != null ? `${unit.areaLiving} м²` : null },
    { l: L('Балкон', 'Balcony'), v: unit.areaBalcony != null ? `${unit.areaBalcony} м²` : null },
    { l: L('Вид из окна', 'View'), v: unit.viewType },
    { l: L('Цена за м²', 'Price per m²'), v: unit.pricePerSqm ? money(unit.pricePerSqm) : null },
    { l: L('Стоимость', 'Price'), v: money(price) },
  ].filter((s) => s.v) as { l: string; v: string }[]

  const promo = unit.promotion && unit.promotion.isActive !== false ? unit.promotion.label : null
  const amenities = (project?.amenities ?? []).slice(0, 8)
  const payments = project?.paymentTypes ?? []

  const footText = [
    project?.developer ?? 'BAZA.sale',
    'baza.sale',
    fmtDate(new Date().toISOString()),
    manager?.name ? `подготовил ${manager.name}` : null,
    manager?.phone || null,
  ].filter(Boolean).join(' · ')

  const chipsHtml = (items: string[]) =>
    `<div class="chips">${items.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>`

  // Карточка «кто направил» — фото/инициалы, имя, роль, телефон, компания.
  const agentName = manager?.name?.trim()
  const agentPhoneLine = [manager?.phone, manager?.company].filter(Boolean).join('  ·  ')
  const agentSocialLine = [
    manager?.telegram ? `Telegram ${manager.telegram}` : null,
    manager?.whatsapp ? `WhatsApp ${manager.whatsapp}` : null,
  ].filter(Boolean).join('  ·  ')
  const agentCard = blocks.agentContacts && agentName ? `
    <div class="agent-card">
      <div class="agent-ava">${manager?.avatarUrl
        ? `<img src="${esc(manager.avatarUrl)}" alt="" />`
        : `<span>${esc(initials(agentName))}</span>`}</div>
      <div class="agent-info">
        <div class="agent-eyebrow">${esc(L('Ваш консультант', 'Your consultant'))}</div>
        <div class="agent-name">${esc(agentName)}</div>
        ${manager?.role ? `<div class="agent-role">${esc(manager.role)}</div>` : ''}
        ${agentPhoneLine ? `<div class="agent-contacts">${esc(agentPhoneLine)}</div>` : ''}
        ${agentSocialLine ? `<div class="agent-contacts">${esc(agentSocialLine)}</div>` : ''}
      </div>
    </div>` : ''

  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8" />
  <title>${esc(project?.name ?? 'Лот')} · ${esc(unit.number)} — PDF</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    :root {
      --bg: #0b1d14; --panel: #122c20; --gold: #e6c364; --mint: #d0e8df;
      --cream: #f4ecd9; --muted: rgba(208,232,223,.66); --line: rgba(230,195,100,.20);
      --light-card: #f6efe1;
    }
    body {
      background: #07140d; color: var(--cream);
      font-family: Montserrat, Inter, Arial, sans-serif; font-weight: 400;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .sheet {
      position: relative; width: 210mm; height: 297mm; margin: 0 auto;
      background: radial-gradient(120% 80% at 0% 0%, rgba(230,195,100,.06) 0%, transparent 45%), var(--bg);
      overflow: hidden; display: flex; flex-direction: column; color: var(--cream);
      page-break-after: always; break-after: page;
    }
    .sheet:last-child { page-break-after: auto; break-after: auto; }
    .pad { padding: 13mm; display: flex; flex-direction: column; gap: 14px; flex: 1; min-height: 0; }
    .eyebrow { margin: 0; font-size: 30px; font-weight: 500; letter-spacing: .22em; text-transform: uppercase; color: var(--gold); }
    .block-title { margin: 0 0 16px; font-size: 40px; font-weight: 500; letter-spacing: .1em; text-transform: uppercase; color: var(--gold); }
    .chips { display: flex; flex-wrap: wrap; gap: 12px; }
    .chip { font-size: 28px; color: var(--cream); background: rgba(230,195,100,.10); border: 1px solid var(--line); border-radius: 8px; padding: 11px 20px; }
    .cover-hero { position: relative; height: 92mm; flex-shrink: 0; overflow: hidden; background: #06120c; }
    .cover-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
    .cover-hero::after { content: ""; position: absolute; inset: 0; background: linear-gradient(0deg, rgba(5,14,9,.94) 6%, rgba(5,14,9,.12) 52%, rgba(5,14,9,.34) 100%); }
    .hero-logo { position: absolute; top: 4mm; right: 5mm; z-index: 5; width: 42mm; height: 42mm; object-fit: contain; filter: drop-shadow(0 2px 10px rgba(0,0,0,.6)); }
    .cap { position: absolute; left: 13mm; right: 13mm; bottom: 9mm; z-index: 1; }
    .cap h1 { margin: 10px 0 0; font-size: 78px; font-weight: 500; line-height: 1.0; color: var(--cream); }
    .cap .proj { margin-top: 12px; font-size: 34px; color: var(--mint); }
    .price-band { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 12px 16px; border-radius: 12px; background: var(--panel); box-shadow: inset 0 0 0 1px var(--line); }
    .price-band .big { font-size: 68px; font-weight: 500; color: var(--gold); line-height: 1; white-space: nowrap; }
    .price-band > div:first-child { flex-shrink: 0; }
    .price-band .sub { font-size: 30px; color: var(--muted); margin-top: 8px; }
    .price-band .spec-inline { font-size: 29px; color: var(--cream); text-align: right; }
    .plan-card { flex: 1; min-height: 0; border-radius: 14px; overflow: hidden; background: var(--light-card); box-shadow: inset 0 0 0 1px var(--line); display: flex; align-items: center; justify-content: center; position: relative; }
    .plan-card img { max-width: 100%; max-height: 100%; object-fit: contain; padding: 14px; }
    .plan-card .tag { position: absolute; left: 12px; top: 12px; font-size: 28px; color: #2a4032; background: rgba(230,195,100,.30); border: 1px solid rgba(120,90,20,.30); border-radius: 7px; padding: 4px 12px; }
    .plan-empty { font-size: 26px; color: #8a8170; }
    .cover-foot { flex-shrink: 0; font-size: 26px; color: var(--muted); }
    .agent-card { flex-shrink: 0; display: flex; align-items: center; gap: 22px; padding: 18px 22px; border-radius: 14px; background: var(--panel); box-shadow: inset 0 0 0 1px var(--line); }
    .agent-ava { flex-shrink: 0; width: 96px; height: 96px; border-radius: 50%; overflow: hidden; background: rgba(230,195,100,.14); box-shadow: inset 0 0 0 2px rgba(230,195,100,.45); display: flex; align-items: center; justify-content: center; }
    .agent-ava img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .agent-ava span { font-size: 40px; font-weight: 500; color: var(--gold); letter-spacing: .04em; }
    .agent-info { min-width: 0; }
    .agent-eyebrow { font-size: 22px; letter-spacing: .14em; text-transform: uppercase; color: var(--gold); }
    .agent-name { margin-top: 6px; font-size: 38px; font-weight: 500; color: var(--cream); }
    .agent-role { margin-top: 4px; font-size: 26px; color: var(--mint); }
    .agent-contacts { margin-top: 8px; font-size: 28px; color: var(--muted); }
    .agent-note { flex-shrink: 0; font-size: 26px; line-height: 1.5; color: var(--cream); background: rgba(230,195,100,0.08); border-left: 3px solid var(--gold); border-radius: 0 6px 6px 0; padding: 8px 14px; }
    .banner { flex: 1; min-height: 80mm; border-radius: 14px; overflow: hidden; box-shadow: inset 0 0 0 1px var(--line); background: #06120c; }
    .banner img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .photo-ph { display: flex; align-items: center; justify-content: center; text-align: center; padding: 24px; background: radial-gradient(120% 90% at 50% 0%, rgba(230,195,100,.07) 0%, transparent 60%), #06120c; }
    .photo-ph span { font-size: 30px; color: var(--muted); letter-spacing: .04em; }
    .specs { display: grid; grid-template-columns: 1fr 1fr; gap: 0 26px; }
    .spec { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; padding: 13px 2px; border-bottom: 1px solid var(--line); }
    .spec .l { font-size: 28px; color: var(--muted); }
    .spec .v { font-size: 30px; font-weight: 500; color: var(--cream); text-align: right; }
    .promo { flex-shrink: 0; display: flex; align-items: center; gap: 12px; padding: 17px 20px; border-radius: 12px; background: rgba(230,195,100,.12); box-shadow: inset 0 0 0 1px rgba(230,195,100,.35); color: var(--gold); font-size: 30px; }
    .promo .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--gold); flex-shrink: 0; }
    .about { font-size: 30px; line-height: 1.5; color: var(--mint); margin: 0 0 18px; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
    .fill-photo { flex: 1; min-height: 0; border-radius: 14px; overflow: hidden; box-shadow: inset 0 0 0 1px var(--line); background: #06120c; }
    .fill-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .foot { margin-top: auto; font-size: 26px; color: var(--muted); padding-top: 16px; }
    .sheet.photo { padding: 0; }
    .sheet.photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  </style>
</head>
<body>
  <section class="sheet">
    <div class="cover-hero">
      ${blocks.projectGallery && heroImage ? `<img class="cover-bg" src="${esc(heroImage)}" alt="" />` : ''}
      <img class="hero-logo" src="${esc(logoSrc)}" alt="" />
      <div class="cap">
        <p class="eyebrow">${esc(L('Предложение по лоту', 'Property offer'))}</p>
        <h1>${esc(unit.number)}</h1>
        <div class="proj">${esc(project?.name ?? '')}${project?.location ? ` · ${esc(project.location)}` : ''}</div>
      </div>
    </div>
    <div class="pad">
      ${coverChips.length ? chipsHtml(coverChips) : ''}
      ${blocks.unitPrice ? `<div class="price-band">
        <div>
          <div class="big">${esc(money(price))}</div>
          ${unit.pricePerSqm ? `<div class="sub">${esc(money(unit.pricePerSqm))} / м²</div>` : ''}
        </div>
        ${specInline ? `<div class="spec-inline">${esc(specInline)}</div>` : ''}
      </div>` : ''}
      ${blocks.unitPlan ? `<div class="plan-card">
        <span class="tag">${esc(L('Планировка', 'Floor plan'))}</span>
        ${plan ? `<img src="${esc(plan)}" alt="${esc(L('Планировка', 'Floor plan'))} ${esc(unit.number)}" />` : `<span class="plan-empty">${esc(L('Планировка уточняется', 'Floor plan to be confirmed'))}</span>`}
      </div>` : ''}
      ${agentNote ? `<div class="agent-note">${esc(agentNote)}</div>` : ''}
      ${agentCard}
      ${footText ? `<div class="cover-foot">${esc(footText)}</div>` : ''}
    </div>
  </section>

  ${blocks.unitSpecs ? `<section class="sheet">
    <div class="pad">
      ${blocks.projectGallery ? (bannerImage
        ? `<div class="banner"><img src="${esc(bannerImage)}" alt="" /></div>`
        : `<div class="banner photo-ph"><span>${esc(L('Фото проекта появится позже', 'Project photos coming soon'))}</span></div>`) : ''}
      <p class="block-title">${esc(L('Характеристики лота', 'Unit specifications'))}</p>
      <div class="specs">${specs.map((s) => `<div class="spec"><span class="l">${esc(s.l)}</span><span class="v">${esc(s.v)}</span></div>`).join('')}</div>
      ${promo ? `<div class="promo"><span class="dot"></span> ${esc(promo)}</div>` : ''}
    </div>
  </section>` : ''}

  <section class="sheet">
    <div class="pad">
      <p class="block-title">${esc(L('О проекте', 'About the project'))}</p>
      ${blocks.projectDescription && project?.description ? `<p class="about">${esc(project.description)}</p>` : ''}
      ${blocks.amenities && amenities.length ? chipsHtml(amenities) : ''}
      ${blocks.paymentPlans && payments.length ? `<p class="block-title" style="margin-top:10px">${esc(L('Способы оплаты', 'Payment options'))}</p>${chipsHtml(payments)}` : ''}
      ${blocks.projectGallery ? (fillImage
        ? `<div class="fill-photo"><img src="${esc(fillImage)}" alt="" /></div>`
        : `<div class="fill-photo photo-ph"><span>${esc(L('Фото проекта появится позже', 'Project photos coming soon'))}</span></div>`) : ''}
      ${footText ? `<div class="foot">${esc(footText)}</div>` : ''}
    </div>
  </section>

  ${blocks.projectGallery ? photoSheets.map((src) => `<section class="sheet photo"><img src="${esc(src)}" alt="" /></section>`).join('') : ''}

  <script>
    const images = Array.from(document.images);
    const ready = images.length
      ? Promise.all(images.map((img) => img.complete ? Promise.resolve() : new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        })))
      : Promise.resolve();
    ready.then(() => setTimeout(() => window.print(), 350));
  </script>
</body>
</html>`
}

export function getUnitPdfHtml(params: UnitPdfParams): string {
  const logoSrc = new URL(sargonLogo, window.location.origin).href
  const html = buildUnitPdfHtml(params, logoSrc)
  // strip auto-print script so preview doesn't trigger print dialog
  return html.replace(/<script>[\s\S]*?window\.print[\s\S]*?<\/script>/, '')
}

export function openUnitPdf(params: UnitPdfParams): boolean {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1024,height=768')
  if (!printWindow) return false

  const logoSrc = new URL(sargonLogo, window.location.origin).href
  printWindow.document.open()
  printWindow.document.write(buildUnitPdfHtml(params, logoSrc))
  printWindow.document.close()
  return true
}
