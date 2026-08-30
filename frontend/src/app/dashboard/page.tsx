'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Camera,
  CheckCircle2,
  Clock3,
  Percent,
  UserX,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Navbar } from '@/components/Navbar';
import {
  Badge,
  statusBadgeVariant,
  Button,
  Card,
  CardSkeleton,
  EmptyState,
  ErrorState,
  PageHeader,
  SectionHeader,
  StatCard,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from '@/components/ui';
import { ApiError, apiRequest } from '@/lib/api';
import { firstName, formatPercent, formatSimilarity } from '@/lib/utils';

interface Course {
  id: string;
  code: string;
  name: string;
  description?: string;
}

interface AttendanceSession {
  id: string;
  course_id: string;
  started_at: string;
  status: string;
}

interface AttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  status: 'present' | 'late' | 'absent' | 'excused';
  recognized_at?: string;
  created_at: string;
  similarity?: number;
  recognition_source: string;
}

export default function DashboardPage() {
  const { user, profile, session, loading, isAdmin } = useAuth();
  const router = useRouter();

  const [courses, setCourses] = useState<Course[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [myRecords, setMyRecords] = useState<AttendanceRecord[]>([]);
  const [fetchingData, setFetchingData] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  const accessToken = session?.access_token;

  const fetchStudentData = useCallback(async () => {
    if (!accessToken) return;

    try {
      const [cData, rData, sData] = await Promise.all([
        apiRequest<Course[]>('/api/v1/courses', { token: accessToken }),
        apiRequest<AttendanceRecord[]>('/api/v1/attendance/my-records', {
          token: accessToken,
        }),
        apiRequest<AttendanceSession[]>('/api/v1/attendance/sessions', {
          token: accessToken,
        }),
      ]);

      setCourses(Array.isArray(cData) ? cData : []);
      setMyRecords(Array.isArray(rData) ? rData : []);
      setSessions(Array.isArray(sData) ? sData : []);
      setErrorMessage(null);
    } catch (err) {
      console.error('Error fetching student dashboard data:', err);
      setErrorMessage(
        err instanceof ApiError
          ? err.message
          : 'Failed to load attendance dashboard data.'
      );
    } finally {
      setFetchingData(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !user) return;
    const task = window.setTimeout(() => {
      void fetchStudentData();
    }, 0);
    return () => window.clearTimeout(task);
  }, [accessToken, user, fetchStudentData]);

  const handleRetry = () => {
    setFetchingData(true);
    void fetchStudentData();
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 p-6 sm:grid-cols-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  const totalPresent = myRecords.filter((r) => r.status === 'present').length;
  const totalLate = myRecords.filter((r) => r.status === 'late').length;
  const totalAbsent = myRecords.filter((r) => r.status === 'absent').length;
  const totalLogs = myRecords.length;
  const attendanceRate =
    totalLogs > 0 ? ((totalPresent + totalLate) / totalLogs) * 100 : null;

  const courseById = new Map(courses.map((c) => [c.id, c]));
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  const resolveCourseLabel = (record: AttendanceRecord) => {
    const sess = sessionById.get(record.session_id);
    if (sess) {
      const course = courseById.get(sess.course_id);
      if (course) return course.code;
    }
    return `Session ${record.session_id.slice(0, 8)}…`;
  };

  const name = firstName(profile?.full_name, user.email);

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <Navbar />

      <main className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
        <PageHeader
          title={`Welcome back, ${name} 👋`}
          description="Here's an overview of your attendance and enrolled courses."
          actions={
            <>
              <Button onClick={() => router.push('/attendance')}>
                <Camera className="h-4 w-4" />
                Check In
              </Button>
              {isAdmin && (
                <Button variant="outline" onClick={() => router.push('/admin')}>
                  Admin Panel
                </Button>
              )}
            </>
          }
        />

        {errorMessage && <ErrorState message={errorMessage} onRetry={handleRetry} />}

        {fetchingData ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 animate-fade-up sm:grid-cols-4">
            <StatCard
              label="Attendance Rate"
              value={attendanceRate === null ? 'N/A' : formatPercent(attendanceRate)}
              description={totalLogs === 0 ? 'No records yet' : `Based on ${totalLogs} records`}
              icon={<Percent className="h-5 w-5" />}
              tone="brand"
            />
            <StatCard
              label="Present"
              value={totalPresent}
              description="On-time check-ins"
              icon={<CheckCircle2 className="h-5 w-5" />}
              tone="success"
            />
            <StatCard
              label="Late"
              value={totalLate}
              description="Late arrivals"
              icon={<Clock3 className="h-5 w-5" />}
              tone="warning"
            />
            <StatCard
              label="Absent"
              value={totalAbsent}
              description="Missed sessions"
              icon={<UserX className="h-5 w-5" />}
              tone="danger"
            />
          </div>
        )}

        <section>
          <SectionHeader
            title="My Courses"
            description={`${courses.length} enrolled course${courses.length === 1 ? '' : 's'}`}
          />
          {courses.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-5 w-5" />}
              title="No courses yet"
              description="You are not enrolled in any courses. Contact your instructor if this looks incorrect."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {courses.map((c) => (
                <Card
                  key={c.id}
                  className="flex flex-col transition-shadow hover:shadow-[var(--shadow-md)]"
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <span className="font-display text-sm font-bold text-[var(--primary)]">
                      {c.code}
                    </span>
                    <Badge variant="success">Enrolled</Badge>
                  </div>
                  <h3 className="font-display text-base font-semibold text-[var(--text)]">
                    {c.name}
                  </h3>
                  {c.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-[var(--text-secondary)]">
                      {c.description}
                    </p>
                  )}
                  <div className="mt-auto pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      fullWidth
                      onClick={() => router.push('/attendance')}
                    >
                      View Attendance
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionHeader title="Recent Attendance" description="Your latest recognition events" />
          {myRecords.length === 0 ? (
            <EmptyState
              icon={<Camera className="h-5 w-5" />}
              title="No attendance records"
              description="When you check in to a session, your records will appear here."
              actionLabel="Go to Check-In"
              onAction={() => router.push('/attendance')}
            />
          ) : (
            <Card padding="none" className="overflow-hidden print-surface">
              <Table>
                <THead>
                  <tr>
                    <TH>Course</TH>
                    <TH>Date</TH>
                    <TH>Status</TH>
                    <TH>Similarity</TH>
                    <TH>Recognition Source</TH>
                  </tr>
                </THead>
                <TBody>
                  {myRecords.slice(0, 20).map((r) => (
                    <TR key={r.id}>
                      <TD className="font-medium text-[var(--text)]">{resolveCourseLabel(r)}</TD>
                      <TD>{new Date(r.recognized_at || r.created_at).toLocaleString()}</TD>
                      <TD>
                        <Badge variant={statusBadgeVariant(r.status)}>{r.status}</Badge>
                      </TD>
                      <TD className="font-mono text-[var(--primary)]">
                        {formatSimilarity(r.similarity)}
                      </TD>
                      <TD>{r.recognition_source || 'N/A'}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
        </section>
      </main>
    </div>
  );
}
