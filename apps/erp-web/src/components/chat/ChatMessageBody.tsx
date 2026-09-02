import { useMemo, useState } from 'react'
import { MapPin, X } from 'lucide-react'
import { useI18n } from "@/i18n";

const IMAGE_URL_RE =
  /https?:\/\/[^\s<>"']+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s<>"']*)?/gi

const EMBEDDED_PHOTO_LINE_RE = /^📷\s*(https?:\/\/\S+)/i

export function extractEmbeddedImageUrls(text: string): { cleanText: string; imageUrls: string[] } {
  const imageUrls: string[] = []
  const lines = text.split('\n')
  const kept: string[] = []

  for (const line of lines) {
    const photoLine = line.trim().match(EMBEDDED_PHOTO_LINE_RE)
    if (photoLine?.[1]) {
      imageUrls.push(photoLine[1])
      continue
    }

    let cleaned = line
    for (const match of line.matchAll(IMAGE_URL_RE)) {
      const url = match[0]
      if (!imageUrls.includes(url)) imageUrls.push(url)
      cleaned = cleaned.replace(url, '').trim()
    }

    if (cleaned) kept.push(cleaned)
  }

  return {
    cleanText: kept.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    imageUrls,
  }
}

function splitParagraphs(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  if (/^\d+\.\s/m.test(normalized)) {
    return normalized
      .split(/\n(?=\d+\.\s)/)
      .map((p) => p.trim())
      .filter(Boolean)
  }

  const parts = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  return parts.length ? parts : [normalized]
}

function isShowcaseCaption(text: string): boolean {
  return /^🏠\s/m.test(text.trim())
}

function ShowcaseCaption({ text }: { text: string }) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const title = lines[0]?.replace(/^🏠\s*/, '') || ''
  const body = lines.slice(1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {title ? (
        <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.35 }}>{title}</div>
      ) : null}
      {body.map((line, index) => {
        const isLocation = line.startsWith('📍')
        const isPrice = line.startsWith('💰')
        return (
          <div
            key={`${index}-${line.slice(0, 12)}`}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              fontSize: 14,
              lineHeight: 1.45,
              color: isPrice ? 'var(--chat-gold-text)' : 'var(--chat-text)',
              fontWeight: isPrice ? 600 : 400,
            }}
          >
            {isLocation ? <MapPin size={14} style={{ flexShrink: 0, marginTop: 2, opacity: 0.8 }} /> : null}
            <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {line.replace(/^[📍💰]\s*/, '')}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function ChatMessageText({
  text,
  muted = false,
}: {
  text: string
  muted?: boolean
}) {
  if (!text.trim()) return null

  if (isShowcaseCaption(text)) {
    return <ShowcaseCaption text={text} />
  }

  const paragraphs = splitParagraphs(text)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {paragraphs.map((paragraph, index) => (
        <p
          key={`p-${index}`}
          style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontStyle: muted ? 'italic' : 'normal',
            color: muted ? 'var(--chat-text-deleted)' : 'var(--chat-text)',
            paddingBottom: index < paragraphs.length - 1 ? 2 : 0,
            borderBottom:
              paragraphs.length > 1 && /^\d+\.\s/.test(paragraph) && index < paragraphs.length - 1
                ? '1px solid color-mix(in srgb, var(--chat-border) 55%, transparent)'
                : 'none',
          }}
        >
          {paragraph}
        </p>
      ))}
    </div>
  )
}

function ChatPhotoLightbox({
  url,
  onClose,
}: {
  url: string
  onClose: () => void
}) {
    const { t } = useI18n();
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <button
        type="button"
        aria-label={t('chat.chatMessageBody.закрыть')}
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          border: 'none',
          background: 'rgba(255,255,255,0.12)',
          color: '#fff',
          borderRadius: 999,
          width: 40,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <X size={20} />
      </button>
      <img
        src={url}
        alt=""
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 'min(96vw, 1100px)',
          maxHeight: '90vh',
          objectFit: 'contain',
          borderRadius: 10,
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
        }}
      />
    </div>
  )
}

export function ChatMessagePhotos({
  urls,
  resolveUrl,
}: {
  urls: string[]
  resolveUrl: (url?: string) => string | undefined
}) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const uniqueUrls = useMemo(() => [...new Set(urls.filter(Boolean))], [urls])
  if (!uniqueUrls.length) return null

  const multi = uniqueUrls.length > 1

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: multi ? 'repeat(2, minmax(0, 1fr))' : '1fr',
          gap: 6,
          width: multi ? `min(360px, ${uniqueUrls.length * 170}px)` : '100%',
          maxWidth: '100%',
        }}
      >
        {uniqueUrls.map((photoUrl, photoIndex) => {
          const src = resolveUrl(photoUrl) || photoUrl
          return (
            <button
              key={`${photoUrl}-${photoIndex}`}
              type="button"
              onClick={() => setLightboxUrl(src)}
              style={{
                display: 'block',
                padding: 0,
                border: 'none',
                background: 'var(--chat-surface-subtle)',
                borderRadius: 10,
                overflow: 'hidden',
                cursor: 'zoom-in',
                aspectRatio: multi ? '1 / 1' : '4 / 3',
                minHeight: multi ? 120 : 160,
              }}
            >
              <img
                src={src}
                alt=""
                loading="lazy"
                decoding="async"
                style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
                onError={(e) => {
                  e.currentTarget.style.objectFit = 'contain'
                  e.currentTarget.style.padding = '12px'
                }}
              />
            </button>
          )
        })}
      </div>
      {lightboxUrl ? <ChatPhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} /> : null}
    </>
  )
}

export function ChatMessageBody({
  text,
  photoUrls,
  deleted,
  unrecognized,
  resolveUrl,
}: {
  text?: string
  photoUrls: string[]
  deleted?: boolean
  unrecognized?: boolean
  resolveUrl: (url?: string) => string | undefined
}) {
  const embedded = useMemo(() => extractEmbeddedImageUrls(text || ''), [text])
  const allPhotoUrls = useMemo(
    () => [...new Set([...photoUrls, ...embedded.imageUrls])],
    [photoUrls, embedded.imageUrls]
  )
  const displayText = embedded.cleanText || (photoUrls.length ? '' : text || '')
  const muted = Boolean(deleted || unrecognized)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: allPhotoUrls.length && displayText ? 10 : 0 }}>
      {allPhotoUrls.length > 0 ? (
        <ChatMessagePhotos urls={allPhotoUrls} resolveUrl={resolveUrl} />
      ) : null}
      {displayText ? <ChatMessageText text={displayText} muted={muted} /> : null}
    </div>
  )
}
