import React from 'react'

export type ObjectSaleStatus =
  | 'for_sale'
  | 'booked'
  | 'sold'
  | 'moderation'
  | 'draft'
  | 'archived'

export type ObjectActualityState =
  | 'up_to_date'
  | 'needs_attention'
  | 'needs_update'

export interface SaleStatusBadgeProps {
  status: ObjectSaleStatus
  className?: string
}

export interface ActualityBadgeProps {
  state: ObjectActualityState
  className?: string
  onConfirm?: () => void
}

const SALE_STATUS_CONFIG: Record<
  ObjectSaleStatus,
  { label: string; bg: string; color: string; border: string }
> = {
  for_sale: {
    label: 'В продаже',
    bg: '#E8F5E9',
    color: '#1BA800',
    border: '#A5D6A7',
  },
  booked: {
    label: 'Забронировано',
    bg: '#FFF8E1',
    color: '#F57F17',
    border: '#FFE082',
  },
  sold: {
    label: 'Продано',
    bg: '#FBE9E7',
    color: '#D84315',
    border: '#FFAB91',
  },
  moderation: {
    label: 'На модерации',
    bg: '#E1F5FE',
    color: '#0288D1',
    border: '#81D4FA',
  },
  draft: {
    label: 'Черновик',
    bg: '#F5F5F5',
    color: '#616161',
    border: '#E0E0E0',
  },
  archived: {
    label: 'В архиве',
    bg: '#ECEFF1',
    color: '#546E7A',
    border: '#B0BEC5',
  },
}

/**
 * SaleStatusBadge Component (Figma: ComponentSet статус Node ID 5071:68767)
 */
export function SaleStatusBadge({ status, className = '' }: SaleStatusBadgeProps) {
  const cfg = SALE_STATUS_CONFIG[status] || SALE_STATUS_CONFIG.draft
  return (
    <span
      className={`figma-status-badge figma-status-badge--${status} ${className}`.trim()}
      style={{
        backgroundColor: cfg.bg,
        color: cfg.color,
        borderColor: cfg.border,
      }}
    >
      {cfg.label}
    </span>
  )
}

const ACTUALITY_CONFIG: Record<
  ObjectActualityState,
  { label: string; icon: string; bg: string; color: string; border: string }
> = {
  up_to_date: {
    label: 'Актуально',
    icon: '✓',
    bg: '#E8F5E9',
    color: '#1BA800',
    border: '#A5D6A7',
  },
  needs_attention: {
    label: 'Требует внимания',
    icon: '⚠',
    bg: '#FFF8E1',
    color: '#F57F17',
    border: '#FFE082',
  },
  needs_update: {
    label: 'Нужно обновить',
    icon: '↺',
    bg: '#FFEBEE',
    color: '#C62828',
    border: '#FFCDD2',
  },
}

/**
 * ActualityBadge Component (Figma: ComponentSet актуальность Node ID 5071:68749)
 */
export function ActualityBadge({
  state,
  className = '',
  onConfirm,
}: ActualityBadgeProps) {
  const cfg = ACTUALITY_CONFIG[state] || ACTUALITY_CONFIG.up_to_date
  return (
    <button
      type="button"
      onClick={onConfirm}
      disabled={!onConfirm}
      className={`figma-actuality-badge figma-actuality-badge--${state} ${className}`.trim()}
      style={{
        backgroundColor: cfg.bg,
        color: cfg.color,
        borderColor: cfg.border,
        cursor: onConfirm ? 'pointer' : 'default',
      }}
      title={onConfirm ? 'Нажмите, чтобы подтвердить актуальность' : undefined}
    >
      <span aria-hidden="true" style={{ fontWeight: 'bold' }}>
        {cfg.icon}
      </span>
      <span>{cfg.label}</span>
    </button>
  )
}
