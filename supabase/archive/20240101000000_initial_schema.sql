-- ==============================================================================
-- Schema Migration: Sociolinguistic Audio Perception Experiment
-- Includes 10-Audio Matrix, Extended Demographics, 12 Likert Traits & Candid Opinions
-- ==============================================================================

-- 1. Create Participants Table
CREATE TABLE IF NOT EXISTS participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id VARCHAR(32) NOT NULL UNIQUE,
    session_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    gender VARCHAR(64),
    ethnicity VARCHAR(128),
    first_language VARCHAR(128),
    second_language VARCHAR(128),
    hindi_proficiency INT CHECK (hindi_proficiency BETWEEN 1 AND 6),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure columns exist if table was previously created
ALTER TABLE participants ADD COLUMN IF NOT EXISTS first_language VARCHAR(128);
ALTER TABLE participants ADD COLUMN IF NOT EXISTS second_language VARCHAR(128);
ALTER TABLE participants ADD COLUMN IF NOT EXISTS hindi_proficiency INT CHECK (hindi_proficiency BETWEEN 1 AND 6);

CREATE INDEX IF NOT EXISTS idx_participants_session_token ON participants(session_token);
CREATE INDEX IF NOT EXISTS idx_participants_participant_id ON participants(participant_id);

-- 2. Create Consent Table
CREATE TABLE IF NOT EXISTS consent (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    consent_status BOOLEAN NOT NULL DEFAULT false,
    consent_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_participant_consent UNIQUE(participant_id)
);

-- 3. Create Recordings Table (10 Audios: 5 Male, 5 Female across Pure & Code-Mixed)
CREATE TABLE IF NOT EXISTS recordings (
    id SERIAL PRIMARY KEY,
    code VARCHAR(64) UNIQUE NOT NULL,
    category VARCHAR(32) NOT NULL CHECK (category IN ('pure', 'code_mixed')),
    language_variety VARCHAR(64) NOT NULL,
    speaker_gender VARCHAR(16) NOT NULL CHECK (speaker_gender IN ('male', 'female')),
    title TEXT NOT NULL,
    description TEXT,
    audio_storage_path TEXT NOT NULL,
    duration_seconds NUMERIC NOT NULL DEFAULT 60,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recordings_category_gender ON recordings(category, speaker_gender);

-- 4. Create Questions Table (12 Traits + 1 Candid Comment per Recording)
CREATE TABLE IF NOT EXISTS questions (
    id VARCHAR(32) PRIMARY KEY, -- e.g. 'q1_1' to 'q1_12', 'q1_comment', 'q2_1' to 'q2_12', 'q2_comment'
    recording_number INT NOT NULL CHECK (recording_number IN (1, 2)),
    question_number INT NOT NULL CHECK (question_number BETWEEN 1 AND 13),
    question_key VARCHAR(64) NOT NULL, -- e.g. 'leadership', 'humor', ..., 'comment'
    question_text TEXT NOT NULL,
    question_type VARCHAR(32) NOT NULL DEFAULT 'scale', -- 'scale' (1-6) or 'comment'
    is_required BOOLEAN NOT NULL DEFAULT true,
    placeholder TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_recording_question UNIQUE(recording_number, question_number)
);

-- Ensure columns exist if table was previously created
ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_key VARCHAR(64);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(32) DEFAULT 'scale';

CREATE INDEX IF NOT EXISTS idx_questions_recording ON questions(recording_number);

-- 5. Create Experiment Sessions Table (With Allocated Audio IDs)
CREATE TABLE IF NOT EXISTS experiment_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL UNIQUE REFERENCES participants(id) ON DELETE CASCADE,
    current_stage TEXT NOT NULL DEFAULT 'consent_pending' CHECK (
        current_stage IN (
            'consent_pending',
            'consent_completed',
            'audio_1_pending',
            'audio_1_completed',
            'questions_1_pending',
            'questions_1_completed',
            'audio_2_pending',
            'audio_2_completed',
            'questions_2_pending',
            'submitted'
        )
    ),
    audio_1_recording_id INT REFERENCES recordings(id),
    audio_2_recording_id INT REFERENCES recordings(id),
    presentation_order VARCHAR(32) DEFAULT 'pure_first' CHECK (presentation_order IN ('pure_first', 'codemixed_first')),
    audio_1_started_at TIMESTAMPTZ,
    audio_1_completed_at TIMESTAMPTZ,
    audio_2_started_at TIMESTAMPTZ,
    audio_2_completed_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    session_status TEXT NOT NULL DEFAULT 'active' CHECK (session_status IN ('active', 'submitted', 'abandoned')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_participant ON experiment_sessions(participant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_stage ON experiment_sessions(current_stage);
CREATE INDEX IF NOT EXISTS idx_sessions_audio_1 ON experiment_sessions(audio_1_recording_id);
CREATE INDEX IF NOT EXISTS idx_sessions_audio_2 ON experiment_sessions(audio_2_recording_id);

-- 6. Create Responses Table (With direct recording_id tracking)
CREATE TABLE IF NOT EXISTS responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    question_id VARCHAR(32) NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    recording_id INT REFERENCES recordings(id),
    answer TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_participant_question_response UNIQUE(participant_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_responses_participant ON responses(participant_id);
CREATE INDEX IF NOT EXISTS idx_responses_recording ON responses(recording_id);

-- ==============================================================================
-- 7. Row Level Security (RLS) Configuration
-- ==============================================================================

ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to recordings" ON recordings;
CREATE POLICY "Allow public read access to recordings" ON recordings
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow public read access to questions" ON questions;
CREATE POLICY "Allow public read access to questions" ON questions
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Service role full access to participants" ON participants;
CREATE POLICY "Service role full access to participants" ON participants
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to consent" ON consent;
CREATE POLICY "Service role full access to consent" ON consent
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to responses" ON responses;
CREATE POLICY "Service role full access to responses" ON responses
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to experiment_sessions" ON experiment_sessions;
CREATE POLICY "Service role full access to experiment_sessions" ON experiment_sessions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ==============================================================================
-- 8. Stored Procedures & Balanced Allocation State Machine
-- ==============================================================================

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

-- Initialize or Resume Session with Stratified Least-Allocated Audio Assignment
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
    -- 1. Try to resume existing session
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

    -- 2. New Participant Session: Balanced Stratified Allocation
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

-- Submit Consent and Extended Demographics
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

-- ==============================================================================
-- 9. Researcher Views (Wide Format & Tidy Long Format)
-- ==============================================================================

-- A. Wide CSV Export View (1 Row Per Participant, Enriched with Demographics, Audio Metadata & 12 Traits)
DROP VIEW IF EXISTS researcher_responses_long_view CASCADE;
DROP VIEW IF EXISTS researcher_export_view CASCADE;
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

    -- Audio 1 Trait Ratings (1-6) & Candid Comment
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

    -- Audio 2 Trait Ratings (1-6) & Candid Comment
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

-- B. Tidy / Long View (1 Row Per Response for ANOVA / Mixed Models in R/Python/SPSS)
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
