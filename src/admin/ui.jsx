import React, { useEffect, useRef, useState } from 'react';
import { Activity, CheckCircle2, Clock, Loader2, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { STATUS_LABELS } from './status';

export function CenteredCard({ icon = <ShieldCheck className="w-6 h-6 text-primary" />, title, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="academic-card w-full max-w-md p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-3">
          {icon}
          <h1 className="text-lg font-semibold text-main">{title}</h1>
        </div>
        <div className="text-sm text-secondary leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

/* Status always ships as icon + label, never colour alone. */
const STATUS_STYLES = {
  active: { cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', Icon: Activity },
  idle: { cls: 'bg-amber-50 text-amber-800 border-amber-200', Icon: Clock },
  abandoned: { cls: 'bg-red-50 text-red-800 border-red-200', Icon: XCircle },
  submitted: { cls: 'bg-slate-100 text-slate-700 border-slate-200', Icon: CheckCircle2 },
};

export function StatusBadge({ status }) {
  const { cls, Icon } = STATUS_STYLES[status] || STATUS_STYLES.idle;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap ${cls}`}>
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export function StatTile({ label, value, hint }) {
  return (
    <div className="academic-card p-4">
      <div className="text-xs font-medium text-secondary">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-main">{value}</div>
      {hint && <div className="mt-1 text-xs text-secondary">{hint}</div>}
    </div>
  );
}

/** Thin progress meter: blue fill on a lighter blue track. */
export function ProgressMeter({ value, label }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex items-center gap-2 min-w-[110px]" title={label}>
      <div className="h-2 flex-1 rounded-full bg-primary-light overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-primary progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-secondary tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );
}

/**
 * Single-series horizontal bar list (one hue, no legend; the title names the series).
 * Values are direct-labelled and every bar has a hover tooltip.
 */
export function BarList({ title, subtitle, items, emptyText = 'No data yet.' }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <section className="academic-card p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-main">{title}</h3>
      {subtitle && <p className="text-xs text-secondary mt-0.5">{subtitle}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-secondary mt-4">{emptyText}</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {items.map((item) => (
            <li key={item.key} className="group grid grid-cols-[minmax(0,13.5rem)_1fr_2.5rem] items-center gap-3" title={`${item.label}: ${item.value}`}>
              <span className="text-xs text-secondary truncate">{item.label}</span>
              <div className="h-3 relative">
                <div className="absolute inset-y-0 left-0 right-0 border-l border-slate-300" />
                <div
                  className="absolute inset-y-0 left-0 bg-primary rounded-r group-hover:bg-primary-hover transition-colors"
                  style={{ width: item.value ? `${(item.value / max) * 100}%` : 0 }}
                />
              </div>
              <span className="text-xs font-medium text-main tabular-nums text-right">{item.value}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Confirmation dialog for permanent deletes. When `confirmText` is set, the user must
 * type it exactly before the delete button enables.
 */
export function ConfirmDialog({ open, title, body, confirmText, confirmLabel = 'Delete permanently', onConfirm, onCancel }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setTyped('');
      setError(null);
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;
  const canConfirm = !busy && (!confirmText || typed.trim() === confirmText);

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message || 'Delete failed.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="academic-card w-full max-w-md p-6">
        <div className="flex items-center gap-2 mb-2">
          <Trash2 className="w-5 h-5 text-red-600" aria-hidden="true" />
          <h2 id="confirm-title" className="text-base font-semibold text-main">{title}</h2>
        </div>
        <div className="text-sm text-secondary leading-relaxed">{body}</div>
        {confirmText && (
          <div className="mt-4">
            <label htmlFor="confirm-input" className="block text-xs font-medium text-main mb-1">
              Type <span className="font-mono font-semibold">{confirmText}</span> to confirm
            </label>
            <input
              id="confirm-input"
              ref={inputRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canConfirm && handleConfirm()}
              className="w-full px-3 py-2 rounded-lg border border-border font-mono text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              autoComplete="off"
            />
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-slate-50 disabled:opacity-60">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
