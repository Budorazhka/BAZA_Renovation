import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams, useLocation, useSearchParams } from 'react-router-dom'
import { Building2, ChevronLeft, ChevronRight, FileText, MapPin, Phone } from 'lucide-react'
import telegramIcon from '@/assets/telegram.svg'
import whatsappIcon from '@/assets/whatsapp.svg'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibregl from 'maplibre-gl'

import { VisitAmenitiesSection } from '@/components/public/visit/VisitAmenitiesSection'
import { BazaSaleBrandLogo } from '@/components/public/visit/BazaSaleBrandLogo'
import { VisitDeveloperSection } from '@/components/public/visit/VisitDeveloperSection'
import { VisitPaymentSection } from '@/components/public/visit/VisitPaymentSection'
import { VisitPremiumHero } from '@/components/public/visit/VisitPremiumHero'
import { VisitUnitPlans } from '@/components/public/visit/VisitUnitPlans'
import { installmentsKey } from '@/components/development/sales/salesManagementStorage'
import { resolveUnitShareCustomization } from '@/config/dev-selection-customization'
import { resolveUnitCeilingHeight, resolveUnitConditionLabel } from '@/lib/apartment-labels'
import { compactRoomsLabel } from '@/lib/chessboard'
import { optionLabelRu, type OptionGroup } from '@/lib/project-options'
import { resolveProjectInstallmentRows, resolveUnitModalListPrice } from '@/lib/installment-display'
import { resolvePremiumHeroImage } from '@/lib/newbuildings-catalog-images'
import { formatMoney, t, unitStatusLabel, type SelectionLanguage } from '@/lib/selection-display'
import { loadPublicUnitLanding } from '@/lib/unit-landing'
import {
  normalizeFinishPrices,
  readPersistedUnitFinishPrices,
  resolveFinishDisplayOptions,
} from '@/lib/unit-finish-pricing'
import {
  buildAgentCtaMessage,
  formatVisitActualDate,
  resolveCountryInfoContent,
  resolveDistrictContent,
  resolveInvestmentContent,
  resolveLegalInfoContent,
  resolveProjectInfoContent,
  resolvePurchaseFlowContent,
  resolveRentalContent,
  resolveSimilarUnits,
  type SimilarUnitCard,
} from '@/lib/unit-visit-content'
import { visitBlockLabel } from '@/lib/unit-visit-block-labels'
import { applyUnitVisitPageChrome, resolveUnitVisitTheme, type UnitVisitTheme } from '@/lib/unit-visit-theme'
import { parseUnitShareCustomization, shareLinkCustomizationToCustomization } from '@/lib/unit-share-customization'
import { buildUnitShareUrl, getUnitShareSearchQuery, parseUnitShareAgent, shareLinkSenderToAgent } from '@/lib/unit-share'
import { resolveVisitDeveloperInfo } from '@/lib/visit-location-content'
import { developmentApi, type PublicCdnFileRef, type PublicUnitLanding, type UnitShareLinkDto } from '@/services/developmentApi'
import { useCoreStore } from '@/store/useCoreStore'
import '@/styles/unit-visit-page.css'
import '@/styles/visit-premium.css'
import type { FinishType } from '@/types/core'
import { useI18n } from "@/i18n";

type PublicComplex = PublicUnitLanding['complex']
type AgentActionKind = 'generic' | 'docs' | 'similar' | 'reserve'
type ContactAction = { label: string; href?: string; icon: ReactNode; disabled?: boolean }
type ResolvedShareAgent = {
  name: string
  company: string
  role: string
  phone: string
  whatsapp: string
  telegram: string
  email: string
  aboutMe: string
  aboutCompany: string
  instagram: string
  avatarUrl?: string
  website?: string
}

const PLACEHOLDER_AGENT: ResolvedShareAgent = {
  name: 'Никита Девелопер',
  company: 'Development Group',
  role: 'Персональный консультант',
  phone: '+995 591 805 562',
  whatsapp: '+995 591 805 562',
  telegram: 'agent_baza',
  email: 'developer@baza.sale',
  aboutMe:
    'Помогу понять проект, разобрать условия покупки, подобрать похожие варианты и сопроводить клиента до бронирования.',
  aboutCompany: '',
  instagram: 'baza.developer',
}

function WhatsAppIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2C6.48 2 2 6.3 2 11.62c0 2.05.66 3.95 1.79 5.5L2.4 22l5.08-1.33A10.2 10.2 0 0 0 12 21.24c5.52 0 10-4.3 10-9.62C22 6.3 17.52 2 12 2Z"
        fill="currentColor"
        opacity="0.2"
      />
      <path
        d="M19.05 4.93A9.9 9.9 0 0 0 12 2a10 10 0 0 0-8.64 15.03L2 22l5.14-1.35A10 10 0 1 0 19.05 4.93Zm-7.05 14.5c-1.5 0-2.97-.4-4.24-1.14l-.3-.18-3.04.8.82-2.95-.2-.31a8.1 8.1 0 0 1-1.28-4.33A8.24 8.24 0 1 1 12 19.43Zm4.52-6.14c-.25-.12-1.49-.72-1.72-.8-.23-.09-.4-.12-.57.12-.17.24-.65.8-.8.96-.15.17-.3.18-.55.06-.25-.12-1.06-.38-2.03-1.2-.75-.63-1.26-1.4-1.4-1.63-.15-.24-.02-.37.1-.49.12-.11.25-.29.38-.43.12-.15.16-.25.25-.42.08-.17.04-.31-.02-.43-.06-.12-.57-1.35-.79-1.84-.21-.5-.42-.43-.57-.44h-.49c-.17 0-.43.06-.66.31-.23.24-.87.85-.87 2.07s.9 2.4 1.03 2.56c.12.17 1.76 2.77 4.37 3.78.62.27 1.12.43 1.5.55.63.2 1.2.17 1.66.1.5-.08 1.5-.61 1.71-1.2.21-.58.21-1.08.15-1.2-.06-.12-.22-.18-.47-.3Z"
        fill="currentColor"
      />
    </svg>
  )
}

function TelegramIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2" />
      <path
        d="M17.94 7.62c.3-.12.6.15.5.46l-2.3 10.85c-.08.37-.52.5-.78.24l-3.01-2.95-1.53 1.47c-.17.17-.47.08-.52-.16l-.58-2.86-2.43-.83c-.36-.12-.38-.61-.03-.76l10.68-4.46Zm-7.3 7.2.24 1.2.73-.71 4.56-5.17-5.53 4.68Z"
        fill="currentColor"
      />
    </svg>
  )
}

const MAP_STYLE_URL = 'https://api.maptiler.com/maps/streets-v2/style.json?key=en6NJwkot3tUa0Z2O9v9'

const VISIT_SECTION = {
  hero: 'visit-hero',
  branding: 'visit-branding',
  unitCard: 'visit-unit-card',
  unitFinance: 'visit-unit-finance',
  unitPlan: 'visit-unit-plan',
  projectInfo: 'visit-project-info',
  projectGallery: 'visit-project-gallery',
  projectInfrastructure: 'visit-project-infrastructure',
  projectLocation: 'visit-project-location',
  developer: 'visit-developer',
  legal: 'visit-legal',
  purchase: 'visit-purchase',
  investment: 'visit-investment',
  rental: 'visit-rental',
  similar: 'visit-similar',
  cityInfo: 'visit-city-info',
  cityGallery: 'visit-city-gallery',
  districtInfo: 'visit-district-info',
  districtGallery: 'visit-district-gallery',
  countryInfo: 'visit-country-info',
  countryGallery: 'visit-country-gallery',
  finalCta: 'visit-final-cta',
} as const

function localize(language: SelectionLanguage, ru: string, en: string, ka: string): string {
  if (language === 'en') return en
  if (language === 'ka') return ka
  return ru
}

function normalizePhone(phone?: string): string | null {
  const digits = phone?.replace(/\D/g, '') ?? ''
  return digits || null
}

function buildWhatsAppHref(phone: string | undefined, message: string): string | null {
  const digits = normalizePhone(phone)
  if (!digits) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

function buildTelegramHref(username?: string): string | null {
  if (!username) return null
  return `https://t.me/${username.replace(/^@/, '')}`
}

function buildPhoneHref(phone?: string): string | null {
  return phone ? `tel:${phone}` : null
}

function resolveAgentWithPlaceholders(
  agent: ReturnType<typeof parseUnitShareAgent>,
  language: SelectionLanguage,
): ResolvedShareAgent {
  return {
    name: agent?.name?.trim() || localize(language, PLACEHOLDER_AGENT.name, 'Nikita Developer', 'ნიკიტა დეველოპერი'),
    company: agent?.company || PLACEHOLDER_AGENT.company,
    role:
      agent?.role ||
      localize(language, PLACEHOLDER_AGENT.role, 'Personal consultant', 'პერსონალური კონსულტანტი'),
    phone: agent?.phone || PLACEHOLDER_AGENT.phone,
    whatsapp: agent?.whatsapp || agent?.phone || PLACEHOLDER_AGENT.whatsapp,
    telegram: agent?.telegram || PLACEHOLDER_AGENT.telegram,
    avatarUrl: agent?.avatarUrl,
    email: agent?.email || PLACEHOLDER_AGENT.email,
    aboutMe:
      agent?.aboutMe ||
      localize(
        language,
        PLACEHOLDER_AGENT.aboutMe ?? '',
        'I can explain the project, break down the purchase terms, suggest similar options, and guide the client through reservation.',
        'დაგეხმარებით პროექტის გაგებაში, შეძენის პირობების ახსნაში, მსგავსი ვარიანტების შერჩევასა და დაჯავშნამდე сопровождении.',
      ),
    aboutCompany: agent?.aboutCompany || '',
    website: agent?.website,
    instagram: agent?.instagram || PLACEHOLDER_AGENT.instagram,
  }
}

function buildPrimaryContactHref(
  agent: ReturnType<typeof parseUnitShareAgent>,
  unitTitle: string,
  language: SelectionLanguage,
  kind: AgentActionKind = 'generic',
): string | null {
  const safeAgent = resolveAgentWithPlaceholders(agent, language)
  const message = buildAgentCtaMessage(kind, unitTitle, language)
  return (
    buildWhatsAppHref(safeAgent.whatsapp ?? safeAgent.phone, message) ||
    (safeAgent.phone ? `tel:${safeAgent.phone}` : null) ||
    buildTelegramHref(safeAgent.telegram) ||
    (safeAgent.email ? `mailto:${safeAgent.email}?subject=${encodeURIComponent(unitTitle)}` : null)
  )
}

function buildContactActions(
  agent: ReturnType<typeof parseUnitShareAgent>,
  unitTitle: string,
  language: SelectionLanguage,
): ContactAction[] {
  const safeAgent = resolveAgentWithPlaceholders(agent, language)
  const actions: ContactAction[] = []
  const genericMessage = buildAgentCtaMessage('generic', unitTitle, language)
  const waHref = buildWhatsAppHref(safeAgent.whatsapp ?? safeAgent.phone, genericMessage)
  const tgHref = buildTelegramHref(safeAgent.telegram)
  const phoneHref = buildPhoneHref(safeAgent.phone)

  if (phoneHref) {
    actions.push({ label: localize(language, 'Позвонить', 'Call', 'დარეკვა'), href: phoneHref, icon: <Phone size={14} /> })
  }

  if (waHref) {
    actions.push({ label: t(language, 'whatsapp'), href: waHref, icon: <WhatsAppIcon size={14} /> })
  }

  if (tgHref) {
    actions.push({ label: t(language, 'telegram'), href: tgHref, icon: <TelegramIcon size={14} /> })
  }

  return actions
}

function dedupeFiles(files: Array<PublicCdnFileRef | null | undefined>): PublicCdnFileRef[] {
  const seen = new Set<string>()
  const result: PublicCdnFileRef[] = []
  for (const file of files) {
    if (!file?.url || seen.has(file.url)) continue
    seen.add(file.url)
    result.push(file)
  }
  return result
}

/** Галерея проекта — обложка, рендеры и `images[]` (без фото стройки). */
function collectProjectGalleryImages(complex: PublicComplex): PublicCdnFileRef[] {
  const fromStructured = dedupeFiles([complex.cover, ...(complex.renders ?? [])])
  if (fromStructured.length > 0) return fromStructured

  const imageUrls = (complex.images ?? complex.renderUrls ?? []).filter(Boolean)
  if (imageUrls.length > 0) return galleryFilesFromUrls(imageUrls, 'render')

  if (complex.coverUrl) return galleryFilesFromUrls([complex.coverUrl], 'cover')

  return []
}

/** Ход строительства — отдельная галерея с фото стройплощадки. */
function collectConstructionImages(complex: PublicComplex): PublicCdnFileRef[] {
  return dedupeFiles(complex.constructionProgress ?? [])
}

function galleryFilesFromUrls(urls: string[], prefix: string): PublicCdnFileRef[] {
  return urls.map((url, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix}-${index + 1}`,
    url,
    mimeType: 'image/jpeg',
    size: 0,
    createdAt: '',
  }))
}

/**
 * Fallback-фото города/района/страны, когда у ЖК нет загруженной галереи.
 * Источник — Wikimedia Commons (постоянные URL, реальная гео-привязка, свободная лицензия),
 * вместо протухающих прокси-ссылок Google. Каждый набор подобран по содержанию.
 */
const FALLBACK_CITY_BATUMI: string[] = [
  'https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Batumi_skyline_as_seen_from_Mtsvane_Kontskhi_cape.jpg/1280px-Batumi_skyline_as_seen_from_Mtsvane_Kontskhi_cape.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Changing_skyline_of_Batumi%2C_Georgia.jpg/1280px-Changing_skyline_of_Batumi%2C_Georgia.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Black_Sea_coast_of_Georgia_%28country%29%2C_with_skyline_of_Batumi_on_the_horizon.jpg/1280px-Black_Sea_coast_of_Georgia_%28country%29%2C_with_skyline_of_Batumi_on_the_horizon.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Batumi_boulevardbeach.jpg/1280px-Batumi_boulevardbeach.jpg',
]

const FALLBACK_DISTRICT_BATUMI: string[] = [
  'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Batumi_Boulevard_Iclusive_Beach.jpg/1280px-Batumi_Boulevard_Iclusive_Beach.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Batumi_beach_%2884%29.jpg/1280px-Batumi_beach_%2884%29.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Batumi_Plage.jpg/1280px-Batumi_Plage.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/5/50/Batumi_boulevard.jpg',
]

const FALLBACK_CITY_TBILISI: string[] = [
  'https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Old_Town_and_Narikala%2C_Tbilisi.jpg/1280px-Old_Town_and_Narikala%2C_Tbilisi.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/1/11/Sunset_in_Tbilisi_%282010%29.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Tbilisi_City_-_Urban_Photos_-_Georgia_Tourism_13.jpg/1280px-Tbilisi_City_-_Urban_Photos_-_Georgia_Tourism_13.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/View_over_Tbilisi_from_Nariqala_Fortress_-_Old_Town_-_Tbilisi_-_Georgia_%2818713422175%29_%282%29.jpg/1280px-View_over_Tbilisi_from_Nariqala_Fortress_-_Old_Town_-_Tbilisi_-_Georgia_%2818713422175%29_%282%29.jpg',
]

const FALLBACK_CITY_GENERIC: string[] = FALLBACK_CITY_TBILISI

const FALLBACK_COUNTRY_GEORGIA: string[] = [
  'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Gergeti_Trinity_Church_and_Kuru_mountain_range_as_seen_from_Kazbek_slopes%2C_Georgia.jpg/1280px-Gergeti_Trinity_Church_and_Kuru_mountain_range_as_seen_from_Kazbek_slopes%2C_Georgia.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/%22Kazbegi%22%2C_Mount_Kazbek_range_obscured_by_clouds_and_rays_of_setting_sun%2C_Georgia.jpg/1280px-%22Kazbegi%22%2C_Mount_Kazbek_range_obscured_by_clouds_and_rays_of_setting_sun%2C_Georgia.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Rainbow_in_Kakheti.jpg/1280px-Rainbow_in_Kakheti.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Georgia_Jvari_monastery_IMG_9320_2055.jpg/1280px-Georgia_Jvari_monastery_IMG_9320_2055.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Old_Town_and_Narikala%2C_Tbilisi.jpg/1280px-Old_Town_and_Narikala%2C_Tbilisi.jpg',
]

const FALLBACK_DISTRICT_GENERIC: string[] = [
  'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Tbilisi_City_-_Urban_Photos_-_Georgia_Tourism_13.jpg/1280px-Tbilisi_City_-_Urban_Photos_-_Georgia_Tourism_13.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Tbilisi_City_-_Urban_Photos_-_Georgia_Tourism_17.jpg/1280px-Tbilisi_City_-_Urban_Photos_-_Georgia_Tourism_17.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Old_Town_and_Narikala%2C_Tbilisi.jpg/1280px-Old_Town_and_Narikala%2C_Tbilisi.jpg',
]

function formatRooms(language: SelectionLanguage, rooms: string, roomsStr?: string | null): string {
  const raw = roomsStr ?? rooms
  if (!raw) return '—'
  if (raw === 'studio' || /^0$/.test(raw)) return t(language, 'studio')
  return compactRoomsLabel(raw) || raw
}

function usePublicPageScroll() {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    const prevMinWidth = document.body.style.minWidth
    document.body.style.overflow = 'auto'
    document.body.style.minWidth = '0'
    return () => {
      document.body.style.overflow = prevOverflow
      document.body.style.minWidth = prevMinWidth
    }
  }, [])
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="visit-premium-section-label text-left text-sm font-normal uppercase tracking-[0.22em] sm:text-base">
      {children}
    </h2>
  )
}

function VisitEmptySection({ label, message }: { label: string; message: string }) {
  return (
    <section className="visit-premium-section visit-premium-empty">
      <SectionTitle>{label}</SectionTitle>
      <p className="visit-section-content text-base leading-relaxed sm:text-lg">{message}</p>
    </section>
  )
}

function VisitShell({
  theme,
  children,
  className = '',
}: {
  theme: UnitVisitTheme
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`unit-visit-page min-h-[100dvh] text-base sm:text-lg ${className}`} data-visit-theme={theme}>
      {children}
    </div>
  )
}

function InfoPanelSection({
  id,
  label,
  intro,
  bullets,
  note,
  footer,
}: {
  id: string
  label: string
  intro?: string
  bullets?: string[]
  note?: string
  footer?: ReactNode
}) {
  const hasContent = Boolean(intro || (bullets?.length ?? 0) > 0 || note || footer)
  if (!hasContent) return null

  // Описание из кабинета часто многоабзацное — пустая строка делит абзацы,
  // одиночный перенос сохраняем внутри абзаца (whitespace-pre-line).
  // Инлайновые маркеры «●/•» переносим на свою строку для читабельности.
  const introParagraphs = intro
    ? intro
        .replace(/[ \t]*([•●])[ \t]*/g, '\n$1 ')
        .replace(/\n{3,}/g, '\n\n')
        .split(/\n\s*\n/)
        .map((part) => part.trim())
        .filter(Boolean)
    : []

  return (
    <section id={id} className="visit-premium-section visit-scroll-section scroll-mt-6 reveal-section">
      <SectionTitle>{label}</SectionTitle>
      <div className="visit-section-content visit-premium-panel px-4 py-5 sm:px-7 sm:py-7">
        {introParagraphs.length > 0 ? (
          <div className="flex flex-col gap-4">
            {introParagraphs.map((paragraph, index) => (
              <p key={index} className="visit-premium-muted whitespace-pre-line text-base leading-relaxed sm:text-lg">
                {paragraph}
              </p>
            ))}
          </div>
        ) : null}
        {bullets && bullets.length > 0 ? (
          <ul className={`grid gap-3 text-base sm:grid-cols-2 sm:text-lg ${intro ? 'mt-5' : ''}`}>
            {bullets.map((item) => (
              <li key={item} className="visit-premium-muted flex gap-3 stagger-item">
                <span className="visit-amenity-bullet mt-2 size-1.5 shrink-0 rounded-full" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {note ? (
          <p className={`visit-subtle text-sm leading-relaxed sm:text-base ${intro || (bullets?.length ?? 0) > 0 ? 'mt-5' : ''}`}>
            {note}
          </p>
        ) : null}
        {footer ? <div className="mt-5">{footer}</div> : null}
      </div>
    </section>
  )
}

function PurchaseStepsRibbon({
  agent,
  language,
  unitTitle,
}: {
  agent: ReturnType<typeof parseUnitShareAgent>
  language: SelectionLanguage
  unitTitle: string
}) {
  const primaryHref = buildPrimaryContactHref(agent, unitTitle, language, 'generic')

  const steps = language === 'en'
    ? ['Consultation', 'Reservation', 'Agreement', 'Registration', 'Keys']
    : language === 'ka'
      ? ['კონსულტაცია', 'დაჯავშნა', 'ხელშეკრულება', 'რეგისტრაცია', 'გასაღებები']
      : ['Консультация', 'Бронирование', 'Договор', 'Регистрация', 'Ключи']

  return (
    <div className="visit-premium-panel overflow-hidden rounded-2xl">
      {/* Шаги */}
      <div className="flex items-center gap-0 overflow-x-auto border-b border-[var(--visit-border-soft)] px-4 py-3 sm:px-6">
        {steps.map((step, i) => (
          <div key={step} className="flex shrink-0 items-center">
            <div className="flex flex-col items-center gap-1">
              {i === 0 ? (
                <div className="relative flex h-7 w-7 items-center justify-center">
                  {/* Пульсирующее кольцо */}
                  <span className="absolute inset-0 animate-ping rounded-full bg-[var(--visit-accent)] opacity-30" />
                  <div className="relative flex h-7 w-7 items-center justify-center rounded-full bg-[var(--visit-accent)] text-[10px] font-bold text-white shadow-[0_0_8px_var(--visit-accent)]">
                    1
                  </div>
                </div>
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--visit-border-strong)] text-[10px] font-medium text-[var(--visit-text-muted)]">
                  {i + 1}
                </div>
              )}
              <span className={`text-[9px] uppercase tracking-[0.1em] sm:text-[10px] ${i === 0 ? 'text-[var(--visit-accent)]' : 'text-[var(--visit-text-muted)]'}`}>
                {step}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="mx-1.5 mb-3.5 h-px w-5 bg-[var(--visit-border-strong)] sm:mx-2 sm:w-7" />
            )}
          </div>
        ))}
      </div>

      {/* Кнопка */}
      <div className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <p className="visit-premium-muted text-sm sm:text-base">
          {localize(
            language,
            'Готовы обсудить? Риэлтор ответит на любые вопросы.',
            'Ready to discuss? The agent will answer any questions.',
            'მზად ხართ განხილვისთვის? კონსულტანტი პასუხს გასცემს ნებისმიერ კითხვას.',
          )}
        </p>
        {primaryHref ? (
          <a
            href={primaryHref}
            target={primaryHref.startsWith('http') ? '_blank' : undefined}
            rel={primaryHref.startsWith('http') ? 'noopener noreferrer' : undefined}
            className="visit-premium-btn-primary shrink-0 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm"
          >
            <Phone size={14} />
            {localize(language, 'Связаться', 'Contact', 'დაკავშირება')}
          </a>
        ) : null}
      </div>
    </div>
  )
}

function BrandingHeaderSection({
  id,
  agent,
  senderMode,
  companyLogo,
  showAgentCard,
  language,
  showSocial = true,
  showAvatar = true,
  showAbout = true,
}: {
  id: string
  agent: ReturnType<typeof parseUnitShareAgent>
  /** Отправитель: 'baza' — лого BAZA.sale, 'company' — лого агентства, 'none' — без логотипа. */
  senderMode: 'baza' | 'company' | 'none'
  companyLogo?: string
  showAgentCard: boolean
  language: SelectionLanguage
  showSocial?: boolean
  showAvatar?: boolean
  showAbout?: boolean
}) {
  const displayAgent = resolveAgentWithPlaceholders(agent, language)
  const waMessage = buildAgentCtaMessage('generic', '', language)
  const waHref = buildWhatsAppHref(displayAgent.whatsapp ?? displayAgent.phone, waMessage)
  const tgHref = buildTelegramHref(displayAgent.telegram)
  const phoneHref = buildPhoneHref(displayAgent.phone)
  const primaryHref = waHref || phoneHref || tgHref

  return (
    <section id={id} className="visit-premium-section visit-scroll-section scroll-mt-6 reveal-section">
      <SectionTitle>{visitBlockLabel(language, 'shareBranding')}</SectionTitle>
      <div className="visit-section-content">
        <div className="w-full">

          {/* Отправитель: BAZA.sale */}
          {senderMode === 'baza' && (
            <div className="flex flex-col items-start gap-3 px-2 py-4">
              <BazaSaleBrandLogo
                iconClassName="size-7 shrink-0 sm:size-8"
                labelClassName="visit-premium-brand-label text-[14px] font-semibold sm:text-[16px]"
                className="visit-branding-baza-lockup"
              />
              <p className="visit-premium-muted mt-1 max-w-xs text-left text-sm">
                {localize(language, 'Официальная платформа для покупки недвижимости', 'Official real estate platform', 'უძრავი ქონების ოფიციალური პლატფორმა')}
              </p>
            </div>
          )}

          {/* Отправитель: логотип агентства */}
          {senderMode === 'company' && companyLogo && (
            <div className="flex items-center px-2 py-4">
              <img src={companyLogo} alt="" className="max-h-12 w-auto object-contain" />
            </div>
          )}

          {/* Карточка риэлтора (свитчер «Контакт риэлтора») */}
          {showAgentCard && (
            <AgentCard
              agent={displayAgent}
              language={language}
              waHref={waHref}
              tgHref={tgHref}
              phoneHref={phoneHref}
              contactHref={primaryHref}
              showSocial={showSocial}
              showAvatar={showAvatar}
              showAbout={showAbout}
              className="px-5 py-6 sm:px-6 sm:py-7"
            />
          )}
        </div>
      </div>
    </section>
  )
}

function AgentCard({
  agent,
  language,
  contactHref,
  waHref,
  tgHref,
  phoneHref,
  showSocial = true,
  showAvatar = true,
  showAbout = true,
  className = '',
}: {
  agent: ResolvedShareAgent
  language: SelectionLanguage
  contactHref: string | null
  waHref: string | null
  tgHref: string | null
  phoneHref: string | null
  showSocial?: boolean
  showAvatar?: boolean
  showAbout?: boolean
  className?: string
}) {
  const mainContactHref = phoneHref || contactHref
  return (
    <div className={className}>
      <div className="flex items-center gap-4">
        {showAvatar && (
          <div
            className="agent-avatar-premium-wrap flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden sm:h-16 sm:w-16"
            style={agent.avatarUrl
              ? { border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.05)' }
              : { border: '2px solid var(--visit-accent)', background: 'color-mix(in srgb, var(--visit-accent) 12%, transparent)' }
            }
          >
            {agent.avatarUrl ? (
              <img src={agent.avatarUrl} alt={agent.name} className="h-full w-full object-cover" />
            ) : (
              <span className="select-none text-lg font-semibold text-[var(--visit-accent)] sm:text-xl">
                {agent.name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((w) => w[0]?.toUpperCase() ?? '')
                  .join('')}
              </span>
            )}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="visit-premium-title truncate text-base font-light tracking-tight sm:text-lg">
            {agent.name}
          </p>
          <p className="visit-premium-muted mt-0.5 text-xs sm:text-sm">
            {agent.role || localize(language, 'Личный консультант', 'Personal consultant', 'პერსონალური კონსულტანტი')}
            {agent.company ? ` · ${agent.company}` : ''}
          </p>
        </div>
      </div>

      {showAbout && agent.aboutMe && (
        <p className="visit-premium-muted mt-4 text-sm leading-relaxed sm:text-base">
          {agent.aboutMe}
        </p>
      )}

      {showAbout && agent.aboutCompany && (
        <div className="mt-4">
          <p className="visit-premium-title text-base">
            {localize(language, 'О компании', 'About the company', 'კომპანიის შესახებ')}
            {agent.company ? ` · ${agent.company}` : ''}
          </p>
          <p className="visit-premium-muted mt-1.5 text-base leading-relaxed">
            {agent.aboutCompany}
          </p>
        </div>
      )}

      {/* Контакты и кнопки */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {mainContactHref && (
          <a
            href={mainContactHref}
            className="visit-premium-btn-primary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
          >
            <Phone size={14} />
            {localize(language, 'Связаться', 'Contact', 'დაკავშირება')}
          </a>
        )}
        {showSocial && waHref && (
          <a
            href={waHref}
            className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition"
            style={{
              borderColor: '#25d366',
              background: '#25d366',
              color: '#fff',
            }}
          >
            <img src={whatsappIcon} alt="" aria-hidden className="size-[18px]" />
            WhatsApp
          </a>
        )}
        {showSocial && tgHref && (
          <a
            href={tgHref}
            className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition"
            style={{
              borderColor: '#229ed9',
              background: '#229ed9',
              color: '#fff',
            }}
          >
            <img src={telegramIcon} alt="" aria-hidden className="size-[18px]" />
            Telegram
          </a>
        )}
      </div>
    </div>
  )
}

function UnitSummarySection({
  id,
  language,
  fields,
}: {
  id: string
  language: SelectionLanguage
  fields: Array<{ label: string; value: string }>
}) {
  return (
    <section id={id} className="visit-premium-section visit-scroll-section scroll-mt-6 reveal-section">
      <SectionTitle>{visitBlockLabel(language, 'shareUnitCard')}</SectionTitle>
      <div className="visit-section-content">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {fields.map((field) => (
            <div key={field.label} className="visit-unit-plan-stat rounded-xl px-3 py-3 sm:px-4 sm:py-4 stagger-item">
              <p className="visit-unit-plan-stat-label text-[9px] uppercase tracking-[0.14em] sm:text-[10px]">
                {field.label}
              </p>
              <p className="visit-unit-plan-stat-value mt-1.5 text-sm font-light leading-snug sm:text-base">
                {field.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function PurchaseFlowSection({
  id,
  language,
  steps,
}: {
  id: string
  language: SelectionLanguage
  steps: string[]
}) {
  return (
    <section id={id} className="visit-premium-section visit-scroll-section scroll-mt-6 reveal-section">
      <SectionTitle>{visitBlockLabel(language, 'sharePurchaseFlow')}</SectionTitle>
      <div className="visit-section-content grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step, index) => (
          <div key={step} className="visit-unit-plan-stat rounded-xl px-4 py-4 sm:px-5 stagger-item">
            <p className="visit-unit-plan-stat-label text-[9px] uppercase tracking-[0.14em] sm:text-[10px]">
              {localize(language, `Шаг ${index + 1}`, `Step ${index + 1}`, `ნაბიჯი ${index + 1}`)}
            </p>
            <p className="visit-premium-title mt-2 text-sm font-light leading-relaxed sm:text-base">{step}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function FinalCtaSection({
  id,
  agent,
  language,
  unitTitle,
  similarSectionEnabled,
  unitStatus,
}: {
  id: string
  agent: ReturnType<typeof parseUnitShareAgent>
  language: SelectionLanguage
  unitTitle: string
  similarSectionEnabled: boolean
  unitStatus?: string
}) {
  const isSoldOrBooked = unitStatus === 'sold' || unitStatus === 'booked'
  const docsHref = buildPrimaryContactHref(agent, unitTitle, language, 'docs')
  const reserveHref = isSoldOrBooked ? null : buildPrimaryContactHref(agent, unitTitle, language, 'reserve')
  const similarHref = similarSectionEnabled ? `#${VISIT_SECTION.similar}` : null

  const ctaTitle = isSoldOrBooked
    ? localize(
        language,
        unitStatus === 'sold' ? 'Квартира продана — посмотрим похожие?' : 'Квартира забронирована — посмотрим похожие?',
        unitStatus === 'sold' ? 'This unit is sold — shall we find alternatives?' : 'This unit is reserved — shall we find alternatives?',
        unitStatus === 'sold' ? 'ბინა გაყიდულია — ვეძებოთ მსგავსი?' : 'ბინა დაჯავშნულია — ვეძებოთ მსგავსი?',
      )
    : localize(language, 'Следующий шаг после просмотра', 'Next step after viewing', 'შემდეგი ნაბიჯი ნახვის შემდეგ')

  const ctaSubtitle = isSoldOrBooked
    ? localize(
        language,
        'Риэлтор подберёт аналогичный вариант по бюджету, площади или проекту.',
        'The agent will find a similar option by budget, area, or project.',
        'რიელტორი შეარჩევს მსგავს ვარიანტს ბიუჯეტის, ფართობის ან პროექტის მიხედვით.',
      )
    : localize(
        language,
        'Можно запросить документы, получить похожие варианты или сразу обсудить бронирование с риэлтором.',
        'You can request documents, ask for similar options, or discuss reservation right away with the agent.',
        'შეგიძლიათ მოითხოვოთ დოკუმენტები, მიიღოთ მსგავსი ვარიანტები ან დაუყოვნებლივ განიხილოთ დაჯავშნა აგენტთან.',
      )

  return (
    <section id={id} className="visit-premium-section visit-scroll-section scroll-mt-6">
      <SectionTitle>{visitBlockLabel(language, 'shareFinalCta')}</SectionTitle>
      <div className="visit-section-content visit-premium-panel px-4 py-5 sm:px-7 sm:py-7">
        <p className="visit-premium-title text-xl font-light tracking-tight sm:text-2xl">
          {ctaTitle}
        </p>
        <p className="visit-premium-muted mt-3 text-base leading-relaxed sm:text-lg">
          {ctaSubtitle}
        </p>
        <div className={`mt-5 grid gap-2 ${isSoldOrBooked ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
          {!isSoldOrBooked && (
            docsHref ? (
              <a
                href={docsHref}
                target={docsHref.startsWith('http') ? '_blank' : undefined}
                rel={docsHref.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="visit-premium-btn-ghost inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm"
              >
                <FileText size={16} />
                {localize(language, 'Запросить документы', 'Request documents', 'დოკუმენტების მოთხოვნა')}
              </a>
            ) : (
              <span className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--visit-border-soft)] bg-[var(--visit-surface-alt,transparent)] px-4 py-3 text-sm text-[var(--visit-text-muted)] opacity-70">
                <FileText size={16} />
                {localize(language, 'Документы скоро подключим', 'Documents coming soon', 'დოკუმენტები მალე დაემატება')}
              </span>
            )
          )}
          {similarSectionEnabled && similarHref ? (
            <a
              href={similarHref}
              target={similarHref.startsWith('http') ? '_blank' : undefined}
              rel={similarHref.startsWith('http') ? 'noopener noreferrer' : undefined}
              className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm ${isSoldOrBooked ? 'visit-premium-btn-primary' : 'visit-premium-btn-ghost'}`}
            >
              <Building2 size={16} />
              {localize(language, 'Получить больше вариантов', 'Get more options', 'მეტი ვარიანტის მიღება')}
            </a>
          ) : null}
          {reserveHref ? (
            <a
              href={reserveHref}
              target={reserveHref.startsWith('http') ? '_blank' : undefined}
              rel={reserveHref.startsWith('http') ? 'noopener noreferrer' : undefined}
              className="visit-premium-btn-primary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm"
            >
              <Phone size={16} />
              {localize(language, 'Связаться', 'Contact', 'დაკავშირება')}
            </a>
          ) : !isSoldOrBooked ? (
            <span className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--visit-border-soft)] bg-[var(--visit-surface-alt,transparent)] px-4 py-3 text-sm text-[var(--visit-text-muted)] opacity-70">
              <Phone size={16} />
              {localize(language, 'Бронирование через риэлтора', 'Reservation via agent', 'დაჯავშნა აგენტის მეშვეობით')}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function SimilarUnitsSection({
  id,
  language,
  items,
  buildHref,
  formatPrice,
}: {
  id: string
  language: SelectionLanguage
  items: ReturnType<typeof resolveSimilarUnits>
  buildHref: (unitId: string) => string
  formatPrice: (value: number) => string
}) {
  if (items.length === 0) {
    return <VisitEmptySection label={visitBlockLabel(language, 'shareSimilarUnits')} message={localize(language, 'Похожие варианты пока не подготовлены.', 'Similar options are not available yet.', 'მსგავსი ვარიანტები ჯერ არ არის მომზადებული.')} />
  }

  return (
    <section id={id} className="visit-premium-section visit-scroll-section scroll-mt-6 reveal-section">
      <SectionTitle>{visitBlockLabel(language, 'shareSimilarUnits')}</SectionTitle>
      <div className="visit-section-content grid gap-3 lg:grid-cols-3">
        {items.map((item) => (
          <a
            key={item.unitId}
            href={buildHref(item.unitId)}
            className="visit-unit-plan-stat rounded-xl px-4 py-4 transition-transform hover:-translate-y-0.5 sm:px-5 stagger-item"
          >
            <p className="visit-unit-plan-stat-label text-[9px] uppercase tracking-[0.14em] sm:text-[10px]">
              {item.buildingName || t(language, 'block')}
            </p>
            <p className="visit-premium-title mt-2 text-base font-light sm:text-lg">
              {localize(language, `Лот ${item.number}`, `Lot ${item.number}`, `ლოტი ${item.number}`)}
            </p>
            <p className="visit-premium-muted mt-2 text-sm sm:text-base">
              {[item.rooms, item.area ? `${item.area} ${t(language, 'sqm')}` : null, item.floor ? `${item.floor} ${t(language, 'floor')}` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {item.price ? (
              <p className="visit-unit-plan-stat-value mt-3 text-sm sm:text-base">{formatPrice(item.price)}</p>
            ) : null}
          </a>
        ))}
      </div>
    </section>
  )
}

function createMapPinElement(): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'visit-map-pin'
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="28" height="42" aria-hidden="true">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24S24 21 24 12C24 5.373 18.627 0 12 0z"
      fill="#22c55e" stroke="#14532d" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="4.5" fill="#ffffff"/>
  </svg>`
  return el
}

/** [lng, lat] — из API `coordinates` / `locationCenter` или центроид полигона. */
function resolveComplexMapMarker(complex: PublicComplex): [number, number] | undefined {
  const point = complex.locationCenter ?? complex.coordinates
  if (point?.length === 2) return point

  if (complex.areaPolygon?.length) {
    const lng = complex.areaPolygon.reduce((sum, p) => sum + p[0], 0) / complex.areaPolygon.length
    const lat = complex.areaPolygon.reduce((sum, p) => sum + p[1], 0) / complex.areaPolygon.length
    return [lng, lat]
  }

  return undefined
}

function ProjectMap({
  id,
  title,
  location,
  areaPolygon,
  markerPosition,
  language,
  mapAccent,
  showMap = true,
}: {
  id: string
  title: string
  location?: string
  areaPolygon?: [number, number][]
  markerPosition?: [number, number]
  language: SelectionLanguage
  mapAccent: string
  showMap?: boolean
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return
    if (!markerPosition && (!areaPolygon || areaPolygon.length === 0)) return

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE_URL,
      center: markerPosition ?? areaPolygon![0],
      zoom: 13.5,
      interactive: false,
    })

    map.on('load', () => {
      if (areaPolygon && areaPolygon.length > 0) {
        map.addSource('project-area', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [[...areaPolygon, areaPolygon[0]]],
            },
          },
        })

        map.addLayer({
          id: 'project-area-fill',
          type: 'fill',
          source: 'project-area',
          paint: { 'fill-color': mapAccent, 'fill-opacity': 0.2 },
        })

        map.addLayer({
          id: 'project-area-outline',
          type: 'line',
          source: 'project-area',
          paint: { 'line-color': mapAccent, 'line-width': 2 },
        })

        const lons = areaPolygon.map((p) => p[0])
        const lats = areaPolygon.map((p) => p[1])
        map.fitBounds(
          [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ],
          { padding: 80, maxZoom: 13.5, animate: false },
        )
      } else if (markerPosition) {
        map.setCenter(markerPosition)
        map.setZoom(13.5)
      }

      if (markerPosition) {
        markerRef.current = new maplibregl.Marker({ element: createMapPinElement(), anchor: 'bottom' })
          .setLngLat(markerPosition)
          .addTo(map)
      }
    })

    mapRef.current = map

    return () => {
      markerRef.current?.remove()
      markerRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [areaPolygon, mapAccent, markerPosition])

  const hasMap = showMap && Boolean(
    markerPosition || (areaPolygon && areaPolygon.length > 0),
  )

  return (
    <section id={id} className="visit-premium-section visit-scroll-section scroll-mt-6 reveal-section">
      <SectionTitle>{title}</SectionTitle>
      {hasMap ? (
        <div className="visit-section-content visit-map-wrap overflow-hidden rounded-2xl border">
          <div ref={mapContainerRef} className="h-64 w-full sm:h-80" />
          {location ? <div className="visit-map-caption px-4 py-2 text-sm">{location}</div> : null}
        </div>
      ) : (
        <div className="visit-section-content visit-on-green visit-card rounded-xl border px-5 py-5 sm:px-6">
          {location ? (
            <p className="visit-text mb-2 flex items-center gap-2 text-base sm:text-lg">
              <MapPin size={16} className="shrink-0" />
              {location}
            </p>
          ) : null}
          {!showMap ? null : <p className="visit-dim text-base sm:text-lg">{t(language, 'mapCoordsMissing')}</p>}
        </div>
      )}
    </section>
  )
}

function ComplexPhotoGrid({
  id,
  files,
  alt,
  title,
  label,
}: {
  id?: string
  files: PublicCdnFileRef[]
  alt: string
  title?: string   // overlay badge inside photo
  label?: string   // section heading outside photo
  note?: string    // kept for API compat, ignored
}) {
    const { t } = useI18n();
  const [current, setCurrent] = useState(0)
  const [lightbox, setLightbox] = useState<number | null>(null)

  if (files.length === 0) return null

  const prev = () => setCurrent((i) => (i === 0 ? files.length - 1 : i - 1))
  const next = () => setCurrent((i) => (i === files.length - 1 ? 0 : i + 1))

  return (
    <section id={id} className="visit-premium-gallery visit-border-t visit-scroll-section scroll-mt-6 border-t reveal-section">
      <div className="visit-page-container visit-zone-padding">
        {(label ?? title) && (
          <h2 className="visit-premium-gallery-label visit-premium-section-label text-left text-sm font-normal uppercase tracking-[0.22em] sm:text-base">
            {label ?? title}
          </h2>
        )}
        <div className={(label ?? title) ? 'visit-section-content' : undefined}>
          {/* Карусель */}
          <div className="visit-image-carousel-card relative overflow-hidden rounded-2xl border">
            {/* Картинка */}
            <button
              type="button"
              className="group relative block aspect-[16/9] w-full overflow-hidden sm:aspect-[21/9] reveal-image-container"
              onClick={() => setLightbox(current)}
            >
              <img
                key={files[current].id}
                src={files[current].url}
                alt={`${alt} — ${current + 1}`}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                loading="eager"
              />
              {/* Градиент для оверлея */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />

              {/* Заголовок галереи поверх картинки — только десктоп */}
              {title && (
                <div className="pointer-events-none absolute left-4 top-4 hidden sm:block">
                  <span className="rounded-full border border-white/25 bg-black/35 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-white/90 backdrop-blur-sm">
                    {title}
                  </span>
                </div>
              )}

              {/* Счётчик */}
              <div className="pointer-events-none absolute bottom-3 right-4 rounded-full bg-black/45 px-2.5 py-1 text-[11px] text-white/80 backdrop-blur-sm">
                {current + 1} / {files.length}
              </div>
            </button>

            {/* Стрелки */}
            {files.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prev}
                  aria-label={t('public.clientUnitPage.предыдущее')}
                  className="visit-image-carousel-arrow visit-image-carousel-arrow-left"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  type="button"
                  onClick={next}
                  aria-label={t('public.clientUnitPage.следующее')}
                  className="visit-image-carousel-arrow visit-image-carousel-arrow-right"
                >
                  <ChevronRight size={20} />
                </button>
              </>
            )}

            {/* Точки */}
            {files.length > 1 && files.length <= 12 && (
              <div className="visit-image-carousel-dots">
                {files.map((f, i) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-label={`Фото ${i + 1}`}
                    onClick={() => setCurrent(i)}
                    className={`visit-image-carousel-dot ${i === current ? 'is-active' : ''}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Миниатюры — первые 5 под каруселью */}
          {files.length > 1 && (
            <div className="mt-2 grid grid-cols-5 gap-1.5 sm:gap-2">
              {files.slice(0, 5).map((file, i) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => setCurrent(i)}
                  className={`relative overflow-hidden rounded-lg border aspect-[4/3] transition-all ${
                    i === current
                      ? 'border-[var(--visit-accent)] ring-1 ring-[var(--visit-accent)]'
                      : 'border-[rgba(255,255,255,0.08)] opacity-60 hover:opacity-90'
                  }`}
                >
                  <img
                    src={file.url}
                    alt={`${alt} ${i + 1}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  {files.length > 5 && i === 4 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-medium text-white">
                      +{files.length - 5}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Лайтбокс */}
      {lightbox !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal
        >
          <button
            type="button"
            className="absolute left-4 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white"
            onClick={(e) => { e.stopPropagation(); setLightbox((i) => (i === null || i === 0 ? files.length - 1 : i - 1)) }}
            aria-label={t('public.clientUnitPage.предыдущее')}
          >
            <ChevronLeft size={22} />
          </button>
          <img
            src={files[lightbox].url}
            alt={alt}
            className="max-h-[90vh] max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="absolute right-4 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white"
            onClick={(e) => { e.stopPropagation(); setLightbox((i) => (i === null || i === files.length - 1 ? 0 : i + 1)) }}
            aria-label={t('public.clientUnitPage.следующее')}
          >
            <ChevronRight size={22} />
          </button>
          <p className="absolute bottom-6 text-base text-white/70">{lightbox + 1} / {files.length}</p>
        </div>
      )}
    </section>
  )
}

export function ClientUnitPage() {
  usePublicPageScroll()

  const { unitId } = useParams<{ unitId: string }>()
  const routerLocation = useLocation()
  const [searchParams] = useSearchParams()
  const storeUnits = useCoreStore((s) => s.allUnits)
  const storeBuildings = useCoreStore((s) => s.buildings)
  const storeProjects = useCoreStore((s) => s.projects)
  const shareSearch = useMemo(
    () => getUnitShareSearchQuery(searchParams, routerLocation.hash),
    [searchParams, routerLocation.hash],
  )

  // Серверная share-ссылка (`?share=<token>`): конфигурация и отправитель с бэка.
  // Явные URL-параметры имеют приоритет над токеном (см. docs/lot-landing-*).
  const shareToken = useMemo(
    () => new URLSearchParams(shareSearch).get('share'),
    [shareSearch],
  )
  const [shareLinkState, setShareLinkState] = useState<{ token: string; link: UnitShareLinkDto | null } | null>(null)
  const shareLink = shareToken && shareLinkState?.token === shareToken ? shareLinkState.link : null
  useEffect(() => {
    if (!shareToken) return
    let cancelled = false
    developmentApi
      .getUnitShareLink(shareToken)
      .then((link) => {
        if (!cancelled) setShareLinkState({ token: shareToken, link: link ?? null })
      })
      .catch(() => {
        /* неизвестный/отозванный токен — страница рендерится с дефолтами */
      })
    void developmentApi.registerUnitShareLinkView(shareToken).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [shareToken])

  const agent = useMemo(
    () => parseUnitShareAgent(shareSearch) ?? shareLinkSenderToAgent(shareLink?.sender),
    [shareSearch, shareLink],
  )
  const customization = useMemo(
    () =>
      parseUnitShareCustomization(shareSearch) ??
      shareLinkCustomizationToCustomization(shareLink?.customization) ??
      resolveUnitShareCustomization(undefined),
    [shareSearch, shareLink],
  )
  const { language, currency, blocks } = customization
  const theme = resolveUnitVisitTheme(customization.theme)
  const mapAccent = theme === 'baza' ? '#178b00' : '#c9a84c'
  const formatPrice = (value: number) => formatMoney(value, currency, language)

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])



  useLayoutEffect(() => applyUnitVisitPageChrome(theme), [theme])

  const [data, setData] = useState<PublicUnitLanding | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const storeUnit = useMemo(
    () => storeUnits.find((unit) => unit._id === (data?.unit.id ?? unitId)),
    [data?.unit.id, storeUnits, unitId],
  )
  useEffect(() => {
    if (!unitId) {
      setError('invalid-link')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    loadPublicUnitLanding(unitId, {
      allUnits: storeUnits,
      buildings: storeBuildings,
      projects: storeProjects,
    })
      .then(({ data: landing, error: loadError }) => {
        if (cancelled) return
        if (landing) {
          setData(landing)
          return
        }
        setError(loadError ?? 'not-found')
      })
      .catch(() => {
        if (!cancelled) setError('load-failed')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [unitId, storeUnits, storeBuildings, storeProjects])

  useEffect(() => {
    if (loading || error || !data) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal-active')
            observer.unobserve(entry.target)
          }
        })
      },
      {
        threshold: 0.05,
        rootMargin: '0px 0px -40px 0px',
      }
    )

    const elements = document.querySelectorAll('.reveal-section')
    elements.forEach((el) => observer.observe(el))

    // Handle immediate load or event-based fade-in of images
    const handleImageLoad = (img: Element) => {
      img.classList.add('reveal-loaded')
    }

    const images = document.querySelectorAll('.reveal-image')
    images.forEach((img) => {
      if ((img as HTMLImageElement).complete) {
        handleImageLoad(img)
      } else {
        img.addEventListener('load', () => handleImageLoad(img))
      }
    })

    return () => {
      observer.disconnect()
      images.forEach((img) => {
        img.removeEventListener('load', () => handleImageLoad(img))
      })
    }
  }, [loading, error, data])

  const projectId = data?.complex?.id
  const [selectedFinishType, setSelectedFinishType] = useState<FinishType | null>(null)
  const finishPrices = useMemo(() => {
    if (!data) return undefined
    return (
      normalizeFinishPrices(data.unit.finishPrices) ??
      normalizeFinishPrices(data.unit.details?.finishPrices) ??
      normalizeFinishPrices(storeUnit?.finishPrices) ??
      readPersistedUnitFinishPrices(data.unit.id)
    )
  }, [data, storeUnit?.finishPrices])
  // Кондиции «Ремонт» оффера = отделка ЖК + цены с лота (тот же источник, что в карточке лота).
  const finishOptions = useMemo(
    () =>
      data
        ? resolveFinishDisplayOptions(
            data.complex.finishTypes as FinishType[] | undefined,
            { ...data.unit, finishPrices },
          )
        : [],
    [data, finishPrices],
  )
  const defaultFinishType =
    finishOptions.find((option) => option.isBase)?.finishType ?? finishOptions[0]?.finishType ?? null
  const effectiveFinishType =
    selectedFinishType && finishOptions.some((option) => option.finishType === selectedFinishType)
      ? selectedFinishType
      : defaultFinishType
  const selectedFinishOption =
    finishOptions.find((option) => option.finishType === effectiveFinishType) ?? null

  const selectedPricePerSqm = selectedFinishOption?.pricePerSqm
  const selectedPrice =
    selectedPricePerSqm != null && typeof data?.unit.area === 'number' && data.unit.area > 0
      ? Math.round(selectedPricePerSqm * data.unit.area)
      : undefined
  const [installmentStorageTick, setInstallmentStorageTick] = useState(0)

  useEffect(() => {
    if (!projectId) return
    const key = installmentsKey(projectId)
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setInstallmentStorageTick((tick) => tick + 1)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [projectId])

  const installmentRows = useMemo(() => {
    if (!data) return []
    const listPrice = resolveUnitModalListPrice({
      price: selectedPrice,
      pricePerSqm: selectedPricePerSqm,
      area: data.unit.area,
    })
    return resolveProjectInstallmentRows({
      projectId: data.complex?.id,
      projectPlans: data.complex?.installmentPlans,
      projectTerms: data.complex?.installmentTerms,
      unitId: data.unit.id,
      listPrice,
    })
  }, [data, selectedPrice, selectedPricePerSqm, installmentStorageTick])

  const installmentListPrice = useMemo(() => {
    if (!data) return 100_000
    const { unit } = data
    return resolveUnitModalListPrice({
      price: selectedPrice,
      pricePerSqm: selectedPricePerSqm,
      area: unit.area,
    })
  }, [data, installmentStorageTick, selectedPrice, selectedPricePerSqm])

  if (loading) {
    return (
      <VisitShell theme={theme} className="visit-surface-light flex items-center justify-center">
        <p className="visit-muted text-base">{t(language, 'loading')}</p>
      </VisitShell>
    )
  }

  if (error || !data) {
    return (
      <VisitShell theme={theme} className="visit-surface-light flex flex-col items-center justify-center px-4 text-center">
        <Building2 size={48} className="visit-icon-dim mb-4" />
        <h1 className="visit-text text-2xl font-normal">{t(language, 'unitNotFoundTitle')}</h1>
        <p className="visit-subtle mt-2 text-base">
          {error === 'load-failed' ? t(language, 'loadFailed') : t(language, 'unitNotFoundSub')}
        </p>
      </VisitShell>
    )
  }

  const { unit, building, complex } = data
  const details = unit.details
  const planUrl = unit.image?.url ?? null
  const floorPlanUrl = unit.floorPlanImage?.url ?? unit.floorPlanUrl ?? null
  const projectGalleryFiles = collectProjectGalleryImages(complex)
  const constructionFiles = collectConstructionImages(complex)
  // Значения опций — канонические слаги; для русской визитки показываем русскую
  // подпись, для остальных языков — канонический вариант (как в VisitUnitPlans).
  const optLabel = (group: OptionGroup, value: string) =>
    language === 'ru' ? optionLabelRu(group, value) : value
  const infraLabel = (value: string) => {
    if (language !== 'ru') return value
    for (const group of ['infraInternal', 'infraExternal', 'infraLocation'] as const) {
      const label = optionLabelRu(group, value)
      if (label !== value) return label
    }
    return value
  }
  const amenities = [
    ...(complex.amenities ?? []),
    ...(complex.infrastructureInternal ?? []),
    ...(complex.infrastructureExternal ?? []),
    ...(complex.infrastructureLocation ?? []),
  ].map(infraLabel)
  const location = [complex.city, complex.country].filter(Boolean).join(', ')
  const mapMarkerPosition = resolveComplexMapMarker(complex)
  const mapLocation = complex.address || location
  const statusLabel = unitStatusLabel(language, unit.status)
  const pricePerSqm = selectedPricePerSqm
  // Выбранная кондиция без цены → «цена по запросу» (не подставляем базовую цену).
  const priceOnRequest = effectiveFinishType != null && selectedPricePerSqm == null
  const displayPrice = priceOnRequest ? undefined : selectedPrice ?? unit.price
  const installmentPricePerSqmLabel =
    pricePerSqm != null ? `${formatPrice(pricePerSqm)}/${t(language, 'sqm')}` : null
  const allPaymentTypes = (complex.paymentTypes ?? []).filter(Boolean)
  const paymentTypes = allPaymentTypes.filter((pt) => {
    if (/рассрочк|installment|განვადება/i.test(pt)) return blocks.shareInstallment
    if (/полн|full|სრულ/i.test(pt)) return blocks.shareFullPayment
    return true
  })
  const ceilingHeight = resolveUnitCeilingHeight({
    customCeiling: storeUnit?.customFields?.['Потолки'],
    projectCeiling: complex.ceilingHeight,
  })
  const rawConditionLabel = resolveUnitConditionLabel({
    customFinish: effectiveFinishType ?? storeUnit?.customFields?.Отделка,
  })
  const conditionLabel = rawConditionLabel ? optLabel('finishTypes', rawConditionLabel) : rawConditionLabel
  const storeProject = storeProjects.find((project) => project._id === complex.id)
  const classType = complex.classType ?? storeProject?.classType
  const viewFromWindow = details?.viewType?.trim() || storeUnit?.viewType?.trim() || undefined
  const lotTitle = details?.title?.trim() || `${t(language, 'aptNumber')} ${unit.number}`
  const developerInfo = resolveVisitDeveloperInfo(complex, language)
  const projectInfo = resolveProjectInfoContent(data, language)
  const districtInfo = resolveDistrictContent(data, language)
  const countryInfo = resolveCountryInfoContent(data, language)
  const legalInfo = resolveLegalInfoContent(data, language)
  const documentUrls = (complex.documents ?? []).filter(Boolean)
  const legalFooter = documentUrls.length > 0 ? (
    <div className="flex flex-col gap-2">
      {documentUrls.map((url, i) => {
        let label = url
        try {
          label = decodeURIComponent(url.split('/').pop() || url)
        } catch {
          label = url.split('/').pop() || url
        }
        return (
          <a
            key={`${i}-${url}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="visit-unit-plan-stat-value inline-flex items-center gap-2 text-base hover:underline"
          >
            {label}
          </a>
        )
      })}
    </div>
  ) : undefined
  const investmentInfo = resolveInvestmentContent(data, language)
  const rentalInfo = resolveRentalContent(data, language)
  const purchaseSteps = resolvePurchaseFlowContent(language)
  // Похожие лоты: приоритет — серверный список из лендинга (работает и для
  // анонимных посетителей); стор — фолбэк для старого бэка без similarUnits.
  const apiSimilarUnits: SimilarUnitCard[] = (data?.similarUnits ?? []).map((u) => ({
    unitId: u.id,
    number: String(u.aptNum ?? ''),
    rooms: u.rooms ?? '',
    area: u.area,
    floor: u.floor,
    price: u.price,
    buildingName: undefined,
  }))
  const similarUnits =
    apiSimilarUnits.length > 0
      ? apiSimilarUnits.slice(0, 3)
      : resolveSimilarUnits(unit.id, unit, storeUnits, storeBuildings)
  const projectCoverUrl = complex.coverUrl ?? complex.cover?.url ?? projectGalleryFiles[0]?.url ?? null
  const heroBackgroundImage = resolvePremiumHeroImage({
    coverUrl: projectCoverUrl,
    catalogImages: complex.images,
  })
  const isGeorgia =
    (complex.country ?? '').toLowerCase().includes('georgia') ||
    (complex.country ?? '').toLowerCase().includes('грузи') ||
    (complex.country ?? '').toLowerCase().includes('საქართველო')
  const isBatumi =
    (complex.city ?? '').toLowerCase().includes('batumi') ||
    (complex.city ?? '').toLowerCase().includes('батуми') ||
    (complex.city ?? '').toLowerCase().includes('ბათუმ')
  const isTbilisi =
    (complex.city ?? '').toLowerCase().includes('tbilisi') ||
    (complex.city ?? '').toLowerCase().includes('тбилиси') ||
    (complex.city ?? '').toLowerCase().includes('თბილის')
  const citySourceUrls = (complex.cityGallery ?? []).map((f: PublicCdnFileRef) => f.url).filter(Boolean)
  const cityGalleryFiles = galleryFilesFromUrls(
    citySourceUrls.length > 0
      ? citySourceUrls.slice(0, 6)
      : isBatumi
        ? FALLBACK_CITY_BATUMI
        : isTbilisi
          ? FALLBACK_CITY_TBILISI
          : FALLBACK_CITY_GENERIC,
    'city',
  )

  const districtSourceUrls = (complex.districtGallery ?? []).map((f: PublicCdnFileRef) => f.url).filter(Boolean)
  const districtGalleryFiles = galleryFilesFromUrls(
    districtSourceUrls.length > 0
      ? districtSourceUrls.slice(0, 6)
      : isBatumi
        ? FALLBACK_DISTRICT_BATUMI
        : FALLBACK_DISTRICT_GENERIC,
    'district',
  )
  const countrySourceUrls = (complex.countryGallery ?? []).map((f: PublicCdnFileRef) => f.url).filter(Boolean)
  const countryGalleryFiles = galleryFilesFromUrls(
    countrySourceUrls.length > 0
      ? countrySourceUrls.slice(0, 6)
      : isGeorgia
        ? FALLBACK_COUNTRY_GEORGIA
        : [],
    'country',
  )
  const actualDate = formatVisitActualDate(language)
  const unitSummaryFields = [
    { label: localize(language, 'Лот / ID', 'Lot / ID', 'ლოტი / ID'), value: details?.identifier || String(unit.number) },
    { label: localize(language, 'Тип объекта', 'Property type', 'ობიექტის ტიპი'), value: t(language, 'primary') },
    { label: localize(language, 'Цена', 'Price', 'ფასი'), value: displayPrice != null ? formatPrice(displayPrice) : t(language, 'priceOnRequest') },
    { label: localize(language, 'Цена за м²', 'Price per m²', 'ფასი მ²-ზე'), value: pricePerSqm ? formatPrice(pricePerSqm) : t(language, 'priceOnRequest') },
    { label: t(language, 'area'), value: `${unit.area} ${t(language, 'sqm')}` },
    { label: t(language, 'floorLabel'), value: String(unit.floor) },
    { label: localize(language, 'Комнатность', 'Rooms', 'ოთახები'), value: formatRooms(language, unit.rooms, unit.roomsStr) },
    { label: localize(language, 'Вид', 'View', 'ხედი'), value: viewFromWindow ? optLabel('views', viewFromWindow) : localize(language, 'По проекту', 'Per project', 'პროექტის მიხედვით') },
    { label: localize(language, 'Ремонт', 'Finish', 'რემონტი'), value: conditionLabel || localize(language, 'Уточняется', 'To be confirmed', 'დაზუსტდება') },
    { label: localize(language, 'Статус доступности', 'Availability', 'ხელმისაწვდომობა'), value: statusLabel },
    { label: localize(language, 'Цена и статус актуальны на', 'Price and status updated on', 'ფასი და სტატუსი აქტუალურია'), value: actualDate },
    { label: localize(language, 'Корпус', 'Building', 'კორპუსი'), value: building.name },
  ]
  const contactActions = buildContactActions(agent, lotTitle, language)
  const heroPrimaryHref = buildPhoneHref(resolveAgentWithPlaceholders(agent, language).phone)

  // «Отправитель BAZA.sale»: вкл → лого BAZA; выкл → лого агентства (если есть), иначе ничего.
  const senderMode: 'baza' | 'company' | 'none' = blocks.shareBazaBranding
    ? 'baza'
    : agent?.companyLogo
      ? 'company'
      : 'none'
  const showBrandingSection = blocks.shareBranding || senderMode !== 'none'
  const firstContentSectionId = showBrandingSection
    ? VISIT_SECTION.branding
    : blocks.shareUnitCard
      ? VISIT_SECTION.unitCard
      : blocks.shareUnitFinance
        ? VISIT_SECTION.unitFinance
        : blocks.shareProjectInfo
          ? VISIT_SECTION.projectInfo
          : undefined
  const firstContentSectionLabel = firstContentSectionId === VISIT_SECTION.branding
    ? blocks.shareBranding
      ? visitBlockLabel(language, 'shareBranding')
      : localize(language, 'Отправитель BAZA.sale', 'Sent via BAZA.sale', 'BAZA.sale')
    : firstContentSectionId === VISIT_SECTION.unitCard
      ? visitBlockLabel(language, 'shareUnitCard')
      : firstContentSectionId === VISIT_SECTION.unitFinance
        ? visitBlockLabel(language, 'shareUnitFinance')
        : firstContentSectionId === VISIT_SECTION.projectInfo
          ? visitBlockLabel(language, 'shareProjectInfo')
          : undefined

  const buildSimilarHref = (nextUnitId: string) => buildUnitShareUrl(nextUnitId, agent ?? undefined, customization)

  return (
    <VisitShell theme={theme}>
      {blocks.shareHero && (
        <VisitPremiumHero
          id={VISIT_SECTION.hero}
          backgroundImage={heroBackgroundImage}
          agent={agent}
          showAgent={false}
          showBrand
          showPrice={blocks.shareObjectInfo}
          showStatus={blocks.shareObjectInfo}
          complexName={complex.name}
          location={location || complex.address || t(language, 'locationUnknown')}
          classType={classType}
          unitNumber={unit.number}
          lotTitle={lotTitle}
          scrollToSectionId={firstContentSectionId}
          scrollCueLabel={firstContentSectionLabel}
          primaryActionHref={heroPrimaryHref ?? undefined}
          primaryActionLabel={heroPrimaryHref ? t(language, 'connect') : undefined}
          price={blocks.shareObjectInfo ? displayPrice : undefined}
          pricePerSqm={blocks.shareObjectInfo ? pricePerSqm : undefined}
          statusLabel={blocks.shareObjectInfo ? statusLabel : undefined}
          statusKey={blocks.shareObjectInfo ? unit.status : undefined}
          promo={blocks.shareObjectInfo ? details?.promo : undefined}
          formatPrice={formatPrice}
          language={language}
          projectIntro={blocks.shareObjectInfo ? (projectInfo.intro || undefined) : undefined}
        />
      )}

      <div className="visit-premium-body">
        <div className="visit-page-container visit-premium-stack">
          {showBrandingSection && (
            <BrandingHeaderSection
              id={VISIT_SECTION.branding}
              agent={agent}
              senderMode={senderMode}
              companyLogo={agent?.companyLogo}
              showAgentCard={blocks.shareBranding}
              language={language}
              showSocial={blocks.shareStickyContacts}
              showAvatar={blocks.shareRealtorAvatar}
              showAbout={blocks.shareRealtorInfo}
            />
          )}

          {blocks.shareUnitCard && (
            <UnitSummarySection id={VISIT_SECTION.unitCard} language={language} fields={unitSummaryFields} />
          )}

          {blocks.shareUnitPlan && (
            <VisitUnitPlans
              id={VISIT_SECTION.unitPlan}
              title={visitBlockLabel(language, 'shareUnitPlan')}
              planUrl={planUrl}
              floorPlanUrl={floorPlanUrl}
              unitNumber={unit.number}
              floor={unit.floor}
              buildingName={building.name}
              roomsLabel={formatRooms(language, unit.rooms, unit.roomsStr)}
              area={unit.area}
              floorLabel={String(unit.floor)}
              viewFromWindow={viewFromWindow}
              ceilingHeight={ceilingHeight}
              condition={conditionLabel}
              finishOptions={finishOptions}
              selectedFinishType={effectiveFinishType}
              onFinishTypeChange={setSelectedFinishType}
              language={language}
              showPlans
              showStats={false}
              showOverview={false}
            />
          )}

          {blocks.shareUnitFinance && (
            <section id={VISIT_SECTION.unitFinance} className="visit-scroll-section scroll-mt-6">
              <VisitPaymentSection
                id={`${VISIT_SECTION.unitFinance}-section`}
                title={visitBlockLabel(language, 'shareUnitFinance')}
                paymentTypes={paymentTypes}
                installmentRows={blocks.shareInstallment ? installmentRows : []}
                listPrice={installmentListPrice}
                pricePerSqm={pricePerSqm}
                pricePerSqmLabel={installmentPricePerSqmLabel}
                formatAmount={(value) => formatPrice(Math.round(value))}
                language={language}
              />
            </section>
          )}

          {blocks.shareUnitFinance && blocks.shareStickyContacts && contactActions.length > 0 && (
            <PurchaseStepsRibbon agent={agent} language={language} unitTitle={lotTitle} />
          )}

          {blocks.shareProjectInfo && (
            <InfoPanelSection
              id={VISIT_SECTION.projectInfo}
              label={visitBlockLabel(language, 'shareProjectInfo')}
              intro={projectInfo.intro}
              bullets={projectInfo.bullets}
            />
          )}

          {blocks.shareProjectGallery && (
            projectGalleryFiles.length > 0 ? (
              <ComplexPhotoGrid
                id={VISIT_SECTION.projectGallery}
                files={projectGalleryFiles}
                alt={complex.name}
                title={visitBlockLabel(language, 'shareProjectGallery')}
              />
            ) : (
              <VisitEmptySection label={visitBlockLabel(language, 'shareProjectGallery')} message={t(language, 'galleryEmpty')} />
            )
          )}

          {blocks.shareProjectGallery && constructionFiles.length > 0 && (
            <ComplexPhotoGrid
              id={`${VISIT_SECTION.projectGallery}-construction`}
              files={constructionFiles}
              alt={complex.name}
              title={localize(language, 'Ход строительства', 'Construction progress', 'მშენებლობის მიმდინარეობა')}
            />
          )}

          {blocks.shareProjectInfrastructure && (
            amenities.length > 0 ? (
              <VisitAmenitiesSection
                id={VISIT_SECTION.projectInfrastructure}
                title={visitBlockLabel(language, 'shareProjectInfrastructure')}
                items={amenities}
                language={language}
              />
            ) : (
              <VisitEmptySection label={visitBlockLabel(language, 'shareProjectInfrastructure')} message={t(language, 'amenitiesEmpty')} />
            )
          )}

          {blocks.shareProjectLocation && (
            <ProjectMap
              id={VISIT_SECTION.projectLocation}
              title={visitBlockLabel(language, 'shareProjectLocation')}
              location={mapLocation}
              areaPolygon={complex.areaPolygon}
              markerPosition={mapMarkerPosition}
              language={language}
              mapAccent={mapAccent}
              showMap={blocks.shareProjectMap}
            />
          )}

          {blocks.shareDistrict && blocks.shareDistrictInfo && (
            <InfoPanelSection
              id={VISIT_SECTION.districtInfo}
              label={visitBlockLabel(language, 'shareDistrictInfo')}
              intro={districtInfo.intro}
              bullets={districtInfo.bullets}
            />
          )}

          {blocks.shareDistrict && blocks.shareDistrictGallery && (
            <ComplexPhotoGrid
              id={VISIT_SECTION.districtGallery}
              files={districtGalleryFiles}
              alt={complex.name}
              label={visitBlockLabel(language, 'shareDistrictGallery')}
              title={complex.district || complex.districtArea || undefined}
            />
          )}

          {blocks.shareDeveloperInfo &&
            developerInfo &&
            (developerInfo.name || developerInfo.description || developerInfo.website) && (
            <VisitDeveloperSection
              id={VISIT_SECTION.developer}
              title={visitBlockLabel(language, 'shareDeveloperInfo')}
              developer={developerInfo}
              language={language}
              showLogo={blocks.shareDeveloperLogo}
              showCompanyName={blocks.shareDeveloperCompanyName}
            />
          )}

          {blocks.sharePurchaseFlow && (
            <PurchaseFlowSection id={VISIT_SECTION.purchase} language={language} steps={purchaseSteps} />
          )}

          {blocks.shareLegalInfo && (
            <InfoPanelSection
              id={VISIT_SECTION.legal}
              label={visitBlockLabel(language, 'shareLegalInfo')}
              intro={legalInfo.intro}
              bullets={legalInfo.bullets}
              note={legalInfo.note}
              footer={legalFooter}
            />
          )}

          {blocks.shareInvestmentPotential && (
            <InfoPanelSection
              id={VISIT_SECTION.investment}
              label={visitBlockLabel(language, 'shareInvestmentPotential')}
              intro={investmentInfo.intro}
              bullets={investmentInfo.bullets}
              note={investmentInfo.note}
            />
          )}

          {blocks.shareRentalPotential && (
            <InfoPanelSection
              id={VISIT_SECTION.rental}
              label={visitBlockLabel(language, 'shareRentalPotential')}
              intro={rentalInfo.intro}
              bullets={rentalInfo.bullets}
              note={rentalInfo.note}
            />
          )}

          {blocks.shareSimilarUnits && (
            <SimilarUnitsSection
              id={VISIT_SECTION.similar}
              language={language}
              items={similarUnits}
              buildHref={buildSimilarHref}
              formatPrice={formatPrice}
            />
          )}

          {blocks.shareCity && blocks.shareCityInfo && (
            <InfoPanelSection
              id={VISIT_SECTION.cityInfo}
              label={visitBlockLabel(language, 'shareCityInfo')}
              intro=""
              bullets={[
                ...(complex.infrastructureLocation ?? []).slice(0, 3).map((v) => optLabel('infraLocation', v)),
                ...(complex.infrastructureExternal ?? []).slice(0, 2).map((v) => optLabel('infraExternal', v)),
                complex.coastline
                  ? localize(language, `Локационный ориентир: ${optLabel('coastline', complex.coastline)}`, `Location cue: ${optLabel('coastline', complex.coastline)}`, `ლოკაციის ორიენტირი: ${optLabel('coastline', complex.coastline)}`)
                  : localize(language, 'Транспорт, сервисы и ежедневная инфраструктура уточняются по проекту.', 'Transport links, services, and daily infrastructure are clarified per project.', 'ტრანსპორტი, სერვისები და ყოველდღიური ინფრასტრუქტურა პროექტის მიხედვით ზუსტდება.'),
              ]}
            />
          )}

          {blocks.shareCity && blocks.shareCityGallery && (
            <ComplexPhotoGrid
              id={VISIT_SECTION.cityGallery}
              files={cityGalleryFiles}
              alt={complex.city || complex.name}
              label={visitBlockLabel(language, 'shareCityGallery')}
              title={complex.city || undefined}
            />
          )}

          {blocks.shareCountry && blocks.shareCountryInfo && (
            <InfoPanelSection
              id={VISIT_SECTION.countryInfo}
              label={visitBlockLabel(language, 'shareCountryInfo')}
              intro={countryInfo.intro}
              bullets={countryInfo.bullets}
              note={countryInfo.note}
            />
          )}

          {blocks.shareCountry && blocks.shareCountryGallery && countryGalleryFiles.length > 0 && (
            <ComplexPhotoGrid
              id={VISIT_SECTION.countryGallery}
              files={countryGalleryFiles}
              alt={complex.country || complex.name}
              label={visitBlockLabel(language, 'shareCountryGallery')}
              title={
                isGeorgia
                  ? localize(language, 'Грузия', 'Georgia', 'საქართველო')
                  : complex.country || undefined
              }
            />
          )}
        </div>
      </div>

      {blocks.shareFinalCta && (
      <div className="visit-premium-body pt-0">
        <div className="visit-page-container visit-premium-stack">
          <FinalCtaSection
            id={VISIT_SECTION.finalCta}
            agent={agent}
            language={language}
            unitTitle={lotTitle}
            similarSectionEnabled={blocks.shareSimilarUnits}
            unitStatus={unit.status}
          />
        </div>
      </div>
      )}

      {blocks.shareStickyContacts && (
        <div className="visit-surface-light visit-sticky-bar sticky bottom-0 z-30 border-t px-4 pt-3 backdrop-blur-md lg:hidden">
          <div className="grid grid-cols-2 gap-2">
            {heroPrimaryHref ? (
              <a
                href={heroPrimaryHref}
                target={heroPrimaryHref.startsWith('http') ? '_blank' : undefined}
                rel={heroPrimaryHref.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="visit-btn-primary flex items-center justify-center gap-2 rounded-xl py-3.5 text-base font-medium"
              >
                <Phone size={18} />
                {t(language, 'connect')}
              </a>
            ) : (
              <span className="visit-btn-primary flex items-center justify-center gap-2 rounded-xl py-3.5 text-base font-medium opacity-70">
                <Phone size={18} />
                {localize(language, 'Контакт скоро появится', 'Contact soon', 'კონტაქტი მალე დაემატება')}
              </span>
            )}
            {agent?.telegram ? (
              <a
                href={buildTelegramHref(agent.telegram) ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="visit-premium-btn-ghost flex items-center justify-center gap-2 rounded-xl border py-3.5 text-base font-medium"
              >
                <TelegramIcon size={18} />
                {t(language, 'telegram')}
              </a>
            ) : agent?.whatsapp ? (
              <a
                href={buildWhatsAppHref(agent.whatsapp, buildAgentCtaMessage('generic', lotTitle, language)) ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="visit-premium-btn-ghost flex items-center justify-center gap-2 rounded-xl border py-3.5 text-base font-medium"
              >
                <WhatsAppIcon size={18} />
                {t(language, 'whatsapp')}
              </a>
            ) : (
              <span className="visit-premium-btn-ghost flex items-center justify-center gap-2 rounded-xl border py-3.5 text-base font-medium opacity-70">
                <TelegramIcon size={18} />
                {localize(language, 'Контакты уточняются', 'Details pending', 'კონტაქტი ზუსტდება')}
              </span>
            )}
          </div>
        </div>
      )}

      <footer className="visit-premium-footer py-8 text-center text-sm">
        {complex.name} · {unit.number}
      </footer>
    </VisitShell>
  )
}
