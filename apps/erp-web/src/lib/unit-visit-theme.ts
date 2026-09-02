import type { CSSProperties } from 'react'

export type UnitVisitTheme = 'dark' | 'baza' | 'light'

export const UNIT_VISIT_THEMES: { value: UnitVisitTheme; label: string }[] = [
  { value: 'dark', label: 'Тёмная' },
  { value: 'baza', label: 'BAZA.sale' },
  { value: 'light', label: 'Светлая' },
]

const THEME_CODES: Record<UnitVisitTheme, string> = {
  dark: 'd',
  baza: 'b',
  light: 'l',
}

const CODE_THEMES: Record<string, UnitVisitTheme> = {
  d: 'dark',
  b: 'baza',
  l: 'light',
}

export function encodeUnitVisitTheme(theme: UnitVisitTheme): string {
  return THEME_CODES[theme]
}

export function parseUnitVisitTheme(raw: string | null | undefined): UnitVisitTheme | null {
  if (!raw) return null
  if (raw === 'dark' || raw === 'baza' || raw === 'light') return raw
  return CODE_THEMES[raw] ?? null
}

export function resolveUnitVisitTheme(theme?: UnitVisitTheme | null): UnitVisitTheme {
  return theme ?? 'dark'
}

export const BAZA_BRAND_GREEN = '#178b00'

/** Атрибут на html/body — скроллбар и chrome визитки, не ERP. */
export const UNIT_VISIT_THEME_ATTR = 'data-unit-visit-theme'

/** Цвет полосы браузера (адресная строка / status bar) для публичной визитки. */
export const UNIT_VISIT_THEME_COLOR: Record<UnitVisitTheme, string> = {
  dark: '#07120a',
  baza: BAZA_BRAND_GREEN,
  light: '#faf7f2',
}

function upsertMeta(name: string, content: string): HTMLMetaElement {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = name
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', content)
  return meta
}

/** Синхронизирует meta theme-color и фон html/body (зона над контентом / overscroll). */
export function syncUnitVisitPageChrome(theme: UnitVisitTheme): void {
  const themeColor = UNIT_VISIT_THEME_COLOR[theme]

  upsertMeta('theme-color', themeColor)
  upsertMeta('msapplication-navbutton-color', themeColor)
  upsertMeta(
    'apple-mobile-web-app-status-bar-style',
    theme === 'baza' ? 'black-translucent' : 'default',
  )

  document.documentElement.style.backgroundColor = themeColor
  document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light'
  document.body.style.backgroundColor = themeColor
  document.documentElement.classList.toggle('unit-visit-chrome-baza', theme === 'baza')
  document.body.classList.toggle('unit-visit-chrome-baza', theme === 'baza')
  document.documentElement.setAttribute(UNIT_VISIT_THEME_ATTR, theme)
  document.body.setAttribute(UNIT_VISIT_THEME_ATTR, theme)
}

/** Подключает chrome визитки и восстанавливает значения при размонтировании. */
export function applyUnitVisitPageChrome(theme: UnitVisitTheme): () => void {
  const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  const msMeta = document.querySelector<HTMLMetaElement>('meta[name="msapplication-navbutton-color"]')
  const appleMeta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-status-bar-style"]')

  const prevThemeColor = themeMeta?.getAttribute('content') ?? null
  const prevMsColor = msMeta?.getAttribute('content') ?? null
  const prevAppleStyle = appleMeta?.getAttribute('content') ?? null
  const prevHtmlBg = document.documentElement.style.backgroundColor
  const prevBodyBg = document.body.style.backgroundColor
  const prevColorScheme = document.documentElement.style.colorScheme
  const hadChromeBazaClass = document.body.classList.contains('unit-visit-chrome-baza')
  const hadHtmlChromeBazaClass = document.documentElement.classList.contains('unit-visit-chrome-baza')
  const prevHtmlVisitTheme = document.documentElement.getAttribute(UNIT_VISIT_THEME_ATTR)
  const prevBodyVisitTheme = document.body.getAttribute(UNIT_VISIT_THEME_ATTR)

  syncUnitVisitPageChrome(theme)

  return () => {
    if (themeMeta) {
      if (prevThemeColor != null) themeMeta.setAttribute('content', prevThemeColor)
      else themeMeta.setAttribute('content', '#178b00')
    }
    if (msMeta) {
      if (prevMsColor != null) msMeta.setAttribute('content', prevMsColor)
      else msMeta.setAttribute('content', '#178b00')
    }
    if (appleMeta) {
      if (prevAppleStyle != null) appleMeta.setAttribute('content', prevAppleStyle)
      else appleMeta.removeAttribute('content')
    }

    document.documentElement.style.backgroundColor = prevHtmlBg
    document.documentElement.style.colorScheme = prevColorScheme
    document.body.style.backgroundColor = prevBodyBg
    document.body.classList.toggle('unit-visit-chrome-baza', hadChromeBazaClass)
    document.documentElement.classList.toggle('unit-visit-chrome-baza', hadHtmlChromeBazaClass)

    if (prevHtmlVisitTheme != null) {
      document.documentElement.setAttribute(UNIT_VISIT_THEME_ATTR, prevHtmlVisitTheme)
    } else {
      document.documentElement.removeAttribute(UNIT_VISIT_THEME_ATTR)
    }
    if (prevBodyVisitTheme != null) {
      document.body.setAttribute(UNIT_VISIT_THEME_ATTR, prevBodyVisitTheme)
    } else {
      document.body.removeAttribute(UNIT_VISIT_THEME_ATTR)
    }
  }
}

export function floorplanPanelStyle(theme: UnitVisitTheme): CSSProperties {
  if (theme === 'baza') {
    return {
      backgroundColor: '#ffffff',
      backgroundImage: `
        linear-gradient(rgba(23,139,0,0.06) 1px, transparent 1px),
        linear-gradient(90deg, rgba(23,139,0,0.06) 1px, transparent 1px)
      `,
      backgroundSize: '28px 28px',
    }
  }
  if (theme === 'light') {
    return {
      backgroundColor: '#f5f0e8',
      backgroundImage: `
        linear-gradient(rgba(120,90,40,0.06) 1px, transparent 1px),
        linear-gradient(90deg, rgba(120,90,40,0.06) 1px, transparent 1px)
      `,
      backgroundSize: '28px 28px',
    }
  }
  return {
    backgroundColor: '#0e2a1f',
    backgroundImage: `
      linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
    `,
    backgroundSize: '28px 28px',
  }
}
