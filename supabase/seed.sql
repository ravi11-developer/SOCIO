-- ==============================================================================
-- Seed Data: 10 Audio Recordings and 20 Questions
-- ==============================================================================

-- 1. Insert 10 Audio Recordings (5 Male, 5 Female across Pure and Code-Mixed)
INSERT INTO recordings (id, code, category, language_variety, speaker_gender, title, description, audio_storage_path, duration_seconds)
VALUES 
(
    1, 
    'pure_hindi_male', 
    'pure', 
    'Pure Hindi', 
    'male', 
    'Audio Recording (Pure Hindi - Male)', 
    '[PLACEHOLDER: INSERT PURE HINDI MALE AUDIO DESCRIPTION]', 
    '[PLACEHOLDER: AUDIO_PURE_HINDI_MALE]', 
    60
),
(
    2, 
    'pure_hindi_female', 
    'pure', 
    'Pure Hindi', 
    'female', 
    'Audio Recording (Pure Hindi - Female)', 
    '[PLACEHOLDER: INSERT PURE HINDI FEMALE AUDIO DESCRIPTION]', 
    '[PLACEHOLDER: AUDIO_PURE_HINDI_FEMALE]', 
    60
),
(
    3, 
    'pure_english_male', 
    'pure', 
    'Pure English', 
    'male', 
    'Audio Recording (Pure English - Male)', 
    '[PLACEHOLDER: INSERT PURE ENGLISH MALE AUDIO DESCRIPTION]', 
    '[PLACEHOLDER: AUDIO_PURE_ENGLISH_MALE]', 
    60
),
(
    4, 
    'pure_english_female', 
    'pure', 
    'Pure English', 
    'female', 
    'Audio Recording (Pure English - Female)', 
    '[PLACEHOLDER: INSERT PURE ENGLISH FEMALE AUDIO DESCRIPTION]', 
    '[PLACEHOLDER: AUDIO_PURE_ENGLISH_FEMALE]', 
    60
),
(
    5, 
    'pure_bombay_hindi_male', 
    'pure', 
    'Pure Bombay Hindi', 
    'male', 
    'Audio Recording (Pure Bombay Hindi - Male)', 
    '[PLACEHOLDER: INSERT PURE BOMBAY HINDI MALE AUDIO DESCRIPTION]', 
    '[PLACEHOLDER: AUDIO_PURE_BOMBAY_HINDI_MALE]', 
    60
),
(
    6, 
    'pure_bombay_hindi_female', 
    'pure', 
    'Pure Bombay Hindi', 
    'female', 
    'Audio Recording (Pure Bombay Hindi - Female)', 
    '[PLACEHOLDER: INSERT PURE BOMBAY HINDI FEMALE AUDIO DESCRIPTION]', 
    '[PLACEHOLDER: AUDIO_PURE_BOMBAY_HINDI_FEMALE]', 
    60
),
(
    7, 
    'codemixed_hindi_male', 
    'code_mixed', 
    'Code-Mixed Hindi', 
    'male', 
    'Audio Recording (Code-Mixed Hindi - Male)', 
    '[PLACEHOLDER: INSERT CODE-MIXED HINDI MALE AUDIO DESCRIPTION]', 
    '[PLACEHOLDER: AUDIO_CODEMIXED_HINDI_MALE]', 
    60
),
(
    8, 
    'codemixed_hindi_female', 
    'code_mixed', 
    'Code-Mixed Hindi', 
    'female', 
    'Audio Recording (Code-Mixed Hindi - Female)', 
    '[PLACEHOLDER: INSERT CODE-MIXED HINDI FEMALE AUDIO DESCRIPTION]', 
    '[PLACEHOLDER: AUDIO_CODEMIXED_HINDI_FEMALE]', 
    60
),
(
    9, 
    'codemixed_bombay_english_male', 
    'code_mixed', 
    'Code-Mixed Bombay English', 
    'male', 
    'Audio Recording (Code-Mixed Bombay English - Male)', 
    '[PLACEHOLDER: INSERT CODE-MIXED BOMBAY ENGLISH MALE AUDIO DESCRIPTION]', 
    '[PLACEHOLDER: AUDIO_CODEMIXED_BOMBAY_ENGLISH_MALE]', 
    60
),
(
    10, 
    'codemixed_bombay_english_female', 
    'code_mixed', 
    'Code-Mixed Bombay English', 
    'female', 
    'Audio Recording (Code-Mixed Bombay English - Female)', 
    '[PLACEHOLDER: INSERT CODE-MIXED BOMBAY ENGLISH FEMALE AUDIO DESCRIPTION]', 
    '[PLACEHOLDER: AUDIO_CODEMIXED_BOMBAY_ENGLISH_FEMALE]', 
    60
)
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

-- 2. Insert Questions for First Audio Recording (10 Questions)
INSERT INTO questions (id, recording_number, question_number, question_text, is_required, placeholder)
VALUES
('q1_1',  1, 1,  '[INSERT QUESTION 1]',  true, 'Write your answer here...'),
('q1_2',  1, 2,  '[INSERT QUESTION 2]',  true, 'Write your answer here...'),
('q1_3',  1, 3,  '[INSERT QUESTION 3]',  true, 'Write your answer here...'),
('q1_4',  1, 4,  '[INSERT QUESTION 4]',  true, 'Write your answer here...'),
('q1_5',  1, 5,  '[INSERT QUESTION 5]',  true, 'Write your answer here...'),
('q1_6',  1, 6,  '[INSERT QUESTION 6]',  true, 'Write your answer here...'),
('q1_7',  1, 7,  '[INSERT QUESTION 7]',  true, 'Write your answer here...'),
('q1_8',  1, 8,  '[INSERT QUESTION 8]',  true, 'Write your answer here...'),
('q1_9',  1, 9,  '[INSERT QUESTION 9]',  true, 'Write your answer here...'),
('q1_10', 1, 10, '[INSERT QUESTION 10]', true, 'Write your answer here...')
ON CONFLICT (recording_number, question_number) DO UPDATE SET
    question_text = EXCLUDED.question_text,
    is_required = EXCLUDED.is_required,
    placeholder = EXCLUDED.placeholder;

-- 3. Insert Questions for Second Audio Recording (10 Questions)
INSERT INTO questions (id, recording_number, question_number, question_text, is_required, placeholder)
VALUES
('q2_1',  2, 1,  '[INSERT QUESTION 1]',  true, 'Write your answer here...'),
('q2_2',  2, 2,  '[INSERT QUESTION 2]',  true, 'Write your answer here...'),
('q2_3',  2, 3,  '[INSERT QUESTION 3]',  true, 'Write your answer here...'),
('q2_4',  2, 4,  '[INSERT QUESTION 4]',  true, 'Write your answer here...'),
('q2_5',  2, 5,  '[INSERT QUESTION 5]',  true, 'Write your answer here...'),
('q2_6',  2, 6,  '[INSERT QUESTION 6]',  true, 'Write your answer here...'),
('q2_7',  2, 7,  '[INSERT QUESTION 7]',  true, 'Write your answer here...'),
('q2_8',  2, 8,  '[INSERT QUESTION 8]',  true, 'Write your answer here...'),
('q2_9',  2, 9,  '[INSERT QUESTION 9]',  true, 'Write your answer here...'),
('q2_10', 2, 10, '[INSERT QUESTION 10]', true, 'Write your answer here...')
ON CONFLICT (recording_number, question_number) DO UPDATE SET
    question_text = EXCLUDED.question_text,
    is_required = EXCLUDED.is_required,
    placeholder = EXCLUDED.placeholder;
