export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A';
  return `${value.toFixed(digits)}%`;
}

export function formatSimilarity(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A';
  return value.toFixed(4);
}

export function getInitials(name?: string | null, email?: string | null): string {
  const source = (name || email || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function firstName(fullName?: string | null, email?: string | null): string {
  if (fullName?.trim()) return fullName.trim().split(/\s+/)[0];
  if (email) return email.split('@')[0];
  return 'there';
}
