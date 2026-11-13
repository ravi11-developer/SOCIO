import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { EXPERIMENT_CONFIG } from '../config/experiment';

export const LOCAL_STORAGE_KEY = 'audio_research_session';
export const SESSION_TOKEN_KEY = 'audio_research_session_token';
export const COMPLETED_FLAG_KEY = 'audio_research_completed_code';
const ALLOCATION_COUNTS_KEY = 'audio_research_allocations';

/** True when the site talks to the real database (false in tests and local development without .env). */
export const isLiveDatabase = Boolean(isSupabaseConfigured && supabase);

/** Error raised when the server says the recording was not listened to for long enough. */
export class ListenIncompleteError extends Error {
  constructor(details = {}) {
    super('The recording has to be listened to in full before continuing.');
    this.name = 'ListenIncompleteError';
    this.code = 'LISTEN_INCOMPLETE';
    this.details = details;
  }
}

/**
 * Errors that will fail the same way however often they are retried
 * (bad input, wrong stage, session already submitted, unknown session).
 */
export function isNonRetryableError(err) {
  const msg = String(err?.message || '');
  return (
    err?.code === 'LISTEN_INCOMPLETE' ||
    /VALIDATION:|STAGE_LOCKED:|after final submission|Invalid session token|Informed consent/i.test(msg)
  );
}

/** Removes this browser's stored session, so the next visit starts a new participant. */
export function clearStoredSession() {
  try {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch (e) {
    /* storage unavailable: nothing to clear */
  }
}

function randomTraitOrder() {
  const order = Array.from({ length: 12 }, (_, i) => i + 1);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getLocalState() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveLocalState(state) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to write to local storage', e);
  }
}

function getAllocationCounts() {
  try {
    const raw = localStorage.getItem(ALLOCATION_COUNTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function recordLocalAllocation(recId) {
  try {
    const counts = getAllocationCounts();
    counts[recId] = (counts[recId] || 0) + 1;
    localStorage.setItem(ALLOCATION_COUNTS_KEY, JSON.stringify(counts));
  } catch (e) {}
}

/**
 * Local simulation of Least-Allocated Balanced Stratification
 */
function allocateAudiosLocally() {
  const counts = getAllocationCounts();
  const pureAudios = EXPERIMENT_CONFIG.audioLibrary.filter((a) => a.category === 'pure');
  const codeMixedAudios = EXPERIMENT_CONFIG.audioLibrary.filter((a) => a.category === 'code_mixed');

  const sortedPure = [...pureAudios].sort((a, b) => {
    const countA = counts[a.id] || 0;
    const countB = counts[b.id] || 0;
    if (countA !== countB) return countA - countB;
    return Math.random() - 0.5;
  });
  const selectedPure = sortedPure[0] || pureAudios[0];

  const sortedCodeMixed = [...codeMixedAudios].sort((a, b) => {
    const aOpposite = a.speakerGender !== selectedPure.speakerGender ? 0 : 1;
    const bOpposite = b.speakerGender !== selectedPure.speakerGender ? 0 : 1;
    if (aOpposite !== bOpposite) return aOpposite - bOpposite;

    const countA = counts[a.id] || 0;
    const countB = counts[b.id] || 0;
    if (countA !== countB) return countA - countB;
    return Math.random() - 0.5;
  });
  const selectedCodeMixed = sortedCodeMixed[0] || codeMixedAudios[0];

  recordLocalAllocation(selectedPure.id);
  recordLocalAllocation(selectedCodeMixed.id);

  const isPureFirst = Math.random() < 0.5;
  return {
    assigned_audio_1: isPureFirst ? selectedPure : selectedCodeMixed,
    assigned_audio_2: isPureFirst ? selectedCodeMixed : selectedPure,
    presentation_order: isPureFirst ? 'pure_first' : 'codemixed_first',
  };
}

export const api = {
  /**
   * Initializes a new session or resumes an existing one using sessionToken
   */
  async initOrResumeSession(existingToken = null) {
    if (isLiveDatabase) {
      // No silent fallback to browser-only mode: a session the database has never
      // seen cannot save anything, so the caller must show a connection error instead.
      const { data, error } = await supabase.rpc('rpc_init_or_resume_session', {
        p_session_token: existingToken || null,
      });
      if (error) throw error;
      saveLocalState(data);
      return { success: true, data };
    }

    // Local / Offline Simulation Fallback
    let local = getLocalState();
    if (!local || (existingToken && local.session_token !== existingToken)) {
      const randomCode = 'P-' + Math.random().toString(36).substring(2, 10).toUpperCase();
      const allocations = allocateAudiosLocally();

      local = {
        status: 'created',
        participant_id: randomCode,
        session_token: existingToken || crypto.randomUUID(),
        gender: null,
        ethnicity: null,
        first_language: null,
        second_language: null,
        hindi_proficiency: null,
        current_stage: 'consent_pending',
        audio_1_completed: false,
        audio_2_completed: false,
        submitted: false,
        assigned_audio_1: allocations.assigned_audio_1,
        assigned_audio_2: allocations.assigned_audio_2,
        presentation_order: allocations.presentation_order,
        trait_order_1: randomTraitOrder(),
        trait_order_2: randomTraitOrder(),
        responses: {},
      };
      saveLocalState(local);
    }

    return { success: true, data: local };
  },

  /**
   * Submits extended demographics and informed consent
   */
  async submitConsentAndDemographics(sessionToken, gender, ethnicity, firstLanguage, secondLanguage, hindiProficiency, consent) {
    if (!consent) {
      throw new Error('Informed consent is required.');
    }
    if (!hindiProficiency || hindiProficiency < 1 || hindiProficiency > 6) {
      throw new Error('Please rate your Hindi proficiency on a scale of 1 to 6.');
    }

    if (isLiveDatabase) {
      try {
        const { data, error } = await supabase.rpc('rpc_submit_consent_and_demographics', {
          p_session_token: sessionToken,
          p_gender: gender,
          p_ethnicity: ethnicity,
          p_first_language: firstLanguage,
          p_second_language: secondLanguage,
          p_hindi_proficiency: hindiProficiency,
          p_consent: consent,
        });
        if (error) throw error;
        return { success: true, data };
      } catch (err) {
        console.error('Supabase consent submit error:', err);
        throw err;
      }
    }

    const local = getLocalState() || {};
    local.gender = gender;
    local.ethnicity = ethnicity;
    local.first_language = firstLanguage;
    local.second_language = secondLanguage;
    local.hindi_proficiency = hindiProficiency;
    local.current_stage = 'audio_1_pending';
    saveLocalState(local);
    return { success: true, data: { current_stage: 'audio_1_pending' } };
  },

  /**
   * Records audio start timestamp
   */
  async recordAudioStart(sessionToken, audioNumber) {
    if (!isLiveDatabase) return;
    // The server's listening check measures from this timestamp, so retry a little.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase.rpc('rpc_record_audio_start', {
        p_session_token: sessionToken,
        p_audio_number: audioNumber,
      });
      if (!error) return;
      console.warn('Audio start logging failed:', error);
      if (isNonRetryableError(error)) return;
      await sleep(600 * (attempt + 1));
    }
  },

  /**
   * Logs a playback event (play, pause, ended, hidden, visible, load_error).
   * Best effort: failures are ignored because they must never block a participant.
   */
  async recordAudioEvent(sessionToken, audioNumber, eventType, positionSeconds = null) {
    if (!isLiveDatabase || !sessionToken) return;
    try {
      const position = Number.isFinite(positionSeconds) ? Math.round(positionSeconds * 100) / 100 : null;
      await supabase.rpc('rpc_record_audio_event', {
        p_session_token: sessionToken,
        p_audio_number: audioNumber,
        p_event_type: eventType,
        p_position_seconds: position,
      });
    } catch (err) {
      console.warn('Audio event logging failed:', err);
    }
  },

  /**
   * Marks audio playback complete and unlocks next stage
   */
  async completeAudio(sessionToken, audioNumber) {
    if (isLiveDatabase) {
      try {
        const { data, error } = await supabase.rpc('rpc_complete_audio', {
          p_session_token: sessionToken,
          p_audio_number: audioNumber,
        });
        if (error) throw error;
        if (data && data.success === false && data.reason === 'listen_incomplete') {
          throw new ListenIncompleteError(data);
        }
        return { success: true, data };
      } catch (err) {
        console.error('Supabase audio completion error:', err);
        throw err;
      }
    }

    const local = getLocalState() || {};
    if (audioNumber === 1) {
      local.audio_1_completed = true;
      local.current_stage = 'questions_1_pending';
    } else {
      local.audio_2_completed = true;
      local.current_stage = 'questions_2_pending';
    }
    saveLocalState(local);
    return { success: true, data: { current_stage: local.current_stage } };
  },

  /**
   * Autosaves a single question response with recording metadata
   */
  async autosaveResponse(sessionToken, questionId, answer) {
    const local = getLocalState() || {};
    local.responses = local.responses || {};
    local.responses[questionId] = answer;
    saveLocalState(local);

    if (isLiveDatabase) {
      const { data, error } = await supabase.rpc('rpc_autosave_response', {
        p_session_token: sessionToken,
        p_question_id: questionId,
        p_answer: String(answer),
      });
      if (error) throw error;
      return { success: true, data };
    }

    return { success: true };
  },

  /**
   * Validates Audio 1 responses and advances to Audio 2
   */
  async completeQuestions1(sessionToken) {
    if (isLiveDatabase) {
      try {
        const { data, error } = await supabase.rpc('rpc_complete_questions_1', {
          p_session_token: sessionToken,
        });
        if (error) throw error;
        return { success: true, data };
      } catch (err) {
        console.error('Questions 1 completion error:', err);
        throw err;
      }
    }

    const local = getLocalState() || {};
    local.current_stage = 'audio_2_pending';
    saveLocalState(local);
    return { success: true, data: { current_stage: 'audio_2_pending' } };
  },

  /**
   * Final submission of Audio 2 questions and closes session
   */
  async submitExperiment(sessionToken) {
    if (isLiveDatabase) {
      try {
        const { data, error } = await supabase.rpc('rpc_submit_experiment', {
          p_session_token: sessionToken,
        });
        if (error) throw error;
        return { success: true, data };
      } catch (err) {
        console.error('Final experiment submission error:', err);
        throw err;
      }
    }

    const local = getLocalState() || {};
    local.current_stage = 'submitted';
    local.submitted = true;
    local.submitted_at = new Date().toISOString();
    saveLocalState(local);
    return { success: true, data: { current_stage: 'submitted', submitted_at: local.submitted_at } };
  },

  /**
   * Resolves the audio URL from the Supabase storage bucket 'audio_files'.
   * On the live site there is deliberately NO fallback to the sample clip: if the
   * assigned recording cannot be found, null is returned and the player shows an
   * error, rather than a participant rating a speaker they never heard.
   * The sample clip is used only in local development and tests.
   */
  getAudioUrl(storagePath, fallbackUrl) {
    const safeFallback = isLiveDatabase ? null : fallbackUrl || '/audio/sample_audio.mp3';
    if (!storagePath || storagePath.startsWith('[PLACEHOLDER')) {
      return safeFallback;
    }
    if (storagePath.startsWith('http://') || storagePath.startsWith('https://') || storagePath.startsWith('/')) {
      return storagePath;
    }
    if (isLiveDatabase) {
      let path = storagePath;
      if (!path.endsWith('.mpeg') && !path.endsWith('.mp3')) {
        path = `${path}.mp3.mpeg`;
      }
      const { data } = supabase.storage.from('audio_files').getPublicUrl(path);
      return data?.publicUrl || null;
    }
    return safeFallback;
  }
};
