import { Check, Monitor } from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import type { ThemePreference } from '@/context/ThemeContext'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from "@/i18n";

const THEMES: {
  id: ThemePreference
  label: string
  desc: string
  preview: {
    bg: string
    rail: string
    card: string
    cardBorder: string
    text: string
    textMuted: string
    accent: string
    row1: string
    row2: string
  }
}[] = [
  {
    id: 'standard',
    label: 'Тёмная',
    desc: 'Bloomberg Terminal — фирменная тёмно-зелёная',
    preview: {
      bg: '#072821',
      rail: '#031d16',
      card: '#112d1c',
      cardBorder: 'rgba(230,195,100,0.18)',
      text: '#ffffff',
      textMuted: 'rgba(255,255,255,0.55)',
      accent: '#e6c364',
      row1: '#072821',
      row2: '#112d1c',
    },
  },
  {
    id: 'light',
    label: 'Белый',
    desc: 'Чистый белый с чёрным — максимальный контраст',
    preview: {
      bg: '#f7f7f7',
      rail: '#f9f9f9',
      card: '#ffffff',
      cardBorder: '#e0e0e0',
      text: '#111111',
      textMuted: '#666666',
      accent: '#a07828',
      row1: '#f9f9f9',
      row2: '#ffffff',
    },
  },
  {
    id: 'light-green',
    label: 'Мятный',
    desc: 'Светлый с зелёным подтоном — мягко, без усталости',
    preview: {
      bg: '#eef4f1',
      rail: '#f0f7f3',
      card: '#fafdfc',
      cardBorder: '#cde0d8',
      text: '#0b1f15',
      textMuted: '#456255',
      accent: '#a07828',
      row1: '#f2f7f4',
      row2: '#fafdfc',
    },
  },
]

function ThemeCard({
  theme,
  active,
  onClick,
}: {
  theme: (typeof THEMES)[number]
  active: boolean
  onClick: () => void
}) {
  const p = theme.preview
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'relative',
        width: '100%',
        background: 'var(--hub-card-bg)',
        border: `1px solid ${active ? 'var(--gold)' : 'var(--hub-card-border)'}`,
        borderRadius: 6,
        padding: 0,
        cursor: 'pointer',
        textAlign: 'left',
        overflow: 'hidden',
        transition: 'border-color 0.15s',
        outline: 'none',
      }}
    >
      {/* Мини-превью приложения */}
      <div
        style={{
          display: 'flex',
          height: 120,
          background: p.bg,
          overflow: 'hidden',
          borderRadius: '5px 5px 0 0',
        }}
      >
        {/* Rail */}
        <div
          style={{
            width: 32,
            flexShrink: 0,
            background: p.rail,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '10px 5px',
          }}
        >
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                height: 4,
                borderRadius: 2,
                background: i === 2 ? p.accent : p.textMuted,
                opacity: i === 2 ? 1 : 0.4,
                width: i === 2 ? '80%' : '60%',
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: '10px 10px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Header bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <div style={{ height: 5, width: 60, borderRadius: 2, background: p.text, opacity: 0.8 }} />
            <div style={{ flex: 1 }} />
            <div
              style={{
                height: 16,
                width: 40,
                borderRadius: 3,
                background: p.accent,
                opacity: 0.85,
              }}
            />
          </div>

          {/* Card */}
          <div
            style={{
              background: p.card,
              border: `1px solid ${p.cardBorder}`,
              borderRadius: 4,
              padding: '6px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ height: 4, width: '55%', borderRadius: 2, background: p.text, opacity: 0.75 }} />
            <div style={{ height: 3, width: '80%', borderRadius: 2, background: p.textMuted, opacity: 0.6 }} />
            <div style={{ height: 3, width: '65%', borderRadius: 2, background: p.textMuted, opacity: 0.4 }} />
          </div>

          {/* Table rows */}
          <div style={{ borderRadius: 4, overflow: 'hidden', border: `1px solid ${p.cardBorder}` }}>
            {[p.row1, p.row2, p.row1].map((rowBg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 8,
                  padding: '3px 6px',
                  background: rowBg,
                  borderBottom: i < 2 ? `1px solid ${p.cardBorder}` : 'none',
                  alignItems: 'center',
                }}
              >
                <div style={{ height: 3, width: '30%', borderRadius: 1, background: p.text, opacity: 0.7 }} />
                <div style={{ height: 3, width: '20%', borderRadius: 1, background: p.textMuted, opacity: 0.5 }} />
                <div style={{ flex: 1 }} />
                <div style={{ height: 3, width: '15%', borderRadius: 1, background: p.accent, opacity: 0.8 }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Label area */}
      <div
        style={{
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--hub-card-bg)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: active ? 500 : 400,
              color: active ? 'var(--gold)' : 'var(--workspace-text)',
              marginBottom: 2,
            }}
          >
            {theme.label}
          </div>
          <div style={{ fontSize: 16, color: 'var(--workspace-text-muted)', lineHeight: 1.4 }}>{theme.desc}</div>
        </div>
        {active && (
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              background: 'var(--gold)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Check size={12} color="var(--theme-active-check)" strokeWidth={2.5} />
          </div>
        )}
      </div>
    </button>
  )
}

export function ThemeSettingsPage() {
    const { t } = useI18n();
  const { preference, setPreference } = useTheme()

  const activeTheme = THEMES.find((t) => t.id === preference) ?? THEMES[0]

  return (
    <DashboardShell>
      <div style={{ padding: '24px 28px 48px', maxWidth: 860 }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 20, fontWeight: 400, color: 'var(--app-text)', marginBottom: 4 }}>
            {t('settings.themeSettingsPage.внешний_вид')}</div>
        </div>

        {/* Плашка текущей темы */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            background: 'var(--hub-card-bg)',
            border: '1px solid var(--hub-card-border)',
            borderRadius: 6,
            marginBottom: 20,
          }}
        >
          <Monitor size={16} color="var(--gold)" />
          <span style={{ fontSize: 16, color: 'var(--workspace-text-muted)' }}>{t('settings.themeSettingsPage.активная_тема')}</span>
          <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--gold)' }}>{activeTheme.label}</span>
        </div>

        {/* Три тайла тем */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
          }}
        >
          {THEMES.map((t) => (
            <ThemeCard
              key={t.id}
              theme={t}
              active={preference === t.id}
              onClick={() => setPreference(t.id)}
            />
          ))}
        </div>
      </div>
    </DashboardShell>
  )
}
