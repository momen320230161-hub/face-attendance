'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Info,
  RefreshCw,
  ScanFace,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Navbar } from '@/components/Navbar';
import { AttendanceCamera, AttendanceCameraRef } from '@/components/attendance/AttendanceCamera';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Select,
  Input,
} from '@/components/ui';
import { formatSimilarity } from '@/lib/utils';

interface SessionItem {
  id: string;
  course_id: string;
  session_date: string;
  status: string;
  topic?: string;
  courses?: {
    course_name: string;
    course_code: string;
  };
}

interface RecognitionResult {
  matched: boolean;
  student_id?: string;
  similarity?: number;
  attendance_record_id?: string;
  status?: string;
  detail?: string;
}

export default function AttendancePage() {
  const { session, loading } = useAuth();
  const router = useRouter();

  const cameraRef = useRef<AttendanceCameraRef | null>(null);

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [fetchingSessions, setFetchingSessions] = useState(true);

  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  useEffect(() => {
    if (!loading && !session) {
      router.push('/login');
    }
  }, [session, loading, router]);

  useEffect(() => {
    const fetchOpenSessions = async () => {
      if (!session?.access_token) return;
      try {
        setFetchingSessions(true);
        const res = await fetch(`${API_URL}/api/v1/attendance/sessions`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          const openList = Array.isArray(data)
            ? data.filter((s: SessionItem) => s.status === 'open')
            : [];
          setSessions(openList);
          if (openList.length > 0) {
            setSelectedSessionId(openList[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch attendance sessions:', err);
      } finally {
        setFetchingSessions(false);
      }
    };

    if (session) {
      fetchOpenSessions();
    }
  }, [session, API_URL]);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  const handleCapture = async (blob: Blob) => {
    if (!selectedSessionId) {
      setErrorMessage('Please select an active attendance session first.');
      return;
    }

    if (!session?.access_token) {
      setErrorMessage('Authentication session expired. Please sign in again.');
      return;
    }

    try {
      setIsProcessing(true);
      setResult(null);
      setErrorMessage(null);

      const formData = new FormData();
      formData.append('session_id', selectedSessionId);
      formData.append('image', blob, 'webcam_frame.jpg');

      const res = await fetch(`${API_URL}/api/v1/recognition/recognize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setResult(data);
      } else if (res.status === 400) {
        setErrorMessage(data.detail || 'The selected attendance session is closed or invalid.');
      } else if (res.status === 403) {
        setErrorMessage(
          data.detail || 'You are not enrolled in this course or authorized for this session.'
        );
      } else if (res.status === 422) {
        setErrorMessage(
          data.detail || 'Face validation failed. Ensure exactly one face is clearly visible.'
        );
      } else {
        setErrorMessage(data.detail || 'An unexpected error occurred during attendance check-in.');
      }
    } catch {
      setErrorMessage('Network error connecting to recognition service. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetResult = () => {
    setResult(null);
    setErrorMessage(null);
    cameraRef.current?.resetLiveness();
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-[var(--text-secondary)]">
          Loading session...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <Navbar />

      <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        <PageHeader
          title="Face Verification"
          description="Complete liveness, then verify your identity to record attendance."
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>Active Session</CardTitle>
                <CardDescription>
                  {fetchingSessions
                    ? 'Loading open sessions…'
                    : 'Select the session you are checking into'}
                </CardDescription>
              </CardHeader>
              {sessions.length > 0 ? (
                <Select
                  id="session-select"
                  label="Open session"
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  disabled={isProcessing}
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.courses?.course_name
                        ? `${s.courses.course_name} (${s.courses.course_code})`
                        : `Session: ${s.id.slice(0, 8)}`}{' '}
                      — {s.session_date}
                    </option>
                  ))}
                </Select>
              ) : (
                <div className="space-y-3">
                  <EmptyState
                    className="py-8"
                    icon={<ScanFace className="h-5 w-5" />}
                    title="No open sessions"
                    description="Ask your instructor for the active session ID, or enter it below."
                  />
                  <Input
                    id="manual-session-input"
                    label="Session ID (UUID)"
                    type="text"
                    value={selectedSessionId}
                    onChange={(e) => setSelectedSessionId(e.target.value)}
                    placeholder="Enter active session ID..."
                    disabled={isProcessing}
                  />
                </div>
              )}
            </Card>

            <AttendanceCamera
              ref={cameraRef}
              onCapture={handleCapture}
              isProcessing={isProcessing}
            />
          </div>

          <div className="space-y-4 lg:col-span-2">
            <Card className="sticky top-20">
              <CardHeader>
                <CardTitle>Attendance Status</CardTitle>
                <CardDescription>Live verification progress</CardDescription>
              </CardHeader>

              <ol className="mb-5 space-y-3">
                {[
                  { label: 'Camera', done: true },
                  { label: 'Liveness', done: !!result || isProcessing },
                  { label: 'Recognition', done: !!result },
                  { label: 'Attendance', done: !!(result?.matched && result.status !== undefined) },
                ].map((step, i) => (
                  <li key={step.label} className="flex items-center gap-3 text-sm">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${step.done
                        ? 'bg-[var(--success-soft)] text-[var(--success)]'
                        : 'bg-[var(--bg-muted)] text-[var(--text-muted)]'
                        }`}
                    >
                      {step.done ? '✓' : i + 1}
                    </span>
                    <span className={step.done ? 'text-[var(--text)] font-medium' : 'text-[var(--text-secondary)]'}>
                      {step.label}
                    </span>
                  </li>
                ))}
              </ol>

              {selectedSession && (
                <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-muted)]/50 p-3 text-sm">
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Course</p>
                  <p className="mt-1 font-semibold text-[var(--text)]">
                    {selectedSession.courses?.course_name || 'Selected session'}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {selectedSession.courses?.course_code || selectedSession.id.slice(0, 8)} ·{' '}
                    {selectedSession.session_date}
                  </p>
                </div>
              )}

              {errorMessage && (
                <Alert tone="error" title="Check-in failed" className="mb-4">
                  {errorMessage}
                </Alert>
              )}

              {result?.matched && result.status === 'present' && (
                <div className="rounded-[var(--radius-lg)] border border-[var(--success-border)] bg-[var(--success-soft)] p-5 text-center animate-fade-up">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--success)] shadow-[var(--shadow-sm)]">
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                  <h3 className="font-display text-lg font-bold text-[var(--text)]">
                    Attendance Recorded
                  </h3>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    Your identity was verified successfully.
                  </p>
                  <dl className="mt-4 space-y-2 text-left text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--text-muted)]">Course</dt>
                      <dd className="font-medium text-[var(--text)]">
                        {selectedSession?.courses?.course_code || 'N/A'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--text-muted)]">Time</dt>
                      <dd className="font-medium text-[var(--text)]">
                        {new Date().toLocaleTimeString()}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--text-muted)]">Similarity</dt>
                      <dd className="font-mono font-medium text-[var(--primary)]">
                        {formatSimilarity(result.similarity)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--text-muted)]">Status</dt>
                      <dd>
                        <Badge variant="success">Present</Badge>
                      </dd>
                    </div>
                  </dl>
                </div>
              )}

              {result?.matched && result.status === 'already_marked' && (
                <div className="rounded-[var(--radius-lg)] border border-[var(--info-border)] bg-[var(--info-soft)] p-5 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--info)]">
                    <Info className="h-6 w-6" />
                  </div>
                  <h3 className="font-display text-base font-bold text-[var(--text)]">
                    Attendance Already Recorded
                  </h3>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    You have already checked in for this session.
                  </p>
                </div>
              )}

              {result && !result.matched && (
                <div className="rounded-[var(--radius-lg)] border border-[var(--warning-border)] bg-[var(--warning-soft)] p-5 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--warning)]">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <h3 className="font-display text-base font-bold text-[var(--text)]">
                    Face Not Recognized
                  </h3>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    No matching enrolled student was found. Ensure your face is registered, then retry.
                  </p>
                  <Button className="mt-4" variant="outline" onClick={resetResult}>
                    <RefreshCw className="h-4 w-4" />
                    Try Again
                  </Button>
                </div>
              )}

              {!result && !errorMessage && (
                <p className="text-sm text-[var(--text-secondary)]">
                  Position your face inside the frame, complete the liveness challenge, then verify.
                </p>
              )}

              {(result || errorMessage) && result?.matched && (
                <Button className="mt-4" variant="outline" fullWidth onClick={resetResult}>
                  <RefreshCw className="h-4 w-4" />
                  New Verification
                </Button>
              )}
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
