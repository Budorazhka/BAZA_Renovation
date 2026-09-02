import type { ReactElement } from 'react'

import type { SelectionLanguage } from '@/lib/selection-display'
import type { Language } from '@/i18n/types'

interface FlagProps {
  className?: string
}

/** Флаг России — три горизонтальные полосы. */
function FlagRU({ className }: FlagProps) {
  return (
    <svg viewBox="0 0 9 6" className={className} aria-hidden role="presentation">
      <rect width="9" height="6" fill="#fff" />
      <rect width="9" height="4" y="2" fill="#0039a6" />
      <rect width="9" height="2" y="4" fill="#d52b1e" />
    </svg>
  )
}

/** Флаг Великобритании — для английского языка. */
function FlagGB({ className }: FlagProps) {
  return (
    <svg viewBox="0 0 60 30" className={className} aria-hidden role="presentation">
      <clipPath id="flag-gb-clip">
        <path d="M0,0 v30 h60 v-30 z" />
      </clipPath>
      <g clipPath="url(#flag-gb-clip)">
        <rect width="60" height="30" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path
          d="M0,0 L60,30 M60,0 L0,30"
          clipPath="url(#flag-gb-clip)"
          stroke="#c8102e"
          strokeWidth="4"
        />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
      </g>
    </svg>
  )
}

/** Флаг Грузии — пять крестов (для грузинского языка). */
function FlagGE({ className }: FlagProps) {
  const small = (cx: number, cy: number) => (
    <g fill="#ff0000">
      <rect x={cx - 38} y={cy - 12} width={76} height={24} />
      <rect x={cx - 12} y={cy - 38} width={24} height={76} />
    </g>
  )
  return (
    <svg viewBox="0 0 600 400" className={className} aria-hidden role="presentation">
      <rect width="600" height="400" fill="#fff" />
      <rect x="240" y="0" width="120" height="400" fill="#ff0000" />
      <rect x="0" y="160" width="600" height="80" fill="#ff0000" />
      {small(120, 80)}
      {small(480, 80)}
      {small(120, 320)}
      {small(480, 320)}
    </svg>
  )
}

const FLAGS: Record<SelectionLanguage | Language, (props: FlagProps) => ReactElement> = {
  ru: FlagRU,
  en: FlagGB,
  ka: FlagGE,
  es: FlagES,
  tr: FlagTR,
}

function FlagTR({ className }: FlagProps) {
  return (
    <svg viewBox="0 0 1200 800" className={className} aria-hidden role="presentation">
      <rect width="1200" height="800" fill="#E30A17" />
      <circle cx="425" cy="400" r="200" fill="#fff" />
      <circle cx="475" cy="400" r="160" fill="#E30A17" />
      <polygon points="700,400 600,435 635,335 670,435 570,365 690,365" fill="#fff" />
    </svg>
  )
}

function FlagES({ className }: FlagProps) {
  return (
    <svg viewBox="0 0 750 500" className={className} aria-hidden role="presentation">
      <rect width="750" height="500" fill="#c60b1e" />
      <rect width="750" height="250" y="125" fill="#ffc400" />
    </svg>
  )
}

/** Прямоугольный флаг страны языка визитки. */
export function LanguageFlag({ lang, className }: { lang: SelectionLanguage | Language; className?: string }) {
  const Flag = FLAGS[lang]
  return <Flag className={className} />
}
