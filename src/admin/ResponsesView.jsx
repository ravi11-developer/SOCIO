import React, { useMemo, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { formatRelative, prettifyCode } from './status';
import { ConfirmDialog } from './ui';

const PAGE_SIZE = 100;

export default function ResponsesView({ data, onOpenParticipant }) {
  const { responses, participants, now, deleteResponse } = data;
  const [query, setQuery] = useState('');
  const [audioSlot, setAudioSlot] = useState('all');
  const [questionId, setQuestionId] = useState('all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [pending, setPending] = useState(null);

  const codeById = useMemo(() => new Map(participants.map((p) => [p.id, p.code])), [participants]);

  const questionOptions = useMemo(() => {
    const seen = new Map();
    for (const r of responses) {
      if (!seen.has(r.question_id)) seen.set(r.question_id, r.questions);
    }
    return [...seen.entries()]
      .sort(
        ([, a], [, b]) =>
          (a?.recording_number ?? 0) - (b?.recording_number ?? 0) || (a?.question_number ?? 0) - (b?.question_number ?? 0)
      )
      .map(([id, q]) => ({ id, label: `A${q?.recording_number ?? '?'} · ${q?.question_key || id}` }));
  }, [responses]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return responses.filter((r) => {
      if (audioSlot !== 'all' && String(r.questions?.recording_number) !== audioSlot) return false;
      if (questionId !== 'all' && r.question_id !== questionId) return false;
      if (q) {
        const code = (codeById.get(r.participant_id) || '').toLowerCase();
        if (!code.includes(q) && !(r.answer || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [responses, query, audioSlot, questionId, codeById]);

  const selectCls =
    'px-3 py-2 rounded-lg border border-border text-sm bg-card focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="w-4 h-4 text-secondary absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE_SIZE);
            }}
            placeholder="Search code or answer text"
            aria-label="Search participant code or answer text"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <select aria-label="Audio" value={audioSlot} onChange={(e) => setAudioSlot(e.target.value)} className={selectCls}>
          <option value="all">Both audios</option>
          <option value="1">Audio 1</option>
          <option value="2">Audio 2</option>
        </select>
        <select aria-label="Question" value={questionId} onChange={(e) => setQuestionId(e.target.value)} className={selectCls}>
          <option value="all">All questions</option>
          {questionOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        <span className="text-xs text-secondary sm:ml-auto">
          {rows.length} answers{responses.length >= 2000 ? ' (latest 2,000 loaded)' : ''}
        </span>
      </div>

      <section className="academic-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-secondary">
              <tr>
                <th className="px-4 py-2 font-medium">Participant</th>
                <th className="px-4 py-2 font-medium">Question</th>
                <th className="px-4 py-2 font-medium">Recording</th>
                <th className="px-4 py-2 font-medium">Answer</th>
                <th className="px-4 py-2 font-medium">Saved</th>
                <th className="px-4 py-2 font-medium sr-only">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-secondary">No answers match.</td>
                </tr>
              )}
              {rows.slice(0, limit).map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 align-top">
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => onOpenParticipant(r.participant_id)}
                      className="font-mono text-primary hover:underline"
                    >
                      {codeById.get(r.participant_id) || '—'}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-secondary">
                    <span className="whitespace-nowrap">A{r.questions?.recording_number ?? '?'} · </span>
                    {r.questions?.question_key || r.question_id}
                  </td>
                  <td className="px-4 py-2.5 text-secondary whitespace-nowrap">{prettifyCode(r.recordings?.code)}</td>
                  <td className="px-4 py-2.5 text-main max-w-sm break-words whitespace-pre-wrap">
                    {r.answer || <em className="text-secondary">empty</em>}
                  </td>
                  <td className="px-4 py-2.5 text-secondary whitespace-nowrap">{formatRelative(r.updated_at, now)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => setPending(r)}
                      className="p-1.5 rounded-md text-secondary hover:text-red-700 hover:bg-red-50"
                      aria-label={`Delete answer to ${r.question_id} from ${codeById.get(r.participant_id) || 'participant'}`}
                      title="Delete answer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > limit && (
          <div className="px-4 py-3 border-t border-border">
            <button type="button" onClick={() => setLimit((l) => l + PAGE_SIZE)} className="text-sm font-medium text-primary hover:underline">
              Show {Math.min(PAGE_SIZE, rows.length - limit)} more
            </button>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(pending)}
        title="Delete this answer?"
        body={
          <>
            The answer to <strong>{pending?.questions?.question_text || pending?.question_id}</strong> from{' '}
            <span className="font-mono">{codeById.get(pending?.participant_id) || 'this participant'}</span> will be
            permanently deleted.
          </>
        }
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          await deleteResponse(pending.id);
          setPending(null);
        }}
      />
    </div>
  );
}
