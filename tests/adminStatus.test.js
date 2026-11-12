import { describe, it, expect } from 'vitest';
import {
  getLiveStatus,
  stageProgress,
  summarize,
  stageCounts,
  allocationCounts,
  toCsv,
  formatRelative,
  ACTIVE_WINDOW_MS,
  ABANDONED_AFTER_MS,
} from '../src/admin/status';

const NOW = new Date('2026-11-12T12:00:00Z').getTime();
const ago = (ms) => new Date(NOW - ms).toISOString();

describe('admin getLiveStatus', () => {
  it('marks recent activity as active', () => {
    expect(getLiveStatus({ current_stage: 'audio_1_pending', last_activity_at: ago(60_000) }, NOW)).toBe('active');
  });

  it('marks 5-30 min of inactivity as idle', () => {
    expect(getLiveStatus({ current_stage: 'audio_1_pending', last_activity_at: ago(ACTIVE_WINDOW_MS + 1000) }, NOW)).toBe('idle');
  });

  it('marks 30+ min of inactivity as abandoned', () => {
    expect(getLiveStatus({ current_stage: 'audio_1_pending', last_activity_at: ago(ABANDONED_AFTER_MS) }, NOW)).toBe('abandoned');
  });

  it('submitted wins over inactivity', () => {
    expect(
      getLiveStatus({ current_stage: 'submitted', session_status: 'submitted', last_activity_at: ago(10 * ABANDONED_AFTER_MS) }, NOW)
    ).toBe('submitted');
  });

  it('falls back to created_at when last_activity_at is missing', () => {
    expect(getLiveStatus({ current_stage: 'consent_pending', created_at: ago(1000) }, NOW)).toBe('active');
  });
});

describe('admin aggregates', () => {
  const rows = [
    { current_stage: 'submitted', session_status: 'submitted', audio_1_code: 'pure_hindi_male', audio_2_code: 'codemixed_hindi_female' },
    { current_stage: 'audio_2_pending', last_activity_at: ago(1000), audio_1_code: 'pure_hindi_male', audio_2_code: 'codemixed_hindi_female' },
    { current_stage: 'consent_pending', last_activity_at: ago(ABANDONED_AFTER_MS * 2), audio_1_code: 'pure_english_female' },
  ];

  it('summarizes statuses and completion rate', () => {
    const s = summarize(rows, NOW);
    expect(s).toMatchObject({ total: 3, submitted: 1, active: 1, abandoned: 1, idle: 0 });
    expect(s.completionRate).toBeCloseTo(1 / 3);
  });

  it('counts participants per stage in study order', () => {
    const counts = stageCounts(rows);
    expect(counts.map((c) => c.key)[0]).toBe('consent_pending');
    expect(counts.find((c) => c.key === 'submitted').value).toBe(1);
    expect(counts.reduce((a, c) => a + c.value, 0)).toBe(3);
  });

  it('counts recording allocations across both slots', () => {
    const map = Object.fromEntries(allocationCounts(rows).map((r) => [r.key, r.value]));
    expect(map).toEqual({ pure_hindi_male: 2, codemixed_hindi_female: 2, pure_english_female: 1 });
  });

  it('stage progress goes 0 -> 1', () => {
    expect(stageProgress('consent_pending')).toBe(0);
    expect(stageProgress('submitted')).toBe(1);
    expect(stageProgress('unknown')).toBe(0);
  });
});

describe('admin helpers', () => {
  it('escapes CSV values', () => {
    expect(toCsv([{ a: 'x,y', b: 'say "hi"', c: null }])).toBe('a,b,c\r\n"x,y","say ""hi""",');
  });

  it('formats relative times', () => {
    expect(formatRelative(ago(10_000), NOW)).toBe('just now');
    expect(formatRelative(ago(5 * 60_000), NOW)).toBe('5 min ago');
    expect(formatRelative(null, NOW)).toBe('—');
  });
});
