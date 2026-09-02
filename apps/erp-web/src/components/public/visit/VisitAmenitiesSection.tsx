import {
  Activity,
  Archive,
  Bike,
  BookOpen,
  Building2,
  Car,
  CheckCircle2,
  Clapperboard,
  Dumbbell,
  Flame,
  GraduationCap,
  Heart,
  Leaf,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TreePine,
  UtensilsCrossed,
  Waves,
  Wifi,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { visitBlockLabel } from '@/lib/unit-visit-block-labels'
import type { SelectionLanguage } from '@/lib/selection-display'

const AMENITY_ICON_MAP: Array<{ pattern: RegExp; Icon: LucideIcon }> = [
  { pattern: /бассейн|pool|აუზი/i, Icon: Waves },
  { pattern: /спортза|фитнес|gym|fitness|სპორტ/i, Icon: Dumbbell },
  { pattern: /детск|playground|ბავშვ/i, Icon: Heart },
  { pattern: /парков|parking|car|ავტო/i, Icon: Car },
  { pattern: /охран|безопасн|security|shield|დაცვ/i, Icon: ShieldCheck },
  { pattern: /ресторан|кафе|restaurant|cafe|რესტ/i, Icon: UtensilsCrossed },
  { pattern: /магазин|торгов|shop|store|მაღაზ/i, Icon: ShoppingCart },
  { pattern: /школ|образован|school|სკოლ/i, Icon: GraduationCap },
  { pattern: /библиотек|library|ბიბლიო/i, Icon: BookOpen },
  { pattern: /парк|сад|garden|park|ბაღ|ტყ/i, Icon: TreePine },
  { pattern: /сауна|баня|sauna|spa|спа|სა/i, Icon: Flame },
  { pattern: /велосипед|bike|велодорожк|ველოსი/i, Icon: Bike },
  { pattern: /кино|кинотеатр|cinema|კინო/i, Icon: Clapperboard },
  { pattern: /коворкинг|офис|cowork|office|ოფის/i, Icon: Building2 },
  { pattern: /йога|yoga|медитац|wellness|ჯანმ/i, Icon: Activity },
  { pattern: /зелен|озеленен|ландшафт|green|eco|эко|ეკო/i, Icon: Leaf },
  { pattern: /wifi|интернет|wi-fi|ინტ/i, Icon: Wifi },
  { pattern: /склад|кладов|хранил|storage|archive/i, Icon: Archive },
  { pattern: /spa|спа|красот|salon|салон/i, Icon: Sparkles },
]

function getAmenityIcon(item: string): LucideIcon {
  for (const { pattern, Icon } of AMENITY_ICON_MAP) {
    if (pattern.test(item)) return Icon
  }
  return CheckCircle2
}

export function VisitAmenitiesSection({
  id,
  items,
  language,
  title,
}: {
  id: string
  items: string[]
  language: SelectionLanguage
  title?: string
}) {
  if (items.length === 0) return null

  return (
    <section id={id} className="visit-premium-section visit-scroll-section scroll-mt-6 reveal-section">
      <h2 className="visit-premium-section-label text-left text-sm font-normal uppercase tracking-[0.22em] sm:text-base">
        {title ?? visitBlockLabel(language, 'amenities')}
      </h2>
      <ul className="visit-section-content visit-amenities-grid grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
        {items.map((item) => {
          const Icon = getAmenityIcon(item)
          return (
            <li key={item} className="visit-unit-plan-stat visit-amenity-item rounded-xl px-3.5 py-3 sm:px-4 sm:py-3.5 stagger-item">
              <div className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.05)] text-[var(--visit-accent)]" aria-hidden>
                  <Icon size={16} />
                </span>
                <span className="visit-amenity-text text-sm leading-snug sm:text-base">{item}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
