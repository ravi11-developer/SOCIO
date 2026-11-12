import React, { useMemo, useState } from 'react';
import { Search, Trash2, X } from 'lucide-react';
import { formatDateTime, formatRelative, getLiveStatus, prettifyCode, stageProgress, STAGE_LABELS, STATUS_LABELS } from './status';
import { ConfirmDialog, ProgressMeter, StatusBadge } from './ui';

const STATUS_FILTERS = ['all', 'active', 'idle', 'abandoned', 'submitted'];

export default function ParticipantsView({ data, selectedId, onSelect }) {
  const { participants, responses, now, deleteParticipant, deleteResponse } = data;
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pendingDelete, setPendingDelete] = useState(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return participants
      .map((p) => ({ ...p, liveStatus: getLiveStatus(p, now) }))
      .filter((p) => statusFilter === 'all' || p.liveStatus === statusFilter)
      .filter((p) => !q || p.code?.toLowerCase().includes(q));
  }, [participants, now, query, statusFilter]);

  const selected = participants.find((p) => p.id === selectedId) || null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 text-secondary absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search participant code"
            aria-label="Search participant code"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by status">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              aria-pressed={statusFilter === s}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                statusFilter === s ? 'bg-primary text-white border-primary' : 'bg-card text-secondary border-border hover:text-main'
              }`}
            >
              {s === 'all' ? 'All' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <span className="text-xs text-secondary sm:ml-auto">{rows.length} shown</span>
      </div>

      <section className="academic-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-secondary">
              <tr>
                <th className="px-4 py-2 font-medium">Participant</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Stage</th>
                <th className="px-4 py-2 font-medium">Progress</th>
                <th className="px-4 py-2 font-medium text-right">Answers</th>
                <th className="px-4 py-2 font-medium">Last activity</th>
                <th className="px-4 py-2 font-medium">Started</th>
                <th className="px-4 py-2 font-medium sr-only">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-secondary">No participants match.</td>
                </tr>
              )}
              {rows.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => onSelect(p.id)}
                  className={`cursor-pointer hover:bg-slate-50 ${selectedId === p.id ? 'bg-primary-light/40' : ''}`}
                >
                  <td className="px-4 py-2.5 font-mono">{p.code}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={p.liveStatus} /></td>
                  <td className="px-4 py-2.5 text-secondary whitespace-nowrap">{STAGE_LABELS[p.current_stage] || '—'}</td>
                  <td className="px-4 py-2.5"><ProgressMeter value={stageProgress(p.current_stage)} label={`${p.code} progress`} /></td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.response_count}</td>
                  <td className="px-4 py-2.5 text-secondary whitespace-nowrap">{formatRelative(p.last_activity_at, now)}</td>
                  <td className="px-4 py-2.5 text-secondary whitespace-nowrap">{formatDateTime(p.created_at)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete(p);
                      }}
                      className="p-1.5 rounded-md text-secondary hover:text-red-700 hover:bg-red-50"
                      aria-label={`Delete participant ${p.code}`}
                      title="Delete participant"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <ParticipantDrawer
          participant={selected}
          responses={responses.filter((r) => r.participant_id === selected.id)}
          now={now}
          onClose={() => onSelect(null)}
          onDeleteParticipant={() => setPendingDelete(selected)}
          onDeleteResponse={deleteResponse}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Delete participant ${pendingDelete?.code ?? ''}?`}
        body={
          <>
            This permanently deletes their demographics, consent record, session and all{' '}
            <strong>{pendingDelete?.response_count ?? 0}</strong> answers. It cannot be undone.
          </>
        }
        confirmText={pendingDelete?.code}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          await deleteParticipant(pendingDelete.id);
          if (selectedId === pendingDelete.id) onSelect(null);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

function humanize(value) {
  if (!value) return null;
  const s = String(value).replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-secondary">{label}</dt>
      <dd className="text-sm text-main mt-0.5 break-words">{children ?? '—'}</dd>
    </div>
  );
}

function ParticipantDrawer({ participant: p, responses, now, onClose, onDeleteParticipant, onDeleteResponse }) {
  const [pendingResponse, setPendingResponse] = useState(null);
  const status = getLiveStatus(p, now);

  const sorted = useMemo(
    () =>
      [...responses].sort(
        (a, b) =>
          (a.questions?.recording_number ?? 0) - (b.questions?.recording_number ?? 0) ||
          (a.questions?.question_number ?? 0) - (b.questions?.question_number ?? 0)
      ),
    [responses]
  );

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={`Participant ${p.code}`}>
      <button type="button" className="absolute inset-0 bg-slate-900/30" onClick={onClose} aria-label="Close panel" />
      <aside className="relative w-full max-w-xl h-full bg-card shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono font-semibold text-main truncate">{p.code}</span>
            <StatusBadge status={status} />
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-secondary mb-2">Progress</h4>
            <p className="text-sm text-main mb-2">{STAGE_LABELS[p.current_stage] || '—'}</p>
            <ProgressMeter value={stageProgress(p.current_stage)} label="Progress" />
            <dl className="grid grid-cols-2 gap-3 mt-4">
              <Field label="Started">{formatDateTime(p.created_at)}</Field>
              <Field label="Last activity">{formatRelative(p.last_activity_at, now)}</Field>
              <Field label="Submitted">{p.submitted_at ? formatDateTime(p.submitted_at) : 'Not yet'}</Field>
              <Field label="Order">{p.presentation_order === 'pure_first' ? 'Pure first' : 'Code-mixed first'}</Field>
            </dl>
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-secondary mb-2">Audio</h4>
            <dl className="grid grid-cols-2 gap-3">
              <Field label="Audio 1">{prettifyCode(p.audio_1_code)}</Field>
              <Field label="Audio 2">{prettifyCode(p.audio_2_code)}</Field>
              <Field label="Audio 1 played">
                {p.audio_1_completed_at ? `Finished ${formatDateTime(p.audio_1_completed_at)}` : p.audio_1_started_at ? 'Started' : 'Not started'}
              </Field>
              <Field label="Audio 2 played">
                {p.audio_2_completed_at ? `Finished ${formatDateTime(p.audio_2_completed_at)}` : p.audio_2_started_at ? 'Started' : 'Not started'}
              </Field>
            </dl>
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-secondary mb-2">Demographics & consent</h4>
            <dl className="grid grid-cols-2 gap-3">
              <Field label="Gender">{humanize(p.gender)}</Field>
              <Field label="Ethnicity">{humanize(p.ethnicity)}</Field>
              <Field label="First language">{p.first_language}</Field>
              <Field label="Second language">{p.second_language}</Field>
              <Field label="Hindi proficiency">{p.hindi_proficiency ? `${p.hindi_proficiency} / 6` : null}</Field>
              <Field label="Consent">
                {p.consent_status ? `Given ${formatDateTime(p.consent_timestamp)}` : 'Not given'}
              </Field>
            </dl>
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-secondary mb-2">
              Answers ({sorted.length})
            </h4>
            {sorted.length === 0 ? (
              <p className="text-sm text-secondary">No answers yet.</p>
            ) : (
              <ul className="divide-y divide-border border border-border rounded-lg">
                {sorted.map((r) => (
                  <li key={r.id} className="px-3 py-2.5 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-secondary">
                        Audio {r.questions?.recording_number ?? '?'} · {r.questions?.question_text || r.question_id}
                      </div>
                      <div className="text-sm text-main mt-0.5 break-words whitespace-pre-wrap">{r.answer || <em className="text-secondary">empty</em>}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingResponse(r)}
                      className="p-1.5 rounded-md text-secondary hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                      aria-label={`Delete answer to ${r.question_id}`}
                      title="Delete answer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="pt-2 border-t border-border">
            <button
              type="button"
              onClick={onDeleteParticipant}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" /> Delete this participant
            </button>
          </section>
        </div>
      </aside>

      <ConfirmDialog
        open={Boolean(pendingResponse)}
        title="Delete this answer?"
        body={
          <>
            The answer to <strong>{pendingResponse?.questions?.question_text || pendingResponse?.question_id}</strong> from{' '}
            <span className="font-mono">{p.code}</span> will be permanently deleted.
          </>
        }
        onCancel={() => setPendingResponse(null)}
        onConfirm={async () => {
          await onDeleteResponse(pendingResponse.id);
          setPendingResponse(null);
        }}
      />
    </div>
  );
}
