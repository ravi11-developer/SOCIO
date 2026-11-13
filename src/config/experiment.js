/**
 * Centralized Experiment Configuration
 * 
 * Sociolinguistic Audio Perception Study:
 * - 10-Audio Library catalog (Pure & Code-Mixed varieties, Male & Female speakers)
 * - Blinded Audio Evaluation (Participants are not told language variety or gender)
 * - 12 Personality & Social Traits (1-6 Likert scale: 1 = Least, 6 = Most)
 * - Candid open-ended opinion commentary
 */

export const EXPERIMENT_CONFIG = {
  // --- Page 1: General Info & Instructions ---
  title: "Sociology Study",
  instructionHeadline: "Listen to the audio and answer the questions",
  description: "Thank you for participating in this research study. In this experiment, you will listen to two short audio recordings and share your impressions of the speakers.",
  estimatedTime: "Approximately 8-10 minutes",
  participantInstructions: [
    "Listen to the audio and answer the questions.",
    "You will listen to two separate audio recordings in sequence.",
    "Each recording must be played completely from start to finish before questions are unlocked.",
    "Answer honestly based on your own natural impressions and observations.",
    "There are no right or wrong answers.",
    "Please do not refresh or navigate away from the browser during the study."
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
        { value: "north_indian", label: "North Indian" },
        { value: "south_indian", label: "South Indian" },
        { value: "east_indian", label: "East Indian" },
        { value: "west_indian", label: "West Indian" },
        { value: "northeast_indian", label: "Northeast Indian" },
        { value: "central_indian", label: "Central Indian" },
        { value: "mixed_indian", label: "Mixed Indian heritage" },
        { value: "east_asian", label: "East Asian" },
        { value: "other", label: "Other" },
        { value: "prefer_not_to_say", label: "Prefer not to say" }
      ]
    },
    firstLanguage: {
      label: "First Language (Mother Tongue / L1)",
      placeholder: "e.g., Hindi, English, Marathi, Gujarati, Bengali, etc.",
      required: true
    },
    secondLanguage: {
      label: "Second Language (L2)",
      placeholder: "e.g., English, Hindi, Punjabi, none, etc.",
      required: true
    },
    hindiProficiency: {
      label: "Rate your proficiency in spoken Hindi",
      required: true,
      helperNote: "If you are a native speaker or are proficient in spoken Hindi then consider rating yourselves 4, 5 or 6.",
      minLabel: "1 - Not proficient",
      maxLabel: "6 - Very proficient",
      choices: [
        { value: 1, label: "1 (Not proficient)" },
        { value: 2, label: "2" },
        { value: 3, label: "3" },
        { value: 4, label: "4" },
        { value: 5, label: "5" },
        { value: 6, label: "6 (Very proficient)" }
      ]
    }
  },

  // --- Page 1: Informed Consent ---
  consent: {
    statement: "I understand that my participation in this research study is completely voluntary and anonymous. No personal identifying information such as my name, phone number, or email address will be collected. All response data will be stored securely and used solely for academic research purposes. I may withdraw from the study at any time prior to submission.",
    checkboxLabel: "I have read and understood the information above and voluntarily agree to participate in this study.",
    startButtonLabel: "Start Experiment"
  },

  // --- Blinded Audio Page Labels (Participants must NOT know the language or dialect in advance) ---
  blindedAudioLabels: {
    audio1: {
      title: "Audio Recording 1",
      description: "Please listen to the recording in full."
    },
    audio2: {
      title: "Audio Recording 2",
      description: "Please listen to the recording in full."
    }
  },

  // --- Complete 10-Audio Library Catalog (Internal metadata tracked for researcher analysis) ---
  audioLibrary: [
    {
      id: 1,
      code: "pure_hindi_male",
      category: "pure",
      languageVariety: "Pure Hindi",
      speakerGender: "male",
      title: "Audio Recording 1",
      storagePath: "pure_hindi_male.mp3",
      fallbackSampleUrl: "/audio/sample_audio.mp3",
      durationSeconds: 60
    },
    {
      id: 2,
      code: "pure_hindi_female",
      category: "pure",
      languageVariety: "Pure Hindi",
      speakerGender: "female",
      title: "Audio Recording",
      storagePath: "pure_hindi_female.mp3",
      fallbackSampleUrl: "/audio/sample_audio.mp3",
      durationSeconds: 60
    },
    {
      id: 3,
      code: "pure_english_male",
      category: "pure",
      languageVariety: "Pure English",
      speakerGender: "male",
      title: "Audio Recording",
      storagePath: "pure_english_male.mp3",
      fallbackSampleUrl: "/audio/sample_audio.mp3",
      durationSeconds: 60
    },
    {
      id: 4,
      code: "pure_english_female",
      category: "pure",
      languageVariety: "Pure English",
      speakerGender: "female",
      title: "Audio Recording",
      storagePath: "pure_english_female.mp3",
      fallbackSampleUrl: "/audio/sample_audio.mp3",
      durationSeconds: 60
    },
    {
      id: 5,
      code: "pure_bombay_hindi_male",
      category: "pure",
      languageVariety: "Pure Bombay Hindi",
      speakerGender: "male",
      title: "Audio Recording",
      storagePath: "pure_bombay_hindi_male.mp3",
      fallbackSampleUrl: "/audio/sample_audio.mp3",
      durationSeconds: 60
    },
    {
      id: 6,
      code: "pure_bombay_hindi_female",
      category: "pure",
      languageVariety: "Pure Bombay Hindi",
      speakerGender: "female",
      title: "Audio Recording",
      storagePath: "pure_bombay_hindi_female.mp3",
      fallbackSampleUrl: "/audio/sample_audio.mp3",
      durationSeconds: 60
    },
    {
      id: 7,
      code: "codemixed_hindi_male",
      category: "code_mixed",
      languageVariety: "Code-Mixed Hindi",
      speakerGender: "male",
      title: "Audio Recording",
      storagePath: "codemixed_hindi_male.mp3",
      fallbackSampleUrl: "/audio/sample_audio.mp3",
      durationSeconds: 60
    },
    {
      id: 8,
      code: "codemixed_hindi_female",
      category: "code_mixed",
      languageVariety: "Code-Mixed Hindi",
      speakerGender: "female",
      title: "Audio Recording",
      storagePath: "codemixed_hindi_female.mp3",
      fallbackSampleUrl: "/audio/sample_audio.mp3",
      durationSeconds: 60
    },
    {
      id: 9,
      code: "codemixed_bombay_english_male",
      category: "code_mixed",
      languageVariety: "Code-Mixed Bombay English",
      speakerGender: "male",
      title: "Audio Recording",
      storagePath: "codemixed_bombay_english_male.mp3",
      fallbackSampleUrl: "/audio/sample_audio.mp3",
      durationSeconds: 60
    },
    {
      id: 10,
      code: "codemixed_bombay_english_female",
      category: "code_mixed",
      languageVariety: "Code-Mixed Bombay English",
      speakerGender: "female",
      title: "Audio Recording",
      storagePath: "codemixed_bombay_english_female.mp3",
      fallbackSampleUrl: "/audio/sample_audio.mp3",
      durationSeconds: 60
    }
  ],

  // --- Audio Player Standard Texts ---
  audioPlayerTexts: {
    completionNotice: "Audio completed. You may now continue.",
    continueButtonLabel: "Continue to Questions"
  },

  // --- 12 Personality & Social Traits to Evaluate (Scale 1 to 6) ---
  traits: [
    { id: "leadership", number: 1, name: "Leadership", prompt: "How strong are the speaker's leadership qualities?" },
    { id: "humor", number: 2, name: "Sense of Humor", prompt: "How good is the speaker's sense of humor?" },
    { id: "intelligence", number: 3, name: "Intelligence", prompt: "How intelligent does the speaker sound?" },
    { id: "religiousness", number: 4, name: "Religiousness", prompt: "How religious does the speaker seem?" },
    { id: "confidence", number: 5, name: "Self-confidence", prompt: "How self-confident does the speaker sound?" },
    { id: "dependability", number: 6, name: "Dependability", prompt: "How dependable / reliable is the speaker?" },
    { id: "entertainingness", number: 7, name: "Entertainingness", prompt: "How entertaining is the speaker to listen to?" },
    { id: "kindness", number: 8, name: "Kindness", prompt: "How kind and warm does the speaker sound?" },
    { id: "ambition", number: 9, name: "Ambition", prompt: "How ambitious does the speaker seem?" },
    { id: "sociability", number: 10, name: "Sociability", prompt: "How sociable and outgoing is the speaker?" },
    { id: "character", number: 11, name: "Character", prompt: "How strong is the speaker's personal character / integrity?" },
    { id: "likability", number: 12, name: "Likability", prompt: "How likable is the speaker overall?" }
  ],

  // --- Candid Open Opinion Prompt ---
  openOpinionPrompt: {
    id: "comment",
    number: 13,
    title: "Overall Opinions",
    prompt: "List all your opinions about the speaker, be as candid as possible",
    placeholder: "Write your candid thoughts, impressions, and opinions about the speaker here...",
    required: true
  },

  // --- Question Page Headers ---
  questionnaireAudio1: {
    title: "Questions About First Audio Recording",
    description: "Rate the speaker on a scale from 1 (Least) to 6 (Most) for each trait below, then share your candid opinions.",
    continueButtonLabel: "Continue to Second Audio"
  },

  questionnaireAudio2: {
    title: "Questions About Second Audio Recording",
    description: "Rate the second speaker on a scale from 1 (Least) to 6 (Most) for each trait below, then share your candid opinions.",
    submitButtonLabel: "Submit Experiment"
  },

  // --- Completion Screen (Page 5) ---
  completion: {
    title: "Thank You for Participating!",
    message: "Your responses have been successfully recorded. Thank you for contributing your valuable time and candid observations to this sociolinguistic research study."
  }
};
