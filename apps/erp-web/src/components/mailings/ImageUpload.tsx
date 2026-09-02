import { useRef } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useI18n } from "@/i18n";

const MAX_SIZE_MB = 5

interface ImageUploadProps {
  value: string | undefined
  onChange: (value: string | undefined) => void
  className?: string
}

export function ImageUpload({ value, onChange, className }: ImageUploadProps) {
    const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      onChange(reader.result as string)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const clear = () => onChange(undefined)

  return (
    <div className={cn('space-y-2', className)}>
      <Label className="text-base text-[color:var(--app-text-muted)]">{t('mailings.imageUpload.изображение')}</Label>
      {value ? (
        <div className="relative inline-block">
          <img
            src={value}
            alt={t('mailings.imageUpload.превью')}
            className="max-h-40 rounded-md border border-[var(--green-border)] object-contain"
          />
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute right-1 top-1 size-8 rounded-full"
            onClick={clear}
            title={t('mailings.imageUpload.удалить')}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            className="border-[var(--green-border)] bg-transparent text-[color:var(--app-text)] hover:bg-[var(--dropdown-hover)]"
          >
            <ImagePlus className="mr-2 size-4" />
            {t('mailings.imageUpload.прикрепить_изображен')}</Button>
          <span className="text-sm text-[color:var(--app-text-muted)]">{t('mailings.imageUpload.до')}{MAX_SIZE_MB} {t('mailings.imageUpload.мб')}</span>
        </div>
      )}
    </div>
  )
}
