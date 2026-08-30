import React from 'react';
import { cn } from '@/lib/utils';

export function Table({
  className,
  children,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="table-scroll rounded-[var(--radius-md)] border border-[var(--border)]">
      <table className={cn('w-full text-left text-sm', className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className="bg-[var(--bg-muted)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]" {...props}>
      {children}
    </thead>
  );
}

export function TBody({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className="divide-y divide-[var(--border)]" {...props}>{children}</tbody>;
}

export function TR({ className, children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('transition-colors hover:bg-[var(--bg-muted)]/60', className)} {...props}>
      {children}
    </tr>
  );
}

export function TH({ className, children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn('px-3.5 py-3 whitespace-nowrap', className)} {...props}>
      {children}
    </th>
  );
}

export function TD({ className, children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-3.5 py-3 text-[var(--text-secondary)] whitespace-nowrap', className)} {...props}>
      {children}
    </td>
  );
}
