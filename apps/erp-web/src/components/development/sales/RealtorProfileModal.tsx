import { useEffect } from 'react'
import { Briefcase, Mail, MessageCircle, Phone, Send, X } from 'lucide-react'
import { useI18n } from '@/i18n'

export interface RealtorProfile {
  name: string
  agency?: string
  position?: string
  experienceYears?: number
  phone?: string
  email?: string
  telegram?: string
  whatsapp?: string
  avatarColor?: string
}

interface Props {
  profile: RealtorProfile
  onClose: () => void
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase()
  return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase()
}

function hashColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  const hue = Math.abs(h) % 360
  return `hsl(${hue}, 38%, 36%)`
}

export function RealtorProfileModal({ profile, onClose }: Props) {
  const { t } = useI18n()
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [onClose])

  const phoneDigits = profile.phone?.replace(/[^\d+]/g, '') ?? ''
  const tg = profile.telegram?.replace(/^@/, '')
  const wa = profile.whatsapp?.replace(/[^\d]/g, '')

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9200,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Montserrat', sans-serif",
        padding: 'clamp(8px, 2vw, 24px)',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          background: 'var(--hub-card-bg, #10261c)',
          border: '1px solid var(--hub-card-border-hover, rgba(201,168,76,0.25))',
          borderRadius: 8,
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{
            fontSize: 16, fontWeight: 400, textTransform: 'uppercase',
            letterSpacing: '0.2em', color: 'var(--theme-accent-heading, #fcecc8)',
          }}>
            {t('salesManagement.realtorProfile.eyebrow', 'Риэлтор')}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', 'Закрыть')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.45)', padding: 4, display: 'flex',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Profile */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: profile.avatarColor ?? hashColor(profile.name),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 400, color: '#fcecc8',
              flexShrink: 0,
            }}>
              {initials(profile.name)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 18, fontWeight: 400,
                color: 'var(--app-text, #fcecc8)',
                lineHeight: 1.2, marginBottom: 4,
              }}>
                {profile.name}
              </div>
              {profile.position && (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                  {profile.position}
                </div>
              )}
            </div>
          </div>

          {/* Company + experience */}
          {(profile.agency || profile.experienceYears != null) && (
            <div style={{
              padding: '12px 14px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              {profile.agency && (
                <Row
                  icon={<Briefcase size={14} />}
                  label={t('salesManagement.realtorProfile.agencyLabel', 'Агентство')}
                  value={profile.agency}
                />
              )}
              {profile.experienceYears != null && (
                <Row
                  icon={null}
                  label={t('salesManagement.realtorProfile.experienceLabel', 'Опыт')}
                  value={`${profile.experienceYears} ${t(
                    `salesManagement.realtorProfile.years.${pluralYears(profile.experienceYears)}`,
                    pluralYearsFallback(profile.experienceYears),
                  )}`}
                />
              )}
            </div>
          )}

          {/* Contacts */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{
              fontSize: 16, fontWeight: 400, textTransform: 'uppercase',
              letterSpacing: '0.2em', color: 'var(--theme-accent-heading, #fcecc8)',
              marginBottom: 2,
            }}>
              {t('salesManagement.realtorProfile.contactsTitle', 'Контакты')}
            </div>

            {profile.phone && (
              <ContactLink
                icon={<Phone size={14} />}
                label={profile.phone}
                href={`tel:${phoneDigits}`}
              />
            )}
            {profile.email && (
              <ContactLink
                icon={<Mail size={14} />}
                label={profile.email}
                href={`mailto:${profile.email}`}
              />
            )}
            {tg && (
              <ContactLink
                icon={<Send size={14} />}
                label={`@${tg}`}
                href={`https://t.me/${tg}`}
                external
              />
            )}
            {wa && (
              <ContactLink
                icon={<MessageCircle size={14} />}
                label="WhatsApp"
                href={`https://wa.me/${wa}`}
                external
              />
            )}

            {!profile.phone && !profile.email && !tg && !wa && (
              <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }}>
                {t('salesManagement.realtorProfile.noContacts', 'Контакты не указаны')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function pluralYears(n: number): 'one' | 'few' | 'many' {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'one'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few'
  return 'many'
}

function pluralYearsFallback(n: number): string {
  const fallbacks = { one: 'год', few: 'года', many: 'лет' } as const
  return fallbacks[pluralYears(n)]
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {icon && <span style={{ color: 'rgba(255,255,255,0.4)', display: 'flex' }}>{icon}</span>}
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', minWidth: 78 }}>{label}</span>
      <span style={{ fontSize: 14, color: 'var(--app-text, #fcecc8)' }}>{value}</span>
    </div>
  )
}

function ContactLink({ icon, label, href, external }: { icon: React.ReactNode; label: string; href: string; external?: boolean }) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 4,
        color: 'var(--app-text, #fcecc8)',
        fontSize: 15,
        textDecoration: 'none',
        transition: 'background 0.15s, border-color 0.15s',
        fontFamily: "'Montserrat', sans-serif",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(230,195,100,0.08)'
        e.currentTarget.style.borderColor = 'rgba(230,195,100,0.3)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
      }}
    >
      <span style={{ color: 'var(--theme-accent-heading, #e6c364)', display: 'flex' }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </a>
  )
}
