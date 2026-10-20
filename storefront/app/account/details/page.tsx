'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { getAccount, updateAccount, type ProfileInput } from '@/lib/cloud-functions/account';
import { CloudFunctionError } from '@/lib/cloud-functions/client';
import { Field } from '@/components/account/Field';

type Notice = { kind: 'success' | 'error'; text: string } | null;

const errorText = (err: unknown) => (err instanceof CloudFunctionError ? err.message : 'Something went wrong. Please try again.');

function NoticeBanner({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p
      role={notice.kind === 'error' ? 'alert' : 'status'}
      className={`rounded-xl border px-5 py-3 text-sm ${
        notice.kind === 'error' ? 'border-berry/40 bg-berry/10 text-berry' : 'border-gold/60 bg-gold-soft'
      }`}
    >
      {notice.text}
    </p>
  );
}

export default function AccountDetailsPage() {
  const [saved, setSaved] = useState<(ProfileInput & { memberTier: string }) | null>(null);
  const [form, setForm] = useState<ProfileInput | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    let cancelled = false;
    getAccount()
      .then((profile) => {
        if (cancelled) return;
        setSaved(profile);
        setForm({ firstName: profile.firstName, lastName: profile.lastName, displayName: profile.displayName, email: profile.email, phone: profile.phone });
        setLoadError(false);
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (loadError) {
    return (
      <div role="alert" className="rounded-xl border border-gold/60 bg-gold-soft px-5 py-4 text-sm">
        We couldn&apos;t load your details.{' '}
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="font-semibold underline">
          Try again
        </button>
      </div>
    );
  }
  if (!form || !saved) {
    return (
      <p role="status" className="py-12 text-center text-muted">
        Loading your details…
      </p>
    );
  }

  const setField = (key: keyof ProfileInput) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  const reset = () => {
    setForm({ firstName: saved.firstName, lastName: saved.lastName, displayName: saved.displayName, email: saved.email, phone: saved.phone });
    setNotice(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);

    setSaving(true);
    try {
      const profile = await updateAccount(form);
      setSaved(profile);
      setForm({ firstName: profile.firstName, lastName: profile.lastName, displayName: profile.displayName, email: profile.email, phone: profile.phone });
      setNotice({ kind: 'success', text: 'Your details have been updated.' });
    } catch (err) {
      setNotice({ kind: 'error', text: errorText(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6 rounded-2xl border border-line bg-cream-card p-6 shadow-sm sm:p-8">
      <div className="flex flex-col justify-between gap-3 border-b border-line/70 pb-5 sm:flex-row sm:items-start">
        <div>
          <h2 className="font-display text-2xl font-bold text-maroon">Account details</h2>
          <p className="mt-1 text-sm text-muted">Manage your personal identification and display preferences.</p>
        </div>
        <span className="inline-flex items-center gap-2 self-start rounded-full border border-line bg-cream px-3 py-1.5 text-xs font-semibold text-ink/80">
          <span aria-hidden className="h-2 w-2 rounded-full bg-green-600" />
          Verified {saved.memberTier} Member
        </span>
      </div>

      <NoticeBanner notice={notice} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="First name" name="firstName" required autoComplete="given-name" value={form.firstName} onChange={setField('firstName')} />
        <Field label="Last name" name="lastName" required autoComplete="family-name" value={form.lastName} onChange={setField('lastName')} />
        <Field
          label="Display name"
          name="displayName"
          required
          className="sm:col-span-2"
          hint="This will be how your name will be displayed in the account section and in reviews."
          value={form.displayName}
          onChange={setField('displayName')}
        />
        <Field
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          readOnly
          hint="This is your sign-in email. Contact support to change it."
          value={form.email}
          onChange={setField('email')}
        />
        <Field label="Phone" name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={setField('phone')} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-maroon px-7 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-md transition-colors hover:bg-maroon-dark disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={saving}
          className="rounded-lg border border-line bg-cream px-7 py-3 text-xs font-bold uppercase tracking-wider text-maroon transition-colors hover:bg-gold/20 disabled:opacity-60"
        >
          Cancel
        </button>
        <p className="w-full text-xs text-muted sm:ml-auto sm:w-auto">Fields marked with * are mandatory</p>
      </div>
    </form>
  );
}
