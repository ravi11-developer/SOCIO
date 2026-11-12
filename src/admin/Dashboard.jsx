import React, { useMemo, useState } from 'react';
import { AlertCircle, Download, Loader2, LogOut, RefreshCw, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import { useDashboardData, fetchExportRows } from './useDashboardData';
import {
  allocationCounts,
  formatDateTime,
  formatRelative,
  getLiveStatus,
  stageCounts,
  stageProgress,
  summarize,
  toCsv,
  STAGE_LABELS,
} from './status';
import { BarList, ProgressMeter, StatTile } from './ui';
import ParticipantsView from './ParticipantsView';
import ResponsesView from './ResponsesView';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'participants', label: 'Participants' },
  { key: 'responses', label: 'Responses' },
  { key: 'audit', label: 'Audit log' },
];

export default function Dashboard({ email, onSignOut }) {
  const data = useDashboardData();
  const [tab, setTab] = useState('overview');
  const [selectedId, setSelectedId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  const openParticipant = (id) => {
    setSelectedId(id);
    setTab('participants');
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const rows = await fetchExportRows();
      const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `responses_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <span className="font-semibold text-main">Study admin</span>
            <RealtimeIndicator status={data.realtimeStatus} />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              onClick={data.refresh}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-slate-50"
              title="Refresh now"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-slate-50 disabled:opacity-60"
            >
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span className="hidden sm:inline">Export CSV</span>
            </button>
            <span className="hidden md:inline text-secondary truncate max-w-[200px]" title={email}>{email}</span>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-slate-50"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto" aria-label="Dashboard sections">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? 'page' : undefined}
              className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap ${
                tab === t.key ? 'border-primary text-primary' : 'border-transparent text-secondary hover:text-main'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {(data.error || exportError) && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-2" role="alert">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{data.error || exportError}</span>
          </div>
        )}

        {data.loading ? (
          <div className="flex items-center gap-2 text-secondary text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-primary" /> Loading dashboard…
          </div>
        ) : (
          <>
            {tab === 'overview' && <OverviewView data={data} onOpenParticipant={openParticipant} />}
            {tab === 'participants' && (
              <ParticipantsView data={data} selectedId={selectedId} onSelect={setSelectedId} />
            )}
            {tab === 'responses' && <ResponsesView data={data} onOpenParticipant={openParticipant} />}
            {tab === 'audit' && <AuditView entries={data.auditLog} />}
          </>
        )}

        {data.lastUpdated && (
          <p className="text-xs text-secondary">Last updated {data.lastUpdated.toLocaleTimeString()}</p>
        )}
      </main>
    </div>
  );
}

function RealtimeIndicator({ status }) {
  const live = status === 'live';
  return (
    <span
      className={`ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
        live ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200'
      }`}
      title={live ? 'Receiving live updates' : 'Live updates unavailable; use Refresh'}
    >
      {live ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
      {live ? 'Live' : status === 'connecting' ? 'Connecting' : 'Offline'}
    </span>
  );
}

function OverviewView({ data, onOpenParticipant }) {
  const { participants, now } = data;
  const summary = useMemo(() => summarize(participants, now), [participants, now]);
  const stages = useMemo(() => stageCounts(participants), [participants]);
  const allocation = useMemo(() => allocationCounts(participants), [participants]);
  const activeRows = useMemo(
    () => participants.filter((p) => getLiveStatus(p, now) === 'active'),
    [participants, now]
  );

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="academic-card p-4 col-span-2 lg:col-span-2">
          <div className="text-xs font-medium text-secondary">Active now</div>
          <div className="mt-1 text-5xl font-semibold text-main">{summary.active}</div>
          <div className="mt-1 text-xs text-secondary">Activity in the last 5 minutes</div>
        </div>
        <StatTile label="Total participants" value={summary.total} />
        <StatTile label="Submitted" value={summary.submitted} hint={`${Math.round(summary.completionRate * 100)}% completion`} />
        <StatTile label="Idle" value={summary.idle} hint="5–30 min inactive" />
        <StatTile label="Abandoned" value={summary.abandoned} hint="30+ min inactive" />
      </section>

      <section className="academic-card overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-main">Currently taking the study</h3>
        </div>
        {activeRows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-secondary">Nobody is active right now.</p>
        ) : (
          <ul className="divide-y divide-border">
            {activeRows.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onOpenParticipant(p.id)}
                  className="w-full text-left px-4 sm:px-5 py-3 grid grid-cols-1 sm:grid-cols-[8rem_1fr_10rem_6rem] gap-2 sm:gap-4 items-center hover:bg-slate-50"
                >
                  <span className="font-mono text-sm text-main">{p.code}</span>
                  <span className="text-sm text-secondary">{STAGE_LABELS[p.current_stage] || p.current_stage}</span>
                  <ProgressMeter value={stageProgress(p.current_stage)} label={`${p.code} progress`} />
                  <span className="text-xs text-secondary sm:text-right">{formatRelative(p.last_activity_at, now)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <BarList title="Participants by stage" subtitle="Where everyone currently is" items={stages} />
        <BarList
          title="Recording allocation"
          subtitle="Times each recording was assigned (should stay roughly even)"
          items={allocation}
        />
      </div>
    </div>
  );
}

const ACTION_LABELS = {
  delete_participant: 'Deleted participant',
  delete_response: 'Deleted response',
};

function AuditView({ entries }) {
  return (
    <section className="academic-card overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-main">Audit log</h3>
        <p className="text-xs text-secondary mt-0.5">
          Every delete, who did it and when. Deleted answers and demographics are not kept here.
        </p>
      </div>
      {entries.length === 0 ? (
        <p className="px-5 py-6 text-sm text-secondary">No admin actions yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-secondary">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Participant</th>
                <th className="px-4 py-2 font-medium">Details</th>
                <th className="px-4 py-2 font-medium">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2 whitespace-nowrap text-secondary">{formatDateTime(e.created_at)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{ACTION_LABELS[e.action] || e.action}</td>
                  <td className="px-4 py-2 font-mono">{e.target}</td>
                  <td className="px-4 py-2 text-secondary">
                    {e.details?.question_id && `Question ${e.details.question_id}`}
                    {e.details?.responses_deleted !== undefined && `${e.details.responses_deleted} responses removed`}
                  </td>
                  <td className="px-4 py-2 text-secondary">{e.actor_email || 'database (SQL editor)'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

