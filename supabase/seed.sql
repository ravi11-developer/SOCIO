-- ==============================================================================
-- Seed Data: 10 Audio Recordings and 12-Trait Perception Questionnaire
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
    'Audio recording of speaker.', 
    'pure_hindi_male.mp3', 
    60
),
(
    2, 
    'pure_hindi_female', 
    'pure', 
    'Pure Hindi', 
    'female', 
    'Audio Recording (Pure Hindi - Female)', 
    'Audio recording of speaker.', 
    'pure_hindi_female.mp3', 
    60
),
(
    3, 
    'pure_english_male', 
    'pure', 
    'Pure English', 
    'male', 
    'Audio Recording (Pure English - Male)', 
    'Audio recording of speaker.', 
    'pure_english_male.mp3', 
    60
),
(
    4, 
    'pure_english_female', 
    'pure', 
    'Pure English', 
    'female', 
    'Audio Recording (Pure English - Female)', 
    'Audio recording of speaker.', 
    'pure_english_female.mp3', 
    60
),
(
    5, 
    'pure_bombay_hindi_male', 
    'pure', 
    'Pure Bombay Hindi', 
    'male', 
    'Audio Recording (Pure Bombay Hindi - Male)', 
    'Audio recording of speaker.', 
    'pure_bombay_hindi_male.mp3', 
    60
),
(
    6, 
    'pure_bombay_hindi_female', 
    'pure', 
    'Pure Bombay Hindi', 
    'female', 
    'Audio Recording (Pure Bombay Hindi - Female)', 
    'Audio recording of speaker.', 
    'pure_bombay_hindi_female.mp3', 
    60
),
(
    7, 
    'codemixed_hindi_male', 
    'code_mixed', 
    'Code-Mixed Hindi', 
    'male', 
    'Audio Recording (Code-Mixed Hindi - Male)', 
    'Audio recording of speaker.', 
    'codemixed_hindi_male.mp3', 
    60
),
(
    8, 
    'codemixed_hindi_female', 
    'code_mixed', 
    'Code-Mixed Hindi', 
    'female', 
    'Audio Recording (Code-Mixed Hindi - Female)', 
    'Audio recording of speaker.', 
    'codemixed_hindi_female.mp3', 
    60
),
(
    9, 
    'codemixed_bombay_english_male', 
    'code_mixed', 
    'Code-Mixed Bombay English', 
    'male', 
    'Audio Recording (Code-Mixed Bombay English - Male)', 
    'Audio recording of speaker.', 
    'codemixed_bombay_english_male.mp3', 
    60
),
(
    10, 
    'codemixed_bombay_english_female', 
    'code_mixed', 
    'Code-Mixed Bombay English', 
    'female', 
    'Audio Recording (Code-Mixed Bombay English - Female)', 
    'Audio recording of speaker.', 
    'codemixed_bombay_english_female.mp3', 
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

-- 2. Insert 12 Trait Rating Scale Items + 1 Candid Comment for Recording 1
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
('q1_comment', 1, 13, 'comment',           'List all your opinions about the speaker, be as candid as possible', 'comment', true, 'Write your candid thoughts, impressions, and opinions about the speaker here...')
ON CONFLICT (recording_number, question_number) DO UPDATE SET
    question_key = EXCLUDED.question_key,
    question_text = EXCLUDED.question_text,
    question_type = EXCLUDED.question_type,
    is_required = EXCLUDED.is_required,
    placeholder = EXCLUDED.placeholder;

-- 3. Insert 12 Trait Rating Scale Items + 1 Candid Comment for Recording 2
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
('q2_comment', 2, 13, 'comment',           'List all your opinions about the speaker, be as candid as possible', 'comment', true, 'Write your candid thoughts, impressions, and opinions about the speaker here...')
ON CONFLICT (recording_number, question_number) DO UPDATE SET
    question_key = EXCLUDED.question_key,
    question_text = EXCLUDED.question_text,
    question_type = EXCLUDED.question_type,
    is_required = EXCLUDED.is_required,
    placeholder = EXCLUDED.placeholder;
