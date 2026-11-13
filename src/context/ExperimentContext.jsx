import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  api,
  clearStoredSession,
  isNonRetryableError,
  SESSION_TOKEN_KEY,
  COMPLETED_FLAG_KEY,
} from '../services/api';
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

const AUTOSAVE_DELAY_MS = 500;
const SAVE_ATTEMPTS = 3;
const DEFAULT_TRAIT_ORDER = Array.from({ length: 12 }, (_, i) => i + 1);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (e) {
    /* storage unavailable */
  }
}

/** Accepts only a permutation of 1..12; anything else falls back to the default order. */
function normaliseTraitOrder(order) {
  if (!Array.isArray(order) || order.length !== 12) return DEFAULT_TRAIT_ORDER;
  const nums = order.map(Number);
  const sorted = [...nums].sort((a, b) => a - b);
  return sorted.every((n, i) => n === i + 1) ? nums : DEFAULT_TRAIT_ORDER;
}

function normalizeAudioMetadata(audioObj, defaultSlot = 1) {
  if (!audioObj) {
    const fallbackItem = EXPERIMENT_CONFIG.audioLibrary[defaultSlot - 1] || EXPERIMENT_CONFIG.audioLibrary[0];
    return fallbackItem;
  }
  // The live database sends only the file path and length (the guise is never sent
  // to the browser). Local simulation mode still sends the full catalogue entry.
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
  const [connectionError, setConnectionError] = useState(false);
  const [alreadyCompletedCode, setAlreadyCompletedCode] = useState(null);
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
  // idle | saving | saved | error | listen_incomplete
  const [audioCompletionStatus, setAudioCompletionStatus] = useState({ 1: 'idle', 2: 'idle' });
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Dynamic Allocated Audios
  const [assignedAudio1, setAssignedAudio1] = useState(null);
  const [assignedAudio2, setAssignedAudio2] = useState(null);
  const [presentationOrder, setPresentationOrder] = useState('pure_first');
  const [traitOrder1, setTraitOrder1] = useState(DEFAULT_TRAIT_ORDER);
  const [traitOrder2, setTraitOrder2] = useState(DEFAULT_TRAIT_ORDER);

  // Refs used by asynchronous save logic (avoid stale closures).
  const tokenRef = useRef(null);
  const participantIdRef = useRef(null);
  const latestValuesRef = useRef({}); // question id -> latest value typed or clicked
  const dirtyRef = useRef(new Set()); // question ids whose latest value is not yet saved
  const failedRef = useRef(new Set()); // question ids whose last save attempt failed
  const timersRef = useRef({}); // question id -> pending debounce timer
  const chainsRef = useRef({}); // question id -> promise chain (saves run one at a time per question)
  const inFlightRef = useRef(0);
  const completedRef = useRef({ 1: false, 2: false });
  const completionPromisesRef = useRef({ 1: null, 2: null });

  // ---------------------------------------------------------------------------
  // 1. Initialise or resume a session
  // ---------------------------------------------------------------------------
  const initialise = useCallback(async () => {
    // "?new=1" starts a fresh participant on this device.
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('new') === '1') {
        clearStoredSession();
        writeStorage(COMPLETED_FLAG_KEY, null);
        params.delete('new');
        const query = params.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
      }
    } catch (e) {
      /* URL handling is best effort */
    }

    const storedToken = readStorage(SESSION_TOKEN_KEY);
    const completedCode = readStorage(COMPLETED_FLAG_KEY);

    // This browser already finished the study: do not silently create a new participant.
    if (!storedToken && completedCode) {
      setAlreadyCompletedCode(completedCode);
      setLoading(false);
      return;
    }

    setLoading(true);
    setConnectionError(false);
    try {
      const { data } = await api.initOrResumeSession(storedToken);
      if (data) {
        setParticipantId(data.participant_id);
        participantIdRef.current = data.participant_id;
        setSessionToken(data.session_token);
        tokenRef.current = data.session_token;
        writeStorage(SESSION_TOKEN_KEY, data.session_token);

        if (data.gender) setGender(data.gender);
        if (data.ethnicity) setEthnicity(data.ethnicity);
        if (data.first_language) setFirstLanguage(data.first_language);
        if (data.second_language) setSecondLanguage(data.second_language);
        if (data.hindi_proficiency) setHindiProficiency(data.hindi_proficiency);

        if (data.responses) {
          setResponses(data.responses);
          latestValuesRef.current = { ...data.responses };
        }
        if (data.audio_1_completed) {
          setAudio1Completed(true);
          completedRef.current[1] = true;
        }
        if (data.audio_2_completed) {
          setAudio2Completed(true);
          completedRef.current[2] = true;
        }

        if (data.assigned_audio_1) setAssignedAudio1(normalizeAudioMetadata(data.assigned_audio_1, 1));
        if (data.assigned_audio_2) setAssignedAudio2(normalizeAudioMetadata(data.assigned_audio_2, 2));
        if (data.presentation_order) setPresentationOrder(data.presentation_order);
        setTraitOrder1(normaliseTraitOrder(data.trait_order_1));
        setTraitOrder2(normaliseTraitOrder(data.trait_order_2));

        if (data.submitted || data.current_stage === STAGES.SUBMITTED) {
          setIsSubmitted(true);
          setCurrentStage(STAGES.SUBMITTED);
        } else {
          setCurrentStage(data.current_stage || STAGES.PAGE_1_CONSENT);
        }
      }
    } catch (err) {
      console.error('Initialization error:', err);
      setConnectionError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initialise();
  }, [initialise]);

  const retryConnection = useCallback(() => {
    initialise();
  }, [initialise]);

  /** Clears this browser's session and reloads, so a different person can take part. */
  const startNewSession = useCallback(() => {
    clearStoredSession();
    writeStorage(COMPLETED_FLAG_KEY, null);
    window.location.assign(window.location.pathname);
  }, []);

  // ---------------------------------------------------------------------------
  // 2. Autosave (debounced, serialised per question, retried, flushable)
  // ---------------------------------------------------------------------------
  const refreshSaveStatus = useCallback(() => {
    const pendingTimers = Object.values(timersRef.current).some(Boolean);
    if (inFlightRef.current > 0 || pendingTimers) setSaveStatus('saving');
    else if (failedRef.current.size > 0 || dirtyRef.current.size > 0) setSaveStatus('error');
    else setSaveStatus('saved');
  }, []);

  const saveOne = useCallback(async (questionId) => {
    if (!dirtyRef.current.has(questionId)) return !failedRef.current.has(questionId);
    const value = latestValuesRef.current[questionId];
    dirtyRef.current.delete(questionId);
    inFlightRef.current += 1;
    refreshSaveStatus();
    let saved = false;
    try {
      for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
        try {
          await api.autosaveResponse(tokenRef.current, questionId, value);
          saved = true;
          break;
        } catch (err) {
          console.error('Autosave error for question', questionId, err);
          if (isNonRetryableError(err) || attempt === SAVE_ATTEMPTS - 1) break;
          await sleep(700 * (attempt + 1));
        }
      }
    } finally {
      inFlightRef.current -= 1;
    }
    if (saved) {
      failedRef.current.delete(questionId);
    } else {
      failedRef.current.add(questionId);
      // Keep the value marked as unsaved unless a newer value has already replaced it.
      if (latestValuesRef.current[questionId] === value) dirtyRef.current.add(questionId);
    }
    refreshSaveStatus();
    return saved;
  }, [refreshSaveStatus]);

  /** Queues a save of the latest value; saves for one question never overlap or reorder. */
  const queueSave = useCallback((questionId) => {
    if (timersRef.current[questionId]) {
      clearTimeout(timersRef.current[questionId]);
      timersRef.current[questionId] = null;
    }
    const previous = chainsRef.current[questionId] || Promise.resolve(true);
    const next = previous.catch(() => false).then(() => saveOne(questionId));
    chainsRef.current[questionId] = next;
    return next;
  }, [saveOne]);

  const updateResponse = useCallback((questionId, value) => {
    setResponses((prev) => ({ ...prev, [questionId]: value }));
    latestValuesRef.current[questionId] = value;
    dirtyRef.current.add(questionId);
    if (timersRef.current[questionId]) clearTimeout(timersRef.current[questionId]);
    timersRef.current[questionId] = setTimeout(() => {
      timersRef.current[questionId] = null;
      queueSave(questionId);
    }, AUTOSAVE_DELAY_MS);
    setSaveStatus('saving');
  }, [queueSave]);

  const flushResponseSave = useCallback((questionId, value) => {
    if (value !== undefined && latestValuesRef.current[questionId] !== value) {
      latestValuesRef.current[questionId] = value;
      dirtyRef.current.add(questionId);
    }
    if (!dirtyRef.current.has(questionId) && !timersRef.current[questionId]) {
      return chainsRef.current[questionId] || Promise.resolve(true);
    }
    return queueSave(questionId);
  }, [queueSave]);

  /**
   * Sends every unsaved answer whose id starts with `prefix` and waits for all saves
   * (including ones already in flight). Resolves true only if everything is saved.
   */
  const flushAllPendingSaves = useCallback(async (prefix = '') => {
    const matches = (key) => key.startsWith(prefix);
    const keys = new Set([
      ...Object.keys(timersRef.current).filter((k) => timersRef.current[k] && matches(k)),
      ...[...dirtyRef.current].filter(matches),
      ...[...failedRef.current].filter(matches),
    ]);
    const results = await Promise.all([...keys].map((k) => queueSave(k)));
    await Promise.all(
      Object.entries(chainsRef.current)
        .filter(([k]) => matches(k))
        .map(([, chain]) => chain.catch(() => false))
    );
    const stillUnsaved = [...dirtyRef.current, ...failedRef.current].some(matches);
    return results.every(Boolean) && !stillUnsaved;
  }, [queueSave]);

  // Save anything pending when the participant switches app or tab (common on phones).
  useEffect(() => {
    const flushOnHide = () => {
      if (document.visibilityState === 'hidden') flushAllPendingSaves('');
    };
    document.addEventListener('visibilitychange', flushOnHide);
    return () => document.removeEventListener('visibilitychange', flushOnHide);
  }, [flushAllPendingSaves]);

  // While some answers are unsaved (e.g. the connection dropped), keep retrying quietly.
  useEffect(() => {
    if (saveStatus !== 'error') return undefined;
    const retry = setInterval(() => {
      flushAllPendingSaves('');
    }, 10000);
    return () => clearInterval(retry);
  }, [saveStatus, flushAllPendingSaves]);

  useEffect(() => () => {
    Object.values(timersRef.current).forEach((t) => t && clearTimeout(t));
  }, []);

  // ---------------------------------------------------------------------------
  // 3. Prevent accidental back navigation & warn on unload during an active session
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const sessionActive = Boolean(sessionToken) && !isSubmitted && currentStage !== STAGES.SUBMITTED;
    if (!sessionActive) return undefined;

    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
    };
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = 'You have an active research experiment in progress. Please do not leave or refresh the page.';
      return e.returnValue;
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentStage, isSubmitted, sessionToken]);

  // ---------------------------------------------------------------------------
  // 4. Page 1: consent & demographics
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // 5. Audio playback tracking
  // ---------------------------------------------------------------------------
  const notifyAudioStart = useCallback(async (audioNumber) => {
    if (!tokenRef.current) return;
    try {
      await api.recordAudioStart(tokenRef.current, audioNumber);
    } catch (e) {
      console.warn('Error recording audio start', e);
    }
  }, []);

  const recordAudioEvent = useCallback((audioNumber, eventType, positionSeconds = null) => {
    api.recordAudioEvent(tokenRef.current, audioNumber, eventType, positionSeconds);
  }, []);

  const setCompletionStatus = useCallback((audioNumber, status) => {
    setAudioCompletionStatus((prev) => ({ ...prev, [audioNumber]: status }));
  }, []);

  /**
   * Tells the server the recording finished. Retries network failures.
   * Resolves 'saved', 'listen_incomplete' or 'error'.
   */
  const markAudioCompleted = useCallback((audioNumber) => {
    if (completedRef.current[audioNumber]) return Promise.resolve('saved');
    if (completionPromisesRef.current[audioNumber]) return completionPromisesRef.current[audioNumber];
    if (!tokenRef.current) return Promise.resolve('error');

    setCompletionStatus(audioNumber, 'saving');
    const attempt = (async () => {
      for (let i = 0; i < SAVE_ATTEMPTS; i++) {
        try {
          await api.completeAudio(tokenRef.current, audioNumber);
          completedRef.current[audioNumber] = true;
          if (audioNumber === 1) setAudio1Completed(true);
          else setAudio2Completed(true);
          setCompletionStatus(audioNumber, 'saved');
          return 'saved';
        } catch (e) {
          if (e?.code === 'LISTEN_INCOMPLETE') {
            setCompletionStatus(audioNumber, 'listen_incomplete');
            return 'listen_incomplete';
          }
          console.error('Error completing audio', e);
          if (isNonRetryableError(e) || i === SAVE_ATTEMPTS - 1) break;
          await sleep(800 * (i + 1));
        }
      }
      setCompletionStatus(audioNumber, 'error');
      return 'error';
    })();
    completionPromisesRef.current[audioNumber] = attempt;
    attempt.finally(() => {
      completionPromisesRef.current[audioNumber] = null;
    });
    return attempt;
  }, [setCompletionStatus]);

  const resetAudioCompletionStatus = useCallback((audioNumber) => {
    setCompletionStatus(audioNumber, 'idle');
  }, [setCompletionStatus]);

  /**
   * Continue button on an audio page. Waits for the server to confirm completion
   * (retrying if needed) and never throws, so a failure is always shown to the participant.
   */
  const advanceFromAudio = async (audioNumber) => {
    setError(null);
    const result = completedRef.current[audioNumber] ? 'saved' : await markAudioCompleted(audioNumber);
    if (result === 'saved') {
      setCurrentStage(audioNumber === 1 ? STAGES.PAGE_3_QUESTIONS_1 : STAGES.PAGE_5_QUESTIONS_2);
      return true;
    }
    if (result === 'error') {
      setError('We could not confirm that you finished listening. Please check your internet connection and press Continue again.');
    }
    return false;
  };

  // ---------------------------------------------------------------------------
  // 6. Questions
  // ---------------------------------------------------------------------------
  // All 12 traits must be rated; the candid comment is optional.
  const requiredKeysFor = (recordingNumber) =>
    Array.from({ length: 12 }, (_, i) => `q${recordingNumber}_${i + 1}`);

  const ensureAnswersSaved = async (recordingNumber) => {
    const allSaved = await flushAllPendingSaves(`q${recordingNumber}_`);
    if (!allSaved) {
      throw new Error('Some of your answers have not been saved yet. Please check your internet connection and press the button again.');
    }
  };

  const advanceFromQuestions1 = async () => {
    const unanswered = requiredKeysFor(1).filter(
      (key) => !responses[key] || String(responses[key]).trim() === ''
    );
    if (unanswered.length > 0) {
      throw new Error(`Please rate all 12 traits before proceeding (${unanswered.length} items remaining).`);
    }

    setLoading(true);
    setError(null);
    try {
      // Wait for every answer to reach the database before changing stage.
      await ensureAnswersSaved(1);
      await api.completeQuestions1(sessionToken);
      setCurrentStage(STAGES.PAGE_4_AUDIO_2);
    } catch (err) {
      setError(err.message || 'Failed to advance to next stage.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const submitFinalExperiment = async () => {
    const unanswered = requiredKeysFor(2).filter(
      (key) => !responses[key] || String(responses[key]).trim() === ''
    );
    if (unanswered.length > 0) {
      throw new Error(`Please rate all 12 traits before submitting (${unanswered.length} items remaining).`);
    }

    setLoading(true);
    setError(null);
    try {
      // Without this, the final comment edit could arrive after the session is locked.
      await ensureAnswersSaved(2);
      await api.submitExperiment(sessionToken);
      setIsSubmitted(true);
      setCurrentStage(STAGES.SUBMITTED);
      // Forget this session in the browser so the next person on this device does not
      // resume it; remember only that this browser has finished.
      clearStoredSession();
      writeStorage(COMPLETED_FLAG_KEY, participantIdRef.current || 'completed');
    } catch (err) {
      setError(err.message || 'Failed to submit experiment.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 7. Progress helpers
  // ---------------------------------------------------------------------------
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
    connectionError,
    retryConnection,
    alreadyCompletedCode,
    startNewSession,
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
    audioCompletionStatus,
    isSubmitted,
    assignedAudio1: assignedAudio1 || normalizeAudioMetadata(null, 1),
    assignedAudio2: assignedAudio2 || normalizeAudioMetadata(null, 2),
    presentationOrder,
    traitOrder1,
    traitOrder2,
    progress: getProgressPercentage(),
    pageNumber: getPageNumber(),
    submitConsentAndDemographics,
    notifyAudioStart,
    recordAudioEvent,
    markAudioCompleted,
    resetAudioCompletionStatus,
    advanceFromAudio,
    updateResponse,
    flushResponseSave,
    flushAllPendingSaves,
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
