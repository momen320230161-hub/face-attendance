-- Migration: Face Embeddings Storage for Biometric Identification

CREATE TABLE IF NOT EXISTS public.face_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    embedding vector(512) NOT NULL,
    model_name TEXT NOT NULL DEFAULT 'ArcFace-buffalo_l',
    model_version TEXT NOT NULL DEFAULT 'v1.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_face_embeddings_student ON public.face_embeddings(student_id);

-- RLS Security
ALTER TABLE public.face_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access on face_embeddings" ON public.face_embeddings;
CREATE POLICY "Admin full access on face_embeddings" ON public.face_embeddings
    FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Students view own embedding status" ON public.face_embeddings;
CREATE POLICY "Students view own embedding status" ON public.face_embeddings
    FOR SELECT USING (student_id = auth.uid());
