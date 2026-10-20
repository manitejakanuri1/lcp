'use client';

import { useState } from 'react';
import { subscribeNewsletter } from '@/lib/cloud-functions/newsletter';

type Status = 'idle' | 'loading' | 'success' | 'error';

export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus('loading');
    try {
      await subscribeNewsletter(email);
      setStatus('success');
      setMessage('Subscribed — thank you.');
      setEmail('');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Subscription failed.');
    }
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
      <div className="flex gap-2">
        <input
          type="email"
          required
          placeholder="Your email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="min-w-0 flex-1 rounded-lg bg-warm-ivory/10 px-3 py-2 font-body text-sm text-warm-ivory outline-none placeholder:text-warm-ivory/50 focus:ring-1 focus:ring-antique-gold"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="shrink-0 rounded-lg bg-primary-container px-4 py-2 font-body text-sm font-bold uppercase tracking-wider text-warm-ivory transition-colors hover:bg-primary disabled:opacity-60"
        >
          {status === 'loading' ? 'Subscribing…' : 'Subscribe'}
        </button>
      </div>
      {message && (
        <p role="status" className="font-body text-xs text-antique-gold">
          {message}
        </p>
      )}
    </form>
  );
}
