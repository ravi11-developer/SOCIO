import React, { useState } from 'react';
import { Loader2, Mail, MailCheck, ShieldCheck } from 'lucide-react';
import { adminSupabase } from './adminClient';
import { CenteredCard } from './ui';

export default function LoginScreen({ initialError = null }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent
  const [error, setError] = useState(initialError);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setStatus('sending');

    const { error: err } = await adminSupabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // Never create new accounts from this form - only existing users can sign in.
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/admin`,
      },
    });

    // Show the same message whether or not the email exists, so the form can't be used
    // to discover the admin address. Rate-limit errors are the exception (they help you).
    if (err && err.status === 429) {
      setError('Too many login emails requested. Wait a few minutes and try again.');
      setStatus('idle');
      return;
    }
    if (err) console.warn('[admin login]', err.message);
    setStatus('sent');
  };

  if (status === 'sent') {
    return (
      <CenteredCard icon={<MailCheck className="w-6 h-6 text-emerald-600" />} title="Check your email">
        <p>
          If <strong>{email}</strong> is the admin account, a sign-in link is on its way. Open it in this same browser.
        </p>
        <button
          type="button"
          onClick={() => setStatus('idle')}
          className="mt-4 text-sm font-medium text-primary hover:text-primary-hover underline"
        >
          Use a different email
        </button>
      </CenteredCard>
    );
  }

  return (
    <CenteredCard icon={<ShieldCheck className="w-6 h-6 text-primary" />} title="Admin sign in">
      <p className="mb-4">We'll email you a one-time sign-in link.</p>
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm" role="alert">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        <label htmlFor="admin-email" className="block text-sm font-medium text-main">
          Email
        </label>
        <input
          id="admin-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border text-main focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="you@example.com"
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-hover disabled:opacity-60"
        >
          {status === 'sending' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
          Send magic link
        </button>
      </form>
    </CenteredCard>
  );
}
