import type { Selection, SelectionProperty } from '@/types/selections'
import {
  resolveAgencyCustomization,
  type AgencySelectionCustomization,
} from '@/config/agency-selection-customization'
import { formatMoney, formatMoneyPerM2, t } from '@/lib/selection-display'

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function propertyCard(prop: SelectionProperty, c: AgencySelectionCustomization): string {
  const { language, currency, blocks } = c
  const roomsLabel = prop.rooms === 0 ? (language === 'ru' ? 'Студия' : 'Studio') : `${prop.rooms}-${language === 'ru' ? 'комн.' : 'room'}`
  const params = [roomsLabel, `${prop.area} м²`, `${prop.floor} ${t(language, 'floor')}`].filter(Boolean).join(' · ')
  const priceLine = blocks.pricePerM2 && prop.area > 0
    ? `${formatMoney(prop.price, currency, language)} · ${formatMoneyPerM2(prop.price / prop.area, currency, language)}`
    : formatMoney(prop.price, currency, language)
  return `
    <article class="lot${blocks.photo ? '' : ' lot--nophoto'}">
      ${blocks.photo ? (prop.imageUrl ? `<img src="${esc(prop.imageUrl)}" alt="" />` : '<div class="lot-noimg">Фото</div>') : ''}
      <div class="lot-body">
        ${blocks.address ? `<h3>${esc(prop.address)}</h3>` : ''}
        ${blocks.specs ? `<p class="lot-params">${esc(params)}</p>` : ''}
        ${blocks.developer && prop.developer ? `<p class="lot-meta">${esc(prop.developer)}</p>` : ''}
        ${blocks.description && prop.description ? `<p class="lot-desc">${esc(prop.description)}</p>` : ''}
        ${blocks.price ? `<p class="lot-price">${esc(priceLine)}</p>` : ''}
      </div>
    </article>
  `
}

function buildHtml(selection: Selection, agencyName: string, logoDataUrl: string | null, c: AgencySelectionCustomization): string {
  const { language, blocks } = c
  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8" />
  <title>${esc(selection.title)}</title>
  <style>
    @page { size: A4; margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Montserrat', system-ui, sans-serif; color: #0a1f12; margin: 0; }
    header { border-bottom: 1px solid #ddd; padding-bottom: 12px; margin-bottom: 16px; }
    header img { max-height: 48px; max-width: 220px; object-fit: contain; }
    header .agency { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #666; }
    h1 { font-size: 22px; font-weight: 500; margin: 8px 0 0; }
    .lot { display: grid; grid-template-columns: 220px 1fr; gap: 16px; padding: 14px 0; border-bottom: 1px dashed #ccc; break-inside: avoid; }
    .lot--nophoto { grid-template-columns: 1fr; }
    .lot img { width: 100%; height: 140px; object-fit: cover; border-radius: 6px; }
    .lot-noimg { width: 100%; height: 140px; background: #eee; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #999; font-size: 11px; }
    .lot-body h3 { font-size: 14px; font-weight: 500; margin: 0 0 4px; }
    .lot-params { font-size: 12px; color: #444; margin: 0 0 4px; }
    .lot-meta { font-size: 11px; color: #777; margin: 0 0 6px; }
    .lot-desc { font-size: 12px; line-height: 1.45; color: #333; margin: 0 0 8px; }
    .lot-price { font-size: 14px; font-weight: 500; color: #a87a17; margin: 0; }
    footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: #888; text-align: center; }
  </style>
</head>
<body>
  <header>
    ${blocks.agentContacts ? (logoDataUrl ? `<img src="${esc(logoDataUrl)}" alt="" />` : `<div class="agency">${esc(agencyName)}</div>`) : ''}
    <h1>${esc(selection.title)}</h1>
  </header>
  ${selection.properties.map((p) => propertyCard(p, c)).join('')}
  ${blocks.agentContacts ? `<footer>${esc(agencyName)}</footer>` : ''}
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>
</body>
</html>`
}

export function getSelectionPdfHtml(selection: Selection, agencyName: string, logoDataUrl: string | null, customization?: AgencySelectionCustomization): string {
  const c = resolveAgencyCustomization(customization)
  return buildHtml(selection, agencyName, logoDataUrl, c).replace(
    '<script>window.addEventListener(\'load\', () => setTimeout(() => window.print(), 250));</script>',
    '',
  )
}

export function openSelectionPdf(selection: Selection, agencyName: string, logoDataUrl: string | null, customization?: AgencySelectionCustomization): boolean {
  const c = resolveAgencyCustomization(customization)
  const html = buildHtml(selection, agencyName, logoDataUrl, c)
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  return true
}
