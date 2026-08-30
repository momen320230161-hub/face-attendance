'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  BookOpen,
  Users,
  ScanFace,
  CalendarClock,
  ClipboardList,
  BarChart3,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Logo } from './Logo';
import { Avatar } from './Avatar';
import { ThemeToggle } from './ThemeToggle';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export type AdminSection =
  | 'overview'
  | 'courses'
  | 'students'
  | 'face-enrollment'
  | 'sessions'
  | 'records'
  | 'analytics';

const navItems: Array<{ id: AdminSection; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'courses', label: 'Courses', icon: BookOpen },
  { id: 'students', label: 'Enrollments', icon: Users },
  { id: 'face-enrollment', label: 'Face Registration', icon: ScanFace },
  { id: 'sessions', label: 'Attendance Sessions', icon: CalendarClock },
  { id: 'records', label: 'Attendance Records', icon: ClipboardList },
  { id: 'analytics', label: 'Analytics & Reports', icon: BarChart3 },
];

interface AdminSidebarProps {
  active: AdminSection;
  onChange: (section: AdminSection) => void;
}

export function AdminSidebar({ active, onChange }: AdminSidebarProps) {
  const { user, profile, signOut } = useAuth();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

  const NavContent = (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 px-5 py-5">
        <Logo href="/admin" light />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Admin">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onChange(item.id);
                setMobileOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[var(--sidebar-active)] text-white'
                  : 'text-[var(--sidebar-text)] hover:bg-white/5 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Avatar name={profile?.full_name} email={user?.email} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {profile?.full_name || user?.email || 'Admin'}
            </p>
            <p className="text-[11px] text-slate-400">Administrator</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/dashboard" className="flex-1">
            <Button variant="outline" size="sm" fullWidth className="border-white/15 text-slate-200 hover:bg-white/5">
              Student View
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            aria-label="Log out"
            className="text-slate-300 hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r border-[var(--border)] bg-[var(--sidebar)] lg:block no-print">
        {NavContent}
      </aside>

      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 lg:hidden no-print">
        <Logo href="/admin" compact />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden no-print">
          <button
            type="button"
            className="absolute inset-0 bg-[var(--overlay)]"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 bg-[var(--sidebar)] shadow-[var(--shadow-lg)]">
            <button
              type="button"
              className="absolute right-3 top-4 rounded p-2 text-slate-300 hover:bg-white/5"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            {NavContent}
          </div>
        </div>
      )}
    </>
  );
}

export { navItems as adminNavItems };
