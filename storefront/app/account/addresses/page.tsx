'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { deleteAddress, getAddresses, saveAddress } from '@/lib/cloud-functions/account';
import { CloudFunctionError } from '@/lib/cloud-functions/client';
import type { Address, AddressInput } from '@/lib/types';
import { Field } from '@/components/account/Field';

const blank: AddressInput = { label: 'Home', name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '', isDefault: false };

export default function AddressBookPage() {
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<AddressInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAddresses()
      .then((items) => {
        if (cancelled) return;
        setAddresses(items);
        setLoadError(false);
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = () => setAttempt((n) => n + 1);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setFormError(null);
    try {
      await saveAddress(editing);
      setEditing(null);
      reload();
    } catch (err) {
      setFormError(err instanceof CloudFunctionError ? err.message : 'We couldn’t save this address. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (address: Address) => {
    if (!window.confirm(`Delete the "${address.label}" address?`)) return;
    setActionError(null);
    try {
      await deleteAddress(address.id);
      reload();
    } catch {
      setActionError('We couldn’t delete that address. Please try again.');
    }
  };

  const makeDefault = async (address: Address) => {
    setActionError(null);
    try {
      await saveAddress({ ...address, isDefault: true });
      reload();
    } catch {
      setActionError('We couldn’t update your default address. Please try again.');
    }
  };

  const set = (key: keyof AddressInput) => (e: React.ChangeEvent<HTMLInputElement>) => setEditing(editing && { ...editing, [key]: e.target.value });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl font-bold text-maroon">Address book</h2>
          <p className="mt-1 text-sm text-muted">Saved delivery addresses for faster checkout.</p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setEditing(blank);
            }}
            className="self-start rounded-lg bg-maroon px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md transition-colors hover:bg-maroon-dark sm:self-auto"
          >
            Add new address
          </button>
        )}
      </div>

      {actionError && (
        <p role="alert" className="rounded-xl border border-berry/40 bg-berry/10 px-5 py-3 text-sm text-berry">
          {actionError}
        </p>
      )}

      {editing && (
        <form onSubmit={submit} className="space-y-5 rounded-2xl border border-line bg-cream-card p-6 shadow-sm">
          <h3 className="font-display text-lg font-bold">{editing.id ? 'Edit address' : 'New address'}</h3>
          {formError && (
            <p role="alert" className="rounded-xl border border-berry/40 bg-berry/10 px-5 py-3 text-sm text-berry">
              {formError}
            </p>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Label" name="label" placeholder="Home, Office…" value={editing.label} onChange={set('label')} />
            <Field label="Full name" name="name" required autoComplete="name" value={editing.name} onChange={set('name')} />
            <Field label="Phone" name="phone" type="tel" required autoComplete="tel" value={editing.phone} onChange={set('phone')} />
            <Field label="Pincode" name="pincode" required inputMode="numeric" maxLength={6} autoComplete="postal-code" value={editing.pincode} onChange={set('pincode')} />
            <Field label="Address line 1" name="line1" required className="sm:col-span-2" autoComplete="address-line1" value={editing.line1} onChange={set('line1')} />
            <Field label="Address line 2" name="line2" className="sm:col-span-2" autoComplete="address-line2" value={editing.line2} onChange={set('line2')} />
            <Field label="City" name="city" required autoComplete="address-level2" value={editing.city} onChange={set('city')} />
            <Field label="State" name="state" required autoComplete="address-level1" value={editing.state} onChange={set('state')} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(editing.isDefault)}
              onChange={(e) => setEditing({ ...editing, isDefault: e.target.checked })}
              className="h-4 w-4 accent-maroon"
            />
            Make this my default address
          </label>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-maroon px-7 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-md transition-colors hover:bg-maroon-dark disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save address'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setEditing(null)}
              className="rounded-lg border border-line bg-cream px-7 py-3 text-xs font-bold uppercase tracking-wider text-maroon transition-colors hover:bg-gold/20 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loadError && (
        <div role="alert" className="rounded-xl border border-gold/60 bg-gold-soft px-5 py-4 text-sm">
          We couldn&apos;t load your addresses.{' '}
          <button type="button" onClick={reload} className="font-semibold underline">
            Try again
          </button>
        </div>
      )}

      {!loadError && addresses === null && (
        <p role="status" className="py-12 text-center text-muted">
          Loading your addresses…
        </p>
      )}

      {!loadError && addresses?.length === 0 && !editing && (
        <div className="rounded-2xl border border-line bg-cream-card p-10 text-center shadow-sm">
          <h3 className="font-display text-2xl font-bold text-maroon">No saved addresses yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">Add an address and it will be ready the next time you check out.</p>
        </div>
      )}

      {!loadError && addresses && addresses.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {addresses.map((address) => (
            <li key={address.id} className="flex flex-col justify-between rounded-2xl border border-line bg-cream-card p-6 shadow-sm">
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <h3 className="font-display text-lg font-bold">{address.label}</h3>
                  {address.isDefault && (
                    <span className="rounded-full border border-maroon/20 bg-maroon/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-maroon">
                      Default
                    </span>
                  )}
                </div>
                <address className="space-y-0.5 text-sm not-italic">
                  <p className="font-semibold">{address.name}</p>
                  <p>{address.line1}</p>
                  {address.line2 && <p>{address.line2}</p>}
                  <p>
                    {address.city}, {address.state} {address.pincode}
                  </p>
                  <p className="text-muted">{address.phone}</p>
                </address>
              </div>
              <div className="mt-5 flex flex-wrap gap-4 border-t border-line/70 pt-4 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setEditing(address);
                  }}
                  className="text-maroon underline"
                >
                  Edit
                </button>
                {!address.isDefault && (
                  <button type="button" onClick={() => makeDefault(address)} className="text-maroon underline">
                    Set as default
                  </button>
                )}
                <button type="button" onClick={() => remove(address)} className="text-berry underline">
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
