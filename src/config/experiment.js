/**
 * Centralized Experiment Configuration
 * 
 * Includes the 10-Audio Library catalog:
 * - 6 Pure Audios (3 Male, 3 Female: Pure Hindi, Pure English, Pure Bombay Hindi)
 * - 4 Code-Mixed Audios (2 Male, 2 Female: Code-Mixed Hindi, Code-Mixed Bombay English)
 */

export const EXPERIMENT_CONFIG = {
  // --- Page 1: General Info & Instructions ---
  title: "[PLACEHOLDER: INSERT EXPERIMENT TITLE]",
  description: "[PLACEHOLDER: INSERT RESEARCH DESCRIPTION]",
  estimatedTime: "[PLACEHOLDER: INSERT ESTIMATED COMPLETION TIME]",
  participantInstructions: [
    "You will listen to two separate audio recordings in sequence.",
    "Each recording must be played completely from start to finish before you can proceed.",
    "You will answer 10 questions immediately after each audio recording (20 questions total).",
    "Please answer honestly based on your own direct observations and perceptions.",
    "There are no right or wrong answers unless specified by the researcher.",
    "Please do not refresh or close your browser during the experiment."
  ],

  // --- Page 1: Demographics Configuration ---
  demographics: {
    gender: {
      label: "Gender",
      required: true,
      options: [
        { value: "male", label: "Male" },
        { value: "female", label: "Female" },
        { value: "other", label: "Other" },
        { value: "prefer_not_to_say", label: "Prefer not to say" }
      ]
    },
    ethnicity: {
      label: "Ethnicity",
      required: true,
      options: [
        { value: "option_placeholder_1", label: "[PLACEHOLDER: INSERT RESEARCH-APPROPRIATE OPTIONS - Option A]" },
        { value: "option_placeholder_2", label: "[PLACEHOLDER: INSERT RESEARCH-APPROPRIATE OPTIONS - Option B]" },
        { value: "option_placeholder_3", label: "[PLACEHOLDER: INSERT RESEARCH-APPROPRIATE OPTIONS - Option C]" },
        { value: "other", label: "Other" },
        { value: "prefer_not_to_say", label: "Prefer not to say" }
      ]
    }
  },

  // --- Page 1: Informed Consent ---
  consent: {
    statement: "[PLACEHOLDER: INSERT COMPLETE INFORMED CONSENT TEXT]",
    checkboxLabel: "I have read and understood the information above and voluntarily agree to participate in this study.",
    startButtonLabel: "Start Experiment"
  },

  // --- Complete 10-Audio Library Catalog ---
  audioLibrary: [
    // --- Pure Section (6 Audios: 3 Male, 3 Female) ---
    {
      id: 1,
      code: "pure_hindi_male",
      category: "pure",
      languageVariety: "Pure Hindi",
      speakerGender: "male",
      title: "Audio Recording 1 (Pure Hindi - Male)",
      description: "[PLACEHOLDER: INSERT PURE HINDI MALE AUDIO DESCRIPTION]",
      storagePath: "[PLACEHOLDER: AUDIO_PURE_HINDI_MALE]",
      fallbackSampleUrl: "/audio/sample_audio.mp3",
      durationSeconds: 60
    },
    {
      id: 2,
      code: "pure_hindi_female",
      category: "pure",
      languageVariety: "Pure Hindi",
      speakerGender: "female",
      title: "Audio Recording (Pure Hindi - Female)",
      description: "[PLACEHOLDER: INSERT PURE HINDI FEMALE AUDIO DESCRIPTION]",
      storagePath: "[PLACEHOLDER: AUDIO_PURE_HINDI_FEMALE]",
      fallbackSampleUrl: "/audio/sample_audio.mp3",
      durationSeconds: 60
    },
    {
      id: 3,
      code: "pure_english_male",
      category: "pure",
      languageVariety: "Pure English",
      speakerGender: "male",
      title: "Audio Recording (Pure English - Male)",
      description: "[PLACEHOLDER: INSERT PURE ENGLISH MALE AUDIO DESCRIPTION]",
      storagePath: "[PLACEHOLDER: AUDIO_PURE_ENGLISH_MALE]",
      fallbackSampleUrl: "/audio/sample_audio.mp3",
      durationSeconds: 60
    },
    {
      id: 4,
      code: "pure_english_female",
      category: "pure",
      languageVariety: "Pure English",
      speakerGender: "female",
      title: "Audio Recording (Pure English - Female)",
      description: "[PLACEHOLDER: INSERT PURE ENGLISH FEMALE AUDIO DESCRIPTION]",
      storagePath: "[PLACEHOLDER: AUDIO_PURE_ENGLISH_FEMALE]",
      fallbackSampleUrl: "/audio/sample_audio.mp3",
      durationSeconds: 60
    },
    {
      id: 5,
      code: "pure_bombay_hindi_male",
      category: "pure",
      languageVariety: "Pure Bombay Hindi",
      speakerGender: "male",
      title: "Audio Recording (Pure Bombay Hindi - Male)",
      description: "[PLACEHOLDER: INSERT PURE BOMBAY HINDI MALE AUDIO DESCRIPTION]",
      storagePath: "[PLACEHOLDER: AUDIO_PURE_BOMBAY_HINDI_MALE]",
      fallbackSampleUrl: "/audio/sample_audio.mp3",
      durationSeconds: 60
    },
    {
      id: 6,
      code: "pure_bombay_hindi_female",
      category: "pure",
      languageVariety: "Pure Bombay Hindi",
      speakerGender: "female",
      title: "Audio Recording (Pure Bombay Hindi - Female)",
      description: "[PLACEHOLDER: INSERT PURE BOMBAY HINDI FEMALE AUDIO DESCRIPTION]",
      storagePath: "[PLACEHOLDER: AUDIO_PURE_BOMBAY_HINDI_FEMALE]",
      fallbackSampleUrl: "/audio/sample_audio.mp3",
      durationSeconds: 60
    },

    // --- Code-Mixed Section (4 Audios: 2 Male, 2 Female) ---
    {
      id: 7,
      code: "codemixed_hindi_male",
      category: "code_mixed",
      languageVariety: "Code-Mixed Hindi",
      speakerGender: "male",
      title: "Audio Recording (Code-Mixed Hindi - Male)",
      description: "[PLACEHOLDER: INSERT CODE-MIXED HINDI MALE AUDIO DESCRIPTION]",
      storagePath: "[PLACEHOLDER: AUDIO_CODEMIXED_HINDI_MALE]",
      fallbackSampleUrl: "/audio/sample_audio.mp3",
      durationSeconds: 60
    },
    {
      id: 8,
      code: "codemixed_hindi_female",
      category: "code_mixed",
      languageVariety: "Code-Mixed Hindi",
      speakerGender: "female",
      title: "Audio Recording (Code-Mixed Hindi - Female)",
      description: "[PLACEHOLDER: INSERT CODE-MIXED HINDI FEMALE AUDIO DESCRIPTION]",
      storagePath: "[PLACEHOLDER: AUDIO_CODEMIXED_HINDI_FEMALE]",
      fallbackSampleUrl: "/audio/sample_audio.mp3",
      durationSeconds: 60
    },
    {
      id: 9,
      code: "codemixed_bombay_english_male",
      category: "code_mixed",
      languageVariety: "Code-Mixed Bombay English",
      speakerGender: "male",
      title: "Audio Recording (Code-Mixed Bombay English - Male)",
      description: "[PLACEHOLDER: INSERT CODE-MIXED BOMBAY ENGLISH MALE AUDIO DESCRIPTION]",
      storagePath: "[PLACEHOLDER: AUDIO_CODEMIXED_BOMBAY_ENGLISH_MALE]",
      fallbackSampleUrl: "/audio/sample_audio.mp3",
      durationSeconds: 60
    },
    {
      id: 10,
      code: "codemixed_bombay_english_female",
      category: "code_mixed",
      languageVariety: "Code-Mixed Bombay English",
      speakerGender: "female",
      title: "Audio Recording (Code-Mixed Bombay English - Female)",
      description: "[PLACEHOLDER: INSERT CODE-MIXED BOMBAY ENGLISH FEMALE AUDIO DESCRIPTION]",
      storagePath: "[PLACEHOLDER: AUDIO_CODEMIXED_BOMBAY_ENGLISH_FEMALE]",
      fallbackSampleUrl: "/audio/sample_audio.mp3",
      durationSeconds: 60
    }
  ],

  // --- Audio Player Standard Texts ---
  audioPlayerTexts: {
    completionNotice: "Audio completed. You may now continue.",
    continueButtonLabel: "Continue to Questions"
  },

  // --- Page 3: Questions for Audio Recording 1 ---
  questionsAudio1: {
    title: "Questions About First Audio Recording",
    description: "Please answer the following questions based on the first audio recording you just heard.",
    continueButtonLabel: "Continue to Second Audio",
    questions: [
      { id: "q1_1", number: 1, text: "[INSERT QUESTION 1]", required: true, placeholder: "Write your answer here..." },
      { id: "q1_2", number: 2, text: "[INSERT QUESTION 2]", required: true, placeholder: "Write your answer here..." },
      { id: "q1_3", number: 3, text: "[INSERT QUESTION 3]", required: true, placeholder: "Write your answer here..." },
      { id: "q1_4", number: 4, text: "[INSERT QUESTION 4]", required: true, placeholder: "Write your answer here..." },
      { id: "q1_5", number: 5, text: "[INSERT QUESTION 5]", required: true, placeholder: "Write your answer here..." },
      { id: "q1_6", number: 6, text: "[INSERT QUESTION 6]", required: true, placeholder: "Write your answer here..." },
      { id: "q1_7", number: 7, text: "[INSERT QUESTION 7]", required: true, placeholder: "Write your answer here..." },
      { id: "q1_8", number: 8, text: "[INSERT QUESTION 8]", required: true, placeholder: "Write your answer here..." },
      { id: "q1_9", number: 9, text: "[INSERT QUESTION 9]", required: true, placeholder: "Write your answer here..." },
      { id: "q1_10", number: 10, text: "[INSERT QUESTION 10]", required: true, placeholder: "Write your answer here..." }
    ]
  },

  // --- Page 5: Questions for Audio Recording 2 & Submission ---
  questionsAudio2: {
    title: "Questions About Second Audio Recording",
    description: "Please answer the following questions based on the second audio recording you just heard.",
    submitButtonLabel: "Submit Experiment",
    questions: [
      { id: "q2_1", number: 1, text: "[INSERT QUESTION 1]", required: true, placeholder: "Write your answer here..." },
      { id: "q2_2", number: 2, text: "[INSERT QUESTION 2]", required: true, placeholder: "Write your answer here..." },
      { id: "q2_3", number: 3, text: "[INSERT QUESTION 3]", required: true, placeholder: "Write your answer here..." },
      { id: "q2_4", number: 4, text: "[INSERT QUESTION 4]", required: true, placeholder: "Write your answer here..." },
      { id: "q2_5", number: 5, text: "[INSERT QUESTION 5]", required: true, placeholder: "Write your answer here..." },
      { id: "q2_6", number: 6, text: "[INSERT QUESTION 6]", required: true, placeholder: "Write your answer here..." },
      { id: "q2_7", number: 7, text: "[INSERT QUESTION 7]", required: true, placeholder: "Write your answer here..." },
      { id: "q2_8", number: 8, text: "[INSERT QUESTION 8]", required: true, placeholder: "Write your answer here..." },
      { id: "q2_9", number: 9, text: "[INSERT QUESTION 9]", required: true, placeholder: "Write your answer here..." },
      { id: "q2_10", number: 10, text: "[INSERT QUESTION 10]", required: true, placeholder: "Write your answer here..." }
    ]
  },

  // --- Completion Screen (Page 5) ---
  completion: {
    title: "Thank You for Participating!",
    message: "[PLACEHOLDER: INSERT FINAL THANK-YOU MESSAGE]"
  }
};
