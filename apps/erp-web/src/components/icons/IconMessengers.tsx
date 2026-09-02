interface IconProps {
  size?: number
  className?: string
}

// Брендовый значок WhatsApp (зелёный пузырь, белая трубка).
export function IconWhatsApp({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <path
        fill="#25D366"
        d="M17 0C8.7 0 2 6.7 2 15c0 3.4 1.1 6.6 3.2 9.2l-2.1 6.4c-.1.4 0 .8.3 1.1.2.2.5.3.7.3.1 0 .3 0 .4-.1l6.9-3.1C13.1 29.6 15 30 17 30c8.3 0 15-6.7 15-15S25.3 0 17 0z"
      />
      <path
        fill="#FFFFFF"
        d="M25.7 20.5c-.4 1.2-1.9 2.2-3.2 2.4-.3.1-.6.1-1 .1-.8 0-2-.2-4.1-1.1-2.4-1-4.8-3.1-6.7-5.8L10.7 16C10.1 15.1 9 13.4 9 11.6c0-2.2 1.1-3.3 1.5-3.8.5-.5 1.2-.8 2-.8.2 0 .3 0 .5 0 .7 0 1.2.2 1.7 1.2l.4.8c.3.8.7 1.7.8 1.8.3.6.3 1.1 0 1.6-.1.3-.3.5-.5.7-.1.2-.2.3-.3.3-.1.1-.1.1-.2.2.3.5.9 1.4 1.7 2.1 1.2 1.1 2.1 1.4 2.6 1.6.2-.2.4-.6.7-.9l.1-.2c.5-.7 1.3-.9 2.1-.6.4.2 2.6 1.2 2.6 1.2l.2.1c.3.2.7.3.9.7.3.4 0 1.7-.2 2.4z"
      />
    </svg>
  )
}

// Брендовый значок Telegram (синий градиентный круг, белый самолётик).
export function IconTelegram({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <circle cx="16" cy="16" r="14" fill="url(#bzTelegramGradient)" />
      <path
        fill="#FFFFFF"
        d="M22.9866 10.2088C23.1112 9.40332 22.3454 8.76755 21.6292 9.082L7.36482 15.3448C6.85123 15.5703 6.8888 16.3483 7.42147 16.5179L10.3631 17.4547C10.9246 17.6335 11.5325 17.541 12.0228 17.2023L18.655 12.6203C18.855 12.4821 19.073 12.7665 18.9021 12.9426L14.1281 17.8646C13.665 18.3421 13.7569 19.1512 14.314 19.5005L19.659 22.8523C20.2585 23.2282 21.0297 22.8506 21.1418 22.1261L22.9866 10.2088Z"
      />
      <defs>
        <linearGradient id="bzTelegramGradient" x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#37BBFE" />
          <stop offset="1" stopColor="#007DBB" />
        </linearGradient>
      </defs>
    </svg>
  )
}

// Контурный значок чата — наследует цвет через currentColor.
export function IconChat({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <path
        d="M20 12C20 16.4183 16.4183 20 12 20C10.5937 20 9.27223 19.6372 8.12398 19C7.53267 18.6719 4.48731 20.4615 3.99998 20C3.44096 19.4706 5.4583 16.6708 5.07024 16C4.38956 14.8233 3.99999 13.4571 3.99999 12C3.99999 7.58172 7.58171 4 12 4C16.4183 4 20 7.58172 20 12Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}
