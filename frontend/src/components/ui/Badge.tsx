import React from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variants: Record<BadgeVariant, string> = {
  default: 'bg-[var(--primary-soft)] text-[var(--primary)] border-[var(--primary-border)]',
  success: 'bg-[var(--success-soft)] text-[var(--success)] border-[var(--success-border)]',
  warning: 'bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning-border)]',
  danger: 'bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger-border)]',
  info: 'bg-[var(--info-soft)] text-[var(--info)] border-[var(--info-border)]',
  neutral: 'bg-[var(--bg-muted)] text-[var(--text-secondary)] border-[var(--border)]',
};

export function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function statusBadgeVariant(
  status?: string
): BadgeVariant {
  const s = (status || '').toLowerCase();
  if (s === 'present' || s === 'open' || s === 'active' || s === 'enrolled') return 'success';
  if (s === 'late') return 'warning';
  if (s === 'absent' || s === 'cancelled' || s === 'failed' || s === 'denied') return 'danger';
  if (s === 'excused' || s === 'already_marked' || s === 'closed') return 'info';
  return 'neutral';
}
