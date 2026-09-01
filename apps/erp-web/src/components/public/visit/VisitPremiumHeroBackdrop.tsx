export function VisitPremiumHeroBackdrop({ image }: { image: string }) {
  return (
    <div className="visit-premium-hero-media absolute inset-0" aria-hidden>
      <img
        src={image}
        alt=""
        className="visit-premium-hero-bg visit-premium-hero-bg-active absolute inset-0 size-full object-cover"
        loading="eager"
        fetchPriority="high"
        draggable={false}
      />
      <div className="visit-premium-hero-vignette pointer-events-none absolute inset-0" />
    </div>
  )
}
