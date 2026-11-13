import { useCallback, useEffect, useRef, useState } from 'react';
import { adminSupabase } from './adminClient';
import { fetchAllRows } from '../lib/pagination';

const REFETCH_DEBOUNCE_MS = 600;
const CLOCK_TICK_MS = 15000;

/**
 * Loads everything the dashboard shows and keeps it live via Supabase Realtime.
 * Any change event triggers a debounced refetch (simpler and more reliable than
 * patching rows locally, and Realtime only sends primary keys for RLS-protected deletes).
 */
export function useDashboardData() {
  const [participants, setParticipants] = useState([]);
  const [responses, setResponses] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [realtimeStatus, setRealtimeStatus] = useState('connecting');
  const [now, setNow] = useState(Date.now());
  const debounceRef = useRef(null);

  const fetchAll = useCallback(async () => {
    // Participants and responses are paginated: Supabase returns at most 1,000 rows
    // per request, which a full study (about 26 answers per participant) exceeds quickly.
    const wrap = (promise) => promise.then((data) => ({ data, error: null }), (error) => ({ data: null, error }));
    const [p, r, a] = await Promise.all([
      wrap(
        fetchAllRows(() =>
          adminSupabase
            .from('admin_participant_overview')
            .select('*')
            .order('created_at', { ascending: false })
            .order('id', { ascending: true })
        )
      ),
      wrap(
        fetchAllRows(() =>
          adminSupabase
            .from('responses')
            .select(
              'id, participant_id, question_id, answer, created_at, updated_at, recordings(code), questions(question_text, recording_number, question_number, question_key, question_type)'
            )
            .order('updated_at', { ascending: false })
            .order('id', { ascending: true })
        )
      ),
      adminSupabase.from('admin_audit_log').select('*').order('created_at', { ascending: false }).limit(200),
    ]);

    const firstError = p.error || r.error || a.error;
    if (firstError) {
      setError(firstError.message);
    } else {
      setError(null);
      setParticipants(p.data || []);
      setResponses(r.data || []);
      setAuditLog(a.data || []);
      setLastUpdated(new Date());
    }
    setLoading(false);
  }, []);

  const scheduleRefetch = useCallback(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchAll, REFETCH_DEBOUNCE_MS);
  }, [fetchAll]);

  useEffect(() => {
    fetchAll();

    const channel = adminSupabase
      .channel('admin-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'experiment_sessions' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'responses' }, scheduleRefetch)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtimeStatus('error');
        else if (status === 'CLOSED') setRealtimeStatus('closed');
      });

    // Keeps "x min ago" and active/abandoned status fresh even when nothing changes.
    const clock = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);

    return () => {
      clearTimeout(debounceRef.current);
      clearInterval(clock);
      adminSupabase.removeChannel(channel);
    };
  }, [fetchAll, scheduleRefetch]);

  /** Permanently deletes a participant (cascades to consent, session, responses). */
  const deleteParticipant = useCallback(
    async (id) => {
      const { data, error: err } = await adminSupabase.from('participants').delete().eq('id', id).select('id');
      if (err) throw new Error(err.message);
      if (!data || data.length === 0) throw new Error('Nothing was deleted. Are you signed in as the admin?');
      await fetchAll();
    },
    [fetchAll]
  );

  /** Permanently deletes a single response. */
  const deleteResponse = useCallback(
    async (id) => {
      const { data, error: err } = await adminSupabase.from('responses').delete().eq('id', id).select('id');
      if (err) throw new Error(err.message);
      if (!data || data.length === 0) throw new Error('Nothing was deleted. Are you signed in as the admin?');
      await fetchAll();
    },
    [fetchAll]
  );

  return {
    participants,
    responses,
    auditLog,
    loading,
    error,
    lastUpdated,
    realtimeStatus,
    now,
    refresh: fetchAll,
    deleteParticipant,
    deleteResponse,
  };
}

/** Wide-format export (one row per participant) via the RLS-protected researcher view. */
export async function fetchExportRows() {
  return fetchAllRows(() =>
    adminSupabase.from('researcher_export_view').select('*').order('"Created At"', { ascending: true }).order('"Participant ID"', { ascending: true })
  );
}
