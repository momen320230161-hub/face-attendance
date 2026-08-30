import React from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand';
  className?: string;
}

const toneStyles = {
  default: 'text-[var(--text)]',
  success: 'text-[var(--success)]',
  warning: 'text-[var(--warning)]',
  danger: 'text-[var(--danger)]',
  info: 'text-[var(--info)]',
  brand: 'text-[var(--primary)]',
};

const iconTone = {
  default: 'bg-[var(--bg-muted)] text-[var(--text-secondary)]',
  success: 'bg-[var(--success-soft)] text-[var(--success)]',
  warning: 'bg-[var(--warning-soft)] text-[var(--warning)]',
  danger: 'bg-[var(--danger-soft)] text-[var(--danger)]',
  info: 'bg-[var(--info-soft)] text-[var(--info)]',
  brand: 'bg-[var(--primary-soft)] text-[var(--primary)]',
};

export function StatCard({
  label,
  value,
  description,
  icon,
  tone = 'default',
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)] sm:p-5',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            {label}
          </p>
          <p className={cn('font-display text-2xl font-bold tracking-tight sm:text-3xl', toneStyles[tone])}>
            {value}
          </p>
          {description && (
            <p className="text-xs text-[var(--text-secondary)]">{description}</p>
          )}
        </div>
        {icon && (
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)]',
              iconTone[tone]
            )}
            aria-hidden
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
