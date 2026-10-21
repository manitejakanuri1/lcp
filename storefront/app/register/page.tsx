'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { register } from '@/lib/cloud-functions/auth';
import { CloudFunctionError } from '@/lib/cloud-functions/client';
import { Field } from '@/components/account/Field';

const MIN_PASSWORD = 8;

/**
 * Sign-up. Asks for the least that an order needs - a name, an email, a password - and takes
 * the phone number only if it is offered, because a customer who will not give it still gets
 * to buy. A new account is signed in by the server, so there is no second sign-in screen.
 */
export default function RegisterPage() {
  // useSearchParams needs a boundary, or the whole page falls out of the static build.
  return (
    <main className="mx-auto w-full max-w-md px-4 py-12 md:px-8">
      <h1 className="font-display text-3xl font-bold text-primary">Create an account</h1>
      <p className="mt-2 font-body text-sm text-on-surface-variant">So your orders, addresses and saved sarees are waiting next time.</p>
      <Suspense>
        <SignUpForm />
      </Suspense>
    </main>
  );
}

function SignUpForm() {
  const router = useRouter();
  const nextPath = useSearchParams().get('next') ?? '/account';
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '' });
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setProblem('');
    if (form.password.length < MIN_PASSWORD) {
      setProblem(`Use at least ${MIN_PASSWORD} characters for the password.`);
      return;
    }
    setBusy(true);
    try {
      await register({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || undefined,
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
        marketingOptIn,
      });
      router.push(nextPath);
    } catch (error) {
      setProblem(
        error instanceof CloudFunctionError
          ? error.message
          : 'Could not create the account just now. Check the connection and try again.',
      );
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="First name" name="firstName" autoComplete="given-name" required value={form.firstName} onChange={set('firstName')} />
          <Field label="Last name" name="lastName" autoComplete="family-name" value={form.lastName} onChange={set('lastName')} />
        </div>
        <Field label="Email" name="email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
        <Field
          label="Phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          hint="Optional. Used only to reach you about an order."
          value={form.phone}
          onChange={set('phone')}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
          hint={`At least ${MIN_PASSWORD} characters.`}
          value={form.password}
          onChange={set('password')}
        />

        <label className="flex items-start gap-2 font-body text-sm text-on-surface-variant">
          <input
            type="checkbox"
            name="marketingOptIn"
            checked={marketingOptIn}
            onChange={(event) => setMarketingOptIn(event.target.checked)}
            className="mt-0.5"
          />
          Send me new arrivals and offers.
        </label>

        {problem && (
          <p role="alert" className="rounded-lg bg-[#fdecef] px-3 py-2 font-body text-sm text-[#b91c1c]">
            {problem}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-lg bg-primary px-5 py-3 font-body text-sm font-semibold uppercase tracking-wider text-warm-ivory transition-opacity disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 font-body text-sm text-on-surface-variant">
        Already have an account?{' '}
        <Link href={`/login?next=${encodeURIComponent(nextPath)}`} className="font-semibold text-primary underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
