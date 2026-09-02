import type { UnitShareAgent } from '@/lib/unit-share'

export function splitPersonName(full?: string): { firstName: string; lastName: string } {
  if (!full?.trim()) return { firstName: '', lastName: '' }
  const parts = full.trim().split(/\s+/)
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') }
}

/** Инициалы: 1 слово — первые 2 буквы; 2+ слова — по первой букве первых двух слов (не первое+последнее). */
export function personInitials(name?: string): string {
  if (!name?.trim()) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    const word = parts[0]
    return (word.length >= 2 ? word.slice(0, 2) : word).toUpperCase()
  }
  const first = parts[0]?.[0] ?? ''
  const second = parts[1]?.[0] ?? ''
  const initials = `${first}${second}`.toUpperCase()
  return initials || '?'
}

export function hasAgentData(agent: UnitShareAgent | null): boolean {
  return Boolean(
    agent &&
      (
        agent.name ||
        agent.phone ||
        agent.telegram ||
        agent.whatsapp ||
        agent.company ||
        agent.role ||
        agent.email ||
        agent.website ||
        agent.instagram
      ),
  )
}

export function agentPortraitUrl(name: string): string {
  const initials = personInitials(name)
  const avatarName = initials.length >= 2 ? `${initials[0]} ${initials[1]}` : initials
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(avatarName)}&background=0f0f0f&color=c9a962&size=512&bold=true&format=png`
}

/** Фото из профиля риэлтора или заглушка с инициалами. */
export function resolveAgentPortraitUrl(agent: UnitShareAgent | null | undefined, fallbackName: string): string {
  const avatarUrl = agent?.avatarUrl?.trim()
  if (avatarUrl && /^https?:\/\//i.test(avatarUrl)) return avatarUrl
  return agentPortraitUrl(fallbackName)
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

/** Плавный скролл к секции визитки (надёжнее scrollIntoView при overflow в hero). */
export function scrollToVisitSection(id: string, offset = 16): void {
  const el = document.getElementById(id)
  if (!el) return

  const hero = document.querySelector<HTMLElement>('.visit-premium-hero')
  if (hero && hero.scrollTop > 0) {
    hero.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const target = Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset)
  const start = window.scrollY
  const distance = target - start
  if (Math.abs(distance) < 2) return

  const duration = Math.min(950, Math.max(520, Math.abs(distance) * 0.5))
  let startTime: number | null = null

  const step = (time: number) => {
    if (startTime == null) startTime = time
    const progress = Math.min((time - startTime) / duration, 1)
    window.scrollTo(0, start + distance * easeInOutCubic(progress))
    if (progress < 1) requestAnimationFrame(step)
  }

  requestAnimationFrame(step)
}
