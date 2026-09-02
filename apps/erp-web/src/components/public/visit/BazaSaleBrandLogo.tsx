type BazaSaleBrandLogoProps = {
  className?: string
  iconClassName?: string
  labelClassName?: string
  showLabel?: boolean
  href?: string
}

function BazaSalePalmsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 381 295"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <g clipPath="url(#baza-sale-palms-clip0)">
        <path
          d="M101.532 86.0918C91.0936 96.1918 96.5386 102.931 110.496 98.9388C143.609 89.4698 200.725 76.2418 226.723 88.6748C226.723 88.6748 150.69 148.929 162.15 268.088C163.537 282.545 174.377 294.103 184.815 294.103C195.258 294.103 202.198 282.393 202.166 267.865C202.101 235.029 207.659 173.84 240.968 98.5358C240.968 98.5358 265.743 131.094 273.189 166.622C276.17 180.834 281.712 182.825 285.574 168.819C289.8 153.437 291.138 132.241 278.77 110.028C278.77 110.028 326.074 135.673 356.886 168.726C366.791 179.348 372.681 177.559 368.819 163.559C360.698 134.166 336.75 88.5428 266.162 74.9678C266.162 74.9678 293.341 61.7238 326.302 63.0348C340.813 63.6058 345.584 56.8018 332.66 50.1718C316.936 42.0948 290.078 36.6828 246.44 49.2308C246.44 49.2308 225.413 -2.03818 157.479 0.0618185C142.968 0.512818 142.337 7.63282 155.385 13.9908C177.919 24.9718 209.058 42.6708 215.215 59.0918C215.224 59.0928 145.207 43.8198 101.532 86.0918Z"
          fill="currentColor"
        />
      </g>
      <g clipPath="url(#baza-sale-palms-clip1)">
        <path
          d="M162.917 172.349C169.022 178.256 165.837 182.197 157.675 179.862C138.309 174.324 104.906 166.588 89.702 173.86C89.702 173.86 134.168 209.098 127.466 278.785C126.655 287.24 120.315 293.999 114.211 293.999C108.104 293.999 104.045 287.151 104.064 278.655C104.102 259.451 100.851 223.666 81.3712 179.627C81.3712 179.627 66.8821 198.667 62.5275 219.445C60.7841 227.757 57.543 228.921 55.2844 220.73C52.8129 211.734 52.0304 199.338 59.2635 186.347C59.2635 186.347 31.5989 201.345 13.5792 220.676C7.78648 226.888 4.34184 225.841 6.60045 217.654C11.3498 200.464 25.3553 173.782 66.637 165.843C66.637 165.843 50.742 158.098 31.4655 158.865C22.9791 159.198 20.1889 155.219 27.7472 151.342C36.943 146.618 52.6503 143.453 78.171 150.792C78.171 150.792 90.4682 120.808 130.198 122.036C138.684 122.3 139.053 126.464 131.422 130.182C118.244 136.604 100.033 146.955 96.4322 156.559C96.427 156.559 137.375 147.627 162.917 172.349Z"
          fill="currentColor"
        />
      </g>
      <defs>
        <clipPath id="baza-sale-palms-clip0">
          <rect width="294.104" height="294.104" fill="white" transform="translate(86)" />
        </clipPath>
        <clipPath id="baza-sale-palms-clip1">
          <rect width="172" height="172" fill="white" transform="matrix(-1 0 0 1 172 122)" />
        </clipPath>
      </defs>
    </svg>
  )
}

/** Логотип BAZA.sale — пальмы + название, как на baza.sale */
export function BazaSaleBrandLogo({
  className = '',
  iconClassName = 'size-7 shrink-0 sm:size-8',
  labelClassName = 'visit-premium-brand-label text-sm font-semibold sm:text-[0.9375rem]',
  showLabel = true,
  href = 'https://baza.sale',
}: BazaSaleBrandLogoProps) {
  const content = (
    <>
      <BazaSalePalmsIcon className={iconClassName} />
      {showLabel ? <span className={labelClassName}>BAZA.sale</span> : null}
    </>
  )

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`visit-premium-brand-lockup inline-flex items-center gap-1.5 ${className}`}
        aria-label="BAZA.sale"
      >
        {content}
      </a>
    )
  }

  return (
    <span className={`visit-premium-brand-lockup inline-flex items-center gap-1.5 ${className}`} aria-label="BAZA.sale">
      {content}
    </span>
  )
}
