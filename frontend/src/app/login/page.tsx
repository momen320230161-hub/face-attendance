'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, ScanFace, ShieldCheck, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/ErrorState';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Logo } from '@/components/layout/Logo';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.15C3.26 21.3 7.31 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.39l3.99-3.15z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.61l3.99 3.15c.95-2.85 3.6-4.96 6.72-4.96z"
    />
  </svg>
);

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router]);

  const getRedirectUrl = () => {
    const siteUrl =
      process.env.NEXT_PUBLIC_REDIRECT_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
    return `${siteUrl.replace(/\/$/, '')}/dashboard`;
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getRedirectUrl(),
        },
      });

      if (oauthError) {
        setError(oauthError.message);
        setGoogleLoading(false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during Google sign-in');
      setGoogleLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(signInError.message);
      } else {
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-[#0b1b33] text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 60% at 20% 20%, rgba(37,99,235,0.35), transparent 55%), radial-gradient(ellipse 50% 40% at 80% 80%, rgba(14,165,233,0.2), transparent 50%)',
          }}
        />
        <div className="relative z-10">
          <Logo href="/login" light />
        </div>

        <div className="relative z-10 max-w-lg animate-fade-up">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-sky-100 ring-1 ring-white/15">
            <Sparkles className="h-3.5 w-3.5" />
            AI-Powered Attendance System
          </p>
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight xl:text-5xl">
            FaceAttendance
          </h1>
          <p className="mt-4 text-lg text-slate-300">
            Smart attendance powered by face recognition.
          </p>
          <ul className="mt-10 space-y-4 text-sm text-slate-300">
            <li className="flex items-start gap-3">
              <ScanFace className="mt-0.5 h-5 w-5 text-sky-300" />
              Secure biometric check-in with liveness verification
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-sky-300" />
              Enterprise-grade access control for students and admins
            </li>
          </ul>
        </div>

        <p className="relative z-10 text-xs text-slate-500">
          Built for modern universities and training institutions
        </p>
      </aside>

      <main className="relative flex flex-col justify-center px-4 py-10 sm:px-8 lg:px-12 xl:px-20">
        <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
          <ThemeToggle />
        </div>

        <div className="mx-auto w-full max-w-[420px] animate-fade-up">
          <div className="mb-8 lg:hidden">
            <Logo href="/login" />
          </div>

          <div className="mb-8">
            <h2 className="font-display text-2xl font-bold text-[var(--text)]">Welcome back</h2>
            <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
              Sign in to continue to your attendance workspace
            </p>
          </div>

          {error && (
            <Alert tone="error" className="mb-5" id="login-error">
              {error}
            </Alert>
          )}

          <Button
            id="google-login-btn"
            type="button"
            variant="outline"
            fullWidth
            size="lg"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            loading={googleLoading}
            className="mb-5 border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)]"
          >
            {!googleLoading && <GoogleIcon />}
            Continue with Google
          </Button>

          <div className="relative my-6 text-center text-xs uppercase tracking-wide text-[var(--text-muted)]">
            <span className="absolute inset-x-0 top-1/2 h-px bg-[var(--border)]" />
            <span className="relative bg-[var(--bg)] px-3">or sign in with email</span>
          </div>

          <form onSubmit={handleLogin} id="login-form" className="space-y-4">
            <Input
              id="login-email"
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@university.edu"
              autoComplete="email"
              required
            />

            <div className="relative">
              <Input
                id="login-password"
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                className="pr-11"
              />
              <button
                type="button"
                className="absolute right-3 top-[34px] rounded p-1 text-[var(--text-muted)] hover:text-[var(--text)]"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <Button
              id="login-submit-btn"
              type="submit"
              fullWidth
              size="lg"
              loading={loading}
              disabled={loading || googleLoading}
            >
              Sign In
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
            Don&apos;t have an account?{' '}
            <Link
              href="/signup"
              id="link-to-signup"
              className="font-semibold text-[var(--primary)] hover:underline"
            >
              Sign Up
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
