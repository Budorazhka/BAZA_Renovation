import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useModulePermissions } from '@/hooks/useModulePermissions'
import { isHubSectionVisible } from '@/lib/module-permissions'
import { useI18n } from "@/i18n";

export interface HubSection {
  icon: React.ReactNode
  title: string
  description: string
  route?: string
  externalUrl?: string
  badge?: string
}

export interface HubStat {
  label: string
  value: string
  sub?: string
  progress?: number
}

interface Props {
  moduleIcon: React.ReactNode
  moduleName: string
  moduleDescription?: string
  sections: HubSection[]
  /** Внутренний маршрут или внешняя ссылка (например обычная CRM baza.sale) */
  actionButton?: { label: string; route?: string; externalUrl?: string }
  stats?: HubStat[]
}

export default function ModuleHub({
  moduleIcon,
  moduleName,
  sections,
  actionButton,
  stats,
}: Props) {
    const { t } = useI18n();
  const navigate = useNavigate()
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const { permissions } = useModulePermissions()
  const sectionsWithAccess = useMemo(
    () =>
      sections.map((s) => ({
        section: s,
        accessible: isHubSectionVisible(s.route, permissions),
      })),
    [sections, permissions],
  )

  function handleSection(s: HubSection, accessible: boolean) {
    if (!accessible && s.route) {
      navigate('/dashboard/access-denied', {
        state: { from: s.route, sectionLabel: s.title },
      })
      return
    }
    if (s.externalUrl) { window.open(s.externalUrl, '_blank'); return }
    if (s.route) navigate(s.route)
  }

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--app-bg)',
      padding: 'clamp(20px, 3vh, 32px) clamp(16px, 2.5vw, 40px)',
      fontFamily: "'Montserrat', sans-serif",
      overflowY: 'auto',
    }}>

      {/* ── Header (нижняя граница — сплошная, без градиента «обрывка») ─── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          paddingBottom: 24,
          marginBottom: 24,
          borderBottom: '1px solid var(--hub-card-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div
            className="hub-header-module-icon"
            style={{
              width: 68, height: 68, flexShrink: 0,
              background: 'var(--hub-card-bg)',
              border: '1px solid var(--hub-card-border-hover)',
              borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {moduleIcon}
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 400, color: 'var(--theme-accent-heading)', letterSpacing: '0.02em', lineHeight: 1.1 }}>
              {moduleName}
            </h1>
          </div>
        </div>

        {actionButton && (
          <button
            type="button"
            onClick={() => {
              if (actionButton.externalUrl) {
                window.open(actionButton.externalUrl, '_blank', 'noopener,noreferrer')
                return
              }
              if (actionButton.route) navigate(actionButton.route)
            }}
            style={{
              flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 22px',
              background: 'transparent',
              border: '1px solid color-mix(in srgb, var(--gold) 40%, transparent)',
              borderRadius: 'var(--section-cta-radius)',
              color: 'var(--theme-accent-heading)',
              fontSize: 12, fontWeight: 400,
              letterSpacing: '0.04em',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hub-action-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            {actionButton.label}
            <ArrowUpRight size={20} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* ── Sections grid: 6 в ряд от ~1536px viewport, карточки 9:5 ─────── */}
      <div className="module-hub-sections-grid">
        {sectionsWithAccess.map(({ section: s, accessible }, i) => {
          const hovered = hoveredIdx === i
          const clickable = !!(s.route || s.externalUrl)
          const locked = !accessible && !!s.route
          return (
            <div
              key={i}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={() => handleSection(s, accessible)}
              onKeyDown={(e) => {
                if (!clickable) return
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleSection(s, accessible)
                }
              }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              title={locked ? 'Нет прав для использования этого раздела' : undefined}
              className={cn(
                'module-hub-section-card',
                hovered && accessible && 'module-hub-section-card--hover',
                clickable && (accessible ? 'cursor-pointer' : 'cursor-not-allowed opacity-55'),
                locked && 'grayscale-[0.35]',
              )}
            >
              {locked ? (
                <Lock
                  size={18}
                  strokeWidth={2}
                  color="var(--workspace-text-muted)"
                  style={{ position: 'absolute', top: 16, right: 16, opacity: 0.75 }}
                />
              ) : (
                <ArrowUpRight
                  size={20}
                  strokeWidth={2}
                  color="var(--theme-accent-heading)"
                  style={{ position: 'absolute', top: 16, right: 16, opacity: hovered ? 1 : 0, transition: 'opacity 0.2s' }}
                />
              )}

              {/* Badge top-right (if soon) */}
              {s.badge === 'soon' && (
                <span style={{
                  position: 'absolute', top: 14, right: 14,
                  fontSize: 13, fontWeight: 400, padding: '3px 8px', borderRadius: 3,
                  background: 'color-mix(in srgb, var(--gold) 15%, transparent)', color: 'var(--hub-badge-soon-fg)',
                  letterSpacing: '0.08em',
                }}>{t('moduleHub.скоро')}</span>
              )}

              {/* Icon */}
              <div
                className="module-hub-section-icon"
                style={{
                  background: hovered ? 'var(--hub-tile-icon-hover-bg)' : 'var(--hub-tile-icon-bg)',
                }}
              >
                <span
                  className="hub-section-icon-slot"
                  style={{ color: hovered ? 'var(--hub-tile-icon-hover-fg)' : 'var(--hub-tile-icon-fg)', display: 'flex', transition: 'color 0.2s' }}
                >
                  {s.icon}
                </span>
              </div>

              {/* Title — перенос длинных подписей; без жёсткой «двух строк» при узких колонках */}
              <h3
                className="module-hub-section-title w-full min-w-0 px-0.5"
                style={{
                  margin: 0,
                  fontWeight: 400,
                  color: 'var(--theme-accent-heading)',
                }}
              >
                {s.title}
              </h3>

            </div>
          )
        })}
      </div>

      {/* ── Stats footer ───────────────────────────────────────────────── */}
      {stats && stats.length > 0 && (
        <footer style={{
          flexShrink: 0,
          marginTop: 24,
          paddingTop: 20,
          borderTop: '1px solid var(--divider-subtle)',
          display: 'grid',
          gridTemplateColumns: `repeat(${stats.length}, 1fr)`,
          gap: 24,
        }}>
          {stats.map((stat, i) => (
            <div key={i}>
              <div style={{ fontSize: 9, color: 'var(--hub-stat-label)', letterSpacing: '0.12em', marginBottom: 6 }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 400, color: 'var(--workspace-text)', letterSpacing: '-0.01em', lineHeight: 1 }}>
                {stat.value}
              </div>
              {stat.sub && (
                <div style={{ fontSize: 10, color: stat.sub.startsWith('+') ? '#4ade80' : 'var(--workspace-text-dim)', marginTop: 5 }}>
                  {stat.sub}
                </div>
              )}
              {stat.progress !== undefined && (
                <div style={{ marginTop: 8, height: 3, background: 'var(--hub-progress-track)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${stat.progress}%`, background: 'var(--hub-progress-fill)', borderRadius: 2 }} />
                </div>
              )}
            </div>
          ))}
        </footer>
      )}
    </div>
  )
}
