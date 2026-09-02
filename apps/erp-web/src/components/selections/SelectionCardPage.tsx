import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { SELECTIONS_MOCK } from '@/data/selections-mock'
import {
  loadExtraSelections,
  loadSelectionCustomization,
  saveSelectionCustomization,
} from '@/lib/selections-storage'
import { getSelectionPdfHtml, openSelectionPdf } from '@/lib/selection-pdf'
import { useAgencyBranding } from '@/hooks/useAgencyBranding'
import {
  type Selection,
  type SelectionProperty,
} from '@/types/selections'
import {
  ArrowLeft,
  Building2,
  Eye,
  FileDown,
  Link2,
  Printer,
  Sliders,
  X,
} from 'lucide-react'
import { formatUsdCompact } from '@/lib/format-currency'
import { SelectionCustomizationPanel } from '@/components/selections/SelectionCustomizationPanel'
import {
  AGENCY_CUSTOMIZATION_GROUPS,
  resolveAgencyCustomization,
  type AgencySelectionCustomization,
} from '@/config/agency-selection-customization'
import { formatMoney, formatMoneyPerM2, t } from '@/lib/selection-display'
import { useTheme } from '@/context/ThemeContext'
import { useI18n } from "@/i18n";

function formatPrice(price: number) {
  return formatUsdCompact(price)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

const TG_ICON =
  'M9.5 14.5 9 18.5c.4 0 .6-.2.8-.4l2-2 4.1 3c.7.4 1.3.2 1.5-.7l2.7-12.6c.3-1.1-.4-1.6-1.2-1.3L2.7 9.2C1.6 9.6 1.6 10.3 2.5 10.6l4.4 1.4 10.2-6.4c.5-.3.9-.1.5.2L9.5 14.5Z'
const WA_ICON =
  'M16.6 14.2c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.2-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-1.7-.9-2.9-1.6-4-3.6-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.5-.1-.1-.7-1.6-.9-2.2-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.7s1.2 3.1 1.3 3.3c.2.3 2.4 3.7 5.9 5.2 2.4 1 3.4 1.1 4.6.9.7-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3ZM12 2C6.5 2 2 6.5 2 12c0 1.9.5 3.6 1.4 5.2L2 22l4.9-1.3c1.5.8 3.2 1.3 5.1 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2Z'

function shortAddress(raw: string): string {
  // оставляем только название ЖК и номер квартиры, без улицы/дома
  // напр. «ЖК "Символ", ул. Электрозаводская, 24, кв. 518» → «ЖК "Символ", кв. 518»
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
  const jk = parts.find(p => /жк/i.test(p)) ?? parts[0] ?? raw
  const flat = parts.find(p => /^кв\b/i.test(p))
  return flat ? `${jk}, ${flat}` : jk
}

function PropertyRow({ prop }: { prop: SelectionProperty }) {
    const { t: tApp } = useI18n();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: 'var(--hub-card-bg)',
      border: '1px solid var(--hub-card-border)',
      borderRadius: 8, padding: '12px 14px',
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 6, flexShrink: 0,
        background: 'rgba(201,168,76,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Building2 size={14} color="var(--gold)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <div style={{
            fontSize: 12, fontWeight: 400, color: 'var(--app-text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {shortAddress(prop.address)}
          </div>
          {prop.isPromo && (
            <span style={{
              flexShrink: 0, fontSize: 16, fontWeight: 500, textTransform: 'uppercase',
              letterSpacing: '0.06em', color: 'var(--gold)',
              background: 'rgba(230,195,100,0.15)', borderRadius: 4, padding: '2px 6px',
            }}>
              {tApp('selections.selectionCardPage.акция')}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--app-text-muted)' }}>
          {prop.rooms === 0 ? 'Студия' : `${prop.rooms}+1`} · {prop.area} {tApp('selections.selectionCardPage.м')}{prop.floor} {tApp('selections.selectionCardPage.эт')}{prop.developer && ` · ${prop.developer}`}
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 400, color: 'var(--app-text)', flexShrink: 0 }}>
        {formatPrice(prop.price)}
      </div>
    </div>
  )
}

function PreviewModal({
  selection,
  agencyName,
  logoDataUrl,
  onClose,
  c,
}: {
  selection: Selection
  agencyName: string
  logoDataUrl: string | null
  onClose: () => void
  c: AgencySelectionCustomization
}) {
    const { t: tApp } = useI18n();
  const { language, currency, blocks } = c
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 80,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--hub-card-bg)',
          border: '1px solid var(--hub-card-border)',
          borderRadius: 12, maxWidth: 640, width: '100%',
          maxHeight: '90vh', overflowY: 'auto',
          fontFamily: "'Montserrat', sans-serif",
        }}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 20px', borderBottom: '1px solid var(--divider-subtle)',
          position: 'sticky', top: 0, background: 'var(--hub-card-bg)', zIndex: 1,
        }}>
          <span style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--hub-desc)' }}>
            {tApp('selections.selectionCardPage.предпросмотр_письма')}</span>
          <button
            type="button" onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--app-text-subtle)', padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {logoDataUrl ? (
            <img src={logoDataUrl} alt="" style={{ maxHeight: 48, maxWidth: 220, objectFit: 'contain' }} />
          ) : (
            <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--hub-desc)' }}>
              {agencyName}
            </div>
          )}
          <h2 style={{ fontSize: 18, fontWeight: 400, color: 'var(--app-text)', margin: '12px 0 0' }}>
            {selection.title}
          </h2>
        </div>

        <div style={{ padding: '0 24px 20px' }}>
          {selection.properties.map((prop, i) => (
            <div key={prop.id}>
              {i > 0 && (
                <div style={{ borderTop: '1px dashed var(--divider-subtle)', margin: '16px 0' }} />
              )}
              <article style={{ display: 'grid', gridTemplateColumns: blocks.photo ? '160px 1fr' : '1fr', gap: 14 }}>
                {blocks.photo && (prop.imageUrl ? (
                  <img
                    src={prop.imageUrl} alt=""
                    style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 6 }}
                  />
                ) : (
                  <div style={{
                    width: '100%', height: 110, background: 'var(--green-deep)',
                    borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--app-text-subtle)', fontSize: 11,
                  }}>
                    {tApp('selections.selectionCardPage.фото')}</div>
                ))}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)', margin: 0 }}>
                      {language === 'ru' ? 'Объект' : 'Property'} {i + 1}
                    </p>
                    {prop.isPromo && (
                      <span style={{
                        fontSize: 16, fontWeight: 500, textTransform: 'uppercase',
                        letterSpacing: '0.06em', color: 'var(--gold)',
                        background: 'rgba(230,195,100,0.15)', borderRadius: 4, padding: '2px 6px',
                      }}>
                        {language === 'ru' ? 'Акция' : 'Promo'}
                      </span>
                    )}
                  </div>
                  {blocks.address && (
                    <h3 style={{ fontSize: 14, fontWeight: 400, color: 'var(--app-text)', margin: '4px 0' }}>
                      {prop.address}
                    </h3>
                  )}
                  {(blocks.specs || (blocks.developer && prop.developer)) && (
                    <p style={{ fontSize: 12, color: 'var(--hub-body)', margin: '0 0 4px' }}>
                      {blocks.specs && `${prop.rooms === 0 ? (language === 'ru' ? 'Студия' : 'Studio') : `${prop.rooms}+1`} · ${prop.area} м² · ${prop.floor} ${t(language, 'floor')}`}
                      {blocks.developer && prop.developer && `${blocks.specs ? ' · ' : ''}${prop.developer}`}
                    </p>
                  )}
                  {blocks.description && prop.description && (
                    <p style={{ fontSize: 12, color: 'var(--hub-body)', lineHeight: 1.45, margin: '0 0 6px' }}>
                      {prop.description}
                    </p>
                  )}
                  {blocks.price && (
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--gold)', margin: 0 }}>
                      {formatMoney(prop.price, currency, language)}
                      {blocks.pricePerM2 && prop.area > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--app-text-subtle)', marginLeft: 6 }}>
                          {formatMoneyPerM2(prop.price / prop.area, currency, language)}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </article>
            </div>
          ))}
        </div>

        {blocks.agentContacts && (
          <div style={{
            padding: '12px 24px', borderTop: '1px solid var(--divider-subtle)',
            background: 'var(--green-deep)', textAlign: 'center',
            fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--hub-desc)',
          }}>
            {agencyName}
          </div>
        )}
      </div>
    </div>
  )
}

type SendTarget = 'tg' | 'wa'

export function SelectionCardPage() {
    const { t: tApp } = useI18n();
  const { selectionId } = useParams<{ selectionId: string }>()
  const navigate = useNavigate()
  const branding = useAgencyBranding()
  const { isLightTheme } = useTheme()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false)
  const [sendTarget, setSendTarget] = useState<SendTarget | null>(null)

  const selection = useMemo(() => {
    const pool = [...loadExtraSelections(), ...SELECTIONS_MOCK]
    return pool.find((s) => s.id === selectionId)
  }, [selectionId])

  const [showCustom, setShowCustom] = useState(false)
  const [customization, setCustomization] = useState<AgencySelectionCustomization>(() =>
    resolveAgencyCustomization(
      (selectionId ? loadSelectionCustomization(selectionId) : undefined) ?? selection?.customization,
    ),
  )
  const updateCustomization = (next: AgencySelectionCustomization) => {
    setCustomization(next)
    if (selectionId) saveSelectionCustomization(selectionId, next)
  }

  if (!selection) {
    return (
      <DashboardShell hideSidebar>
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--app-text-subtle)' }}>
          {tApp('selections.selectionCardPage.подборка_не_найдена')}</div>
      </DashboardShell>
    )
  }

  const agencyName = branding.name || 'Ваше агентство'

  const handlePdf = () => {
    const opened = openSelectionPdf(selection, agencyName, branding.logoDataUrl, customization)
    if (!opened) {
      window.alert('Браузер заблокировал окно PDF. Разрешите всплывающие окна и повторите.')
    }
  }

  const shareUrl = selection.portalUrl
    || `${window.location.origin}${window.location.pathname}#/selections/${selection.id}`

  const openMessengerWithLink = (kind: SendTarget) => {
    if (kind === 'tg') {
      window.open(
        `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(selection.title)}`,
        '_blank',
      )
    } else {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(`${selection.title}\n${shareUrl}`)}`,
        '_blank',
      )
    }
  }

  const handleSendChoice = (mode: 'link' | 'pdf') => {
    if (!sendTarget) return
    const target = sendTarget
    setSendTarget(null)
    if (mode === 'pdf') handlePdf()
    openMessengerWithLink(target)
  }

  return (
    <DashboardShell hideSidebar>
      <div
        style={{
          padding: '20px 24px',
          minHeight: '100%',
          fontFamily: "'Montserrat', sans-serif",
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
          background: 'var(--app-bg)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--app-text-subtle)', padding: 4, marginTop: 4,
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 400, color: 'var(--app-text)', marginBottom: 4 }}>
              {selection.title}
            </div>
            <div style={{ fontSize: 11, color: 'var(--app-text-subtle)' }}>
              {tApp('selections.selectionCardPage.создана')}{formatDate(selection.createdAt)} · {selection.properties.length} {selection.properties.length === 1 ? 'объект' : 'объектов'}
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 4,
              background: 'var(--nav-item-bg-active)',
              border: '1px solid var(--hub-card-border-hover)',
              color: 'var(--theme-accent-heading)',
              fontSize: 12, fontWeight: 400, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <Eye size={13} />
            {tApp('selections.selectionCardPage.предпросмотр')}</button>
          <button
            type="button"
            onClick={() => setPdfPreviewOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 4,
              background: 'var(--hub-tile-icon-bg)',
              border: '1px solid var(--hub-card-border)',
              color: 'var(--app-text-muted)',
              fontSize: 12, fontWeight: 400, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <FileDown size={13} />
            {tApp('selections.selectionCardPage.предпросмотр_pdf')}</button>
          <button
            type="button"
            onClick={() => setSendTarget('tg')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 4,
              background: 'rgba(34,158,217,0.12)',
              border: '1px solid rgba(34,158,217,0.35)',
              color: '#5ab9e8',
              fontSize: 12, fontWeight: 400, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d={TG_ICON} /></svg>
            Telegram
          </button>
          <button
            type="button"
            onClick={() => setSendTarget('wa')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 4,
              background: 'rgba(37,211,102,0.12)',
              border: '1px solid rgba(37,211,102,0.35)',
              color: '#4ad17a',
              fontSize: 12, fontWeight: 400, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d={WA_ICON} /></svg>
            WhatsApp
          </button>
        </div>

        {/* Кастомизация */}
        <div style={{ marginBottom: 18 }}>
          <button
            type="button"
            onClick={() => setShowCustom(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '10px 14px', borderRadius: 6, background: 'rgba(0,0,0,0.22)',
              border: 'none', boxShadow: 'inset 0 0 0 1px rgba(230,195,100,0.18)',
              color: 'var(--app-text-muted)', fontSize: 16, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Sliders size={15} />
            <span style={{ flex: 1, textAlign: 'left' }}>{tApp('selections.selectionCardPage.кастомизация_язык_ва')}</span>
          </button>
          {showCustom && (
            <div style={{ marginTop: 12 }}>
              <SelectionCustomizationPanel
                value={customization}
                groups={AGENCY_CUSTOMIZATION_GROUPS}
                variant={isLightTheme ? 'light' : 'dark'}
                onChange={updateCustomization}
              />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {selection.properties.map(prop => (
            <PropertyRow key={prop.id} prop={prop} />
          ))}
        </div>

        {previewOpen && (
          <PreviewModal
            selection={selection}
            agencyName={agencyName}
            logoDataUrl={branding.logoDataUrl}
            onClose={() => setPreviewOpen(false)}
            c={customization}
          />
        )}

        {pdfPreviewOpen && (
          <PdfPreviewModal
            html={getSelectionPdfHtml(selection, agencyName, branding.logoDataUrl, customization)}
            onPrint={handlePdf}
            onClose={() => setPdfPreviewOpen(false)}
          />
        )}

        {sendTarget && (
          <SendChoiceModal
            target={sendTarget}
            onChoose={handleSendChoice}
            onClose={() => setSendTarget(null)}
          />
        )}
      </div>
    </DashboardShell>
  )
}

function SendChoiceModal({
  target,
  onChoose,
  onClose,
}: {
  target: SendTarget
  onChoose: (mode: 'link' | 'pdf') => void
  onClose: () => void
}) {
    const { t: tApp } = useI18n();
  const targetLabel = target === 'tg' ? 'Telegram' : 'WhatsApp'
  const accent = target === 'tg' ? '#5ab9e8' : '#4ad17a'
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 85,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--hub-card-bg)',
          border: '1px solid var(--hub-card-border)',
          borderRadius: 8, maxWidth: 440, width: '100%',
          fontFamily: "'Montserrat', sans-serif",
        }}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 20px', borderBottom: '1px solid var(--divider-subtle)',
        }}>
          <span style={{ fontSize: 14, color: 'var(--app-text)' }}>
            {tApp('selections.selectionCardPage.что_отправить_в')}{targetLabel}?
          </span>
          <button
            type="button" onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--app-text-subtle)', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            onClick={() => onChoose('link')}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '12px 14px', borderRadius: 6,
              background: 'var(--green-deep)', border: `1px solid ${accent}40`,
              cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
              color: 'var(--app-text)',
            }}
          >
            <Link2 size={16} color={accent} style={{ marginTop: 2, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 13, marginBottom: 2 }}>{tApp('selections.selectionCardPage.ссылкой')}</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--app-text-subtle)' }}>
                {tApp('selections.selectionCardPage.клиент_откроет_подбо')}</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => onChoose('pdf')}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '12px 14px', borderRadius: 6,
              background: 'var(--green-deep)', border: `1px solid ${accent}40`,
              cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
              color: 'var(--app-text)',
            }}
          >
            <FileDown size={16} color={accent} style={{ marginTop: 2, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 13, marginBottom: 2 }}>{tApp('selections.selectionCardPage.pdf_файлом')}</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--app-text-subtle)' }}>
                {tApp('selections.selectionCardPage.откроется_pdf_сохран')}</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

function PdfPreviewModal({
  html,
  onPrint,
  onClose,
}: {
  html: string
  onPrint: () => void
  onClose: () => void
}) {
    const { t: tApp } = useI18n();
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 90,
        display: 'flex', alignItems: 'stretch', justifyContent: 'center',
        padding: '24px 20px',
        fontFamily: "'Montserrat', sans-serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex', flexDirection: 'column',
          width: '100%', maxWidth: 700,
          background: 'var(--hub-card-bg)',
          border: '1px solid var(--hub-card-border)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid var(--divider-subtle)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--app-text-subtle)' }}>
            {tApp('selections.selectionCardPage.предпросмотр_pdf')}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={onPrint}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 4,
                background: 'rgba(230,195,100,0.1)',
                border: '1px solid rgba(230,195,100,0.4)',
                color: '#e6c364',
                fontSize: 12, fontWeight: 400, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <Printer size={13} />
              {tApp('selections.selectionCardPage.печать_сохранить_pdf')}</button>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--app-text-subtle)', padding: 4 }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* iframe */}
        <iframe
          srcDoc={html}
          title={tApp('selections.selectionCardPage.pdf_предпросмотр')}
          style={{
            flex: 1,
            border: 'none',
            width: '100%',
            background: '#fff',
          }}
        />
      </div>
    </div>
  )
}
