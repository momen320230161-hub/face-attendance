'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  tone: ToastTone;
  title: string;
  message?: string;
}

interface ToastContextType {
  toast: (opts: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextType>({
  toast: () => {},
});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((opts: Omit<ToastItem, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setItems((prev) => [...prev, { ...opts, id }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const dismiss = (id: string) => setItems((prev) => prev.filter((t) => t.id !== id));

  const iconMap = {
    success: CheckCircle2,
    error: AlertCircle,
    info: Info,
  };

  const toneMap = {
    success: 'border-[var(--success-border)] bg-[var(--bg-elevated)]',
    error: 'border-[var(--danger-border)] bg-[var(--bg-elevated)]',
    info: 'border-[var(--info-border)] bg-[var(--bg-elevated)]',
  };

  const iconTone = {
    success: 'text-[var(--success)]',
    error: 'text-[var(--danger)]',
    info: 'text-[var(--info)]',
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0"
        aria-live="polite"
      >
        {items.map((item) => {
          const Icon = iconMap[item.tone];
          return (
            <div
              key={item.id}
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-[var(--radius-md)] border p-3 shadow-[var(--shadow-lg)] animate-fade-up',
                toneMap[item.tone]
              )}
            >
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', iconTone[item.tone])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--text)]">{item.title}</p>
                {item.message && (
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{item.message}</p>
                )}
              </div>
              <button
                type="button"
                className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-muted)]"
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
