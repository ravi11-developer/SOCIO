/**
 * Behaviour of the API layer when a real Supabase project is configured
 * (the client is replaced with a fake so no network is used).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const getPublicUrl = vi.fn((path) => ({ data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/audio_files/${path}` } }));
const from = vi.fn(() => ({ getPublicUrl }));

vi.mock('../src/lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: (...args) => rpc(...args), storage: { from: (...args) => from(...args) } },
}));

const { api, isLiveDatabase, ListenIncompleteError } = await import('../src/services/api');

beforeEach(() => {
  rpc.mockReset();
  from.mockClear();
  localStorage.clear();
});

describe('API layer against a live database', () => {
  it('is in live mode', () => {
    expect(isLiveDatabase).toBe(true);
  });

  it('does not fall back to a browser-only session when the database cannot be reached', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('Failed to fetch') });
    await expect(api.initOrResumeSession(null)).rejects.toThrow('Failed to fetch');
    expect(localStorage.getItem('audio_research_session')).toBeNull();
  });

  it('never substitutes the sample clip for a missing recording', () => {
    expect(api.getAudioUrl('', '/audio/sample_audio.mp3')).toBeNull();
    expect(api.getAudioUrl('[PLACEHOLDER: X]', '/audio/sample_audio.mp3')).toBeNull();
  });

  it('builds public URLs from the audio_files bucket', () => {
    const url = api.getAudioUrl('pure_hindi_male.mp3.mpeg', '/audio/sample_audio.mp3');
    expect(from).toHaveBeenCalledWith('audio_files');
    expect(url).toMatch(/audio_files\/pure_hindi_male\.mp3\.mpeg$/);
  });

  it('turns a failed server listening check into ListenIncompleteError', async () => {
    rpc.mockResolvedValue({ data: { success: false, reason: 'listen_incomplete', required_seconds: 51 }, error: null });
    await expect(api.completeAudio('tok', 1)).rejects.toBeInstanceOf(ListenIncompleteError);
  });

  it('accepts a successful completion', async () => {
    rpc.mockResolvedValue({ data: { success: true, current_stage: 'questions_1_pending' }, error: null });
    const res = await api.completeAudio('tok', 1);
    expect(res.data.current_stage).toBe('questions_1_pending');
  });

  it('logs audio events through rpc_record_audio_event and ignores failures', async () => {
    rpc.mockRejectedValue(new Error('offline'));
    await expect(api.recordAudioEvent('tok', 2, 'pause', 12.3456)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('rpc_record_audio_event', {
      p_session_token: 'tok',
      p_audio_number: 2,
      p_event_type: 'pause',
      p_position_seconds: 12.35,
    });
  });

  it('retries recording the audio start time', async () => {
    rpc
      .mockResolvedValueOnce({ error: new Error('Failed to fetch') })
      .mockResolvedValueOnce({ error: null });
    await api.recordAudioStart('tok', 1);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
