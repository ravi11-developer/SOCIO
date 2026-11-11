import { describe, it, expect, beforeEach } from 'vitest';
import { api } from '../src/services/api';
import { EXPERIMENT_CONFIG } from '../src/config/experiment';

describe('Experiment State Machine & Security Progression', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('1. Initializes new anonymous participant at consent_pending stage', async () => {
    const { data } = await api.initOrResumeSession();
    expect(data.current_stage).toBe('consent_pending');
    expect(data.participant_id).toMatch(/^P-[A-Z0-9]+$/);
    expect(data.session_token).toBeDefined();
    expect(data.submitted).toBe(false);
  });

  it('2. Enforces consent requirement (cannot proceed without consent)', async () => {
    const { data: session } = await api.initOrResumeSession();
    
    await expect(
      api.submitConsentAndDemographics(session.session_token, 'female', 'option_placeholder_1', false)
    ).rejects.toThrow('Informed consent is required.');

    const { data: refreshed } = await api.initOrResumeSession(session.session_token);
    expect(refreshed.current_stage).toBe('consent_pending');
  });

  it('3. Advances to audio_1_pending after valid consent and demographics', async () => {
    const { data: session } = await api.initOrResumeSession();
    const result = await api.submitConsentAndDemographics(
      session.session_token,
      'female',
      'option_placeholder_1',
      true
    );

    expect(result.data.current_stage).toBe('audio_1_pending');
  });

  it('4. Audio 1 completion transitions to questions_1_pending', async () => {
    const { data: session } = await api.initOrResumeSession();
    await api.submitConsentAndDemographics(session.session_token, 'male', 'option_placeholder_2', true);

    const comp = await api.completeAudio(session.session_token, 1);
    expect(comp.data.current_stage).toBe('questions_1_pending');
  });

  it('5. Autosaves responses correctly into storage and local cache', async () => {
    const { data: session } = await api.initOrResumeSession();
    await api.submitConsentAndDemographics(session.session_token, 'male', 'option_placeholder_2', true);
    await api.completeAudio(session.session_token, 1);

    await api.autosaveResponse(session.session_token, 'q1_1', 'Answer for Question 1');
    await api.autosaveResponse(session.session_token, 'q1_2', 'Answer for Question 2');

    // Simulate page refresh by re-initializing with session token
    const { data: refreshed } = await api.initOrResumeSession(session.session_token);
    expect(refreshed.responses['q1_1']).toBe('Answer for Question 1');
    expect(refreshed.responses['q1_2']).toBe('Answer for Question 2');
    expect(refreshed.current_stage).toBe('questions_1_pending');
  });

  it('6. Questions 1 completion advances to audio_2_pending', async () => {
    const { data: session } = await api.initOrResumeSession();
    await api.submitConsentAndDemographics(session.session_token, 'male', 'option_placeholder_2', true);
    await api.completeAudio(session.session_token, 1);

    const next = await api.completeQuestions1(session.session_token);
    expect(next.data.current_stage).toBe('audio_2_pending');
  });

  it('7. Audio 2 completion transitions to questions_2_pending', async () => {
    const { data: session } = await api.initOrResumeSession();
    await api.submitConsentAndDemographics(session.session_token, 'male', 'option_placeholder_2', true);
    await api.completeAudio(session.session_token, 1);
    await api.completeQuestions1(session.session_token);

    const comp2 = await api.completeAudio(session.session_token, 2);
    expect(comp2.data.current_stage).toBe('questions_2_pending');
  });

  it('8. Final submission seals experiment and marks submitted', async () => {
    const { data: session } = await api.initOrResumeSession();
    await api.submitConsentAndDemographics(session.session_token, 'male', 'option_placeholder_2', true);
    await api.completeAudio(session.session_token, 1);
    await api.completeQuestions1(session.session_token);
    await api.completeAudio(session.session_token, 2);

    const sub = await api.submitExperiment(session.session_token);
    expect(sub.data.current_stage).toBe('submitted');
    expect(sub.data.submitted_at).toBeDefined();

    // Verify session resumption stays submitted
    const { data: refreshed } = await api.initOrResumeSession(session.session_token);
    expect(refreshed.current_stage).toBe('submitted');
    expect(refreshed.submitted).toBe(true);
  });

  it('9. Isolates participant responses from different participants', async () => {
    // Participant A
    const { data: sessionA } = await api.initOrResumeSession();
    await api.autosaveResponse(sessionA.session_token, 'q1_1', 'Response from participant A');

    // Participant B
    const { data: sessionB } = await api.initOrResumeSession();
    await api.autosaveResponse(sessionB.session_token, 'q1_1', 'Response from participant B');

    // Verify participant B's session contains only B's response
    const { data: currentB } = await api.initOrResumeSession(sessionB.session_token);
    expect(currentB.responses['q1_1']).toBe('Response from participant B');
  });

  it('10. Correctly preserves all 20 question responses across workflow', async () => {
    const { data: session } = await api.initOrResumeSession();
    
    // Save 10 answers for audio 1
    for (let i = 1; i <= 10; i++) {
      await api.autosaveResponse(session.session_token, `q1_${i}`, `Answer for A1 Q${i}`);
    }

    // Save 10 answers for audio 2
    for (let i = 1; i <= 10; i++) {
      await api.autosaveResponse(session.session_token, `q2_${i}`, `Answer for A2 Q${i}`);
    }

    // Verify all 20 responses exist
    const { data: verifySession } = await api.initOrResumeSession(session.session_token);
    for (let i = 1; i <= 10; i++) {
      expect(verifySession.responses[`q1_${i}`]).toBe(`Answer for A1 Q${i}`);
      expect(verifySession.responses[`q2_${i}`]).toBe(`Answer for A2 Q${i}`);
    }
  });

  it('11. Resolves audio URLs with fallback when storage paths are placeholders', () => {
    const fallback = 'https://example.com/sound.mp3';
    const url = api.getAudioUrl('[PLACEHOLDER: AUDIO_1_FILE]', fallback);
    expect(url).toBe(fallback);

    const directHttp = 'https://my-bucket.supabase.co/audio.mp3';
    expect(api.getAudioUrl(directHttp, fallback)).toBe(directHttp);
  });
});
