-- ==============================================================================
-- COMPLETE CLEAN SETUP SCRIPT FOR A *NEW, EMPTY* SUPABASE PROJECT
--
-- DO NOT RUN THIS ON THE LIVE PROJECT. It drops and recreates every study table.
-- To update the live project, run the files in supabase/migrations/ instead.
--
-- Safety guard: the script refuses to run (and changes nothing) if the
-- participants table already contains any rows.
--
-- The result matches the live project: storage paths end in .mp3.mpeg, the
-- bucket is audio_files, and the admin dashboard and data integrity migrations
-- are applied at the end.
-- ==============================================================================

DO $guard$
DECLARE
    v_has_data BOOLEAN := false;
BEGIN
    IF to_regclass('public.participants') IS NOT NULL THEN
        EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.participants)' INTO v_has_data;
    END IF;
    IF v_has_data THEN
        RAISE EXCEPTION 'Refusing to run full_clean_setup.sql: the participants table already holds data. Run the migrations in supabase/migrations/ instead.';
    END IF;
END
$guard$;


-- 1. DROP EXISTING VIEWS, TABLES & FUNCTIONS (CASCADE)
DROP VIEW IF EXISTS admin_participant_overview CASCADE;
DROP TABLE IF EXISTS audio_events CASCADE;
DROP FUNCTION IF EXISTS rpc_record_audio_event(UUID, INT, TEXT, NUMERIC) CASCADE;
DROP FUNCTION IF EXISTS random_trait_order() CASCADE;
DROP VIEW IF EXISTS researcher_responses_long_view CASCADE;
DROP VIEW IF EXISTS researcher_export_view CASCADE;

DROP FUNCTION IF EXISTS rpc_submit_experiment(UUID) CASCADE;
DROP FUNCTION IF EXISTS rpc_complete_questions_1(UUID) CASCADE;
DROP FUNCTION IF EXISTS rpc_autosave_response(UUID, TEXT, TEXT, INT) CASCADE;
DROP FUNCTION IF EXISTS rpc_autosave_response(UUID, VARCHAR, TEXT) CASCADE;
DROP FUNCTION IF EXISTS rpc_complete_audio(UUID, INT) CASCADE;
DROP FUNCTION IF EXISTS rpc_record_audio_start(UUID, INT) CASCADE;
DROP FUNCTION IF EXISTS rpc_submit_consent_and_demographics(UUID, TEXT, TEXT, TEXT, TEXT, INT, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS rpc_submit_consent_and_demographics(UUID, TEXT, TEXT, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS rpc_init_or_resume_session(UUID) CASCADE;
DROP FUNCTION IF EXISTS generate_participant_code() CASCADE;

DROP TABLE IF EXISTS responses CASCADE;
DROP TABLE IF EXISTS experiment_sessions CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS recordings CASCADE;
DROP TABLE IF EXISTS consent CASCADE;
DROP TABLE IF EXISTS participants CASCADE;

-- 2. CREATE TABLES

-- Participants Table
CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id VARCHAR(32) NOT NULL UNIQUE,
    session_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    gender VARCHAR(64),
    ethnicity VARCHAR(128),
    first_language VARCHAR(128),
    second_language VARCHAR(128),
    hindi_proficiency INT CHECK (hindi_proficiency BETWEEN 1 AND 6),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_participants_session_token ON participants(session_token);
CREATE INDEX idx_participants_participant_id ON participants(participant_id);

-- Consent Table
CREATE TABLE consent (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    consent_status BOOLEAN NOT NULL DEFAULT false,
    consent_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_hash VARCHAR(64),
    user_agent TEXT,
    CONSTRAINT unique_participant_consent UNIQUE(participant_id)
);

CREATE INDEX idx_consent_participant ON consent(participant_id);

-- Recordings Table (10 Audios: 5 Male, 5 Female)
CREATE TABLE recordings (
    id SERIAL PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    category VARCHAR(32) NOT NULL CHECK (category IN ('pure', 'code_mixed')),
    language_variety VARCHAR(64) NOT NULL,
    speaker_gender VARCHAR(16) NOT NULL CHECK (speaker_gender IN ('male', 'female')),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    audio_storage_path TEXT NOT NULL,
    duration_seconds INT NOT NULL DEFAULT 60,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recordings_category ON recordings(category);
CREATE INDEX idx_recordings_gender ON recordings(speaker_gender);

-- Questions Table (12 Traits + 1 Comment per audio)
CREATE TABLE questions (
    id VARCHAR(32) PRIMARY KEY,
    recording_number INT NOT NULL CHECK (recording_number IN (1, 2)),
    question_number INT NOT NULL,
    question_key VARCHAR(64),
    question_text TEXT NOT NULL,
    question_type VARCHAR(32) NOT NULL DEFAULT 'scale',
    is_required BOOLEAN NOT NULL DEFAULT true,
    placeholder TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_recording_question UNIQUE(recording_number, question_number)
);

CREATE INDEX idx_questions_recording ON questions(recording_number);

-- Experiment Sessions Table
CREATE TABLE experiment_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    current_stage VARCHAR(32) NOT NULL DEFAULT 'consent_pending' 
        CHECK (current_stage IN ('consent_pending', 'audio_1_pending', 'questions_1_pending', 'audio_2_pending', 'questions_2_pending', 'submitted')),
    audio_1_recording_id INT REFERENCES recordings(id),
    audio_2_recording_id INT REFERENCES recordings(id),
    presentation_order VARCHAR(32) NOT NULL CHECK (presentation_order IN ('pure_first', 'codemixed_first')),
    session_status VARCHAR(32) NOT NULL DEFAULT 'in_progress' CHECK (session_status IN ('in_progress', 'submitted', 'abandoned')),
    audio_1_started_at TIMESTAMPTZ,
    audio_1_completed_at TIMESTAMPTZ,
    audio_2_started_at TIMESTAMPTZ,
    audio_2_completed_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_participant ON experiment_sessions(participant_id);
CREATE INDEX idx_sessions_stage ON experiment_sessions(current_stage);
CREATE INDEX idx_sessions_audio_1 ON experiment_sessions(audio_1_recording_id);
CREATE INDEX idx_sessions_audio_2 ON experiment_sessions(audio_2_recording_id);

-- Responses Table
CREATE TABLE responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    question_id VARCHAR(32) NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    recording_id INT REFERENCES recordings(id),
    answer TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_participant_question_response UNIQUE(participant_id, question_id)
);

CREATE INDEX idx_responses_participant ON responses(participant_id);
CREATE INDEX idx_responses_recording ON responses(recording_id);

-- 3. ROW LEVEL SECURITY (RLS)
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to recordings" ON recordings
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow public read access to questions" ON questions
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Service role full access to participants" ON participants
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to consent" ON consent
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to responses" ON responses
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to experiment_sessions" ON experiment_sessions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. STORED PROCEDURES & STATE MACHINE

-- Random Participant Code Generator
CREATE OR REPLACE FUNCTION generate_participant_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    result TEXT := 'P-';
    i INT;
BEGIN
    FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$;

-- Initialize or Resume Session (Balanced Stratified Allocation)
CREATE OR REPLACE FUNCTION rpc_init_or_resume_session(p_session_token UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_participant participants%ROWTYPE;
    v_session experiment_sessions%ROWTYPE;
    v_new_code TEXT;
    v_responses JSONB;
    v_rec1 recordings%ROWTYPE;
    v_rec2 recordings%ROWTYPE;
    v_pure_id INT;
    v_pure_gender VARCHAR(16);
    v_codemixed_id INT;
    v_order VARCHAR(32);
BEGIN
    -- 1. Resume existing session if token is provided and valid
    IF p_session_token IS NOT NULL THEN
        SELECT * INTO v_participant FROM participants WHERE session_token = p_session_token;
        IF FOUND THEN
            SELECT * INTO v_session FROM experiment_sessions WHERE participant_id = v_participant.id;
            
            SELECT * INTO v_rec1 FROM recordings WHERE id = v_session.audio_1_recording_id;
            SELECT * INTO v_rec2 FROM recordings WHERE id = v_session.audio_2_recording_id;

            SELECT COALESCE(jsonb_object_agg(question_id, answer), '{}'::jsonb)
            INTO v_responses
            FROM responses
            WHERE participant_id = v_participant.id;

            RETURN jsonb_build_object(
                'status', 'resumed',
                'participant_id', v_participant.participant_id,
                'session_token', v_participant.session_token,
                'gender', v_participant.gender,
                'ethnicity', v_participant.ethnicity,
                'first_language', v_participant.first_language,
                'second_language', v_participant.second_language,
                'hindi_proficiency', v_participant.hindi_proficiency,
                'current_stage', v_session.current_stage,
                'audio_1_completed', v_session.audio_1_completed_at IS NOT NULL,
                'audio_2_completed', v_session.audio_2_completed_at IS NOT NULL,
                'submitted', v_session.submitted_at IS NOT NULL,
                'assigned_audio_1', to_jsonb(v_rec1),
                'assigned_audio_2', to_jsonb(v_rec2),
                'presentation_order', v_session.presentation_order,
                'responses', v_responses
            );
        END IF;
    END IF;

    -- 2. New Session: Pick least-allocated Pure recording
    SELECT r.id, r.speaker_gender
    INTO v_pure_id, v_pure_gender
    FROM recordings r
    LEFT JOIN (
        SELECT audio_1_recording_id AS rec_id FROM experiment_sessions
        UNION ALL
        SELECT audio_2_recording_id AS rec_id FROM experiment_sessions
    ) alloc ON alloc.rec_id = r.id
    WHERE r.category = 'pure'
    GROUP BY r.id, r.speaker_gender
    ORDER BY COUNT(alloc.rec_id) ASC, random()
    LIMIT 1;

    -- Pick least-allocated Code-Mixed recording (opposite gender prioritized)
    SELECT r.id
    INTO v_codemixed_id
    FROM recordings r
    LEFT JOIN (
        SELECT audio_1_recording_id AS rec_id FROM experiment_sessions
        UNION ALL
        SELECT audio_2_recording_id AS rec_id FROM experiment_sessions
    ) alloc ON alloc.rec_id = r.id
    WHERE r.category = 'code_mixed'
    GROUP BY r.id, r.speaker_gender
    ORDER BY 
        (CASE WHEN r.speaker_gender != v_pure_gender THEN 0 ELSE 1 END) ASC,
        COUNT(alloc.rec_id) ASC, 
        random()
    LIMIT 1;

    -- Randomize Presentation Order (Pure first vs Code-mixed first)
    IF random() < 0.5 THEN
        v_order := 'pure_first';
    ELSE
        v_order := 'codemixed_first';
    END IF;

    v_new_code := generate_participant_code();
    INSERT INTO participants (participant_id, session_token)
    VALUES (v_new_code, gen_random_uuid())
    RETURNING * INTO v_participant;

    IF v_order = 'pure_first' THEN
        INSERT INTO experiment_sessions (
            participant_id, current_stage, audio_1_recording_id, audio_2_recording_id, presentation_order
        )
        VALUES (v_participant.id, 'consent_pending', v_pure_id, v_codemixed_id, v_order)
        RETURNING * INTO v_session;
    ELSE
        INSERT INTO experiment_sessions (
            participant_id, current_stage, audio_1_recording_id, audio_2_recording_id, presentation_order
        )
        VALUES (v_participant.id, 'consent_pending', v_codemixed_id, v_pure_id, v_order)
        RETURNING * INTO v_session;
    END IF;

    SELECT * INTO v_rec1 FROM recordings WHERE id = v_session.audio_1_recording_id;
    SELECT * INTO v_rec2 FROM recordings WHERE id = v_session.audio_2_recording_id;

    RETURN jsonb_build_object(
        'status', 'created',
        'participant_id', v_participant.participant_id,
        'session_token', v_participant.session_token,
        'gender', NULL,
        'ethnicity', NULL,
        'first_language', NULL,
        'second_language', NULL,
        'hindi_proficiency', NULL,
        'current_stage', 'consent_pending',
        'audio_1_completed', false,
        'audio_2_completed', false,
        'submitted', false,
        'assigned_audio_1', to_jsonb(v_rec1),
        'assigned_audio_2', to_jsonb(v_rec2),
        'presentation_order', v_session.presentation_order,
        'responses', '{}'::jsonb
    );
END;
$$;

-- Submit Consent and Sociolinguistic Demographics
CREATE OR REPLACE FUNCTION rpc_submit_consent_and_demographics(
    p_session_token UUID,
    p_gender TEXT,
    p_ethnicity TEXT,
    p_first_language TEXT,
    p_second_language TEXT,
    p_hindi_proficiency INT,
    p_consent BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_participant participants%ROWTYPE;
    v_session experiment_sessions%ROWTYPE;
BEGIN
    IF p_consent IS NOT TRUE THEN
        RAISE EXCEPTION 'Informed consent is mandatory to proceed.';
    END IF;

    IF p_hindi_proficiency < 1 OR p_hindi_proficiency > 6 THEN
        RAISE EXCEPTION 'Hindi proficiency must be rated between 1 and 6.';
    END IF;

    SELECT * INTO v_participant FROM participants WHERE session_token = p_session_token;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid session token.';
    END IF;

    SELECT * INTO v_session FROM experiment_sessions WHERE participant_id = v_participant.id;
    
    IF v_session.current_stage != 'consent_pending' THEN
        RETURN jsonb_build_object('success', true, 'current_stage', v_session.current_stage);
    END IF;

    UPDATE participants
    SET gender = p_gender,
        ethnicity = p_ethnicity,
        first_language = p_first_language,
        second_language = p_second_language,
        hindi_proficiency = p_hindi_proficiency
    WHERE id = v_participant.id;

    INSERT INTO consent (participant_id, consent_status, consent_timestamp)
    VALUES (v_participant.id, true, now())
    ON CONFLICT (participant_id) DO UPDATE SET consent_status = true, consent_timestamp = now();

    UPDATE experiment_sessions
    SET current_stage = 'audio_1_pending', updated_at = now()
    WHERE participant_id = v_participant.id
    RETURNING * INTO v_session;

    RETURN jsonb_build_object('success', true, 'current_stage', v_session.current_stage);
END;
$$;

-- Record Audio Playback Start
CREATE OR REPLACE FUNCTION rpc_record_audio_start(
    p_session_token UUID,
    p_audio_number INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_participant participants%ROWTYPE;
BEGIN
    SELECT * INTO v_participant FROM participants WHERE session_token = p_session_token;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid session token.';
    END IF;

    IF p_audio_number = 1 THEN
        UPDATE experiment_sessions
        SET audio_1_started_at = COALESCE(audio_1_started_at, now()), updated_at = now()
        WHERE participant_id = v_participant.id;
    ELSIF p_audio_number = 2 THEN
        UPDATE experiment_sessions
        SET audio_2_started_at = COALESCE(audio_2_started_at, now()), updated_at = now()
        WHERE participant_id = v_participant.id;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Complete Audio Playback
CREATE OR REPLACE FUNCTION rpc_complete_audio(
    p_session_token UUID,
    p_audio_number INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_participant participants%ROWTYPE;
    v_session experiment_sessions%ROWTYPE;
BEGIN
    SELECT * INTO v_participant FROM participants WHERE session_token = p_session_token;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid session token.';
    END IF;

    SELECT * INTO v_session FROM experiment_sessions WHERE participant_id = v_participant.id;

    IF p_audio_number = 1 THEN
        IF v_session.current_stage != 'audio_1_pending' AND v_session.current_stage != 'audio_1_completed' THEN
            IF v_session.audio_1_completed_at IS NOT NULL THEN
                RETURN jsonb_build_object('success', true, 'current_stage', v_session.current_stage);
            END IF;
            RAISE EXCEPTION 'Cannot complete Audio 1 in stage %', v_session.current_stage;
        END IF;

        UPDATE experiment_sessions
        SET audio_1_completed_at = COALESCE(audio_1_completed_at, now()),
            current_stage = 'questions_1_pending',
            updated_at = now()
        WHERE participant_id = v_participant.id
        RETURNING * INTO v_session;

    ELSIF p_audio_number = 2 THEN
        IF v_session.current_stage != 'audio_2_pending' AND v_session.current_stage != 'audio_2_completed' THEN
            IF v_session.audio_2_completed_at IS NOT NULL THEN
                RETURN jsonb_build_object('success', true, 'current_stage', v_session.current_stage);
            END IF;
            RAISE EXCEPTION 'Cannot complete Audio 2 in stage %', v_session.current_stage;
        END IF;

        UPDATE experiment_sessions
        SET audio_2_completed_at = COALESCE(audio_2_completed_at, now()),
            current_stage = 'questions_2_pending',
            updated_at = now()
        WHERE participant_id = v_participant.id
        RETURNING * INTO v_session;
    END IF;

    RETURN jsonb_build_object('success', true, 'current_stage', v_session.current_stage);
END;
$$;

-- Autosave Response with explicit recording_id attachment
CREATE OR REPLACE FUNCTION rpc_autosave_response(
    p_session_token UUID,
    p_question_id VARCHAR(32),
    p_answer TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_participant participants%ROWTYPE;
    v_session experiment_sessions%ROWTYPE;
    v_question questions%ROWTYPE;
    v_recording_id INT;
BEGIN
    SELECT * INTO v_participant FROM participants WHERE session_token = p_session_token;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid session token.';
    END IF;

    SELECT * INTO v_session FROM experiment_sessions WHERE participant_id = v_participant.id;
    IF v_session.session_status = 'submitted' THEN
        RAISE EXCEPTION 'Responses cannot be modified after final submission.';
    END IF;

    SELECT * INTO v_question FROM questions WHERE id = p_question_id;
    IF FOUND THEN
        IF v_question.recording_number = 1 THEN
            v_recording_id := v_session.audio_1_recording_id;
        ELSE
            v_recording_id := v_session.audio_2_recording_id;
        END IF;
    END IF;

    INSERT INTO responses (participant_id, question_id, recording_id, answer, updated_at)
    VALUES (v_participant.id, p_question_id, v_recording_id, p_answer, now())
    ON CONFLICT (participant_id, question_id)
    DO UPDATE SET answer = EXCLUDED.answer, recording_id = EXCLUDED.recording_id, updated_at = now();

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Complete Questions 1 Stage
CREATE OR REPLACE FUNCTION rpc_complete_questions_1(p_session_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_participant participants%ROWTYPE;
    v_session experiment_sessions%ROWTYPE;
    v_unanswered_count INT;
BEGIN
    SELECT * INTO v_participant FROM participants WHERE session_token = p_session_token;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid session token.';
    END IF;

    SELECT * INTO v_session FROM experiment_sessions WHERE participant_id = v_participant.id;
    
    IF v_session.current_stage IN ('audio_2_pending', 'audio_2_completed', 'questions_2_pending', 'submitted') THEN
        RETURN jsonb_build_object('success', true, 'current_stage', v_session.current_stage);
    END IF;

    IF v_session.current_stage != 'questions_1_pending' THEN
        RAISE EXCEPTION 'Invalid stage % for advancing from Questions 1', v_session.current_stage;
    END IF;

    SELECT COUNT(*)
    INTO v_unanswered_count
    FROM questions q
    LEFT JOIN responses r ON r.question_id = q.id AND r.participant_id = v_participant.id
    WHERE q.recording_number = 1 
      AND q.is_required = true
      AND (r.answer IS NULL OR trim(r.answer) = '');

    IF v_unanswered_count > 0 THEN
        RAISE EXCEPTION 'Please answer all % required items for Recording 1 before continuing.', v_unanswered_count;
    END IF;

    UPDATE experiment_sessions
    SET current_stage = 'audio_2_pending', updated_at = now()
    WHERE participant_id = v_participant.id
    RETURNING * INTO v_session;

    RETURN jsonb_build_object('success', true, 'current_stage', v_session.current_stage);
END;
$$;

-- Final Submission of Experiment
CREATE OR REPLACE FUNCTION rpc_submit_experiment(p_session_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_participant participants%ROWTYPE;
    v_session experiment_sessions%ROWTYPE;
    v_unanswered_count INT;
BEGIN
    SELECT * INTO v_participant FROM participants WHERE session_token = p_session_token;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid session token.';
    END IF;

    SELECT * INTO v_session FROM experiment_sessions WHERE participant_id = v_participant.id;
    
    IF v_session.session_status = 'submitted' OR v_session.current_stage = 'submitted' THEN
        RETURN jsonb_build_object(
            'success', true,
            'current_stage', 'submitted',
            'submitted_at', v_session.submitted_at,
            'message', 'Experiment already submitted.'
        );
    END IF;

    IF v_session.current_stage != 'questions_2_pending' THEN
        RAISE EXCEPTION 'Cannot submit experiment in stage %', v_session.current_stage;
    END IF;

    SELECT COUNT(*)
    INTO v_unanswered_count
    FROM questions q
    LEFT JOIN responses r ON r.question_id = q.id AND r.participant_id = v_participant.id
    WHERE q.recording_number = 2 
      AND q.is_required = true
      AND (r.answer IS NULL OR trim(r.answer) = '');

    IF v_unanswered_count > 0 THEN
        RAISE EXCEPTION 'Please answer all % required items for Recording 2 before final submission.', v_unanswered_count;
    END IF;

    UPDATE experiment_sessions
    SET current_stage = 'submitted',
        session_status = 'submitted',
        submitted_at = now(),
        updated_at = now()
    WHERE participant_id = v_participant.id
    RETURNING * INTO v_session;

    RETURN jsonb_build_object(
        'success', true,
        'current_stage', 'submitted',
        'submitted_at', v_session.submitted_at
    );
END;
$$;

-- Grant RPC execution permissions to anonymous & authenticated users
GRANT EXECUTE ON FUNCTION rpc_init_or_resume_session(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_submit_consent_and_demographics(UUID, TEXT, TEXT, TEXT, TEXT, INT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_record_audio_start(UUID, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_complete_audio(UUID, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_autosave_response(UUID, VARCHAR, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_complete_questions_1(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_submit_experiment(UUID) TO anon, authenticated;

-- 5. RESEARCHER EXPORT VIEWS

-- Wide Format Export View
CREATE OR REPLACE VIEW researcher_export_view AS
SELECT 
    p.participant_id AS "Participant ID",
    p.created_at AS "Created At",
    p.gender AS "Gender",
    p.ethnicity AS "Ethnicity",
    p.first_language AS "First Language",
    p.second_language AS "Second Language",
    p.hindi_proficiency AS "Hindi Proficiency (1-6)",
    c.consent_status AS "Consent Granted",
    c.consent_timestamp AS "Consent Timestamp",
    s.presentation_order AS "Presentation Order",
    
    -- Audio 1 Details
    r1.code AS "Audio 1 Code",
    r1.category AS "Audio 1 Category",
    r1.language_variety AS "Audio 1 Language",
    r1.speaker_gender AS "Audio 1 Gender",
    s.audio_1_started_at AS "Audio 1 Started",
    s.audio_1_completed_at AS "Audio 1 Completed",
    
    -- Audio 2 Details
    r2.code AS "Audio 2 Code",
    r2.category AS "Audio 2 Category",
    r2.language_variety AS "Audio 2 Language",
    r2.speaker_gender AS "Audio 2 Gender",
    s.audio_2_started_at AS "Audio 2 Started",
    s.audio_2_completed_at AS "Audio 2 Completed",
    
    s.current_stage AS "Current Stage",
    s.session_status AS "Session Status",
    s.submitted_at AS "Submitted At",

    -- Audio 1 Ratings (12 Traits + 1 Comment)
    MAX(CASE WHEN resp.question_id = 'q1_1' THEN resp.answer END) AS "A1_Leadership",
    MAX(CASE WHEN resp.question_id = 'q1_2' THEN resp.answer END) AS "A1_Sense_of_Humor",
    MAX(CASE WHEN resp.question_id = 'q1_3' THEN resp.answer END) AS "A1_Intelligence",
    MAX(CASE WHEN resp.question_id = 'q1_4' THEN resp.answer END) AS "A1_Religiousness",
    MAX(CASE WHEN resp.question_id = 'q1_5' THEN resp.answer END) AS "A1_Self_Confidence",
    MAX(CASE WHEN resp.question_id = 'q1_6' THEN resp.answer END) AS "A1_Dependability",
    MAX(CASE WHEN resp.question_id = 'q1_7' THEN resp.answer END) AS "A1_Entertainingness",
    MAX(CASE WHEN resp.question_id = 'q1_8' THEN resp.answer END) AS "A1_Kindness",
    MAX(CASE WHEN resp.question_id = 'q1_9' THEN resp.answer END) AS "A1_Ambition",
    MAX(CASE WHEN resp.question_id = 'q1_10' THEN resp.answer END) AS "A1_Sociability",
    MAX(CASE WHEN resp.question_id = 'q1_11' THEN resp.answer END) AS "A1_Character",
    MAX(CASE WHEN resp.question_id = 'q1_12' THEN resp.answer END) AS "A1_Likability",
    MAX(CASE WHEN resp.question_id = 'q1_comment' THEN resp.answer END) AS "A1_Candid_Opinions",

    -- Audio 2 Ratings (12 Traits + 1 Comment)
    MAX(CASE WHEN resp.question_id = 'q2_1' THEN resp.answer END) AS "A2_Leadership",
    MAX(CASE WHEN resp.question_id = 'q2_2' THEN resp.answer END) AS "A2_Sense_of_Humor",
    MAX(CASE WHEN resp.question_id = 'q2_3' THEN resp.answer END) AS "A2_Intelligence",
    MAX(CASE WHEN resp.question_id = 'q2_4' THEN resp.answer END) AS "A2_Religiousness",
    MAX(CASE WHEN resp.question_id = 'q2_5' THEN resp.answer END) AS "A2_Self_Confidence",
    MAX(CASE WHEN resp.question_id = 'q2_6' THEN resp.answer END) AS "A2_Dependability",
    MAX(CASE WHEN resp.question_id = 'q2_7' THEN resp.answer END) AS "A2_Entertainingness",
    MAX(CASE WHEN resp.question_id = 'q2_8' THEN resp.answer END) AS "A2_Kindness",
    MAX(CASE WHEN resp.question_id = 'q2_9' THEN resp.answer END) AS "A2_Ambition",
    MAX(CASE WHEN resp.question_id = 'q2_10' THEN resp.answer END) AS "A2_Sociability",
    MAX(CASE WHEN resp.question_id = 'q2_11' THEN resp.answer END) AS "A2_Character",
    MAX(CASE WHEN resp.question_id = 'q2_12' THEN resp.answer END) AS "A2_Likability",
    MAX(CASE WHEN resp.question_id = 'q2_comment' THEN resp.answer END) AS "A2_Candid_Opinions"
FROM participants p
LEFT JOIN consent c ON c.participant_id = p.id
LEFT JOIN experiment_sessions s ON s.participant_id = p.id
LEFT JOIN recordings r1 ON r1.id = s.audio_1_recording_id
LEFT JOIN recordings r2 ON r2.id = s.audio_2_recording_id
LEFT JOIN responses resp ON resp.participant_id = p.id
GROUP BY 
    p.participant_id, p.created_at, p.gender, p.ethnicity, p.first_language, p.second_language, p.hindi_proficiency,
    c.consent_status, c.consent_timestamp, s.presentation_order,
    r1.code, r1.category, r1.language_variety, r1.speaker_gender,
    s.audio_1_started_at, s.audio_1_completed_at,
    r2.code, r2.category, r2.language_variety, r2.speaker_gender,
    s.audio_2_started_at, s.audio_2_completed_at,
    s.current_stage, s.session_status, s.submitted_at
ORDER BY p.created_at ASC;

-- Long / Tidy Format View (for ANOVA / Regression in R/Python)
CREATE OR REPLACE VIEW researcher_responses_long_view AS
SELECT 
    p.participant_id,
    p.gender AS participant_gender,
    p.ethnicity AS participant_ethnicity,
    p.first_language,
    p.second_language,
    p.hindi_proficiency,
    s.presentation_order,
    q.recording_number,
    q.question_number,
    q.question_key,
    q.question_type,
    q.id AS question_id,
    r.id AS recording_id,
    r.code AS audio_code,
    r.category AS audio_category,
    r.language_variety,
    r.speaker_gender,
    resp.answer,
    resp.created_at AS response_time
FROM responses resp
JOIN participants p ON p.id = resp.participant_id
JOIN questions q ON q.id = resp.question_id
JOIN recordings r ON r.id = resp.recording_id
JOIN experiment_sessions s ON s.participant_id = p.id
ORDER BY p.participant_id, q.recording_number, q.question_number;

-- 6. SEED DATA (10 Recordings + 26 Questions)

-- A. Insert 10 Recordings
INSERT INTO recordings (id, code, category, language_variety, speaker_gender, title, description, audio_storage_path, duration_seconds)
VALUES 
(1,  'pure_hindi_male',               'pure',       'Pure Hindi',                'male',   'Audio Recording (Pure Hindi - Male)',               'Audio recording of speaker.', 'pure_hindi_male.mp3.mpeg',               60),
(2,  'pure_hindi_female',             'pure',       'Pure Hindi',                'female', 'Audio Recording (Pure Hindi - Female)',             'Audio recording of speaker.', 'pure_hindi_female.mp3.mpeg',             60),
(3,  'pure_english_male',             'pure',       'Pure English',              'male',   'Audio Recording (Pure English - Male)',             'Audio recording of speaker.', 'pure_english_male.mp3.mpeg',             60),
(4,  'pure_english_female',           'pure',       'Pure English',              'female', 'Audio Recording (Pure English - Female)',           'Audio recording of speaker.', 'pure_english_female.mp3.mpeg',           60),
(5,  'pure_bombay_hindi_male',        'pure',       'Pure Bombay Hindi',         'male',   'Audio Recording (Pure Bombay Hindi - Male)',        'Audio recording of speaker.', 'pure_bombay_hindi_male.mp3.mpeg',        60),
(6,  'pure_bombay_hindi_female',      'pure',       'Pure Bombay Hindi',         'female', 'Audio Recording (Pure Bombay Hindi - Female)',      'Audio recording of speaker.', 'pure_bombay_hindi_female.mp3.mpeg',      60),
(7,  'codemixed_hindi_male',          'code_mixed', 'Code-Mixed Hindi',          'male',   'Audio Recording (Code-Mixed Hindi - Male)',          'Audio recording of speaker.', 'codemixed_hindi_male.mp3.mpeg',          60),
(8,  'codemixed_hindi_female',        'code_mixed', 'Code-Mixed Hindi',          'female', 'Audio Recording (Code-Mixed Hindi - Female)',        'Audio recording of speaker.', 'codemixed_hindi_female.mp3.mpeg',        60),
(9,  'codemixed_bombay_english_male', 'code_mixed', 'Code-Mixed Bombay English', 'male',   'Audio Recording (Code-Mixed Bombay English - Male)','Audio recording of speaker.', 'codemixed_bombay_english_male.mp3.mpeg', 60),
(10, 'codemixed_bombay_english_female','code_mixed','Code-Mixed Bombay English', 'female', 'Audio Recording (Code-Mixed Bombay English - Female)','Audio recording of speaker.','codemixed_bombay_english_female.mp3.mpeg', 60)
ON CONFLICT (id) DO UPDATE SET
    code = EXCLUDED.code,
    category = EXCLUDED.category,
    language_variety = EXCLUDED.language_variety,
    speaker_gender = EXCLUDED.speaker_gender,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    audio_storage_path = EXCLUDED.audio_storage_path,
    duration_seconds = EXCLUDED.duration_seconds;

SELECT setval('recordings_id_seq', (SELECT MAX(id) FROM recordings));

-- B. Insert 12 Trait Items + 1 Comment for Audio 1
INSERT INTO questions (id, recording_number, question_number, question_key, question_text, question_type, is_required, placeholder)
VALUES
('q1_1',       1, 1,  'leadership',        'Leadership',          'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q1_2',       1, 2,  'humor',             'Sense of Humor',      'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q1_3',       1, 3,  'intelligence',      'Intelligence',        'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q1_4',       1, 4,  'religiousness',     'Religiousness',       'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q1_5',       1, 5,  'confidence',        'Self-confidence',     'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q1_6',       1, 6,  'dependability',     'Dependability',       'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q1_7',       1, 7,  'entertainingness',  'Entertainingness',    'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q1_8',       1, 8,  'kindness',          'Kindness',            'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q1_9',       1, 9,  'ambition',          'Ambition',            'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q1_10',      1, 10, 'sociability',       'Sociability',         'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q1_11',      1, 11, 'character',         'Character',           'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q1_12',      1, 12, 'likability',        'Likability',          'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q1_comment', 1, 13, 'comment',           'List all your opinions about the speaker, be as candid as possible', 'comment', false, 'Write your candid thoughts, impressions, and opinions about the speaker here...')
ON CONFLICT (recording_number, question_number) DO UPDATE SET
    question_key = EXCLUDED.question_key,
    question_text = EXCLUDED.question_text,
    question_type = EXCLUDED.question_type,
    is_required = EXCLUDED.is_required,
    placeholder = EXCLUDED.placeholder;

-- C. Insert 12 Trait Items + 1 Comment for Audio 2
INSERT INTO questions (id, recording_number, question_number, question_key, question_text, question_type, is_required, placeholder)
VALUES
('q2_1',       2, 1,  'leadership',        'Leadership',          'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q2_2',       2, 2,  'humor',             'Sense of Humor',      'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q2_3',       2, 3,  'intelligence',      'Intelligence',        'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q2_4',       2, 4,  'religiousness',     'Religiousness',       'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q2_5',       2, 5,  'confidence',        'Self-confidence',     'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q2_6',       2, 6,  'dependability',     'Dependability',       'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q2_7',       2, 7,  'entertainingness',  'Entertainingness',    'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q2_8',       2, 8,  'kindness',          'Kindness',            'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q2_9',       2, 9,  'ambition',          'Ambition',            'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q2_10',      2, 10, 'sociability',       'Sociability',         'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q2_11',      2, 11, 'character',         'Character',           'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q2_12',      2, 12, 'likability',        'Likability',          'scale',   true, 'Rate 1 (Least) to 6 (Most)'),
('q2_comment', 2, 13, 'comment',           'List all your opinions about the speaker, be as candid as possible', 'comment', false, 'Write your candid thoughts, impressions, and opinions about the speaker here...')
ON CONFLICT (recording_number, question_number) DO UPDATE SET
    question_key = EXCLUDED.question_key,
    question_text = EXCLUDED.question_text,
    question_type = EXCLUDED.question_type,
    is_required = EXCLUDED.is_required,
    placeholder = EXCLUDED.placeholder;

-- 7. SUPABASE STORAGE BUCKET SETUP ('audio_files', the name the site reads from)
-- Automatically creates the public storage bucket for audio recordings
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio_files', 'audio_files', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public Access to Audio Files" ON storage.objects;
CREATE POLICY "Public Access to Audio Files" ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (bucket_id = 'audio_files');


-- ==============================================================================
-- APPLY THE ADMIN DASHBOARD MIGRATION (copied from supabase/migrations/20261112000000_admin_dashboard.sql)
-- ==============================================================================
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


-- ==============================================================================
-- APPLY THE DATA INTEGRITY MIGRATION (copied from supabase/migrations/20261113000000_data_integrity_fixes.sql)
-- ==============================================================================
-- ==============================================================================
-- DATA INTEGRITY, LISTENING CHECKS, TRAIT ORDER AND EXPORT VIEW FIXES
--
-- Run this on the LIVE project in the Supabase SQL Editor AFTER
-- 20261112000000_admin_dashboard.sql. It never drops tables or deletes data.
-- It is idempotent: running it twice is harmless.
--
-- What it changes:
--   1. Records the real length of every recording (they are 54 to 73 s, not 60 s).
--   2. Randomises the order of the 12 traits per participant and per audio, and
--      stores that order (existing sessions are recorded as the default order).
--   3. Adds an audio_events table (play / pause / tab hidden / load errors).
--   4. rpc_complete_audio refuses completion unless enough time has passed since
--      playback started (85% of the recording's length).
--   5. rpc_autosave_response validates answers (ratings must be 1 to 6, comments
--      at most 5000 characters) and only accepts answers in the matching stage.
--   6. Allocation counts only submitted sessions and sessions active in the last
--      30 minutes, and is serialised so simultaneous arrivals cannot collide.
--   7. The participant session no longer receives the recording's code, title,
--      language or gender, and anonymous visitors can no longer read the
--      recordings table.
--   8. Every SECURITY DEFINER function gets a fixed search_path.
--   9. The researcher export views gain session status, final-answer time,
--      listening time, audio event counts, trait display position and a numeric
--      rating column. Existing columns keep their names and order.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. REAL RECORDING DURATIONS (measured with ffprobe, rounded down to whole seconds)
--    If you re-upload different audio, update these numbers to match.
-- ------------------------------------------------------------------------------
UPDATE public.recordings AS r
SET duration_seconds = d.seconds
FROM (VALUES
    ('pure_hindi_male', 70),
    ('pure_hindi_female', 72),
    ('pure_english_male', 54),
    ('pure_english_female', 55),
    ('pure_bombay_hindi_male', 62),
    ('pure_bombay_hindi_female', 67),
    ('codemixed_hindi_male', 70),
    ('codemixed_hindi_female', 61),
    ('codemixed_bombay_english_male', 63),
    ('codemixed_bombay_english_female', 73)
) AS d(code, seconds)
WHERE r.code = d.code;


-- ------------------------------------------------------------------------------
-- 2. PER-PARTICIPANT TRAIT ORDER
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.random_trait_order()
RETURNS INT[]
LANGUAGE sql
VOLATILE
SET search_path = public, pg_temp
AS $$
    SELECT array_agg(g ORDER BY random()) FROM generate_series(1, 12) AS g;
$$;

ALTER TABLE public.experiment_sessions ADD COLUMN IF NOT EXISTS trait_order_1 INT[];
ALTER TABLE public.experiment_sessions ADD COLUMN IF NOT EXISTS trait_order_2 INT[];

-- Sessions that already exist were shown the traits in the default order 1..12.
UPDATE public.experiment_sessions
SET trait_order_1 = ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]
WHERE trait_order_1 IS NULL;
UPDATE public.experiment_sessions
SET trait_order_2 = ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]
WHERE trait_order_2 IS NULL;

-- New sessions get a fresh random order for each audio.
ALTER TABLE public.experiment_sessions ALTER COLUMN trait_order_1 SET DEFAULT public.random_trait_order();
ALTER TABLE public.experiment_sessions ALTER COLUMN trait_order_2 SET DEFAULT public.random_trait_order();


-- ------------------------------------------------------------------------------
-- 3. AUDIO EVENT LOG
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audio_events (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    participant_id   UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
    audio_number     INT NOT NULL CHECK (audio_number IN (1, 2)),
    event_type       TEXT NOT NULL CHECK (event_type IN ('play', 'pause', 'ended', 'hidden', 'visible', 'load_error')),
    position_seconds NUMERIC(8, 2),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audio_events_participant ON public.audio_events(participant_id, audio_number);

ALTER TABLE public.audio_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audio_events FROM anon, authenticated;
GRANT SELECT, DELETE ON public.audio_events TO authenticated;

DROP POLICY IF EXISTS "Admin read audio events" ON public.audio_events;
CREATE POLICY "Admin read audio events" ON public.audio_events
    FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admin delete audio events" ON public.audio_events;
CREATE POLICY "Admin delete audio events" ON public.audio_events
    FOR DELETE TO authenticated USING ((SELECT public.is_admin()));


-- ------------------------------------------------------------------------------
-- 4. HIDE RECORDING METADATA FROM ANONYMOUS VISITORS
--    The participant site never reads this table directly; only the RPCs do.
--    Logged-in admins can still read it (the dashboard and export views need it).
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public read access to recordings" ON public.recordings;
DROP POLICY IF EXISTS "Authenticated read access to recordings" ON public.recordings;
CREATE POLICY "Authenticated read access to recordings" ON public.recordings
    FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.recordings FROM anon;


-- ------------------------------------------------------------------------------
-- 5. PARTICIPANT FUNCTIONS
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_participant_code()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    result TEXT := 'P-';
    i INT;
BEGIN
    FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$;


-- Initialise or resume a session.
-- The audio objects returned contain only what the player needs (file path and
-- length), so a participant cannot see which guise they were given.
CREATE OR REPLACE FUNCTION public.rpc_init_or_resume_session(p_session_token UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_participant participants%ROWTYPE;
    v_session experiment_sessions%ROWTYPE;
    v_new_code TEXT;
    v_responses JSONB;
    v_rec1 recordings%ROWTYPE;
    v_rec2 recordings%ROWTYPE;
    v_pure_id INT;
    v_pure_gender VARCHAR(16);
    v_codemixed_id INT;
    v_order VARCHAR(32);
    v_attempt INT := 0;
BEGIN
    -- 1. Resume an existing session if the token is valid.
    IF p_session_token IS NOT NULL THEN
        SELECT * INTO v_participant FROM participants WHERE session_token = p_session_token;
        IF FOUND THEN
            SELECT * INTO v_session FROM experiment_sessions WHERE participant_id = v_participant.id;
            SELECT * INTO v_rec1 FROM recordings WHERE id = v_session.audio_1_recording_id;
            SELECT * INTO v_rec2 FROM recordings WHERE id = v_session.audio_2_recording_id;

            SELECT COALESCE(jsonb_object_agg(question_id, answer), '{}'::jsonb)
            INTO v_responses
            FROM responses
            WHERE participant_id = v_participant.id;

            RETURN jsonb_build_object(
                'status', 'resumed',
                'participant_id', v_participant.participant_id,
                'session_token', v_participant.session_token,
                'gender', v_participant.gender,
                'ethnicity', v_participant.ethnicity,
                'first_language', v_participant.first_language,
                'second_language', v_participant.second_language,
                'hindi_proficiency', v_participant.hindi_proficiency,
                'current_stage', v_session.current_stage,
                'audio_1_completed', v_session.audio_1_completed_at IS NOT NULL,
                'audio_2_completed', v_session.audio_2_completed_at IS NOT NULL,
                'submitted', v_session.submitted_at IS NOT NULL,
                'assigned_audio_1', jsonb_build_object(
                    'audio_storage_path', v_rec1.audio_storage_path,
                    'duration_seconds', v_rec1.duration_seconds),
                'assigned_audio_2', jsonb_build_object(
                    'audio_storage_path', v_rec2.audio_storage_path,
                    'duration_seconds', v_rec2.duration_seconds),
                'presentation_order', v_session.presentation_order,
                'trait_order_1', to_jsonb(v_session.trait_order_1),
                'trait_order_2', to_jsonb(v_session.trait_order_2),
                'responses', v_responses
            );
        END IF;
    END IF;

    -- 2. New session. Serialise allocation so two people arriving at the same
    --    moment cannot both be given the same least-used recording.
    PERFORM pg_advisory_xact_lock(hashtext('socio_audio_allocation'));

    -- Only sessions that were submitted, or are still in progress and were
    -- active in the last 30 minutes, count towards balance. Abandoned visits
    -- and test visits that were left alone therefore stop skewing allocation.
    SELECT r.id, r.speaker_gender
    INTO v_pure_id, v_pure_gender
    FROM recordings r
    LEFT JOIN (
        SELECT audio_1_recording_id AS rec_id FROM experiment_sessions
        WHERE session_status = 'submitted'
           OR (session_status = 'in_progress' AND last_activity_at > now() - interval '30 minutes')
        UNION ALL
        SELECT audio_2_recording_id AS rec_id FROM experiment_sessions
        WHERE session_status = 'submitted'
           OR (session_status = 'in_progress' AND last_activity_at > now() - interval '30 minutes')
    ) alloc ON alloc.rec_id = r.id
    WHERE r.category = 'pure' AND r.is_active
    GROUP BY r.id, r.speaker_gender
    ORDER BY COUNT(alloc.rec_id) ASC, random()
    LIMIT 1;

    -- Least-allocated code-mixed recording, opposite speaker gender first.
    SELECT r.id
    INTO v_codemixed_id
    FROM recordings r
    LEFT JOIN (
        SELECT audio_1_recording_id AS rec_id FROM experiment_sessions
        WHERE session_status = 'submitted'
           OR (session_status = 'in_progress' AND last_activity_at > now() - interval '30 minutes')
        UNION ALL
        SELECT audio_2_recording_id AS rec_id FROM experiment_sessions
        WHERE session_status = 'submitted'
           OR (session_status = 'in_progress' AND last_activity_at > now() - interval '30 minutes')
    ) alloc ON alloc.rec_id = r.id
    WHERE r.category = 'code_mixed' AND r.is_active
    GROUP BY r.id, r.speaker_gender
    ORDER BY
        (CASE WHEN r.speaker_gender != v_pure_gender THEN 0 ELSE 1 END) ASC,
        COUNT(alloc.rec_id) ASC,
        random()
    LIMIT 1;

    IF v_pure_id IS NULL OR v_codemixed_id IS NULL THEN
        RAISE EXCEPTION 'No active recordings are available for allocation.';
    END IF;

    IF random() < 0.5 THEN
        v_order := 'pure_first';
    ELSE
        v_order := 'codemixed_first';
    END IF;

    -- Participant codes are random; retry on the (very unlikely) collision.
    LOOP
        v_attempt := v_attempt + 1;
        v_new_code := generate_participant_code();
        EXIT WHEN NOT EXISTS (SELECT 1 FROM participants WHERE participant_id = v_new_code) OR v_attempt >= 10;
    END LOOP;

    INSERT INTO participants (participant_id, session_token)
    VALUES (v_new_code, gen_random_uuid())
    RETURNING * INTO v_participant;

    INSERT INTO experiment_sessions (
        participant_id, current_stage, audio_1_recording_id, audio_2_recording_id, presentation_order
    )
    VALUES (
        v_participant.id,
        'consent_pending',
        CASE WHEN v_order = 'pure_first' THEN v_pure_id ELSE v_codemixed_id END,
        CASE WHEN v_order = 'pure_first' THEN v_codemixed_id ELSE v_pure_id END,
        v_order
    )
    RETURNING * INTO v_session;

    SELECT * INTO v_rec1 FROM recordings WHERE id = v_session.audio_1_recording_id;
    SELECT * INTO v_rec2 FROM recordings WHERE id = v_session.audio_2_recording_id;

    RETURN jsonb_build_object(
        'status', 'created',
        'participant_id', v_participant.participant_id,
        'session_token', v_participant.session_token,
        'gender', NULL,
        'ethnicity', NULL,
        'first_language', NULL,
        'second_language', NULL,
        'hindi_proficiency', NULL,
        'current_stage', 'consent_pending',
        'audio_1_completed', false,
        'audio_2_completed', false,
        'submitted', false,
        'assigned_audio_1', jsonb_build_object(
            'audio_storage_path', v_rec1.audio_storage_path,
            'duration_seconds', v_rec1.duration_seconds),
        'assigned_audio_2', jsonb_build_object(
            'audio_storage_path', v_rec2.audio_storage_path,
            'duration_seconds', v_rec2.duration_seconds),
        'presentation_order', v_session.presentation_order,
        'trait_order_1', to_jsonb(v_session.trait_order_1),
        'trait_order_2', to_jsonb(v_session.trait_order_2),
        'responses', '{}'::jsonb
    );
END;
$$;


-- Consent and demographics (same behaviour, plus basic input validation).
CREATE OR REPLACE FUNCTION public.rpc_submit_consent_and_demographics(
    p_session_token UUID,
    p_gender TEXT,
    p_ethnicity TEXT,
    p_first_language TEXT,
    p_second_language TEXT,
    p_hindi_proficiency INT,
    p_consent BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_participant participants%ROWTYPE;
    v_session experiment_sessions%ROWTYPE;
BEGIN
    IF p_consent IS NOT TRUE THEN
        RAISE EXCEPTION 'Informed consent is mandatory to proceed.';
    END IF;

    IF p_hindi_proficiency IS NULL OR p_hindi_proficiency < 1 OR p_hindi_proficiency > 6 THEN
        RAISE EXCEPTION 'Hindi proficiency must be rated between 1 and 6.';
    END IF;

    IF COALESCE(btrim(p_gender), '') = '' OR COALESCE(btrim(p_ethnicity), '') = ''
       OR COALESCE(btrim(p_first_language), '') = '' OR COALESCE(btrim(p_second_language), '') = '' THEN
        RAISE EXCEPTION 'VALIDATION: Please complete every background question.';
    END IF;

    IF length(p_gender) > 64 OR length(p_ethnicity) > 128
       OR length(p_first_language) > 128 OR length(p_second_language) > 128 THEN
        RAISE EXCEPTION 'VALIDATION: One of the background answers is too long.';
    END IF;

    SELECT * INTO v_participant FROM participants WHERE session_token = p_session_token;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid session token.';
    END IF;

    SELECT * INTO v_session FROM experiment_sessions WHERE participant_id = v_participant.id;

    IF v_session.current_stage != 'consent_pending' THEN
        RETURN jsonb_build_object('success', true, 'current_stage', v_session.current_stage);
    END IF;

    UPDATE participants
    SET gender = btrim(p_gender),
        ethnicity = btrim(p_ethnicity),
        first_language = btrim(p_first_language),
        second_language = btrim(p_second_language),
        hindi_proficiency = p_hindi_proficiency,
        updated_at = now()
    WHERE id = v_participant.id;

    INSERT INTO consent (participant_id, consent_status, consent_timestamp)
    VALUES (v_participant.id, true, now())
    ON CONFLICT (participant_id) DO UPDATE SET consent_status = true, consent_timestamp = now();

    UPDATE experiment_sessions
    SET current_stage = 'audio_1_pending', updated_at = now()
    WHERE participant_id = v_participant.id
    RETURNING * INTO v_session;

    RETURN jsonb_build_object('success', true, 'current_stage', v_session.current_stage);
END;
$$;


-- Audio playback start (unchanged apart from search_path and input check).
CREATE OR REPLACE FUNCTION public.rpc_record_audio_start(
    p_session_token UUID,
    p_audio_number INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_participant participants%ROWTYPE;
BEGIN
    SELECT * INTO v_participant FROM participants WHERE session_token = p_session_token;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid session token.';
    END IF;

    IF p_audio_number = 1 THEN
        UPDATE experiment_sessions
        SET audio_1_started_at = COALESCE(audio_1_started_at, now()), updated_at = now()
        WHERE participant_id = v_participant.id;
    ELSIF p_audio_number = 2 THEN
        UPDATE experiment_sessions
        SET audio_2_started_at = COALESCE(audio_2_started_at, now()), updated_at = now()
        WHERE participant_id = v_participant.id;
    ELSE
        RAISE EXCEPTION 'Invalid audio number.';
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;


-- Audio event log (play, pause, tab hidden or visible, ended, load errors).
-- Capped at 500 events per participant so a misbehaving browser cannot flood it.
CREATE OR REPLACE FUNCTION public.rpc_record_audio_event(
    p_session_token UUID,
    p_audio_number INT,
    p_event_type TEXT,
    p_position_seconds NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_participant participants%ROWTYPE;
BEGIN
    SELECT * INTO v_participant FROM participants WHERE session_token = p_session_token;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid session token.';
    END IF;

    IF p_audio_number NOT IN (1, 2)
       OR p_event_type NOT IN ('play', 'pause', 'ended', 'hidden', 'visible', 'load_error') THEN
        RAISE EXCEPTION 'VALIDATION: Unknown audio event.';
    END IF;

    IF (SELECT COUNT(*) FROM audio_events WHERE participant_id = v_participant.id) >= 500 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'event_limit');
    END IF;

    INSERT INTO audio_events (participant_id, audio_number, event_type, position_seconds)
    VALUES (
        v_participant.id,
        p_audio_number,
        p_event_type,
        CASE WHEN p_position_seconds IS NULL THEN NULL
             ELSE LEAST(GREATEST(p_position_seconds, 0), 999999) END
    );

    RETURN jsonb_build_object('success', true);
END;
$$;


-- Audio completion with a server-side listening check.
-- Completion is accepted only if at least 85% of the recording's length has
-- passed since playback first started. Otherwise the function returns
-- success = false with reason 'listen_incomplete' (it does not raise, so that
-- a missing start time can be recorded and the participant can listen again).
CREATE OR REPLACE FUNCTION public.rpc_complete_audio(
    p_session_token UUID,
    p_audio_number INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_participant participants%ROWTYPE;
    v_session experiment_sessions%ROWTYPE;
    v_recording_id INT;
    v_started TIMESTAMPTZ;
    v_completed TIMESTAMPTZ;
    v_expected_stage TEXT;
    v_next_stage TEXT;
    v_duration INT;
    v_required NUMERIC;
    v_elapsed NUMERIC;
BEGIN
    SELECT * INTO v_participant FROM participants WHERE session_token = p_session_token;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid session token.';
    END IF;

    IF p_audio_number NOT IN (1, 2) THEN
        RAISE EXCEPTION 'Invalid audio number.';
    END IF;

    SELECT * INTO v_session FROM experiment_sessions WHERE participant_id = v_participant.id;

    IF p_audio_number = 1 THEN
        v_recording_id := v_session.audio_1_recording_id;
        v_started := v_session.audio_1_started_at;
        v_completed := v_session.audio_1_completed_at;
        v_expected_stage := 'audio_1_pending';
        v_next_stage := 'questions_1_pending';
    ELSE
        v_recording_id := v_session.audio_2_recording_id;
        v_started := v_session.audio_2_started_at;
        v_completed := v_session.audio_2_completed_at;
        v_expected_stage := 'audio_2_pending';
        v_next_stage := 'questions_2_pending';
    END IF;

    -- Already completed: idempotent success.
    IF v_completed IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'current_stage', v_session.current_stage);
    END IF;

    IF v_session.current_stage != v_expected_stage THEN
        RAISE EXCEPTION 'Cannot complete Audio % in stage %', p_audio_number, v_session.current_stage;
    END IF;

    SELECT duration_seconds INTO v_duration FROM recordings WHERE id = v_recording_id;
    v_required := GREATEST(COALESCE(v_duration, 60) * 0.85, 1);

    IF v_started IS NULL THEN
        -- The start was never recorded (for example a failed network call).
        -- Record it now so that a complete second listen will be accepted.
        IF p_audio_number = 1 THEN
            UPDATE experiment_sessions SET audio_1_started_at = now(), updated_at = now()
            WHERE participant_id = v_participant.id;
        ELSE
            UPDATE experiment_sessions SET audio_2_started_at = now(), updated_at = now()
            WHERE participant_id = v_participant.id;
        END IF;
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'listen_incomplete',
            'required_seconds', round(v_required, 1),
            'elapsed_seconds', 0,
            'current_stage', v_session.current_stage
        );
    END IF;

    v_elapsed := EXTRACT(EPOCH FROM (now() - v_started));
    IF v_elapsed < v_required THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'listen_incomplete',
            'required_seconds', round(v_required, 1),
            'elapsed_seconds', round(v_elapsed, 1),
            'current_stage', v_session.current_stage
        );
    END IF;

    IF p_audio_number = 1 THEN
        UPDATE experiment_sessions
        SET audio_1_completed_at = now(), current_stage = v_next_stage, updated_at = now()
        WHERE participant_id = v_participant.id
        RETURNING * INTO v_session;
    ELSE
        UPDATE experiment_sessions
        SET audio_2_completed_at = now(), current_stage = v_next_stage, updated_at = now()
        WHERE participant_id = v_participant.id
        RETURNING * INTO v_session;
    END IF;

    RETURN jsonb_build_object('success', true, 'current_stage', v_session.current_stage);
END;
$$;


-- Autosave with validation.
--   * The question must exist.
--   * Audio 1 answers are accepted only in questions_1_pending, audio 2 answers
--     only in questions_2_pending (so nobody can answer before listening).
--   * Ratings must be a whole number from 1 to 6. Comments are at most 5000 characters.
CREATE OR REPLACE FUNCTION public.rpc_autosave_response(
    p_session_token UUID,
    p_question_id VARCHAR(32),
    p_answer TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_participant participants%ROWTYPE;
    v_session experiment_sessions%ROWTYPE;
    v_question questions%ROWTYPE;
    v_recording_id INT;
    v_required_stage TEXT;
    v_answer TEXT;
BEGIN
    SELECT * INTO v_participant FROM participants WHERE session_token = p_session_token;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid session token.';
    END IF;

    SELECT * INTO v_session FROM experiment_sessions WHERE participant_id = v_participant.id;
    IF v_session.session_status = 'submitted' THEN
        RAISE EXCEPTION 'Responses cannot be modified after final submission.';
    END IF;

    SELECT * INTO v_question FROM questions WHERE id = p_question_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'VALIDATION: Unknown question %.', p_question_id;
    END IF;

    IF v_question.recording_number = 1 THEN
        v_recording_id := v_session.audio_1_recording_id;
        v_required_stage := 'questions_1_pending';
    ELSE
        v_recording_id := v_session.audio_2_recording_id;
        v_required_stage := 'questions_2_pending';
    END IF;

    IF v_session.current_stage != v_required_stage THEN
        RAISE EXCEPTION 'STAGE_LOCKED: Question % cannot be answered in stage %.', p_question_id, v_session.current_stage;
    END IF;

    IF v_question.question_type = 'scale' THEN
        v_answer := btrim(COALESCE(p_answer, ''));
        IF v_answer !~ '^[1-6]$' THEN
            RAISE EXCEPTION 'VALIDATION: Ratings must be a whole number from 1 to 6.';
        END IF;
    ELSE
        v_answer := COALESCE(p_answer, '');
        IF length(v_answer) > 5000 THEN
            RAISE EXCEPTION 'VALIDATION: Comments can be at most 5000 characters long.';
        END IF;
    END IF;

    INSERT INTO responses (participant_id, question_id, recording_id, answer, updated_at)
    VALUES (v_participant.id, p_question_id, v_recording_id, v_answer, now())
    ON CONFLICT (participant_id, question_id)
    DO UPDATE SET answer = EXCLUDED.answer, recording_id = EXCLUDED.recording_id, updated_at = now();

    RETURN jsonb_build_object('success', true);
END;
$$;


-- Complete questions 1 (unchanged apart from search_path).
CREATE OR REPLACE FUNCTION public.rpc_complete_questions_1(p_session_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_participant participants%ROWTYPE;
    v_session experiment_sessions%ROWTYPE;
    v_unanswered_count INT;
BEGIN
    SELECT * INTO v_participant FROM participants WHERE session_token = p_session_token;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid session token.';
    END IF;

    SELECT * INTO v_session FROM experiment_sessions WHERE participant_id = v_participant.id;

    IF v_session.current_stage IN ('audio_2_pending', 'questions_2_pending', 'submitted') THEN
        RETURN jsonb_build_object('success', true, 'current_stage', v_session.current_stage);
    END IF;

    IF v_session.current_stage != 'questions_1_pending' THEN
        RAISE EXCEPTION 'Invalid stage % for advancing from Questions 1', v_session.current_stage;
    END IF;

    SELECT COUNT(*)
    INTO v_unanswered_count
    FROM questions q
    LEFT JOIN responses r ON r.question_id = q.id AND r.participant_id = v_participant.id
    WHERE q.recording_number = 1
      AND q.is_required = true
      AND (r.answer IS NULL OR trim(r.answer) = '');

    IF v_unanswered_count > 0 THEN
        RAISE EXCEPTION 'Please answer all % required items for Recording 1 before continuing.', v_unanswered_count;
    END IF;

    UPDATE experiment_sessions
    SET current_stage = 'audio_2_pending', updated_at = now()
    WHERE participant_id = v_participant.id
    RETURNING * INTO v_session;

    RETURN jsonb_build_object('success', true, 'current_stage', v_session.current_stage);
END;
$$;


-- Final submission (unchanged apart from search_path).
CREATE OR REPLACE FUNCTION public.rpc_submit_experiment(p_session_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_participant participants%ROWTYPE;
    v_session experiment_sessions%ROWTYPE;
    v_unanswered_count INT;
BEGIN
    SELECT * INTO v_participant FROM participants WHERE session_token = p_session_token;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid session token.';
    END IF;

    SELECT * INTO v_session FROM experiment_sessions WHERE participant_id = v_participant.id;

    IF v_session.session_status = 'submitted' OR v_session.current_stage = 'submitted' THEN
        RETURN jsonb_build_object(
            'success', true,
            'current_stage', 'submitted',
            'submitted_at', v_session.submitted_at,
            'message', 'Experiment already submitted.'
        );
    END IF;

    IF v_session.current_stage != 'questions_2_pending' THEN
        RAISE EXCEPTION 'Cannot submit experiment in stage %', v_session.current_stage;
    END IF;

    SELECT COUNT(*)
    INTO v_unanswered_count
    FROM questions q
    LEFT JOIN responses r ON r.question_id = q.id AND r.participant_id = v_participant.id
    WHERE q.recording_number = 2
      AND q.is_required = true
      AND (r.answer IS NULL OR trim(r.answer) = '');

    IF v_unanswered_count > 0 THEN
        RAISE EXCEPTION 'Please answer all % required items for Recording 2 before final submission.', v_unanswered_count;
    END IF;

    UPDATE experiment_sessions
    SET current_stage = 'submitted',
        session_status = 'submitted',
        submitted_at = now(),
        updated_at = now()
    WHERE participant_id = v_participant.id
    RETURNING * INTO v_session;

    RETURN jsonb_build_object(
        'success', true,
        'current_stage', 'submitted',
        'submitted_at', v_session.submitted_at
    );
END;
$$;

-- The trigger and admin functions from the admin migration already set search_path.

GRANT EXECUTE ON FUNCTION public.rpc_init_or_resume_session(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_submit_consent_and_demographics(UUID, TEXT, TEXT, TEXT, TEXT, INT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_record_audio_start(UUID, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_record_audio_event(UUID, INT, TEXT, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_complete_audio(UUID, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_autosave_response(UUID, VARCHAR, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_complete_questions_1(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_submit_experiment(UUID) TO anon, authenticated;

-- Helper used only by the column default; nobody needs to call it through the API.
REVOKE ALL ON FUNCTION public.random_trait_order() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_participant_code() FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------------------------
-- 6. RESEARCHER EXPORT VIEWS
--    Existing columns keep their names and order; new columns are appended.
--    security_invoker keeps them admin-only (RLS applies to the caller).
-- ------------------------------------------------------------------------------
DROP VIEW IF EXISTS public.researcher_export_view;
CREATE VIEW public.researcher_export_view
WITH (security_invoker = on) AS
SELECT
    p.participant_id AS "Participant ID",
    p.created_at AS "Created At",
    p.gender AS "Gender",
    p.ethnicity AS "Ethnicity",
    p.first_language AS "First Language",
    p.second_language AS "Second Language",
    p.hindi_proficiency AS "Hindi Proficiency (1-6)",
    c.consent_status AS "Consent Granted",
    c.consent_timestamp AS "Consent Timestamp",
    s.presentation_order AS "Presentation Order",

    r1.code AS "Audio 1 Code",
    r1.category AS "Audio 1 Category",
    r1.language_variety AS "Audio 1 Language",
    r1.speaker_gender AS "Audio 1 Gender",
    s.audio_1_started_at AS "Audio 1 Started",
    s.audio_1_completed_at AS "Audio 1 Completed",

    r2.code AS "Audio 2 Code",
    r2.category AS "Audio 2 Category",
    r2.language_variety AS "Audio 2 Language",
    r2.speaker_gender AS "Audio 2 Gender",
    s.audio_2_started_at AS "Audio 2 Started",
    s.audio_2_completed_at AS "Audio 2 Completed",

    s.current_stage AS "Current Stage",
    s.session_status AS "Session Status",
    s.submitted_at AS "Submitted At",

    MAX(CASE WHEN resp.question_id = 'q1_1' THEN resp.answer END) AS "A1_Leadership",
    MAX(CASE WHEN resp.question_id = 'q1_2' THEN resp.answer END) AS "A1_Sense_of_Humor",
    MAX(CASE WHEN resp.question_id = 'q1_3' THEN resp.answer END) AS "A1_Intelligence",
    MAX(CASE WHEN resp.question_id = 'q1_4' THEN resp.answer END) AS "A1_Religiousness",
    MAX(CASE WHEN resp.question_id = 'q1_5' THEN resp.answer END) AS "A1_Self_Confidence",
    MAX(CASE WHEN resp.question_id = 'q1_6' THEN resp.answer END) AS "A1_Dependability",
    MAX(CASE WHEN resp.question_id = 'q1_7' THEN resp.answer END) AS "A1_Entertainingness",
    MAX(CASE WHEN resp.question_id = 'q1_8' THEN resp.answer END) AS "A1_Kindness",
    MAX(CASE WHEN resp.question_id = 'q1_9' THEN resp.answer END) AS "A1_Ambition",
    MAX(CASE WHEN resp.question_id = 'q1_10' THEN resp.answer END) AS "A1_Sociability",
    MAX(CASE WHEN resp.question_id = 'q1_11' THEN resp.answer END) AS "A1_Character",
    MAX(CASE WHEN resp.question_id = 'q1_12' THEN resp.answer END) AS "A1_Likability",
    MAX(CASE WHEN resp.question_id = 'q1_comment' THEN resp.answer END) AS "A1_Candid_Opinions",

    MAX(CASE WHEN resp.question_id = 'q2_1' THEN resp.answer END) AS "A2_Leadership",
    MAX(CASE WHEN resp.question_id = 'q2_2' THEN resp.answer END) AS "A2_Sense_of_Humor",
    MAX(CASE WHEN resp.question_id = 'q2_3' THEN resp.answer END) AS "A2_Intelligence",
    MAX(CASE WHEN resp.question_id = 'q2_4' THEN resp.answer END) AS "A2_Religiousness",
    MAX(CASE WHEN resp.question_id = 'q2_5' THEN resp.answer END) AS "A2_Self_Confidence",
    MAX(CASE WHEN resp.question_id = 'q2_6' THEN resp.answer END) AS "A2_Dependability",
    MAX(CASE WHEN resp.question_id = 'q2_7' THEN resp.answer END) AS "A2_Entertainingness",
    MAX(CASE WHEN resp.question_id = 'q2_8' THEN resp.answer END) AS "A2_Kindness",
    MAX(CASE WHEN resp.question_id = 'q2_9' THEN resp.answer END) AS "A2_Ambition",
    MAX(CASE WHEN resp.question_id = 'q2_10' THEN resp.answer END) AS "A2_Sociability",
    MAX(CASE WHEN resp.question_id = 'q2_11' THEN resp.answer END) AS "A2_Character",
    MAX(CASE WHEN resp.question_id = 'q2_12' THEN resp.answer END) AS "A2_Likability",
    MAX(CASE WHEN resp.question_id = 'q2_comment' THEN resp.answer END) AS "A2_Candid_Opinions",

    -- New columns (appended)
    round(EXTRACT(EPOCH FROM (s.audio_1_completed_at - s.audio_1_started_at))::numeric, 1) AS "Audio 1 Listen Seconds",
    ev.a1_pauses AS "Audio 1 Pauses",
    ev.a1_hidden AS "Audio 1 Tab Hidden",
    ev.a1_load_errors AS "Audio 1 Load Errors",
    round(EXTRACT(EPOCH FROM (s.audio_2_completed_at - s.audio_2_started_at))::numeric, 1) AS "Audio 2 Listen Seconds",
    ev.a2_pauses AS "Audio 2 Pauses",
    ev.a2_hidden AS "Audio 2 Tab Hidden",
    ev.a2_load_errors AS "Audio 2 Load Errors",
    array_to_string(s.trait_order_1, ',') AS "A1 Trait Order",
    array_to_string(s.trait_order_2, ',') AS "A2 Trait Order",
    s.last_activity_at AS "Last Activity"
FROM public.participants p
LEFT JOIN public.consent c ON c.participant_id = p.id
LEFT JOIN public.experiment_sessions s ON s.participant_id = p.id
LEFT JOIN public.recordings r1 ON r1.id = s.audio_1_recording_id
LEFT JOIN public.recordings r2 ON r2.id = s.audio_2_recording_id
LEFT JOIN public.responses resp ON resp.participant_id = p.id
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) FILTER (WHERE e.audio_number = 1 AND e.event_type = 'pause') AS a1_pauses,
        COUNT(*) FILTER (WHERE e.audio_number = 1 AND e.event_type = 'hidden') AS a1_hidden,
        COUNT(*) FILTER (WHERE e.audio_number = 1 AND e.event_type = 'load_error') AS a1_load_errors,
        COUNT(*) FILTER (WHERE e.audio_number = 2 AND e.event_type = 'pause') AS a2_pauses,
        COUNT(*) FILTER (WHERE e.audio_number = 2 AND e.event_type = 'hidden') AS a2_hidden,
        COUNT(*) FILTER (WHERE e.audio_number = 2 AND e.event_type = 'load_error') AS a2_load_errors
    FROM public.audio_events e
    WHERE e.participant_id = p.id
) ev ON true
GROUP BY
    p.id, p.participant_id, p.created_at, p.gender, p.ethnicity, p.first_language, p.second_language, p.hindi_proficiency,
    c.consent_status, c.consent_timestamp, s.presentation_order,
    r1.code, r1.category, r1.language_variety, r1.speaker_gender,
    s.audio_1_started_at, s.audio_1_completed_at,
    r2.code, r2.category, r2.language_variety, r2.speaker_gender,
    s.audio_2_started_at, s.audio_2_completed_at,
    s.current_stage, s.session_status, s.submitted_at,
    s.trait_order_1, s.trait_order_2, s.last_activity_at,
    ev.a1_pauses, ev.a1_hidden, ev.a1_load_errors, ev.a2_pauses, ev.a2_hidden, ev.a2_load_errors
ORDER BY p.created_at ASC;


DROP VIEW IF EXISTS public.researcher_responses_long_view;
CREATE VIEW public.researcher_responses_long_view
WITH (security_invoker = on) AS
SELECT
    p.participant_id,
    p.gender AS participant_gender,
    p.ethnicity AS participant_ethnicity,
    p.first_language,
    p.second_language,
    p.hindi_proficiency,
    s.presentation_order,
    q.recording_number,
    q.question_number,
    q.question_key,
    q.question_type,
    q.id AS question_id,
    r.id AS recording_id,
    r.code AS audio_code,
    r.category AS audio_category,
    r.language_variety,
    r.speaker_gender,
    resp.answer,
    resp.created_at AS response_time,

    -- New columns (appended)
    resp.updated_at AS final_answer_at,
    s.session_status,
    s.submitted_at,
    CASE WHEN q.question_type = 'scale' AND resp.answer ~ '^[1-6]$' THEN resp.answer::int END AS answer_numeric,
    CASE WHEN q.question_type = 'scale' THEN
        array_position(CASE q.recording_number WHEN 1 THEN s.trait_order_1 ELSE s.trait_order_2 END, q.question_number)
    END AS trait_display_position,
    round(EXTRACT(EPOCH FROM (
        CASE q.recording_number WHEN 1 THEN s.audio_1_completed_at - s.audio_1_started_at
                                ELSE s.audio_2_completed_at - s.audio_2_started_at END
    ))::numeric, 1) AS audio_listen_seconds
FROM public.responses resp
JOIN public.participants p ON p.id = resp.participant_id
JOIN public.questions q ON q.id = resp.question_id
JOIN public.recordings r ON r.id = resp.recording_id
JOIN public.experiment_sessions s ON s.participant_id = p.id
ORDER BY p.participant_id, q.recording_number, q.question_number;

REVOKE ALL ON public.researcher_export_view, public.researcher_responses_long_view FROM anon, authenticated;
GRANT SELECT ON public.researcher_export_view, public.researcher_responses_long_view TO authenticated;

COMMIT;
