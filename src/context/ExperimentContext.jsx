import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';
import { EXPERIMENT_CONFIG } from '../config/experiment';

const ExperimentContext = createContext(null);

export const STAGES = {
  PAGE_1_CONSENT: 'consent_pending',
  PAGE_2_AUDIO_1: 'audio_1_pending',
  PAGE_3_QUESTIONS_1: 'questions_1_pending',
  PAGE_4_AUDIO_2: 'audio_2_pending',
  PAGE_5_QUESTIONS_2: 'questions_2_pending',
  SUBMITTED: 'submitted',
};

function normalizeAudioMetadata(audioObj, defaultSlot = 1) {
  if (!audioObj) {
    const fallbackItem = EXPERIMENT_CONFIG.audioLibrary[defaultSlot - 1] || EXPERIMENT_CONFIG.audioLibrary[0];
    return fallbackItem;
  }
  return {
    id: audioObj.id,
    code: audioObj.code,
    category: audioObj.category,
    languageVariety: audioObj.language_variety || audioObj.languageVariety || 'Standard',
    speakerGender: audioObj.speaker_gender || audioObj.speakerGender || 'unspecified',
    title: `Audio Recording ${defaultSlot}`,
    description: defaultSlot === 1 
      ? EXPERIMENT_CONFIG.blindedAudioLabels.audio1.description 
      : EXPERIMENT_CONFIG.blindedAudioLabels.audio2.description,
    storagePath: audioObj.audio_storage_path || audioObj.storagePath || '',
    fallbackSampleUrl: audioObj.fallbackSampleUrl || '/audio/sample_audio.mp3',
    durationSeconds: audioObj.duration_seconds || audioObj.durationSeconds || 60,
  };
}

export function ExperimentProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  const [participantId, setParticipantId] = useState(null);
  const [currentStage, setCurrentStage] = useState(STAGES.PAGE_1_CONSENT);
  
  // Demographics
  const [gender, setGender] = useState('');
  const [ethnicity, setEthnicity] = useState('');
  const [firstLanguage, setFirstLanguage] = useState('');
  const [secondLanguage, setSecondLanguage] = useState('');
  const [hindiProficiency, setHindiProficiency] = useState(null);

  // Questionnaire responses & autosave state
  const [responses, setResponses] = useState({});
  const [saveStatus, setSaveStatus] = useState('saved');
  const [audio1Completed, setAudio1Completed] = useState(false);
  const [audio2Completed, setAudio2Completed] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Dynamic Allocated Audios
  const [assignedAudio1, setAssignedAudio1] = useState(null);
  const [assignedAudio2, setAssignedAudio2] = useState(null);
  const [presentationOrder, setPresentationOrder] = useState('pure_first');

  // Debounce autosave timers map
  const saveTimersRef = useRef({});

  // 1. Initialize or resume session on load
  useEffect(() => {
    let storedToken = null;
    try {
      storedToken = localStorage.getItem('audio_research_session_token');
    } catch (e) {
      console.warn('localStorage not accessible', e);
    }

    async function init() {
      try {
        setLoading(true);
        const { data } = await api.initOrResumeSession(storedToken);
        if (data) {
          setParticipantId(data.participant_id);
          setSessionToken(data.session_token);
          try {
            localStorage.setItem('audio_research_session_token', data.session_token);
          } catch (e) {}

          if (data.gender) setGender(data.gender);
          if (data.ethnicity) setEthnicity(data.ethnicity);
          if (data.first_language) setFirstLanguage(data.first_language);
          if (data.second_language) setSecondLanguage(data.second_language);
          if (data.hindi_proficiency) setHindiProficiency(data.hindi_proficiency);

          if (data.responses) setResponses(data.responses);
          if (data.audio_1_completed) setAudio1Completed(true);
          if (data.audio_2_completed) setAudio2Completed(true);

          if (data.assigned_audio_1) {
            setAssignedAudio1(normalizeAudioMetadata(data.assigned_audio_1, 1));
          }
          if (data.assigned_audio_2) {
            setAssignedAudio2(normalizeAudioMetadata(data.assigned_audio_2, 2));
          }
          if (data.presentation_order) {
            setPresentationOrder(data.presentation_order);
          }

          if (data.submitted || data.current_stage === STAGES.SUBMITTED) {
            setIsSubmitted(true);
            setCurrentStage(STAGES.SUBMITTED);
          } else {
            setCurrentStage(data.current_stage || STAGES.PAGE_1_CONSENT);
          }
        }
      } catch (err) {
        console.error('Initialization error:', err);
        setError('Failed to initialize session. Please check your internet connection.');
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  // 2. Prevent accidental browser back button navigation & warn on unload
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
    };

    const handleBeforeUnload = (e) => {
      if (currentStage !== STAGES.SUBMITTED && !isSubmitted) {
        e.preventDefault();
        e.returnValue = 'You have an active research experiment in progress. Please do not leave or refresh the page.';
        return e.returnValue;
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentStage, isSubmitted]);

  // 3. Step 1 Action: Submit Extended Demographics & Consent
  const submitConsentAndDemographics = async (
    selectedGender,
    selectedEthnicity,
    selectedFirstLang,
    selectedSecondLang,
    selectedHindiProf,
    consentAccepted
  ) => {
    if (!consentAccepted) {
      throw new Error('You must accept the informed consent to participate.');
    }
    if (!selectedGender) {
      throw new Error('Please select your gender.');
    }
    if (!selectedEthnicity) {
      throw new Error('Please select your ethnicity.');
    }
    if (!selectedFirstLang || selectedFirstLang.trim() === '') {
      throw new Error('Please provide your first language (mother tongue).');
    }
    if (!selectedSecondLang || selectedSecondLang.trim() === '') {
      throw new Error('Please provide your second language.');
    }
    if (!selectedHindiProf || selectedHindiProf < 1 || selectedHindiProf > 6) {
      throw new Error('Please rate your Hindi proficiency on a scale of 1 to 6.');
    }

    setError(null);
    setLoading(true);
    try {
      const res = await api.submitConsentAndDemographics(
        sessionToken,
        selectedGender,
        selectedEthnicity,
        selectedFirstLang.trim(),
        selectedSecondLang.trim(),
        Number(selectedHindiProf),
        consentAccepted
      );
      setGender(selectedGender);
      setEthnicity(selectedEthnicity);
      setFirstLanguage(selectedFirstLang.trim());
      setSecondLanguage(selectedSecondLang.trim());
      setHindiProficiency(Number(selectedHindiProf));
      setCurrentStage(STAGES.PAGE_2_AUDIO_1);
      return res;
    } catch (err) {
      setError(err.message || 'Error submitting consent. Please try again.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // 4. Audio Playback tracking
  const notifyAudioStart = useCallback(async (audioNumber) => {
    if (!sessionToken) return;
    try {
      await api.recordAudioStart(sessionToken, audioNumber);
    } catch (e) {
      console.warn('Error recording audio start', e);
    }
  }, [sessionToken]);

  const markAudioCompleted = useCallback(async (audioNumber) => {
    if (!sessionToken) return;
    try {
      await api.completeAudio(sessionToken, audioNumber);
      if (audioNumber === 1) {
        setAudio1Completed(true);
      } else {
        setAudio2Completed(true);
      }
    } catch (e) {
      console.error('Error completing audio', e);
    }
  }, [sessionToken]);

  const advanceFromAudio = (audioNumber) => {
    if (audioNumber === 1) {
      if (!audio1Completed) {
        throw new Error('You must finish listening to the audio recording first.');
      }
      setCurrentStage(STAGES.PAGE_3_QUESTIONS_1);
    } else if (audioNumber === 2) {
      if (!audio2Completed) {
        throw new Error('You must finish listening to the audio recording first.');
      }
      setCurrentStage(STAGES.PAGE_5_QUESTIONS_2);
    }
  };

  // 5. Autosaving responses for questions
  const updateResponse = useCallback((questionId, value) => {
    setResponses((prev) => ({
      ...prev,
      [questionId]: value,
    }));
    setSaveStatus('saving');

    if (saveTimersRef.current[questionId]) {
      clearTimeout(saveTimersRef.current[questionId]);
    }

    saveTimersRef.current[questionId] = setTimeout(async () => {
      try {
        await api.autosaveResponse(sessionToken, questionId, value);
        setSaveStatus('saved');
      } catch (err) {
        console.error('Autosave error for question', questionId, err);
        setSaveStatus('error');
      }
    }, 500);
  }, [sessionToken]);

  const flushResponseSave = useCallback(async (questionId, value) => {
    if (saveTimersRef.current[questionId]) {
      clearTimeout(saveTimersRef.current[questionId]);
    }
    try {
      setSaveStatus('saving');
      await api.autosaveResponse(sessionToken, questionId, value);
      setSaveStatus('saved');
    } catch (err) {
      console.error('Flush save error:', err);
      setSaveStatus('error');
    }
  }, [sessionToken]);

  // 6. Step 3 Action: Advance from Questions 1 to Audio 2
  const advanceFromQuestions1 = async () => {
    // 12 traits + 1 candid comment must be answered
    const requiredKeys = [
      ...Array.from({ length: 12 }, (_, i) => `q1_${i + 1}`),
      'q1_comment'
    ];
    const unanswered = requiredKeys.filter(
      (key) => !responses[key] || String(responses[key]).trim() === ''
    );

    if (unanswered.length > 0) {
      throw new Error(`Please rate all 12 traits and write your candid opinions before proceeding (${unanswered.length} items remaining).`);
    }

    setLoading(true);
    setError(null);
    try {
      await api.completeQuestions1(sessionToken);
      setCurrentStage(STAGES.PAGE_4_AUDIO_2);
    } catch (err) {
      setError(err.message || 'Failed to advance to next stage.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // 7. Step 5 Action: Final Submit Experiment
  const submitFinalExperiment = async () => {
    // 12 traits + 1 candid comment must be answered for Audio 2
    const requiredKeys = [
      ...Array.from({ length: 12 }, (_, i) => `q2_${i + 1}`),
      'q2_comment'
    ];
    const unanswered = requiredKeys.filter(
      (key) => !responses[key] || String(responses[key]).trim() === ''
    );

    if (unanswered.length > 0) {
      throw new Error(`Please rate all 12 traits and write your candid opinions before submitting (${unanswered.length} items remaining).`);
    }

    setLoading(true);
    setError(null);
    try {
      await api.submitExperiment(sessionToken);
      setIsSubmitted(true);
      setCurrentStage(STAGES.SUBMITTED);
    } catch (err) {
      setError(err.message || 'Failed to submit experiment.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const getProgressPercentage = () => {
    switch (currentStage) {
      case STAGES.PAGE_1_CONSENT:
        return 20;
      case STAGES.PAGE_2_AUDIO_1:
        return 40;
      case STAGES.PAGE_3_QUESTIONS_1:
        return 60;
      case STAGES.PAGE_4_AUDIO_2:
        return 80;
      case STAGES.PAGE_5_QUESTIONS_2:
      case STAGES.SUBMITTED:
        return 100;
      default:
        return 20;
    }
  };

  const getPageNumber = () => {
    switch (currentStage) {
      case STAGES.PAGE_1_CONSENT:
        return 1;
      case STAGES.PAGE_2_AUDIO_1:
        return 2;
      case STAGES.PAGE_3_QUESTIONS_1:
        return 3;
      case STAGES.PAGE_4_AUDIO_2:
        return 4;
      case STAGES.PAGE_5_QUESTIONS_2:
      case STAGES.SUBMITTED:
        return 5;
      default:
        return 1;
    }
  };

  const value = {
    loading,
    error,
    setError,
    sessionToken,
    participantId,
    currentStage,
    gender,
    ethnicity,
    firstLanguage,
    secondLanguage,
    hindiProficiency,
    responses,
    saveStatus,
    audio1Completed,
    audio2Completed,
    isSubmitted,
    assignedAudio1: assignedAudio1 || normalizeAudioMetadata(null, 1),
    assignedAudio2: assignedAudio2 || normalizeAudioMetadata(null, 2),
    presentationOrder,
    progress: getProgressPercentage(),
    pageNumber: getPageNumber(),
    submitConsentAndDemographics,
    notifyAudioStart,
    markAudioCompleted,
    advanceFromAudio,
    updateResponse,
    flushResponseSave,
    advanceFromQuestions1,
    submitFinalExperiment,
  };

  return (
    <ExperimentContext.Provider value={value}>
      {children}
    </ExperimentContext.Provider>
  );
}

export function useExperiment() {
  const context = useContext(ExperimentContext);
  if (!context) {
    throw new Error('useExperiment must be used within an ExperimentProvider');
  }
  return context;
}
