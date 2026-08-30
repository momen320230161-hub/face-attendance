import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-6 py-10 text-center',
        className
      )}
      role="alert"
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--danger)]">
        <AlertCircle className="h-5 w-5" />
      </div>
      <h3 className="font-display text-base font-semibold text-[var(--text)]">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-[var(--text-secondary)]">{message}</p>
      {onRetry && (
        <Button className="mt-5" variant="outline" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  );
}

type AlertTone = 'error' | 'success' | 'warning' | 'info';

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: AlertTone;
  title?: string;
  children: React.ReactNode;
  onDismiss?: () => void;
}

const toneMap = {
  error: {
    wrap: 'bg-[var(--danger-soft)] border-[var(--danger-border)] text-[var(--danger)]',
    icon: AlertCircle,
  },
  success: {
    wrap: 'bg-[var(--success-soft)] border-[var(--success-border)] text-[var(--success)]',
    icon: CheckCircle2,
  },
  warning: {
    wrap: 'bg-[var(--warning-soft)] border-[var(--warning-border)] text-[var(--warning)]',
    icon: AlertTriangle,
  },
  info: {
    wrap: 'bg-[var(--info-soft)] border-[var(--info-border)] text-[var(--info)]',
    icon: Info,
  },
};

export function Alert({ tone = 'info', title, children, onDismiss, className, ...props }: AlertProps) {
  const cfg = toneMap[tone];
  const Icon = cfg.icon;
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-sm',
        cfg.wrap,
        className
      )}
      role={tone === 'error' ? 'alert' : 'status'}
      {...props}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold text-[var(--text)]">{title}</p>}
        <div className="text-[var(--text-secondary)]">{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
