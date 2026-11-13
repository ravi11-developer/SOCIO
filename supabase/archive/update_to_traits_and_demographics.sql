-- ==============================================================================
-- Quick Update Script: Apply Sociolinguistic Demographics & 12 Traits
-- Run this in Supabase SQL Editor if you already created the tables earlier.
-- ==============================================================================

-- 1. Add new demographic columns to participants table
ALTER TABLE participants ADD COLUMN IF NOT EXISTS first_language VARCHAR(128);
ALTER TABLE participants ADD COLUMN IF NOT EXISTS second_language VARCHAR(128);
ALTER TABLE participants ADD COLUMN IF NOT EXISTS hindi_proficiency INT CHECK (hindi_proficiency BETWEEN 1 AND 6);

-- 2. Add question metadata columns if not present
ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_key VARCHAR(64);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(32) DEFAULT 'scale';

-- 3. Update the submit consent & demographics function
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

-- 4. Update session resumption function to return new demographic fields
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

-- 5. Update researcher export view with all 12 traits & candid opinions
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
