-- Migration: 20260827180000_attendance_foundation.sql
-- Description: Attendance System Database Foundation (Courses, Enrollments, Sessions, Records, Indexes, and RLS)

-- 1. Courses Table
CREATE TABLE IF NOT EXISTS public.courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- 2. Course Enrollments Table
CREATE TABLE IF NOT EXISTS public.course_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_course_student UNIQUE (course_id, student_id)
);

-- 3. Attendance Sessions Table
CREATE TABLE IF NOT EXISTS public.attendance_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- 4. Attendance Records Table
CREATE TABLE IF NOT EXISTS public.attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'late', 'absent', 'excused')),
    recognized_at TIMESTAMPTZ DEFAULT now(),
    confidence NUMERIC CHECK (confidence IS NULL OR (confidence >= 0.0 AND confidence <= 1.0)),
    recognition_source TEXT NOT NULL DEFAULT 'system' CHECK (recognition_source IN ('face_recognition', 'manual', 'system')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_session_student UNIQUE (session_id, student_id)
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_course_enrollments_course ON public.course_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_student ON public.course_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_course ON public.attendance_sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_status ON public.attendance_sessions(status);
CREATE INDEX IF NOT EXISTS idx_attendance_records_session ON public.attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student ON public.attendance_records(student_id);

-- 6. Enable RLS
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies

-- Courses RLS
DROP POLICY IF EXISTS "Admin full access on courses" ON public.courses;
CREATE POLICY "Admin full access on courses" ON public.courses
    FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Authenticated users view courses" ON public.courses;
CREATE POLICY "Authenticated users view courses" ON public.courses
    FOR SELECT USING (auth.role() = 'authenticated');

-- Course Enrollments RLS
DROP POLICY IF EXISTS "Admin full access on course_enrollments" ON public.course_enrollments;
CREATE POLICY "Admin full access on course_enrollments" ON public.course_enrollments
    FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Students view own enrollments" ON public.course_enrollments;
CREATE POLICY "Students view own enrollments" ON public.course_enrollments
    FOR SELECT USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Students view course classmates" ON public.course_enrollments;
CREATE POLICY "Students view course classmates" ON public.course_enrollments
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.course_enrollments ce
        WHERE ce.course_id = public.course_enrollments.course_id
        AND ce.student_id = auth.uid()
    ));

-- Attendance Sessions RLS
DROP POLICY IF EXISTS "Admin full access on attendance_sessions" ON public.attendance_sessions;
CREATE POLICY "Admin full access on attendance_sessions" ON public.attendance_sessions
    FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Students view enrolled course sessions" ON public.attendance_sessions;
CREATE POLICY "Students view enrolled course sessions" ON public.attendance_sessions
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.course_enrollments ce
        WHERE ce.course_id = public.attendance_sessions.course_id
        AND ce.student_id = auth.uid()
    ));

-- Attendance Records RLS
DROP POLICY IF EXISTS "Admin full access on attendance_records" ON public.attendance_records;
CREATE POLICY "Admin full access on attendance_records" ON public.attendance_records
    FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Students view own attendance records" ON public.attendance_records;
CREATE POLICY "Students view own attendance records" ON public.attendance_records
    FOR SELECT USING (student_id = auth.uid());
