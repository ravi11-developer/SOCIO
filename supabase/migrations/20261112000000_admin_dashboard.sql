-- ==============================================================================
-- ADMIN OBSERVABILITY DASHBOARD
-- Safe to run on the live project: it adds objects and never drops tables or data.
-- Safe to re-run: every statement is idempotent.
--
-- After running this, register yourself as the only admin (see the bottom of this file).
-- ==============================================================================


-- ------------------------------------------------------------------------------
-- 1. LOCK THE RESEARCHER VIEWS
-- Views run as their owner by default, which bypasses RLS. security_invoker makes
-- them run as the caller, so the RLS policies below decide who sees rows.
-- anon gets nothing; authenticated users only see rows if is_admin() is true.
-- ------------------------------------------------------------------------------
ALTER VIEW public.researcher_export_view SET (security_invoker = on);
ALTER VIEW public.researcher_responses_long_view SET (security_invoker = on);
REVOKE ALL ON public.researcher_export_view, public.researcher_responses_long_view FROM anon, authenticated;
GRANT SELECT ON public.researcher_export_view, public.researcher_responses_long_view TO authenticated;


-- ------------------------------------------------------------------------------
-- 2. ADMIN ALLOW-LIST
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
    user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_users FROM anon, authenticated;
-- Nobody can add/remove admins through the API; only via the SQL Editor.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users WHERE user_id = (SELECT auth.uid())
    );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;


-- ------------------------------------------------------------------------------
-- 3. LAST-ACTIVITY TRACKING (powers "active now" / "abandoned")
-- Done with triggers so the existing participant RPCs don't need to change.
-- ------------------------------------------------------------------------------
ALTER TABLE public.experiment_sessions
    ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill from existing data (only rows that still have the default value matter,
-- but recomputing all is harmless).
UPDATE public.experiment_sessions s
SET last_activity_at = GREATEST(
    s.updated_at,
    COALESCE((SELECT MAX(r.updated_at) FROM public.responses r WHERE r.participant_id = s.participant_id), s.updated_at)
);

CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON public.experiment_sessions(last_activity_at DESC);

CREATE OR REPLACE FUNCTION public.trg_session_touch_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.last_activity_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS session_touch_activity ON public.experiment_sessions;
CREATE TRIGGER session_touch_activity
    BEFORE UPDATE ON public.experiment_sessions
    FOR EACH ROW EXECUTE FUNCTION public.trg_session_touch_activity();

CREATE OR REPLACE FUNCTION public.trg_response_touch_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.experiment_sessions
    SET last_activity_at = now()
    WHERE participant_id = NEW.participant_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS response_touch_session ON public.responses;
CREATE TRIGGER response_touch_session
    AFTER INSERT OR UPDATE ON public.responses
    FOR EACH ROW EXECUTE FUNCTION public.trg_response_touch_session();


-- ------------------------------------------------------------------------------
-- 4. ADMIN-ONLY RLS POLICIES
-- Participants keep using the SECURITY DEFINER RPCs (unchanged).
-- These policies only apply to logged-in users, and only pass for admins.
-- ------------------------------------------------------------------------------
GRANT SELECT, DELETE ON public.participants, public.responses TO authenticated;
GRANT SELECT ON public.consent, public.experiment_sessions TO authenticated;

DROP POLICY IF EXISTS "Admin read participants" ON public.participants;
CREATE POLICY "Admin read participants" ON public.participants
    FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admin delete participants" ON public.participants;
CREATE POLICY "Admin delete participants" ON public.participants
    FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admin read responses" ON public.responses;
CREATE POLICY "Admin read responses" ON public.responses
    FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admin delete responses" ON public.responses;
CREATE POLICY "Admin delete responses" ON public.responses
    FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admin read consent" ON public.consent;
CREATE POLICY "Admin read consent" ON public.consent
    FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admin read sessions" ON public.experiment_sessions;
CREATE POLICY "Admin read sessions" ON public.experiment_sessions
    FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

-- Deleting a participant cascades (ON DELETE CASCADE) to consent,
-- experiment_sessions and responses. Postgres runs cascades as the table owner,
-- so no extra policies are needed for them.


-- ------------------------------------------------------------------------------
-- 5. AUDIT LOG
-- Records WHO deleted WHAT and WHEN. It deliberately stores identifiers only,
-- never answers or demographics, so a permanent delete stays permanent.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id    UUID,
    actor_email TEXT,
    action      TEXT NOT NULL,
    target      TEXT NOT NULL,
    details     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_audit_log FROM anon, authenticated;
GRANT SELECT ON public.admin_audit_log TO authenticated;

DROP POLICY IF EXISTS "Admin read audit log" ON public.admin_audit_log;
CREATE POLICY "Admin read audit log" ON public.admin_audit_log
    FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

CREATE OR REPLACE FUNCTION public.trg_audit_participant_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.admin_audit_log (actor_id, actor_email, action, target, details)
    VALUES (
        auth.uid(),
        auth.jwt() ->> 'email',
        'delete_participant',
        OLD.participant_id,
        jsonb_build_object(
            'responses_deleted', (SELECT COUNT(*) FROM public.responses r WHERE r.participant_id = OLD.id)
        )
    );
    RETURN OLD;
END;
$$;

-- BEFORE DELETE so the response count is taken before the cascade removes them.
DROP TRIGGER IF EXISTS audit_participant_delete ON public.participants;
CREATE TRIGGER audit_participant_delete
    BEFORE DELETE ON public.participants
    FOR EACH ROW EXECUTE FUNCTION public.trg_audit_participant_delete();

CREATE OR REPLACE FUNCTION public.trg_audit_response_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_code TEXT;
BEGIN
    -- Skip rows removed by a participant-delete cascade (already logged above).
    IF pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;

    SELECT participant_id INTO v_code FROM public.participants WHERE id = OLD.participant_id;

    INSERT INTO public.admin_audit_log (actor_id, actor_email, action, target, details)
    VALUES (
        auth.uid(),
        auth.jwt() ->> 'email',
        'delete_response',
        COALESCE(v_code, OLD.participant_id::text),
        jsonb_build_object('question_id', OLD.question_id)
    );
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS audit_response_delete ON public.responses;
CREATE TRIGGER audit_response_delete
    AFTER DELETE ON public.responses
    FOR EACH ROW EXECUTE FUNCTION public.trg_audit_response_delete();


-- ------------------------------------------------------------------------------
-- 6. DASHBOARD VIEW (one row per participant)
-- security_invoker => RLS applies => only admins get rows.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.admin_participant_overview
WITH (security_invoker = on) AS
SELECT
    p.id,
    p.participant_id        AS code,
    p.gender,
    p.ethnicity,
    p.first_language,
    p.second_language,
    p.hindi_proficiency,
    p.created_at,
    c.consent_status,
    c.consent_timestamp,
    s.current_stage,
    s.session_status,
    s.presentation_order,
    s.audio_1_started_at,
    s.audio_1_completed_at,
    s.audio_2_started_at,
    s.audio_2_completed_at,
    s.submitted_at,
    s.last_activity_at,
    s.audio_1_recording_id,
    s.audio_2_recording_id,
    r1.code                 AS audio_1_code,
    r2.code                 AS audio_2_code,
    (SELECT COUNT(*) FROM public.responses r WHERE r.participant_id = p.id) AS response_count
FROM public.participants p
LEFT JOIN public.consent c              ON c.participant_id = p.id
LEFT JOIN public.experiment_sessions s  ON s.participant_id = p.id
LEFT JOIN public.recordings r1          ON r1.id = s.audio_1_recording_id
LEFT JOIN public.recordings r2          ON r2.id = s.audio_2_recording_id;

REVOKE ALL ON public.admin_participant_overview FROM anon, authenticated;
GRANT SELECT ON public.admin_participant_overview TO authenticated;


-- ------------------------------------------------------------------------------
-- 7. REALTIME (live updates in the dashboard; Realtime enforces the RLS above)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['participants', 'experiment_sessions', 'responses'] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
        END IF;
    END LOOP;
END;
$$;


-- ==============================================================================
-- 8. REGISTER YOURSELF AS THE ONLY ADMIN (run once, after creating your user in
--    Authentication -> Users). Replace the email, then run just this statement:
--
-- INSERT INTO public.admin_users (user_id, email)
-- SELECT id, email FROM auth.users WHERE email = 'you@example.com'
-- ON CONFLICT (user_id) DO NOTHING;
-- ==============================================================================
