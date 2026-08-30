'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  CalendarClock,
  ClipboardList,
  Download,
  GraduationCap,
  Pencil,
  Percent,
  Plus,
  Printer,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Upload,
  UserCheck,
  Users,
  Video,
  BarChart3,
  ScanFace,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Navbar } from '@/components/Navbar';
import { AdminSidebar, type AdminSection } from '@/components/layout/AdminSidebar';
import { Avatar } from '@/components/layout/Avatar';
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
  ErrorState,
  Input,
  Modal,
  PageHeader,
  PageLoadingState,
  SectionHeader,
  Select,
  StatCard,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Tabs,
  TextArea,
  statusBadgeVariant,
  useToast,
} from '@/components/ui';
import { ApiError, apiDownload, apiRequest } from '@/lib/api';
import { formatPercent, formatSimilarity } from '@/lib/utils';

interface Course {
  id: string;
  code: string;
  name: string;
  description?: string;
  created_at: string;
}

interface StudentProfile {
  id: string;
  full_name?: string;
  email?: string;
  role: string;
}

interface AttendanceSession {
  id: string;
  course_id: string;
  started_at: string;
  ended_at?: string;
  status: 'open' | 'closed' | 'cancelled';
  created_at: string;
}

interface AttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  status: 'present' | 'late' | 'absent' | 'excused';
  recognized_at: string;
  confidence?: number;
  similarity?: number;
  recognition_source: string;
}

interface ReportRecord {
  id: string;
  session_id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  course_id: string;
  course_code: string;
  course_name: string;
  session_date: string;
  status: string;
  similarity?: number;
  confidence?: number;
  recognition_source: string;
  recognized_at?: string;
  created_at?: string;
}

interface AnalyticsSummary {
  total_courses: number;
  total_students: number;
  total_enrollments: number;
  total_sessions: number;
  open_sessions: number;
  closed_sessions: number;
  total_records: number;
  present_count: number;
  late_count: number;
  absent_count: number;
  excused_count: number;
  attendance_rate: number;
  face_recognition_count: number;
  manual_count: number;
  system_count: number;
  average_similarity?: number;
  min_similarity?: number;
  max_similarity?: number;
}

type DateFilterType = 'all' | 'today' | '7days' | '30days' | 'custom';

const sectionMeta: Record<
  AdminSection,
  { title: string; description: string }
> = {
  overview: {
    title: 'Overview',
    description: 'System-wide metrics and quick insights.',
  },
  courses: {
    title: 'Courses',
    description: 'Manage courses and enrollment.',
  },
  students: {
    title: 'Enrollments',
    description: 'Assign students to courses and manage roster.',
  },
  'face-enrollment': {
    title: 'Face Registration',
    description: 'Register student faces for biometric attendance.',
  },
  sessions: {
    title: 'Attendance Sessions',
    description: 'Start and close live attendance sessions.',
  },
  records: {
    title: 'Attendance Records',
    description: 'Review recognition results for a session.',
  },
  analytics: {
    title: 'Analytics & Reports',
    description: 'Attendance trends, similarity metrics, and exports.',
  },
};

function formatDate(value?: string | null): string {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toLocaleString();
}

function truncateId(id: string, len = 8): string {
  return id.length > len ? `${id.slice(0, len)}…` : id;
}

function studentOptionLabel(s: StudentProfile): string {
  const name = s.full_name?.trim() || 'Unnamed';
  const email = s.email?.trim() || 'no email';
  return `${name} · ${email} (${s.role})`;
}

export default function AdminDashboardPage() {
  const { user, profile, session, loading, isAdmin } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [activeSection, setActiveSection] = useState<AdminSection>('overview');

  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);

  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [reportRecords, setReportRecords] = useState<ReportRecord[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilterType>('all');
  const [startDateFilter, setStartDateFilter] = useState<string>('');
  const [endDateFilter, setEndDateFilter] = useState<string>('');
  const [analyticsCourseFilter, setAnalyticsCourseFilter] = useState<string>('');
  const [analyticsStudentFilter, setAnalyticsStudentFilter] = useState<string>('');
  const [analyticsStatusFilter, setAnalyticsStatusFilter] = useState<string>('');

  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [courseStudents, setCourseStudents] = useState<StudentProfile[]>([]);
  const [sessionRosterCount, setSessionRosterCount] = useState<number | null>(null);

  const [dataLoading, setDataLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [courseCode, setCourseCode] = useState<string>('');
  const [courseName, setCourseName] = useState<string>('');
  const [courseDesc, setCourseDesc] = useState<string>('');
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [deleteCourseId, setDeleteCourseId] = useState<string | null>(null);
  const [closeSessionId, setCloseSessionId] = useState<string | null>(null);

  const [enrollStudentId, setEnrollStudentId] = useState<string>('');

  const [faceStudentId, setFaceStudentId] = useState<string>('');
  const [enrollMode, setEnrollMode] = useState<'file' | 'webcam'>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [faceProcessingStep, setFaceProcessingStep] = useState<
    null | 'detecting' | 'embedding' | 'complete'
  >(null);
  const [faceRegistered, setFaceRegistered] = useState(false);
  const cameraRef = useRef<AttendanceCameraRef | null>(null);

  const showSuccess = useCallback(
    (title: string) => {
      setSuccessMsg(title);
      toast({ tone: 'success', title });
    },
    [toast]
  );

  const showError = useCallback(
    (message: string) => {
      setErrorMsg(message);
      toast({ tone: 'error', title: message });
    },
    [toast]
  );

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  const accessToken = session?.access_token;

  const buildReportParams = useCallback(
    (includeRecordFilters = true) => {
      const params = new URLSearchParams();
      if (analyticsCourseFilter) params.append('course_id', analyticsCourseFilter);
      if (includeRecordFilters && analyticsStudentFilter) {
        params.append('student_id', analyticsStudentFilter);
      }
      if (includeRecordFilters && analyticsStatusFilter) {
        params.append('status', analyticsStatusFilter);
      }

      const now = new Date();
      if (dateFilter === 'today') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        params.append('start_date', start.toISOString());
      } else if (dateFilter === '7days') {
        const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        params.append('start_date', start.toISOString());
      } else if (dateFilter === '30days') {
        const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        params.append('start_date', start.toISOString());
      } else if (dateFilter === 'custom') {
        if (startDateFilter) params.append('start_date', new Date(startDateFilter).toISOString());
        if (endDateFilter) params.append('end_date', new Date(endDateFilter).toISOString());
      }

      return params;
    },
    [
      analyticsCourseFilter,
      analyticsStudentFilter,
      analyticsStatusFilter,
      dateFilter,
      startDateFilter,
      endDateFilter,
    ]
  );

  const fetchAnalyticsAndReports = useCallback(async () => {
    if (!accessToken) return;
    try {
      const summaryParams = buildReportParams(false);
      const reportParams = buildReportParams(true);
      const summaryQs = summaryParams.toString() ? `?${summaryParams.toString()}` : '';
      const reportQs = reportParams.toString() ? `?${reportParams.toString()}` : '';

      const [summaryResult, reportResult] = await Promise.allSettled([
        apiRequest<AnalyticsSummary>(`/api/v1/reports/analytics/summary${summaryQs}`, {
          token: accessToken,
        }),
        apiRequest<ReportRecord[]>(`/api/v1/reports/attendance${reportQs}`, {
          token: accessToken,
        }),
      ]);

      if (summaryResult.status === 'fulfilled') {
        setAnalytics(summaryResult.value);
      }
      if (reportResult.status === 'fulfilled') {
        setReportRecords(Array.isArray(reportResult.value) ? reportResult.value : []);
      }

      const failed = [summaryResult, reportResult].find(
        (result): result is PromiseRejectedResult => result.status === 'rejected'
      );
      if (failed) {
        const err = failed.reason;
        console.error('Error fetching analytics:', err);
        if (err instanceof ApiError) {
          showError(err.message);
        } else {
          showError('Failed to load analytics data.');
        }
      }
    } catch (err) {
      console.error('Error fetching analytics:', err);
      if (err instanceof ApiError) {
        showError(err.message);
      }
    }
  }, [accessToken, buildReportParams, showError]);

  const fetchAllData = useCallback(
    async (options?: { showLoading?: boolean; clearError?: boolean }) => {
      if (!accessToken) return;
      try {
        if (options?.showLoading) setDataLoading(true);
        if (options?.clearError) setErrorMsg(null);

        const results = await Promise.allSettled([
          apiRequest<Course[]>('/api/v1/courses', { token: accessToken }),
          apiRequest<StudentProfile[]>('/api/v1/admin/students', { token: accessToken }),
          apiRequest<AttendanceSession[]>('/api/v1/attendance/sessions', {
            token: accessToken,
          }),
        ]);

        const [coursesResult, studentsResult, sessionsResult] = results;
        if (coursesResult.status === 'fulfilled' && Array.isArray(coursesResult.value)) {
          const coursesList = coursesResult.value;
          setCourses(coursesList);
          setSelectedCourseId((prev) =>
            prev && coursesList.some((c) => c.id === prev) ? prev : coursesList[0]?.id || ''
          );
        }
        if (studentsResult.status === 'fulfilled' && Array.isArray(studentsResult.value)) {
          const studentsList = studentsResult.value;
          setStudents(studentsList);
          setFaceStudentId((prev) =>
            prev && studentsList.some((s) => s.id === prev) ? prev : studentsList[0]?.id || ''
          );
        }
        if (sessionsResult.status === 'fulfilled' && Array.isArray(sessionsResult.value)) {
          const sessionsList = sessionsResult.value;
          setSessions(sessionsList);
          setSelectedSessionId((prev) =>
            prev && sessionsList.some((s) => s.id === prev) ? prev : sessionsList[0]?.id || ''
          );
        }

        const failed = results.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected'
        );
        if (failed) {
          const failedIndex = results.indexOf(failed);
          const failedPath = [
            '/api/v1/courses',
            '/api/v1/admin/students',
            '/api/v1/attendance/sessions',
          ][failedIndex];
          console.error(`Failed to fetch ${failedPath}:`, failed.reason);
          showError(
            failed.reason instanceof ApiError
              ? `${failedPath}: ${failed.reason.message}`
              : `Failed to fetch ${failedPath}.`
          );
        }
      } catch (err) {
        console.error('Failed to fetch admin data:', err);
        showError(
          err instanceof ApiError ? err.message : 'Network error fetching dashboard data'
        );
      } finally {
        setDataLoading(false);
      }
    },
    [accessToken, showError]
  );

  const fetchCourseStudents = useCallback(
    async (courseId: string) => {
      if (!accessToken || !courseId) return;
      try {
        const data = await apiRequest<StudentProfile[]>(
          `/api/v1/courses/${courseId}/students`,
          { token: accessToken }
        );
        setCourseStudents(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Error fetching course students:', err);
        if (err instanceof ApiError) showError(err.message);
      }
    },
    [accessToken, showError]
  );

  const fetchSessionRecords = useCallback(
    async (sessionId: string) => {
      if (!accessToken || !sessionId) return;
      try {
        const data = await apiRequest<AttendanceRecord[]>(
          `/api/v1/attendance/sessions/${sessionId}/records`,
          { token: accessToken }
        );
        setRecords(Array.isArray(data) ? data : []);

        const sess = sessions.find((s) => s.id === sessionId);
        if (sess?.course_id) {
          try {
            const roster = await apiRequest<StudentProfile[]>(
              `/api/v1/courses/${sess.course_id}/students`,
              { token: accessToken }
            );
            setSessionRosterCount(Array.isArray(roster) ? roster.length : null);
          } catch {
            setSessionRosterCount(null);
          }
        } else {
          setSessionRosterCount(null);
        }
      } catch (err) {
        console.error('Error fetching session records:', err);
        setRecords([]);
        if (err instanceof ApiError) showError(err.message);
      }
    },
    [accessToken, sessions, showError]
  );

  useEffect(() => {
    if (!accessToken || !isAdmin) return;
    const task = window.setTimeout(() => {
      void fetchAllData();
    }, 0);
    return () => window.clearTimeout(task);
  }, [accessToken, isAdmin, fetchAllData]);

  useEffect(() => {
    if (!accessToken || !isAdmin) return;
    if (activeSection !== 'analytics' && activeSection !== 'overview') return;
    const task = window.setTimeout(() => {
      void fetchAnalyticsAndReports();
    }, 0);
    return () => window.clearTimeout(task);
  }, [accessToken, isAdmin, activeSection, fetchAnalyticsAndReports]);

  useEffect(() => {
    if (!selectedCourseId) return;
    const task = window.setTimeout(() => {
      void fetchCourseStudents(selectedCourseId);
    }, 0);
    return () => window.clearTimeout(task);
  }, [selectedCourseId, fetchCourseStudents]);

  useEffect(() => {
    if (!selectedSessionId) return;
    const task = window.setTimeout(() => {
      void fetchSessionRecords(selectedSessionId);
    }, 0);
    return () => window.clearTimeout(task);
  }, [selectedSessionId, fetchSessionRecords]);

  const resetCourseForm = () => {
    setCourseCode('');
    setCourseName('');
    setCourseDesc('');
    setEditingCourseId(null);
  };

  const openCreateCourseModal = () => {
    resetCourseForm();
    setCourseModalOpen(true);
  };

  const openEditCourseModal = (course: Course) => {
    setEditingCourseId(course.id);
    setCourseCode(course.code);
    setCourseName(course.name);
    setCourseDesc(course.description || '');
    setCourseModalOpen(true);
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseCode.trim() || !courseName.trim() || !session?.access_token) return;

    try {
      setActionLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const payload = {
        code: courseCode.trim().toUpperCase(),
        name: courseName.trim(),
        description: courseDesc.trim() || null,
      };

      if (editingCourseId) {
        await apiRequest(`/api/v1/courses/${editingCourseId}`, {
          method: 'PATCH',
          token: session.access_token,
          body: payload,
        });
        showSuccess('Course updated successfully');
      } else {
        await apiRequest('/api/v1/courses', {
          method: 'POST',
          token: session.access_token,
          body: payload,
        });
        showSuccess('Course created successfully');
      }

      resetCourseForm();
      setCourseModalOpen(false);
      await fetchAllData();
      await fetchAnalyticsAndReports();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Network error saving course');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    if (!session?.access_token) return;
    try {
      setActionLoading(true);
      await apiRequest(`/api/v1/courses/${courseId}`, {
        method: 'DELETE',
        token: session.access_token,
      });
      showSuccess('Course deleted successfully');
      setDeleteCourseId(null);
      await fetchAllData();
      await fetchAnalyticsAndReports();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Network error deleting course');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEnrollStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId || !enrollStudentId || !session?.access_token) return;

    try {
      setActionLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      await apiRequest(`/api/v1/courses/${selectedCourseId}/enrollments`, {
        method: 'POST',
        token: session.access_token,
        body: { student_id: enrollStudentId },
      });

      showSuccess('Student enrolled successfully');
      setEnrollStudentId('');
      await fetchCourseStudents(selectedCourseId);
      await fetchAnalyticsAndReports();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Network error enrolling student');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveEnrollment = async (studentId: string) => {
    if (!selectedCourseId || !session?.access_token) return;
    try {
      setActionLoading(true);
      await apiRequest(`/api/v1/courses/${selectedCourseId}/enrollments/${studentId}`, {
        method: 'DELETE',
        token: session.access_token,
      });
      showSuccess('Student unenrolled successfully');
      await fetchCourseStudents(selectedCourseId);
      await fetchAnalyticsAndReports();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Network error removing enrollment');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEnrollFace = async (blobOrFile: Blob) => {
    if (!faceStudentId || !session?.access_token) {
      showError('Please select a student for face enrollment');
      return;
    }

    try {
      setActionLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      setFaceRegistered(false);
      setFaceProcessingStep('detecting');
      setFaceProcessingStep('embedding');

      const formData = new FormData();
      formData.append('student_id', faceStudentId);
      formData.append('image', blobOrFile, 'face.jpg');

      await apiRequest('/api/v1/recognition/enroll', {
        method: 'POST',
        token: session.access_token,
        formData,
      });

      setFaceProcessingStep('complete');
      setFaceRegistered(true);
      showSuccess('Face registered successfully');
      setSelectedFile(null);
    } catch (err) {
      setFaceProcessingStep(null);
      showError(
        err instanceof ApiError
          ? err.message
          : 'Network error during face enrollment'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateSession = async () => {
    if (!selectedCourseId || !session?.access_token) return;
    try {
      setActionLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      await apiRequest('/api/v1/attendance/sessions', {
        method: 'POST',
        token: session.access_token,
        body: { course_id: selectedCourseId, status: 'open' },
      });

      showSuccess('Attendance session created');
      await fetchAllData();
      await fetchAnalyticsAndReports();
    } catch (err) {
      showError(
        err instanceof ApiError ? err.message : 'Network error creating session'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloseSession = async (sessionId: string) => {
    if (!session?.access_token) return;
    try {
      setActionLoading(true);
      await apiRequest(`/api/v1/attendance/sessions/${sessionId}/close`, {
        method: 'POST',
        token: session.access_token,
      });
      showSuccess('Attendance session closed');
      setCloseSessionId(null);
      await fetchAllData();
      await fetchAnalyticsAndReports();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Network error closing session');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadCSV = async () => {
    if (!session?.access_token) return;
    try {
      setCsvLoading(true);
      const params = buildReportParams(true);
      const qs = params.toString() ? `?${params.toString()}` : '';
      await apiDownload(
        `/api/v1/reports/attendance.csv${qs}`,
        session.access_token,
        `attendance_report_${new Date().toISOString().slice(0, 10)}.csv`
      );
      toast({ tone: 'success', title: 'CSV export downloaded' });
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Failed to download CSV report');
    } finally {
      setCsvLoading(false);
    }
  };

  const getCourseById = (id: string) => courses.find((c) => c.id === id);
  const getStudentById = (id: string) => students.find((s) => s.id === id);

  const openSessionsCount =
    analytics?.open_sessions ?? sessions.filter((s) => s.status === 'open').length;
  const totalSessionsCount = analytics?.total_sessions ?? sessions.length;
  const totalCoursesCount = analytics?.total_courses ?? courses.length;
  const totalStudentsCount = analytics?.total_students ?? students.length;
  const enrollmentsCount =
    typeof analytics?.total_enrollments === 'number' ? analytics.total_enrollments : 'N/A';
  const overviewAttendanceRate =
    typeof analytics?.attendance_rate === 'number'
      ? formatPercent(analytics.attendance_rate)
      : 'N/A';

  const activeCourseStudents = selectedCourseId ? courseStudents : [];
  const activeSessionRecords = selectedSessionId ? records : [];
  const activeRosterCount = selectedSessionId ? sessionRosterCount : null;

  const presentCount = activeSessionRecords.filter((r) => r.status === 'present').length;
  const lateCount = activeSessionRecords.filter((r) => r.status === 'late').length;
  const absentCount = activeSessionRecords.filter((r) => r.status === 'absent').length;

  const recordsAttendanceRate = (() => {
    if (typeof activeRosterCount === 'number' && activeRosterCount > 0) {
      return formatPercent(((presentCount + lateCount) / activeRosterCount) * 100);
    }
    if (activeSessionRecords.length > 0) {
      return formatPercent(((presentCount + lateCount) / activeSessionRecords.length) * 100);
    }
    return 'N/A';
  })();

  const enrolledIds = new Set(activeCourseStudents.map((s) => s.id));
  const availableStudents = students.filter((s) => !enrolledIds.has(s.id));

  const selectedFaceStudent = getStudentById(faceStudentId);

  const analyticsBarData = analytics
    ? [
        { label: 'Present', value: analytics.present_count, color: 'var(--success)' },
        { label: 'Late', value: analytics.late_count, color: 'var(--warning)' },
        { label: 'Absent', value: analytics.absent_count, color: 'var(--danger)' },
        { label: 'Excused', value: analytics.excused_count, color: 'var(--info)' },
      ]
    : [];
  const barMax = Math.max(...analyticsBarData.map((b) => b.value), 1);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <PageLoadingState label="Loading session..." />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <>
        <Navbar />
        <main className="mx-auto max-w-lg px-4 py-12">
          <Card padding="lg" className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--danger-soft)] text-[var(--danger)]">
              <ShieldAlert className="h-6 w-6" aria-hidden />
            </div>
            <CardTitle className="text-[var(--danger)]">Access Denied</CardTitle>
            <CardDescription className="mt-2">
              Your database role is{' '}
              <strong className="text-[var(--text)]">{profile?.role || 'user'}</strong>. You must
              have <strong className="text-[var(--primary)]">admin</strong> privileges to access
              the Admin Dashboard.
            </CardDescription>
            <Button className="mt-6" onClick={() => router.push('/dashboard')}>
              Return to Dashboard
            </Button>
          </Card>
        </main>
      </>
    );
  }

  const meta = sectionMeta[activeSection];

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] print:bg-white print:text-black">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <AdminSidebar active={activeSection} onChange={setActiveSection} />

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
            <PageHeader
              title={meta.title}
              description={meta.description}
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void fetchAllData({ showLoading: true, clearError: true });
                    void fetchAnalyticsAndReports();
                  }}
                  loading={dataLoading}
                  className="no-print"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              }
            />

            {errorMsg && (
              <Alert tone="error" onDismiss={() => setErrorMsg(null)} className="no-print">
                {errorMsg}
              </Alert>
            )}

            {successMsg && (
              <Alert tone="success" onDismiss={() => setSuccessMsg(null)} className="no-print">
                {successMsg}
              </Alert>
            )}

            {/* Overview */}
            {activeSection === 'overview' && (
              <div className="space-y-6">
                {dataLoading ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-28 animate-pulse rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-muted)]"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <StatCard
                      label="Total Courses"
                      value={totalCoursesCount}
                      tone="brand"
                      icon={<BookOpen className="h-5 w-5" />}
                    />
                    <StatCard
                      label="Total Students"
                      value={totalStudentsCount}
                      tone="info"
                      icon={<Users className="h-5 w-5" />}
                    />
                    <StatCard
                      label="Enrollments"
                      value={enrollmentsCount}
                      tone="default"
                      icon={<GraduationCap className="h-5 w-5" />}
                    />
                    <StatCard
                      label="Open Sessions"
                      value={openSessionsCount}
                      tone="success"
                      icon={<CalendarClock className="h-5 w-5" />}
                    />
                    <StatCard
                      label="Total Sessions"
                      value={totalSessionsCount}
                      tone="default"
                      icon={<ClipboardList className="h-5 w-5" />}
                    />
                    <StatCard
                      label="Attendance Rate"
                      value={overviewAttendanceRate}
                      tone="brand"
                      icon={<Percent className="h-5 w-5" />}
                    />
                  </div>
                )}

                <Card>
                  <SectionHeader
                    title="Quick Navigation"
                    description="Jump to common admin tasks."
                  />
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {(
                      [
                        { id: 'courses' as AdminSection, label: 'Manage Courses', icon: BookOpen },
                        { id: 'students' as AdminSection, label: 'Enrollments', icon: Users },
                        { id: 'face-enrollment' as AdminSection, label: 'Register Faces', icon: ScanFace },
                        { id: 'sessions' as AdminSection, label: 'Sessions', icon: CalendarClock },
                        { id: 'records' as AdminSection, label: 'Records', icon: ClipboardList },
                        { id: 'analytics' as AdminSection, label: 'Analytics', icon: BarChart3 },
                      ] as const
                    ).map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveSection(item.id)}
                          className="flex flex-col items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-muted)]/40 p-4 text-center transition-colors hover:border-[var(--primary-border)] hover:bg-[var(--primary-soft)]"
                        >
                          <Icon className="h-5 w-5 text-[var(--primary)]" aria-hidden />
                          <span className="text-xs font-medium text-[var(--text-secondary)]">
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </Card>
              </div>
            )}

            {/* Courses */}
            {activeSection === 'courses' && (
              <div className="space-y-6">
                <SectionHeader
                  title="Course Catalog"
                  description={`${courses.length} course${courses.length === 1 ? '' : 's'} registered.`}
                  actions={
                    <Button onClick={openCreateCourseModal}>
                      <Plus className="h-4 w-4" />
                      Create Course
                    </Button>
                  }
                />

                {courses.length === 0 ? (
                  <EmptyState
                    icon={<BookOpen className="h-6 w-6" />}
                    title="No courses yet"
                    description="Create your first course to start managing enrollments and sessions."
                    actionLabel="Create Course"
                    onAction={openCreateCourseModal}
                  />
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Code</TH>
                        <TH>Name</TH>
                        <TH className="hidden md:table-cell">Description</TH>
                        <TH className="hidden sm:table-cell">Created</TH>
                        <TH className="text-right">Actions</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {courses.map((course) => (
                        <TR key={course.id}>
                          <TD className="font-semibold text-[var(--primary)]">{course.code}</TD>
                          <TD className="font-medium text-[var(--text)]">{course.name}</TD>
                          <TD className="hidden max-w-xs truncate md:table-cell">
                            {course.description?.trim() || 'N/A'}
                          </TD>
                          <TD className="hidden sm:table-cell">{formatDate(course.created_at)}</TD>
                          <TD className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditCourseModal(course)}
                                aria-label={`Edit ${course.code}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteCourseId(course.id)}
                                aria-label={`Delete ${course.code}`}
                                className="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </div>
            )}

            {/* Students / Enrollments */}
            {activeSection === 'students' && (
              <div className="space-y-6">
                <Card>
                  <Select
                    label="Course"
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    options={courses.map((c) => ({
                      value: c.id,
                      label: `${c.code} — ${c.name}`,
                    }))}
                  />
                </Card>

                <div className="grid gap-6 lg:grid-cols-3">
                  <Card className="lg:col-span-2">
                    <SectionHeader
                      title="Enrolled Students"
                      description={
                        selectedCourseId
                          ? `${activeCourseStudents.length} student${activeCourseStudents.length === 1 ? '' : 's'} enrolled.`
                          : 'Select a course to view enrollments.'
                      }
                    />

                    {!selectedCourseId ? (
                      <EmptyState
                        icon={<Users className="h-6 w-6" />}
                        title="No course selected"
                        description="Choose a course to manage its roster."
                      />
                    ) : activeCourseStudents.length === 0 ? (
                      <EmptyState
                        icon={<Users className="h-6 w-6" />}
                        title="No enrollments"
                        description="Enroll students using the form on the right."
                      />
                    ) : (
                      <Table>
                        <THead>
                          <TR>
                            <TH>Student</TH>
                            <TH className="hidden sm:table-cell">Email</TH>
                            <TH>Role</TH>
                            <TH className="text-right">Actions</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {activeCourseStudents.map((student) => (
                            <TR key={student.id}>
                              <TD>
                                <div className="flex items-center gap-3">
                                  <Avatar
                                    name={student.full_name}
                                    email={student.email}
                                    size="sm"
                                  />
                                  <span className="font-medium text-[var(--text)]">
                                    {student.full_name || truncateId(student.id)}
                                  </span>
                                </div>
                              </TD>
                              <TD className="hidden sm:table-cell">
                                {student.email || 'N/A'}
                              </TD>
                              <TD>
                                <Badge variant={statusBadgeVariant(student.role)}>
                                  {student.role}
                                </Badge>
                              </TD>
                              <TD className="text-right">
                                <Button
                                  variant="danger"
                                  size="sm"
                                  loading={actionLoading}
                                  onClick={() => handleRemoveEnrollment(student.id)}
                                >
                                  Remove
                                </Button>
                              </TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    )}
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Enroll Student</CardTitle>
                      <CardDescription>Add a student to the selected course.</CardDescription>
                    </CardHeader>
                    <form onSubmit={handleEnrollStudent} className="space-y-4">
                      <Select
                        label="Student"
                        value={enrollStudentId}
                        onChange={(e) => setEnrollStudentId(e.target.value)}
                        disabled={!selectedCourseId || availableStudents.length === 0}
                        options={[
                          { value: '', label: 'Select a student…' },
                          ...availableStudents.map((s) => ({
                            value: s.id,
                            label: studentOptionLabel(s),
                          })),
                        ]}
                      />
                      <Button
                        type="submit"
                        fullWidth
                        loading={actionLoading}
                        disabled={!selectedCourseId || !enrollStudentId}
                      >
                        <UserCheck className="h-4 w-4" />
                        Enroll Student
                      </Button>
                    </form>
                  </Card>
                </div>
              </div>
            )}

            {/* Face Registration */}
            {activeSection === 'face-enrollment' && (
              <div className="mx-auto max-w-2xl space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Register Face</CardTitle>
                    <CardDescription>
                      Capture or upload a clear photo. Face embeddings are stored securely and never
                      displayed here.
                    </CardDescription>
                  </CardHeader>

                  <Select
                    label="Student"
                    value={faceStudentId}
                    onChange={(e) => {
                      setFaceStudentId(e.target.value);
                      setFaceRegistered(false);
                      setFaceProcessingStep(null);
                    }}
                    options={students.map((s) => ({
                      value: s.id,
                      label: studentOptionLabel(s),
                    }))}
                  />

                  <div className="mt-5">
                    <Tabs
                      items={[
                        { id: 'file', label: 'Upload Image', icon: <Upload className="h-4 w-4" /> },
                        { id: 'webcam', label: 'Live Camera', icon: <Video className="h-4 w-4" /> },
                      ]}
                      value={enrollMode}
                      onChange={(id) => setEnrollMode(id as 'file' | 'webcam')}
                    />
                  </div>

                  {faceProcessingStep === 'detecting' && (
                    <Alert tone="info" className="mt-4">
                      Detecting face…
                    </Alert>
                  )}
                  {faceProcessingStep === 'embedding' && (
                    <Alert tone="info" className="mt-4">
                      Generating face embedding…
                    </Alert>
                  )}

                  {enrollMode === 'file' && (
                    <div className="mt-5 space-y-4">
                      <Input
                        type="file"
                        accept="image/jpeg,image/png"
                        label="Photo"
                        onChange={(e) => {
                          setSelectedFile(e.target.files?.[0] || null);
                          setFaceRegistered(false);
                          setFaceProcessingStep(null);
                        }}
                      />
                      <Button
                        type="button"
                        fullWidth
                        disabled={!selectedFile || actionLoading}
                        loading={actionLoading}
                        onClick={() => selectedFile && handleEnrollFace(selectedFile)}
                      >
                        <Upload className="h-4 w-4" />
                        Register Face
                      </Button>
                    </div>
                  )}

                  {enrollMode === 'webcam' && (
                    <div className="mt-5">
                      <AttendanceCamera
                        ref={cameraRef}
                        onCapture={handleEnrollFace}
                        isProcessing={actionLoading}
                        captureLabel="Register Face"
                        processingLabel="Generating face embedding…"
                      />
                    </div>
                  )}

                  {faceRegistered && selectedFaceStudent && (
                    <Card padding="sm" className="mt-5 border-[var(--success-border)] bg-[var(--success-soft)]">
                      <div className="flex flex-wrap items-center gap-4">
                        <Avatar
                          name={selectedFaceStudent.full_name}
                          email={selectedFaceStudent.email}
                          size="lg"
                        />
                        <div>
                          <p className="text-sm text-[var(--text-secondary)]">Student</p>
                          <p className="font-semibold text-[var(--text)]">
                            {selectedFaceStudent.full_name ||
                              selectedFaceStudent.email ||
                              truncateId(selectedFaceStudent.id)}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-sm text-[var(--text-secondary)]">Status</span>
                            <Badge variant="success">registered</Badge>
                          </div>
                        </div>
                      </div>
                    </Card>
                  )}
                </Card>
              </div>
            )}

            {/* Sessions */}
            {activeSection === 'sessions' && (
              <div className="space-y-6">
                <Card className="no-print">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <Select
                        label="Course"
                        value={selectedCourseId}
                        onChange={(e) => setSelectedCourseId(e.target.value)}
                        options={courses.map((c) => ({
                          value: c.id,
                          label: `${c.code} — ${c.name}`,
                        }))}
                      />
                    </div>
                    <Button
                      onClick={handleCreateSession}
                      loading={actionLoading}
                      disabled={!selectedCourseId}
                    >
                      <Plus className="h-4 w-4" />
                      Start Attendance Session
                    </Button>
                  </div>
                </Card>

                {sessions.length === 0 ? (
                  <EmptyState
                    icon={<CalendarClock className="h-6 w-6" />}
                    title="No sessions"
                    description="Start an attendance session for a course."
                  />
                ) : (
                  <>
                    <div className="hidden md:block">
                      <Table>
                        <THead>
                          <TR>
                            <TH>Course</TH>
                            <TH>Started</TH>
                            <TH>Ended</TH>
                            <TH>Status</TH>
                            <TH className="text-right">Actions</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {sessions.map((sess) => {
                            const course = getCourseById(sess.course_id);
                            return (
                              <TR key={sess.id}>
                                <TD className="font-medium text-[var(--text)]">
                                  {course ? `${course.code} — ${course.name}` : truncateId(sess.course_id)}
                                </TD>
                                <TD>{formatDate(sess.started_at)}</TD>
                                <TD>{formatDate(sess.ended_at)}</TD>
                                <TD>
                                  <Badge variant={statusBadgeVariant(sess.status)}>
                                    {sess.status.toUpperCase()}
                                  </Badge>
                                </TD>
                                <TD className="text-right">
                                  {sess.status === 'open' && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setCloseSessionId(sess.id)}
                                    >
                                      Close
                                    </Button>
                                  )}
                                </TD>
                              </TR>
                            );
                          })}
                        </TBody>
                      </Table>
                    </div>

                    <div className="grid gap-4 md:hidden">
                      {sessions.map((sess) => {
                        const course = getCourseById(sess.course_id);
                        return (
                          <Card key={sess.id} padding="sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold text-[var(--text)]">
                                  {course ? course.code : truncateId(sess.course_id)}
                                </p>
                                <p className="text-xs text-[var(--text-secondary)]">
                                  {formatDate(sess.started_at)}
                                </p>
                              </div>
                              <Badge variant={statusBadgeVariant(sess.status)}>
                                {sess.status.toUpperCase()}
                              </Badge>
                            </div>
                            {sess.status === 'open' && (
                              <Button
                                variant="outline"
                                size="sm"
                                fullWidth
                                className="mt-3"
                                onClick={() => setCloseSessionId(sess.id)}
                              >
                                Close Session
                              </Button>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Records */}
            {activeSection === 'records' && (
              <div className="space-y-6">
                <Card className="no-print">
                  <Select
                    label="Session"
                    value={selectedSessionId}
                    onChange={(e) => setSelectedSessionId(e.target.value)}
                    options={sessions.map((s) => {
                      const course = getCourseById(s.course_id);
                      const label = course
                        ? `${course.code} — ${formatDate(s.started_at)} (${s.status})`
                        : `${truncateId(s.id)} — ${formatDate(s.started_at)}`;
                      return { value: s.id, label };
                    })}
                  />
                </Card>

                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <StatCard label="Present" value={presentCount} tone="success" />
                  <StatCard label="Late" value={lateCount} tone="warning" />
                  <StatCard label="Absent" value={absentCount} tone="danger" />
                  <StatCard label="Attendance Rate" value={recordsAttendanceRate} tone="brand" />
                </div>

                {activeSessionRecords.length === 0 ? (
                  <EmptyState
                    icon={<ClipboardList className="h-6 w-6" />}
                    title="No records"
                    description="Select a session with attendance data to view records."
                  />
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Student</TH>
                        <TH>Status</TH>
                        <TH>Similarity</TH>
                        <TH className="hidden sm:table-cell">Recognition Source</TH>
                        <TH>Time</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {activeSessionRecords.map((record) => {
                        const student = getStudentById(record.student_id);
                        const displayName =
                          student?.full_name || student?.email || truncateId(record.student_id);
                        return (
                          <TR key={record.id}>
                            <TD className="font-medium text-[var(--text)]">{displayName}</TD>
                            <TD>
                              <Badge variant={statusBadgeVariant(record.status)}>
                                {record.status}
                              </Badge>
                            </TD>
                            <TD className="font-mono">
                              {formatSimilarity(record.similarity)}
                            </TD>
                            <TD className="hidden sm:table-cell">
                              {record.recognition_source || 'N/A'}
                            </TD>
                            <TD>{formatDate(record.recognized_at)}</TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                )}
              </div>
            )}

            {/* Analytics */}
            {activeSection === 'analytics' && (
              <div className="space-y-6">
                <Card className="no-print">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <Select
                        label="Course"
                        value={analyticsCourseFilter}
                        onChange={(e) => setAnalyticsCourseFilter(e.target.value)}
                        options={[
                          { value: '', label: 'All Courses' },
                          ...courses.map((c) => ({
                            value: c.id,
                            label: `${c.code} — ${c.name}`,
                          })),
                        ]}
                      />
                      <Select
                        label="Student"
                        value={analyticsStudentFilter}
                        onChange={(e) => setAnalyticsStudentFilter(e.target.value)}
                        options={[
                          { value: '', label: 'All Students' },
                          ...students.map((s) => ({
                            value: s.id,
                            label: studentOptionLabel(s),
                          })),
                        ]}
                      />
                      <Select
                        label="Status"
                        value={analyticsStatusFilter}
                        onChange={(e) => setAnalyticsStatusFilter(e.target.value)}
                        options={[
                          { value: '', label: 'All Statuses' },
                          { value: 'present', label: 'Present' },
                          { value: 'late', label: 'Late' },
                          { value: 'absent', label: 'Absent' },
                          { value: 'excused', label: 'Excused' },
                        ]}
                      />
                      <Select
                        label="Date Range"
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value as DateFilterType)}
                        options={[
                          { value: 'all', label: 'All Time' },
                          { value: 'today', label: 'Today' },
                          { value: '7days', label: 'Last 7 Days' },
                          { value: '30days', label: 'Last 30 Days' },
                          { value: 'custom', label: 'Custom Range' },
                        ]}
                      />
                    </div>
                    {dateFilter === 'custom' && (
                      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Input
                          label="Start date"
                          type="date"
                          value={startDateFilter}
                          onChange={(e) => setStartDateFilter(e.target.value)}
                        />
                        <Input
                          label="End date"
                          type="date"
                          value={endDateFilter}
                          onChange={(e) => setEndDateFilter(e.target.value)}
                        />
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadCSV}
                        loading={csvLoading}
                      >
                        <Download className="h-4 w-4" />
                        Export CSV
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => window.print()}>
                        <Printer className="h-4 w-4" />
                        Print
                      </Button>
                    </div>
                  </div>
                </Card>

                {analytics ? (
                  <>
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                      <StatCard
                        label="Attendance Rate"
                        value={formatPercent(analytics.attendance_rate)}
                        tone="brand"
                        icon={<Percent className="h-5 w-5" />}
                      />
                      <StatCard
                        label="Present"
                        value={analytics.present_count}
                        tone="success"
                      />
                      <StatCard
                        label="Late"
                        value={analytics.late_count}
                        tone="warning"
                      />
                      <StatCard
                        label="Absent"
                        value={analytics.absent_count}
                        tone="danger"
                      />
                    </div>

                    <Card className="no-print">
                      <SectionHeader title="Status Distribution" />
                      <div className="space-y-3">
                        {analyticsBarData.map((bar) => (
                          <div key={bar.label} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-[var(--text-secondary)]">
                                {bar.label}
                              </span>
                              <span className="font-semibold text-[var(--text)]">{bar.value}</span>
                            </div>
                            <div className="h-3 overflow-hidden rounded-full bg-[var(--bg-muted)]">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${(bar.value / barMax) * 100}%`,
                                  backgroundColor: bar.color,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>

                    <Card className="no-print">
                      <SectionHeader title="Similarity Metrics" />
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <StatCard
                          label="Average Similarity"
                          value={formatSimilarity(analytics.average_similarity)}
                          tone="brand"
                        />
                        <StatCard
                          label="Minimum Similarity"
                          value={formatSimilarity(analytics.min_similarity)}
                        />
                        <StatCard
                          label="Maximum Similarity"
                          value={formatSimilarity(analytics.max_similarity)}
                          tone="success"
                        />
                      </div>
                    </Card>
                  </>
                ) : (
                  <ErrorState
                    message="Analytics data is unavailable for the selected filters."
                    onRetry={fetchAnalyticsAndReports}
                  />
                )}

                <Card>
                  <SectionHeader
                    title="Attendance Records Log"
                    description={`${reportRecords.length} record${reportRecords.length === 1 ? '' : 's'}`}
                  />
                  {reportRecords.length === 0 ? (
                    <EmptyState
                      icon={<ClipboardList className="h-6 w-6" />}
                      title="No records"
                      description="No attendance logs available for the selected filters."
                    />
                  ) : (
                    <Table>
                      <THead>
                        <TR>
                          <TH>Student</TH>
                          <TH>Course</TH>
                          <TH>Status</TH>
                          <TH>Similarity</TH>
                          <TH className="hidden md:table-cell">Source</TH>
                          <TH className="hidden sm:table-cell">Timestamp</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {reportRecords.map((r) => (
                          <TR key={r.id}>
                            <TD>
                              <div>
                                <p className="font-medium text-[var(--text)]">
                                  {r.student_name || 'N/A'}
                                </p>
                                <p className="text-xs text-[var(--text-muted)]">
                                  {r.student_email || 'N/A'}
                                </p>
                              </div>
                            </TD>
                            <TD className="font-semibold text-[var(--primary)]">
                              {r.course_code || 'N/A'}
                            </TD>
                            <TD>
                              <Badge variant={statusBadgeVariant(r.status)}>{r.status}</Badge>
                            </TD>
                            <TD className="font-mono">{formatSimilarity(r.similarity)}</TD>
                            <TD className="hidden md:table-cell">
                              {r.recognition_source || 'N/A'}
                            </TD>
                            <TD className="hidden sm:table-cell">
                              {formatDate(r.recognized_at || r.created_at)}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  )}
                </Card>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Create / Edit Course Modal */}
      <Modal
        open={courseModalOpen}
        onClose={() => {
          setCourseModalOpen(false);
          resetCourseForm();
        }}
        title={editingCourseId ? 'Edit Course' : 'Create Course'}
        description={
          editingCourseId
            ? 'Update course details below.'
            : 'Add a new course to the system.'
        }
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setCourseModalOpen(false);
                resetCourseForm();
              }}
            >
              Cancel
            </Button>
            <Button
              form="course-form"
              type="submit"
              loading={actionLoading}
            >
              {editingCourseId ? 'Update Course' : 'Create Course'}
            </Button>
          </>
        }
      >
        <form id="course-form" onSubmit={handleSaveCourse} className="space-y-4">
          <Input
            label="Course Code"
            required
            value={courseCode}
            onChange={(e) => setCourseCode(e.target.value)}
            placeholder="e.g. CS501"
            className="uppercase"
          />
          <Input
            label="Course Name"
            required
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            placeholder="e.g. Computer Vision"
          />
          <TextArea
            label="Description (Optional)"
            rows={3}
            value={courseDesc}
            onChange={(e) => setCourseDesc(e.target.value)}
            placeholder="Course details…"
          />
        </form>
      </Modal>

      {/* Delete Course Confirmation */}
      <Modal
        open={!!deleteCourseId}
        onClose={() => setDeleteCourseId(null)}
        title="Delete Course"
        description="This action cannot be undone. All enrollments linked to this course may be affected."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteCourseId(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={actionLoading}
              onClick={() => deleteCourseId && handleDeleteCourse(deleteCourseId)}
            >
              Delete Course
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--text-secondary)]">
          Are you sure you want to delete{' '}
          <strong className="text-[var(--text)]">
            {deleteCourseId
              ? getCourseById(deleteCourseId)?.code || 'this course'
              : 'this course'}
          </strong>
          ?
        </p>
      </Modal>

      {/* Close Session Confirmation */}
      <Modal
        open={!!closeSessionId}
        onClose={() => setCloseSessionId(null)}
        title="Close Session"
        description="Students will no longer be able to mark attendance for this session."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCloseSessionId(null)}>
              Cancel
            </Button>
            <Button
              loading={actionLoading}
              onClick={() => closeSessionId && handleCloseSession(closeSessionId)}
            >
              Close Session
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--text-secondary)]">
          Confirm closing this attendance session?
        </p>
      </Modal>
    </div>
  );
}
