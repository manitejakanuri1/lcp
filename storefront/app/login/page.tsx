'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { login } from '@/lib/cloud-functions/auth';
import { CloudFunctionError } from '@/lib/cloud-functions/client';
import { Field } from '@/components/account/Field';

/**
 * Interim sign-in (FUNCTIONS_USAGE.md §2). The server never says whether it was the email or
 * the password that was wrong, and neither does this page.
 *
 * `next` carries where the shopper was headed - the bag, say - so signing in returns them to
 * it instead of to the account page.
 */
export default function LoginPage() {
  // useSearchParams needs a boundary, or the whole page falls out of the static build.
  return (
    <main className="mx-auto w-full max-w-md px-4 py-12 md:px-8">
      <h1 className="font-display text-3xl font-bold text-primary">Sign in</h1>
      <p className="mt-2 font-body text-sm text-on-surface-variant">To see your orders and keep your bag between visits.</p>
      <Suspense>
        <SignInForm />
      </Suspense>
    </main>
  );
}

function SignInForm() {
  const router = useRouter();
  const nextPath = useSearchParams().get('next') ?? '/account';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setProblem('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      router.push(nextPath);
    } catch (error) {
      setProblem(
        error instanceof CloudFunctionError
          ? error.message
          : 'Could not sign in just now. Check the connection and try again.',
      );
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

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
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 font-body text-sm text-on-surface-variant">
        New here?{' '}
        <Link href={`/register?next=${encodeURIComponent(nextPath)}`} className="font-semibold text-primary underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
