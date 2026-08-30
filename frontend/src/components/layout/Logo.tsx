import Link from 'next/link';
import { ScanFace } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogoProps {
  href?: string;
  compact?: boolean;
  className?: string;
  light?: boolean;
}

export function Logo({ href = '/dashboard', compact = false, className, light = false }: LogoProps) {
  const content = (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-[10px] shadow-[var(--shadow-sm)]',
          light
            ? 'bg-white/15 text-white ring-1 ring-white/20'
            : 'bg-[var(--primary)] text-white'
        )}
        aria-hidden
      >
        <ScanFace className="h-5 w-5" />
      </span>
      {!compact && (
        <span className="flex flex-col leading-tight">
          <span
            className={cn(
              'font-display text-[15px] font-bold tracking-tight',
              light ? 'text-white' : 'text-[var(--text)]'
            )}
          >
            FaceAttendance
          </span>
          <span className={cn('text-[11px]', light ? 'text-white/65' : 'text-[var(--text-muted)]')}>
            AI Attendance Platform
          </span>
        </span>
      )}
    </span>
  );

  if (!href) return content;
  return (
    <Link href={href} className="hover:opacity-90 transition-opacity" id="nav-brand">
      {content}
    </Link>
  );
}
