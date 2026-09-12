import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import type { Translate } from '../i18n'

interface FooterLink {
  key: string
  labelKey: string
  to: string
  badge?: string
}

interface FooterGroup {
  key: string
  titleKey: string
  links: FooterLink[]
}

/** Верхний ярус `footer 1` (`3067:73659`): пять разделов каталога. */
const CATALOGUE_GROUPS: FooterGroup[] = [
  {
    key: 'newConstructions',
    titleKey: 'footer.newConstructions.title',
    links: [
      { key: 'complexes', labelKey: 'footer.newConstructions.complexes', to: '/newconstructions' },
      { key: 'villas', labelKey: 'footer.newConstructions.villas', to: '/?type=villas' },
      { key: 'townhouses', labelKey: 'footer.newConstructions.townhouses', to: '/?type=townhouses' },
      { key: 'discounts', labelKey: 'footer.newConstructions.discounts', to: '/?promo=discounts' },
    ],
  },
  {
    key: 'secondary',
    titleKey: 'footer.secondary.title',
    links: [
      { key: 'flats', labelKey: 'footer.secondary.flats', to: '/secondary' },
      { key: 'houses', labelKey: 'footer.secondary.houses', to: '/secondary?propertyType=house' },
      { key: 'land', labelKey: 'footer.secondary.land', to: '/secondary?propertyType=land' },
      { key: 'urgent', labelKey: 'footer.secondary.urgent', to: '/secondary?urgent=true' },
    ],
  },
  {
    key: 'projects',
    titleKey: 'footer.projects.title',
    links: [
      { key: 'planning', labelKey: 'footer.projects.planning', to: '/newconstructions' },
      { key: 'construction', labelKey: 'footer.projects.construction', to: '/newconstructions?stage=construction' },
      { key: 'ready', labelKey: 'footer.projects.ready', to: '/newconstructions?stage=ready', badge: 'footer.badgeNew' },
      { key: 'interesting', labelKey: 'footer.projects.interesting', to: '/newconstructions?featured=true' },
    ],
  },
  {
    key: 'rent',
    titleKey: 'footer.rent.title',
    links: [
      { key: 'longTerm', labelKey: 'footer.rent.longTerm', to: '/rent' },
      { key: 'shortTerm', labelKey: 'footer.rent.shortTerm', to: '/rent?dealType=rent_short' },
      { key: 'popular', labelKey: 'footer.rent.popular', to: '/rent?popular=true' },
    ],
  },
  {
    key: 'commercial',
    titleKey: 'footer.commercial.title',
    links: [
      { key: 'sale', labelKey: 'footer.commercial.sale', to: '/secondary?propertyType=commercial' },
      { key: 'rent', labelKey: 'footer.commercial.rent', to: '/rent?propertyType=commercial' },
      { key: 'hot', labelKey: 'footer.commercial.hot', to: '/secondary?propertyType=commercial&hot=true' },
    ],
  },
]

/** Нижний ярус: сервисные разделы. */
const SERVICE_GROUPS: FooterGroup[] = [
  {
    key: 'useful',
    titleKey: 'footer.useful.title',
    links: [
      { key: 'realtors', labelKey: 'footer.useful.realtors', to: '/realtors' },
      { key: 'publish', labelKey: 'footer.useful.publish', to: '/publish' },
      { key: 'requests', labelKey: 'footer.useful.requests', to: '/requests' },
    ],
  },
  {
    key: 'services',
    titleKey: 'footer.services.title',
    links: [
      { key: 'banks', labelKey: 'footer.services.banks', to: '/banks' },
      { key: 'calculator', labelKey: 'footer.services.calculator', to: '/calculator' },
      { key: 'analytics', labelKey: 'footer.services.analytics', to: '/analytics' },
    ],
  },
  {
    key: 'support',
    titleKey: 'footer.support.title',
    links: [
      { key: 'faq', labelKey: 'footer.support.faq', to: '/faq' },
      { key: 'contacts', labelKey: 'footer.support.contacts', to: '/contacts' },
      { key: 'writeUs', labelKey: 'footer.support.writeUs', to: '/support' },
    ],
  },
  {
    key: 'legal',
    titleKey: 'footer.legal.title',
    links: [
      { key: 'privacy', labelKey: 'footer.legal.privacy', to: '/privacy' },
      { key: 'terms', labelKey: 'footer.legal.terms', to: '/terms' },
      { key: 'offer', labelKey: 'footer.legal.offer', to: '/offer' },
    ],
  },
]

const SOCIALS = [
  {
    key: 'telegram',
    labelKey: 'footer.socials.telegram',
    href: 'https://t.me/baza_sale',
    path: 'M21.4 4.1 18.3 19c-.2 1-.9 1.3-1.8.8l-4.6-3.4-2.2 2.1c-.3.3-.5.5-1 .5l.3-4.7 8.6-7.8c.4-.3-.1-.5-.6-.2L6.4 13 1.9 11.6c-1-.3-1-1 .2-1.5L20 3.2c.8-.3 1.6.2 1.4.9z',
  },
  {
    key: 'whatsapp',
    labelKey: 'footer.socials.whatsapp',
    href: 'https://wa.me/',
    path: 'M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.6-.1-.4-.1-.8-.3-1.4-.5-2.4-1-4-3.4-4.1-3.6-.1-.2-1-1.3-1-2.4 0-1.2.6-1.7.8-2 .2-.2.5-.3.6-.3h.5c.1 0 .4 0 .6.4l.8 2c.1.2.1.3 0 .5l-.3.4-.3.4c-.1.1-.2.3-.1.5.2.3.7 1.1 1.4 1.7 1 .9 1.8 1.1 2 1.2.3.1.4.1.6-.1l.8-1c.2-.2.4-.2.6-.1l1.9.9c.3.1.4.2.5.3.1.2.1.8-.1 1.4z',
  },
  {
    key: 'instagram',
    labelKey: 'footer.socials.instagram',
    href: 'https://instagram.com/',
    path: 'M12 7.3A4.7 4.7 0 1 0 16.7 12 4.7 4.7 0 0 0 12 7.3zm0 7.7a3 3 0 1 1 3-3 3 3 0 0 1-3 3zm6-7.9a1.1 1.1 0 1 1-1.1-1.1A1.1 1.1 0 0 1 18 7.1zM21.9 8a5.4 5.4 0 0 0-1.5-3.9A5.4 5.4 0 0 0 16.5 2.6C15 2.5 9 2.5 7.5 2.6a5.4 5.4 0 0 0-3.9 1.5A5.4 5.4 0 0 0 2.1 8C2 9.5 2 14.5 2.1 16a5.4 5.4 0 0 0 1.5 3.9 5.4 5.4 0 0 0 3.9 1.5c1.5.1 7.5.1 9 0a5.4 5.4 0 0 0 3.9-1.5 5.4 5.4 0 0 0 1.5-3.9c.1-1.5.1-6.5 0-8zm-2 9.6a3 3 0 0 1-1.7 1.7c-1.2.5-4 .4-5.2.4s-4 .1-5.2-.4a3 3 0 0 1-1.7-1.7c-.5-1.2-.4-4-.4-5.2s-.1-4 .4-5.2A3 3 0 0 1 7.8 5.6C9 5.1 11.8 5.2 13 5.2s4-.1 5.2.4a3 3 0 0 1 1.7 1.7c.5 1.2.4 4 .4 5.2s.1 4-.4 5.1z',
  },
]

function renderGroup(group: FooterGroup, t: Translate) {
  return (
    <div key={group.key} className="bz-footer__group">
      <h3 className="bz-footer__title">{t(group.titleKey)}</h3>
      <ul className="bz-footer__links">
        {group.links.map((link) => (
          <li key={link.key}>
            <Link to={link.to}>
              {t(link.labelKey)}
              {link.badge ? <span className="bz-footer__badge">{t(link.badge)}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Подвал по утверждённому единому `footer 1` (`3067:73634`, MKT-SCR-003).
 *
 * 12.09.2026 собран заново со своими классами `bz-footer*`. Прежний
 * центрировал каждую колонку, из-за чего столбцы ссылок не читались как
 * столбцы, а нижний ярус был набран мельче основного. Значки соцсетей
 * при наведении раздувались: общее правило на кнопки двигало их вверх, а
 * своё увеличивало. Теперь наведение меняет только цвет — спокойно и
 * одинаково во всём подвале.
 */
export function Footer() {
  const year = new Date().getFullYear()
  const { t } = useI18n()

  return (
    <footer className="bz-footer" role="contentinfo">
      <div className="bz-footer__inner">
        <div className="bz-footer__top">
          <div className="bz-footer__brand">
            <Link to="/" className="bz-footer__logo" aria-label={t('footer.logoAria')}>
              <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
                <path
                  transform="translate(6.25 12.55)"
                  d="M45.66 0.65C44.53-0.22 42.97-0.22 41.84 0.65L1.22 31.9C-0.15 32.95-0.4 34.91 0.65 36.28C1.7 37.65 3.66 37.9 5.03 36.85L43.75 7.07L82.47 36.85C83.04 37.29 83.71 37.5 84.37 37.5C85.31 37.5 86.24 37.08 86.85 36.28C87.9 34.91 87.65 32.95 86.28 31.9Z"
                />
                <path
                  transform="translate(15.94 27.52)"
                  d="M43.44 59.94L65 59.94C66.72 59.94 68.13 58.53 68.13 56.81L68.13 26.19L34.06 0L0 26.19L0 56.81C0 58.53 1.41 59.94 3.13 59.94L24.69 59.94C26.41 59.94 27.81 58.53 27.81 56.81L27.81 38.06L40.31 38.06L40.31 56.81C40.31 58.53 41.72 59.94 43.44 59.94Z"
                />
              </svg>
              <span>
                BAZA<span className="bz-footer__logo-dot">.sale</span>
              </span>
            </Link>
            <p className="bz-footer__tagline">{t('footer.tagline')}</p>
            <ul className="bz-footer__socials" aria-label={t('footer.socialsLabel')}>
              {SOCIALS.map((social) => (
                <li key={social.key}>
                  <a href={social.href} target="_blank" rel="noopener noreferrer" aria-label={t(social.labelKey)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d={social.path} fill="currentColor" />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <nav className="bz-footer__catalogue" aria-label={t('footer.catalogueLabel')}>
            {CATALOGUE_GROUPS.map((group) => renderGroup(group, t))}
          </nav>
        </div>

        <nav className="bz-footer__services" aria-label={t('footer.servicesLabel')}>
          {SERVICE_GROUPS.map((group) => renderGroup(group, t))}
        </nav>

        <div className="bz-footer__bottom">
          <p>{t('footer.copyright', { year })}</p>
          <p>{t('footer.disclaimer')}</p>
        </div>
      </div>
    </footer>
  )
}
