'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCart } from '@/lib/cloud-functions/cart';
import { getAccessToken } from '@/lib/cloud-functions/session';
import { formatPrice } from '@/lib/format';
import type { CartView } from '@/lib/types';
import { useCartWishlist } from '@/components/shared/CartWishlistProvider';
import { TruckIcon } from '@/components/icons';
import { RazorpayButton } from '@/components/cart/RazorpayButton';

/**
 * Where the order is addressed.
 *
 * Payment is not wired yet, so the last button says so rather than pretending. The address is
 * kept on this device as it is typed: a shopper who loses the page on a phone should not have
 * to type it again, and nothing here is sent anywhere until there is an order to send.
 */

const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra',
  'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

const STORE_KEY = 'lakshmi.checkout.address.v1';

interface Address {
  firstName: string;
  lastName: string;
  address: string;
  apartment: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  whatsappOptIn: boolean;
}

const EMPTY: Address = {
  firstName: '', lastName: '', address: '', apartment: '',
  city: '', state: 'Andhra Pradesh', pincode: '', phone: '', whatsappOptIn: false,
};

function Field({ label, value, onChange, ...rest }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const id = `f-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink/80">{label}</span>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-line bg-cream px-4 py-2.5 text-sm outline-none transition-colors focus:border-maroon focus:ring-1 focus:ring-maroon"
        {...rest}
      />
    </label>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const { ready, cart } = useCartWishlist();
  const [form, setForm] = useState<Address>(EMPTY);
  // null while the token is being read: showing the form first and then yanking it away
  // reads as the page breaking.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [view, setView] = useState<CartView | null>(null);
  const [touched, setTouched] = useState(false);

  // Read the saved address once, then save on every edit. Storage can be blocked, and a
  // checkout that throws because of that is worse than one that forgets.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORE_KEY);
      if (saved) setForm({ ...EMPTY, ...(JSON.parse(saved) as Partial<Address>) });
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(form)); } catch { /* ignore */ }
  }, [form]);

  // An order has to belong to someone, so the shopper signs in first and comes straight back.
  useEffect(() => {
    const token = getAccessToken();
    setSignedIn(Boolean(token));
    // A full page move, not the client router: the router call was silently dropped here and
    // left shoppers stranded on a "taking you to sign in" line that never went anywhere.
    if (!token) window.location.assign('/login?next=%2Fcheckout');
  }, []);

  // An empty bag has nothing to address.
  useEffect(() => {
    if (ready && cart.length === 0) router.replace('/cart');
  }, [ready, cart.length, router]);

  useEffect(() => {
    if (!ready || cart.length === 0) return;
    getCart(cart.map((line) => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity })))
      .then(setView)
      .catch(() => setView(null));
  }, [ready, cart]);

  const set = (field: keyof Address) => (value: string) => setForm((f) => ({ ...f, [field]: value }));

  const problems = useMemo(() => {
    const list: string[] = [];
    if (!form.firstName.trim()) list.push('First name');
    if (!form.address.trim()) list.push('Address');
    if (!form.city.trim()) list.push('City');
    if (!/^\d{6}$/.test(form.pincode.trim())) list.push('PIN code (6 digits)');
    if (!/^[6-9]\d{9}$/.test(form.phone.replace(/\D/g, ''))) list.push('Phone (10 digits)');
    return list;
  }, [form]);

  const totals = view?.totals;

  if (signedIn !== true) {
    // Shown while the move happens, and left standing if it does not: a dead end with no way
    // out is worse than an extra tap.
    return (
      <main className="mx-auto w-full max-w-md px-4 py-16 text-center md:px-8">
        <h1 className="font-display text-2xl font-bold text-maroon">Sign in to check out</h1>
        <p className="mt-2 text-sm text-muted">Your bag is saved — you will come straight back here.</p>
        <Link
          href="/login?next=%2Fcheckout"
          className="mt-6 inline-block rounded-full bg-maroon px-6 py-3 font-display text-sm font-bold uppercase tracking-wide text-white"
        >
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8">
      <h1 className="font-display text-3xl font-bold text-maroon">Checkout</h1>
      <p className="mt-1 text-sm text-muted">
        Where should the saree go? <Link href="/cart" className="underline">Back to bag</Link>
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <section aria-labelledby="addr" className="rounded-2xl border border-gold/20 bg-white p-6 shadow-sm">
          <h2 id="addr" className="font-display text-xl font-bold text-maroon">Delivery address</h2>

          <div className="mt-5 grid gap-4">
            <label htmlFor="f-country" className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink/80">Country</span>
              <input id="f-country" value="India" readOnly
                className="w-full rounded-lg border border-line bg-line/20 px-4 py-2.5 text-sm text-muted" />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" value={form.firstName} onChange={set('firstName')} autoComplete="given-name" />
              <Field label="Last name" value={form.lastName} onChange={set('lastName')} autoComplete="family-name" />
            </div>

            <Field label="Address" value={form.address} onChange={set('address')} autoComplete="street-address" />
            <Field label="Apartment, suite, etc. (optional)" value={form.apartment} onChange={set('apartment')} />

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="City" value={form.city} onChange={set('city')} autoComplete="address-level2" />
              <label htmlFor="f-state" className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink/80">State</span>
                <select
                  id="f-state"
                  value={form.state}
                  onChange={(event) => set('state')(event.target.value)}
                  className="w-full rounded-lg border border-line bg-cream px-4 py-2.5 text-sm outline-none focus:border-maroon focus:ring-1 focus:ring-maroon"
                >
                  {STATES.map((state) => <option key={state}>{state}</option>)}
                </select>
              </label>
              <Field label="PIN code" value={form.pincode} onChange={(v) => set('pincode')(v.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric" autoComplete="postal-code" />
            </div>

            <Field label="Phone" value={form.phone} onChange={(v) => set('phone')(v.replace(/\D/g, '').slice(0, 10))}
              inputMode="tel" autoComplete="tel" placeholder="10 digit mobile number" />

            <label className="flex items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={form.whatsappOptIn}
                onChange={(event) => setForm((f) => ({ ...f, whatsappOptIn: event.target.checked }))}
                className="mt-0.5"
              />
              Message me on WhatsApp about this order
            </label>
          </div>

          {touched && problems.length > 0 && (
            <p role="alert" className="mt-4 rounded-lg bg-[#fdecef] px-3 py-2 text-sm text-[#b91c1c]">
              Still needed: {problems.join(', ')}
            </p>
          )}

          {problems.length > 0 ? (
            <button
              type="button"
              onClick={() => setTouched(true)}
              className="mt-6 w-full rounded-full bg-muted/40 py-3.5 font-display text-sm font-bold uppercase tracking-wide text-white"
            >
              Pay now
            </button>
          ) : (
            <RazorpayButton address={form} disabled={false} />
          )}
          <p className="mt-2 text-center text-xs text-muted">
            Paid securely through Razorpay. Free shipping anywhere in India.
          </p>
        </section>

        <aside aria-labelledby="sum" className="h-fit rounded-2xl border border-gold/20 bg-white p-6 shadow-sm lg:sticky lg:top-24">
          <h2 id="sum" className="font-display text-xl font-bold text-maroon">Your order</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {view?.items.map((item) => (
              <li key={`${item.productId}-${item.variantId ?? ''}`} className="flex justify-between gap-3">
                <span className="min-w-0">
                  {item.name}
                  {item.variantLabel && <span className="text-muted"> · {item.variantLabel}</span>}
                  <span className="text-muted"> × {item.quantity}</span>
                </span>
                <span className="shrink-0 font-semibold text-maroon">{formatPrice(item.lineTotal)}</span>
              </li>
            ))}
          </ul>

          {totals && (
            <dl className="mt-4 space-y-2 border-t border-line/70 pt-4 text-sm">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd className="font-semibold text-maroon">{formatPrice(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Shipment</dt>
                <dd className="font-medium">Free</dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-line/70 pt-2 font-display">
                <dt className="text-lg font-bold text-maroon">Total</dt>
                <dd className="text-xl font-bold text-berry">{formatPrice(totals.total)}</dd>
              </div>
            </dl>
          )}

          <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-maroon">
            <TruckIcon className="h-4 w-4 text-gold" />
            Free shipping anywhere in India
          </p>
        </aside>
      </div>
    </main>
  );
}
