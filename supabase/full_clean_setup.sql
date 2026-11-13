-- ==============================================================================
-- COMPLETE CLEAN SETUP SCRIPT FOR SOCIOLINGUISTIC EXPERIMENT
-- Drops old tables/views/functions and recreates everything freshly with all seed data.
-- ==============================================================================

-- 1. DROP EXISTING VIEWS, TABLES & FUNCTIONS (CASCADE)
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
(1,  'pure_hindi_male',               'pure',       'Pure Hindi',                'male',   'Audio Recording (Pure Hindi - Male)',               'Audio recording of speaker.', 'pure_hindi_male.mp3',               60),
(2,  'pure_hindi_female',             'pure',       'Pure Hindi',                'female', 'Audio Recording (Pure Hindi - Female)',             'Audio recording of speaker.', 'pure_hindi_female.mp3',             60),
(3,  'pure_english_male',             'pure',       'Pure English',              'male',   'Audio Recording (Pure English - Male)',             'Audio recording of speaker.', 'pure_english_male.mp3',             60),
(4,  'pure_english_female',           'pure',       'Pure English',              'female', 'Audio Recording (Pure English - Female)',           'Audio recording of speaker.', 'pure_english_female.mp3',           60),
(5,  'pure_bombay_hindi_male',        'pure',       'Pure Bombay Hindi',         'male',   'Audio Recording (Pure Bombay Hindi - Male)',        'Audio recording of speaker.', 'pure_bombay_hindi_male.mp3',        60),
(6,  'pure_bombay_hindi_female',      'pure',       'Pure Bombay Hindi',         'female', 'Audio Recording (Pure Bombay Hindi - Female)',      'Audio recording of speaker.', 'pure_bombay_hindi_female.mp3',      60),
(7,  'codemixed_hindi_male',          'code_mixed', 'Code-Mixed Hindi',          'male',   'Audio Recording (Code-Mixed Hindi - Male)',          'Audio recording of speaker.', 'codemixed_hindi_male.mp3',          60),
(8,  'codemixed_hindi_female',        'code_mixed', 'Code-Mixed Hindi',          'female', 'Audio Recording (Code-Mixed Hindi - Female)',        'Audio recording of speaker.', 'codemixed_hindi_female.mp3',        60),
(9,  'codemixed_bombay_english_male', 'code_mixed', 'Code-Mixed Bombay English', 'male',   'Audio Recording (Code-Mixed Bombay English - Male)','Audio recording of speaker.', 'codemixed_bombay_english_male.mp3', 60),
(10, 'codemixed_bombay_english_female','code_mixed','Code-Mixed Bombay English', 'female', 'Audio Recording (Code-Mixed Bombay English - Female)','Audio recording of speaker.','codemixed_bombay_english_female.mp3', 60)
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

-- 7. SUPABASE STORAGE BUCKET SETUP ('audio-files')
-- Automatically creates the public storage bucket for audio recordings
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio-files', 'audio-files', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public Access to Audio Files" ON storage.objects;
CREATE POLICY "Public Access to Audio Files" ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (bucket_id = 'audio-files');

