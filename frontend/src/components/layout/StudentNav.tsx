'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Camera,
  User,
  LogOut,
  Shield,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Logo } from './Logo';
import { Avatar } from './Avatar';
import { ThemeToggle } from './ThemeToggle';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const studentLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/attendance', label: 'Attendance', icon: Camera },
];

export function StudentNav() {
  const { user, profile, isAdmin, signOut, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg-elevated)]/85 backdrop-blur-xl no-print">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Logo />
            {!loading && user && (
              <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
                {studentLinks.map((link) => {
                  const Icon = link.icon;
                  const active = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text)]'
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                      {link.label}
                    </Link>
                  );
                })}
                {isAdmin && (
                  <Link
                    href="/admin"
                    id="nav-admin"
                    className="inline-flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text)]"
                  >
                    <Shield className="h-4 w-4" aria-hidden />
                    Admin
                  </Link>
                )}
              </nav>
            )}
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {!loading && user ? (
              <>
                <div className="hidden items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-muted)]/50 px-2.5 py-1.5 sm:flex">
                  <Avatar name={profile?.full_name} email={user.email} size="sm" />
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-xs font-semibold text-[var(--text)] max-w-[140px]">
                      {profile?.full_name || user.email}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                      {profile?.role || 'user'}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  id="logout-btn"
                  aria-label="Log out"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Logout</span>
                </Button>
              </>
            ) : (
              <>
                <Link href="/login" id="nav-login">
                  <Button variant="ghost" size="sm">
                    Login
                  </Button>
                </Link>
                <Link href="/signup" id="nav-signup">
                  <Button size="sm">Sign Up</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {!loading && user && (
        <nav
          className="fixed bottom-0 inset-x-0 z-50 flex border-t border-[var(--border)] bg-[var(--bg-elevated)]/95 backdrop-blur-xl md:hidden no-print"
          aria-label="Mobile"
        >
          {studentLinks.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium',
                  active ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'
                )}
              >
                <Icon className="h-5 w-5" />
                {link.label}
              </Link>
            );
          })}
          <Link
            href="/dashboard"
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium',
              pathname === '/dashboard' ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'
            )}
          >
            <User className="h-5 w-5" />
            Profile
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium',
                pathname.startsWith('/admin') ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'
              )}
            >
              <Shield className="h-5 w-5" />
              Admin
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

/** @deprecated Use StudentNav — kept as alias for existing imports */
export const Navbar = StudentNav;
