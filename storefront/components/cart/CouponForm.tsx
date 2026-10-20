'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { validatePromotion } from '@/lib/cloud-functions/cart';
import type { CartCoupon } from '@/lib/types';

interface CouponFormProps {
  subtotal: number;
  /** Coupon the server currently has applied to the cart (may have gone invalid since, e.g. subtotal dropped). */
  applied: CartCoupon | null;
  onApply: (code: string) => void;
  onRemove: () => void;
}

/** Collapsible "Have a coupon?" bar from the checkout mockup, with inline success/failure feedback. */
export function CouponForm({ subtotal, applied, onApply, onRemove }: CouponFormProps) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) {
      setFeedback({ ok: false, text: 'Enter a coupon code.' });
      return;
    }
    startTransition(async () => {
      try {
        const result = await validatePromotion(code, subtotal);
        setFeedback({ ok: result.valid, text: result.message });
        if (result.valid) {
          onApply(result.code);
          setCode('');
        }
      } catch {
        setFeedback({ ok: false, text: 'We could not check that code right now. Please try again.' });
      }
    });
  }

  return (
    <section aria-label="Coupon" className="rounded-xl border border-gold/30 bg-white p-4 shadow-sm">
      <div className="flex flex-col items-center justify-between gap-3 text-sm sm:flex-row">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="font-display text-base font-bold text-maroon">Have a coupon?</span>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="font-medium text-berry hover:text-maroon hover:underline"
          >
            {open ? 'Hide coupon entry' : 'Click here to enter your code'}
          </button>
        </div>
        {applied?.valid && (
          <span className="flex items-center gap-2 rounded-full border border-gold/30 bg-gold-soft px-3 py-1 text-xs font-semibold text-maroon">
            {applied.code} applied
            <button type="button" onClick={onRemove} aria-label={`Remove coupon ${applied.code}`} className="text-berry underline">
              Remove
            </button>
          </span>
        )}
      </div>

      {applied && !applied.valid && (
        <p role="status" className="mt-2 rounded-lg border border-gold/60 bg-gold-soft px-3 py-2 text-xs text-ink">
          {applied.message}{' '}
          <button type="button" onClick={onRemove} className="font-semibold uppercase tracking-wider text-maroon underline">
            Remove code
          </button>
        </p>
      )}

      {open && (
        <form onSubmit={submit} className="mt-3 rounded-xl border border-gold/30 bg-cream p-4">
          <p className="mb-2 text-xs text-muted">If you hold a seasonal or privilege coupon, enter it below.</p>
          <div className="flex max-w-md gap-2">
            <label className="sr-only" htmlFor="coupon-code">
              Coupon code
            </label>
            <input
              id="coupon-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="e.g. HERITAGE10"
              autoComplete="off"
              className="flex-1 rounded-lg border border-gold/30 bg-white px-3 py-2 text-xs uppercase tracking-wider focus:border-maroon focus:outline-none"
            />
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-maroon px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-maroon-dark disabled:opacity-60"
            >
              {pending ? 'Checking…' : 'Apply Coupon'}
            </button>
          </div>
          <p
            role={feedback?.ok === false ? 'alert' : 'status'}
            className={`mt-2 min-h-4 text-xs ${feedback?.ok ? 'text-[#1e7e34]' : 'text-berry'}`}
          >
            {feedback?.text}
          </p>
        </form>
      )}
    </section>
  );
}
