/**
 * Tests for the data-integrity fixes: consent, demographics format, save flushing,
 * serialised and retried autosave, audio completion retries and the listening check,
 * connection errors, shared-device handling and per-participant trait order.
 * These run in local mode with the API methods mocked.
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import App from '../src/App';
import Page1InstructionsConsent from '../src/components/pages/Page1InstructionsConsent';
import QuestionList from '../src/components/questions/QuestionList';
import RestrictedAudioPlayer from '../src/components/audio/RestrictedAudioPlayer';
import { ExperimentProvider, useExperiment } from '../src/context/ExperimentContext';
import {
  api,
  ListenIncompleteError,
  isNonRetryableError,
  SESSION_TOKEN_KEY,
  COMPLETED_FLAG_KEY,
} from '../src/services/api';
import { EXPERIMENT_CONFIG } from '../src/config/experiment';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function session(overrides = {}) {
  return {
    participant_id: 'P-TEST1234',
    session_token: 'tok-123',
    current_stage: 'questions_1_pending',
    responses: {},
    assigned_audio_1: { audio_storage_path: 'a.mp3', duration_seconds: 60 },
    assigned_audio_2: { audio_storage_path: 'b.mp3', duration_seconds: 60 },
    presentation_order: 'pure_first',
    trait_order_1: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    trait_order_2: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    submitted: false,
    ...overrides,
  };
}

let ctx;
function Grab() {
  ctx = useExperiment();
  return null;
}

async function renderProvider(sessionData = session(), children = null) {
  vi.spyOn(api, 'initOrResumeSession').mockResolvedValue({ success: true, data: sessionData });
  let utils;
  await act(async () => {
    utils = render(
      <ExperimentProvider>
        <Grab />
        {children}
      </ExperimentProvider>
    );
  });
  await waitFor(() => expect(ctx.sessionToken).toBe(sessionData.session_token));
  return utils;
}

function fillAllAnswers(prefix, comment = 'Final comment') {
  for (let i = 1; i <= 12; i++) ctx.updateResponse(`${prefix}${i}`, String((i % 6) + 1));
  ctx.updateResponse(`${prefix}comment`, comment);
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Consent and demographics', () => {
  it('sends consent only when ticked, and stores languages in a consistent format', async () => {
    const submitSpy = vi.spyOn(api, 'submitConsentAndDemographics').mockResolvedValue({ success: true, data: {} });
    await renderProvider(session({ current_stage: 'consent_pending' }), <Page1InstructionsConsent />);

    fireEvent.change(screen.getByLabelText(/^gender/i), { target: { value: 'male' } });
    fireEvent.change(screen.getByLabelText(/^ethnicity/i), { target: { value: 'south_indian' } });
    fireEvent.change(screen.getByLabelText(/first language/i), { target: { value: '__other__' } });
    const start = screen.getByTestId('start-experiment-button');
    expect(start).toBeDisabled(); // "Other" chosen but not typed yet
    fireEvent.change(screen.getByTestId('first-language-other'), { target: { value: '  Kodava ' } });

    fireEvent.click(screen.getByTestId('second-language-Telugu'));
    fireEvent.click(screen.getByTestId('second-language-English'));
    fireEvent.click(screen.getByTestId('second-language-other-checkbox'));
    expect(start).toBeDisabled(); // L2 "Other" ticked but empty
    fireEvent.change(screen.getByTestId('second-language-other'), { target: { value: 'Sourashtra' } });
    fireEvent.click(screen.getByTestId('hindi-prof-3'));
    expect(start).toBeDisabled(); // consent not given
    fireEvent.click(screen.getByTestId('consent-checkbox'));
    expect(start).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(start);
    });
    expect(submitSpy).toHaveBeenCalledTimes(1);
    const args = submitSpy.mock.calls[0];
    expect(args[3]).toBe('Other: Kodava');
    // Listed languages are stored in catalogue order, then the free-text one.
    expect(args[4]).toBe('English; Telugu; Other: Sourashtra');
    expect(args[5]).toBe(3);
    expect(args[6]).toBe(true);
  });

  it('"None" for second language clears any ticked languages', async () => {
    const submitSpy = vi.spyOn(api, 'submitConsentAndDemographics').mockResolvedValue({ success: true, data: {} });
    await renderProvider(session({ current_stage: 'consent_pending' }), <Page1InstructionsConsent />);
    fireEvent.change(screen.getByLabelText(/^gender/i), { target: { value: 'female' } });
    fireEvent.change(screen.getByLabelText(/^ethnicity/i), { target: { value: 'north_indian' } });
    fireEvent.change(screen.getByLabelText(/first language/i), { target: { value: 'Hindi' } });
    fireEvent.click(screen.getByTestId('second-language-English'));
    fireEvent.click(screen.getByTestId('second-language-none'));
    expect(screen.getByTestId('second-language-English')).not.toBeChecked();
    fireEvent.click(screen.getByTestId('hindi-prof-6'));
    fireEvent.click(screen.getByTestId('consent-checkbox'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('start-experiment-button'));
    });
    expect(submitSpy.mock.calls[0][4]).toBe('None');
  });
});

describe('Autosave flushing, ordering and retries', () => {
  it('waits for every pending answer to be saved before completing questions 1', async () => {
    const events = [];
    vi.spyOn(api, 'autosaveResponse').mockImplementation(async (_t, id, value) => {
      await sleep(30);
      events.push(`save:${id}=${value}`);
      return { success: true };
    });
    vi.spyOn(api, 'completeQuestions1').mockImplementation(async () => {
      events.push('complete');
      return { success: true, data: {} };
    });
    await renderProvider();

    const startedAt = Date.now();
    await act(async () => {
      fillAllAnswers('q1_', 'Last words typed just before clicking');
    });
    // Click "Continue" immediately, before the 500 ms autosave delay has passed.
    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(events).toHaveLength(0);
    await act(async () => {
      await ctx.advanceFromQuestions1();
    });

    expect(events[events.length - 1]).toBe('complete');
    expect(events.filter((e) => e.startsWith('save:'))).toHaveLength(13);
    expect(events).toContain('save:q1_comment=Last words typed just before clicking');
    expect(ctx.currentStage).toBe('audio_2_pending');
  });

  it('lets the participant continue without a comment (the comment is optional)', async () => {
    vi.spyOn(api, 'autosaveResponse').mockResolvedValue({ success: true });
    const complete = vi.spyOn(api, 'completeQuestions1').mockResolvedValue({ success: true, data: {} });
    await renderProvider();
    await act(async () => {
      for (let i = 1; i <= 12; i++) ctx.updateResponse(`q1_${i}`, '3');
    });
    await act(async () => {
      await ctx.advanceFromQuestions1();
    });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(ctx.currentStage).toBe('audio_2_pending');
  });

  it('final submission includes the very last comment edit', async () => {
    const saved = {};
    vi.spyOn(api, 'autosaveResponse').mockImplementation(async (_t, id, value) => {
      await sleep(40);
      saved[id] = value;
      return { success: true };
    });
    let savedAtSubmit = null;
    vi.spyOn(api, 'submitExperiment').mockImplementation(async () => {
      savedAtSubmit = { ...saved };
      return { success: true, data: { current_stage: 'submitted' } };
    });
    await renderProvider(session({ current_stage: 'questions_2_pending' }));

    await act(async () => {
      fillAllAnswers('q2_', 'Partial');
      await sleep(600); // the partial comment is autosaved
    });
    expect(saved.q2_comment).toBe('Partial');
    await act(async () => {
      ctx.updateResponse('q2_comment', 'Partial comment, now finished.');
      ctx.flushResponseSave('q2_comment', 'Partial comment, now finished.'); // blur
    });
    await act(async () => {
      await ctx.submitFinalExperiment(); // click Submit at the same moment
    });

    expect(savedAtSubmit.q2_comment).toBe('Partial comment, now finished.');
    expect(ctx.isSubmitted).toBe(true);
  });

  it('never runs two saves for the same question at once, and the newest value wins', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const order = [];
    vi.spyOn(api, 'autosaveResponse').mockImplementation(async (_t, id, value) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await sleep(value === 'first' ? 120 : 10); // older request is slower
      order.push(value);
      inFlight -= 1;
      return { success: true };
    });
    await renderProvider();

    await act(async () => {
      ctx.updateResponse('q1_comment', 'first');
      await sleep(550); // first save starts
      ctx.updateResponse('q1_comment', 'second');
      await ctx.flushAllPendingSaves('q1_');
    });

    expect(maxInFlight).toBe(1);
    expect(order).toEqual(['first', 'second']);
  });

  it('retries a failed save and reports success once it gets through', async () => {
    let calls = 0;
    vi.spyOn(api, 'autosaveResponse').mockImplementation(async () => {
      calls += 1;
      if (calls < 3) throw new Error('Failed to fetch');
      return { success: true };
    });
    await renderProvider();
    let ok;
    await act(async () => {
      ctx.updateResponse('q1_1', '4');
      ok = await ctx.flushAllPendingSaves('q1_');
    });
    expect(calls).toBe(3);
    expect(ok).toBe(true);
    expect(ctx.saveStatus).toBe('saved');
  }, 10000);

  it('blocks final submission when answers cannot be saved', async () => {
    vi.spyOn(api, 'autosaveResponse').mockRejectedValue(new Error('Failed to fetch'));
    const submitSpy = vi.spyOn(api, 'submitExperiment');
    await renderProvider(session({ current_stage: 'questions_2_pending' }));

    let error;
    await act(async () => {
      fillAllAnswers('q2_');
    });
    await act(async () => {
      try {
        await ctx.submitFinalExperiment();
      } catch (e) {
        error = e;
      }
    });
    expect(error.message).toMatch(/not been saved/i);
    expect(submitSpy).not.toHaveBeenCalled();
    expect(ctx.isSubmitted).toBe(false);
  }, 15000);

  it('does not retry answers the server rejects as invalid', async () => {
    const spy = vi.spyOn(api, 'autosaveResponse').mockRejectedValue(new Error('VALIDATION: Ratings must be a whole number from 1 to 6.'));
    await renderProvider();
    await act(async () => {
      ctx.updateResponse('q1_1', '9');
      await ctx.flushAllPendingSaves('q1_');
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('Audio completion', () => {
  it('retries a failed completion and only then moves on', async () => {
    let calls = 0;
    vi.spyOn(api, 'completeAudio').mockImplementation(async () => {
      calls += 1;
      if (calls < 2) throw new Error('Failed to fetch');
      return { success: true, data: { current_stage: 'questions_1_pending' } };
    });
    await renderProvider(session({ current_stage: 'audio_1_pending' }));
    let moved;
    await act(async () => {
      moved = await ctx.advanceFromAudio(1);
    });
    expect(calls).toBe(2);
    expect(moved).toBe(true);
    expect(ctx.currentStage).toBe('questions_1_pending');
  }, 10000);

  it('shows an error (and does not move on) when completion keeps failing', async () => {
    vi.spyOn(api, 'completeAudio').mockRejectedValue(new Error('Failed to fetch'));
    await renderProvider(session({ current_stage: 'audio_1_pending' }));
    let moved;
    await act(async () => {
      moved = await ctx.advanceFromAudio(1);
    });
    expect(moved).toBe(false);
    expect(ctx.currentStage).toBe('audio_1_pending');
    expect(ctx.error).toMatch(/could not confirm/i);
    expect(ctx.audioCompletionStatus[1]).toBe('error');
  }, 15000);

  it('asks the participant to listen again when the server listening check fails', async () => {
    vi.spyOn(api, 'completeAudio').mockRejectedValue(new ListenIncompleteError({ required_seconds: 51 }));
    vi.spyOn(api, 'recordAudioEvent').mockResolvedValue();
    const { container } = await renderProvider(
      session({ current_stage: 'audio_1_pending' }),
      <RestrictedAudioPlayer audioNumber={1} title="Audio Recording 1" storagePath="a.mp3" fallbackSampleUrl="/audio/sample_audio.mp3" />
    );
    await act(async () => {
      fireEvent.ended(container.querySelector('audio'));
    });
    await waitFor(() => expect(screen.getByTestId('listen-incomplete-notice')).toBeInTheDocument());
    expect(screen.getByTestId('audio-continue-button')).toBeDisabled();
    expect(ctx.currentStage).toBe('audio_1_pending');
  });

  it('logs play, pause and ended events', async () => {
    const eventSpy = vi.spyOn(api, 'recordAudioEvent').mockResolvedValue();
    vi.spyOn(api, 'completeAudio').mockResolvedValue({ success: true, data: {} });
    vi.spyOn(api, 'recordAudioStart').mockResolvedValue();
    const { container } = await renderProvider(
      session({ current_stage: 'audio_1_pending' }),
      <RestrictedAudioPlayer audioNumber={1} title="Audio Recording 1" storagePath="a.mp3" fallbackSampleUrl="/audio/sample_audio.mp3" />
    );
    const audio = container.querySelector('audio');
    await act(async () => {
      fireEvent.play(audio);
      fireEvent.pause(audio);
      fireEvent.ended(audio);
    });
    const types = eventSpy.mock.calls.map((c) => c[2]);
    expect(types).toEqual(expect.arrayContaining(['play', 'pause', 'ended']));
  });
});

describe('Connection errors and shared devices', () => {
  it('shows a blocking connection screen instead of a broken session, and retries', async () => {
    const init = vi
      .spyOn(api, 'initOrResumeSession')
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValue({ success: true, data: session({ current_stage: 'consent_pending' }) });
    await act(async () => {
      render(<App />);
    });
    expect(await screen.findByTestId('connection-error-screen')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    });
    await waitFor(() => expect(screen.getByTestId('start-experiment-button')).toBeInTheDocument());
    expect(init).toHaveBeenCalledTimes(2);
  });

  it('forgets the session after submission and shows "already completed" on reload without creating a participant', async () => {
    vi.spyOn(api, 'autosaveResponse').mockResolvedValue({ success: true });
    vi.spyOn(api, 'submitExperiment').mockResolvedValue({ success: true, data: { current_stage: 'submitted' } });
    const { unmount } = await renderProvider(session({ current_stage: 'questions_2_pending' }));
    await act(async () => {
      fillAllAnswers('q2_');
    });
    await act(async () => {
      await ctx.submitFinalExperiment();
    });
    expect(localStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(COMPLETED_FLAG_KEY)).toBe('P-TEST1234');
    unmount();
    vi.restoreAllMocks();

    const init = vi.spyOn(api, 'initOrResumeSession');
    await act(async () => {
      render(<App />);
    });
    expect(await screen.findByTestId('already-completed-screen')).toBeInTheDocument();
    expect(screen.getByText(/P-TEST1234/)).toBeInTheDocument();
    expect(init).not.toHaveBeenCalled();
  });

  it('"?new=1" starts a fresh participant even on a device that already finished', async () => {
    localStorage.setItem(COMPLETED_FLAG_KEY, 'P-OLD');
    localStorage.setItem(SESSION_TOKEN_KEY, 'old-token');
    window.history.replaceState(null, '', '/?new=1');
    const init = vi.spyOn(api, 'initOrResumeSession').mockResolvedValue({ success: true, data: session({ current_stage: 'consent_pending' }) });
    await act(async () => {
      render(<App />);
    });
    await waitFor(() => expect(init).toHaveBeenCalledWith(null));
    expect(localStorage.getItem(COMPLETED_FLAG_KEY)).toBeNull();
    expect(window.location.search).toBe('');
  });
});

describe('Trait order and comment limit', () => {
  it('shows traits in the participant\'s stored order', async () => {
    const reversed = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    await renderProvider(session({ trait_order_1: reversed }), <QuestionList recordingNumber={1} title="Q" />);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    const expected = reversed.map((n) => EXPERIMENT_CONFIG.traits.find((t) => t.number === n).name);
    expect(headings).toEqual(expected);
  });

  it('falls back to the default order if the stored order is not a valid permutation', async () => {
    await renderProvider(session({ trait_order_1: [1, 1, 2] }), <QuestionList recordingNumber={1} title="Q" />);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(EXPERIMENT_CONFIG.traits.map((t) => t.name));
  });

  it('caps comments at 5000 characters, matching the server', async () => {
    await renderProvider(session(), <QuestionList recordingNumber={1} title="Q" />);
    expect(screen.getByPlaceholderText(/write your candid thoughts/i)).toHaveAttribute('maxLength', '5000');
  });
});

describe('Error classification', () => {
  it('treats validation, stage, submitted and listening errors as non-retryable', () => {
    expect(isNonRetryableError(new Error('VALIDATION: bad'))).toBe(true);
    expect(isNonRetryableError(new Error('STAGE_LOCKED: no'))).toBe(true);
    expect(isNonRetryableError(new Error('Responses cannot be modified after final submission.'))).toBe(true);
    expect(isNonRetryableError(new ListenIncompleteError())).toBe(true);
    expect(isNonRetryableError(new Error('Failed to fetch'))).toBe(false);
  });
});
