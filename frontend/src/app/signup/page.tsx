'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
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

export default function SignupPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
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

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
      } else if (data.user && data.session) {
        router.push('/dashboard');
      } else {
        setSuccessMsg(
          'Account created successfully! Please check your email to confirm your registration before logging in.'
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred during sign up');
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
          <Logo href="/signup" light />
        </div>
        <div className="relative z-10 max-w-lg">
          <h1 className="font-display text-4xl font-bold tracking-tight">Create your account</h1>
          <p className="mt-4 text-lg text-slate-300">
            Join FaceAttendance and start using secure AI-powered check-in.
          </p>
        </div>
        <p className="relative z-10 text-xs text-slate-500">Trusted biometric attendance platform</p>
      </aside>

      <main className="relative flex flex-col justify-center px-4 py-10 sm:px-8 lg:px-12 xl:px-20">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>

        <div className="mx-auto w-full max-w-[420px] animate-fade-up">
          <div className="mb-8 lg:hidden">
            <Logo href="/signup" />
          </div>

          <div className="mb-8">
            <h2 className="font-display text-2xl font-bold text-[var(--text)]">Create Account</h2>
            <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
              Sign up for a new student or staff account
            </p>
          </div>

          {error && (
            <Alert tone="error" className="mb-5" id="signup-error">
              {error}
            </Alert>
          )}
          {successMsg && (
            <Alert tone="success" className="mb-5" id="signup-success">
              {successMsg}
            </Alert>
          )}

          <Button
            id="google-signup-btn"
            type="button"
            variant="outline"
            fullWidth
            size="lg"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            loading={googleLoading}
            className="mb-5"
          >
            {!googleLoading && <GoogleIcon />}
            Continue with Google
          </Button>

          <div className="relative my-6 text-center text-xs uppercase tracking-wide text-[var(--text-muted)]">
            <span className="absolute inset-x-0 top-1/2 h-px bg-[var(--border)]" />
            <span className="relative bg-[var(--bg)] px-3">or sign up with email</span>
          </div>

          <form onSubmit={handleSignup} id="signup-form" className="space-y-4">
            <Input
              id="signup-name"
              label="Full Name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
              required
            />
            <Input
              id="signup-email"
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@university.edu"
              required
            />
            <div className="relative">
              <Input
                id="signup-password"
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
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
            <Input
              id="signup-confirm-password"
              label="Confirm Password"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            <Button
              id="signup-submit-btn"
              type="submit"
              fullWidth
              size="lg"
              loading={loading}
              disabled={loading || googleLoading}
            >
              Create Account
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
            Already have an account?{' '}
            <Link
              href="/login"
              id="link-to-login"
              className="font-semibold text-[var(--primary)] hover:underline"
            >
              Sign In
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
