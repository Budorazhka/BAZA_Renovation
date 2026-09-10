/**
 * Разделы форума заданы на бэкенде (SEED_COMMUNITY_SECTIONS), а фронтенд
 * держит их зеркало в forumData.ts SECTIONS — оттуда берётся список разделов
 * в форме новой темы. До 11.09.2026 списки разошлись: форма предлагала
 * «Ипотеку», «Маркетинг», «Технологии» и «Нетворкинг», которых API не знает
 * (публикация падала с 404), а «Кейсов и опыта» в форме не было.
 *
 * Импорт из apps/api безопасен: в community-seed-data.ts только данные и
 * type-only импорт, который esbuild стирает.
 */
import { describe, expect, it } from 'vitest'

import { SEED_COMMUNITY_SECTIONS } from '../../../api/src/modules/community/community-seed-data'
import { SECTIONS } from '@/components/community/forum/forumData'

describe('разделы форума: зеркало фронтенда совпадает с API', () => {
  const apiSections = [...SEED_COMMUNITY_SECTIONS]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      id: s.sectionId,
      name: s.name,
      kind: s.kind,
      group: s.group ?? undefined,
      icon: s.icon,
      description: s.description,
    }))

  const webSections = SECTIONS.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    group: s.group,
    icon: s.icon,
    description: s.description,
  }))

  it('те же разделы в том же порядке, с теми же подписями', () => {
    expect(webSections).toEqual(apiSections)
  })

  it('каждый раздел, куда форма даёт публиковать, существует в API', () => {
    const apiIds = new Set(apiSections.map((s) => s.id))
    const postable = SECTIONS.filter((s) => s.kind === 'category' || s.kind === 'feed')
    expect(postable.length).toBeGreaterThan(0)
    for (const s of postable) expect(apiIds.has(s.id)).toBe(true)
  })

  it('в зеркале нет выдуманных счётчиков тем', () => {
    for (const s of SECTIONS) expect(s.threads).toBe(0)
  })
})
