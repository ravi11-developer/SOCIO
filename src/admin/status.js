/**
 * Pure helpers for the admin dashboard (no React, no network) so they are easy to test.
 */

export const ACTIVE_WINDOW_MS = 5 * 60 * 1000; // activity within 5 min  => "Active now"
export const ABANDONED_AFTER_MS = 30 * 60 * 1000; // no activity for 30 min => "Abandoned"

export const STAGE_ORDER = [
  'consent_pending',
  'audio_1_pending',
  'questions_1_pending',
  'audio_2_pending',
  'questions_2_pending',
  'submitted',
];

export const STAGE_LABELS = {
  consent_pending: 'Consent & demographics',
  audio_1_pending: 'Listening to audio 1',
  questions_1_pending: 'Answering audio 1',
  audio_2_pending: 'Listening to audio 2',
  questions_2_pending: 'Answering audio 2',
  submitted: 'Submitted',
};

export const STATUS_LABELS = {
  active: 'Active now',
  idle: 'Idle',
  abandoned: 'Abandoned',
  submitted: 'Submitted',
};

function toMs(ts) {
  if (!ts) return null;
  const ms = new Date(ts).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** active | idle | abandoned | submitted */
export function getLiveStatus(row, now = Date.now()) {
  if (row.session_status === 'submitted' || row.current_stage === 'submitted') return 'submitted';
  if (row.session_status === 'abandoned') return 'abandoned';
  const last = toMs(row.last_activity_at) ?? toMs(row.created_at);
  if (last === null) return 'idle';
  const age = now - last;
  if (age <= ACTIVE_WINDOW_MS) return 'active';
  if (age >= ABANDONED_AFTER_MS) return 'abandoned';
  return 'idle';
}

/** 0..1 based on how far through the 6 stages the participant is. */
export function stageProgress(stage) {
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx < 0) return 0;
  return idx / (STAGE_ORDER.length - 1);
}

export function summarize(rows, now = Date.now()) {
  const counts = { total: rows.length, active: 0, idle: 0, abandoned: 0, submitted: 0 };
  for (const row of rows) counts[getLiveStatus(row, now)] += 1;
  counts.completionRate = counts.total ? counts.submitted / counts.total : 0;
  return counts;
}

/** Participants currently sitting at each stage (submitted included). */
export function stageCounts(rows) {
  const counts = Object.fromEntries(STAGE_ORDER.map((s) => [s, 0]));
  for (const row of rows) {
    if (row.current_stage in counts) counts[row.current_stage] += 1;
  }
  return STAGE_ORDER.map((stage) => ({ key: stage, label: STAGE_LABELS[stage], value: counts[stage] }));
}

/** How many times each recording has been assigned (audio slot 1 or 2). */
export function allocationCounts(rows) {
  const counts = new Map();
  for (const row of rows) {
    for (const code of [row.audio_1_code, row.audio_2_code]) {
      if (code) counts.set(code, (counts.get(code) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([key, value]) => ({ key, label: prettifyCode(key), value }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function prettifyCode(code) {
  if (!code) return '—';
  return code
    .replace(/^codemixed_/, 'code-mixed_')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function formatRelative(ts, now = Date.now()) {
  const ms = toMs(ts);
  if (ms === null) return '—';
  const sec = Math.max(0, Math.round((now - ms) / 1000));
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const days = Math.round(hr / 24);
  return `${days} d ago`;
}

export function formatDateTime(ts) {
  const ms = toMs(ts);
  if (ms === null) return '—';
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** RFC 4180 CSV. */
export function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(escape).join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\r\n');
}
