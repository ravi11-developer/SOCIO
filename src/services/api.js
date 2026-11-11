import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { EXPERIMENT_CONFIG } from '../config/experiment';

const LOCAL_STORAGE_KEY = 'audio_research_session';
const ALLOCATION_COUNTS_KEY = 'audio_research_allocations';

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

  // Sort pure audios by allocation count, then random tie-breaker
  const sortedPure = [...pureAudios].sort((a, b) => {
    const countA = counts[a.id] || 0;
    const countB = counts[b.id] || 0;
    if (countA !== countB) return countA - countB;
    return Math.random() - 0.5;
  });
  const selectedPure = sortedPure[0] || pureAudios[0];

  // Sort code-mixed audios, prioritizing opposite gender if possible to balance participant exposure
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

  // Counterbalance presentation order: 50% pure first, 50% code-mixed first
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
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.rpc('rpc_init_or_resume_session', {
          p_session_token: existingToken || null,
        });
        if (error) throw error;
        saveLocalState(data);
        return { success: true, data };
      } catch (err) {
        console.error('Supabase session init failed, falling back to local cache:', err);
      }
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
        current_stage: 'consent_pending',
        audio_1_completed: false,
        audio_2_completed: false,
        submitted: false,
        assigned_audio_1: allocations.assigned_audio_1,
        assigned_audio_2: allocations.assigned_audio_2,
        presentation_order: allocations.presentation_order,
        responses: {},
      };
      saveLocalState(local);
    }

    return { success: true, data: local };
  },

  /**
   * Submits demographics and informed consent
   */
  async submitConsentAndDemographics(sessionToken, gender, ethnicity, consent) {
    if (!consent) {
      throw new Error('Informed consent is required.');
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.rpc('rpc_submit_consent_and_demographics', {
          p_session_token: sessionToken,
          p_gender: gender,
          p_ethnicity: ethnicity,
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
    local.current_stage = 'audio_1_pending';
    saveLocalState(local);
    return { success: true, data: { current_stage: 'audio_1_pending' } };
  },

  /**
   * Records audio start timestamp
   */
  async recordAudioStart(sessionToken, audioNumber) {
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.rpc('rpc_record_audio_start', {
          p_session_token: sessionToken,
          p_audio_number: audioNumber,
        });
      } catch (err) {
        console.warn('Audio start logging failed:', err);
      }
    }
  },

  /**
   * Marks audio playback complete and unlocks next stage
   */
  async completeAudio(sessionToken, audioNumber) {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.rpc('rpc_complete_audio', {
          p_session_token: sessionToken,
          p_audio_number: audioNumber,
        });
        if (error) throw error;
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

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.rpc('rpc_autosave_response', {
        p_session_token: sessionToken,
        p_question_id: questionId,
        p_answer: answer,
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
    if (isSupabaseConfigured && supabase) {
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
    if (isSupabaseConfigured && supabase) {
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
   * Resolves audio URL from Supabase storage bucket 'audio-files' or fallback
   */
  getAudioUrl(storagePath, fallbackUrl) {
    if (!storagePath || storagePath.startsWith('[PLACEHOLDER')) {
      return fallbackUrl;
    }
    if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
      return storagePath;
    }
    if (isSupabaseConfigured && supabase) {
      const { data } = supabase.storage.from('audio-files').getPublicUrl(storagePath);
      return data?.publicUrl || fallbackUrl;
    }
    return fallbackUrl;
  }
};
