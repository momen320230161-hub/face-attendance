import React from 'react';
import { cn, getInitials } from '@/lib/utils';

interface AvatarProps {
  name?: string | null;
  email?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'h-8 w-8 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-11 w-11 text-sm',
};

export function Avatar({ name, email, size = 'md', className }: AvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-[var(--primary-soft)] font-semibold text-[var(--primary)] ring-1 ring-[var(--primary-border)]',
        sizes[size],
        className
      )}
      aria-hidden
    >
      {getInitials(name, email)}
    </span>
  );
}
