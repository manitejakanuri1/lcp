'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { confirmPayment, startPayment, type CheckoutAddress } from '@/lib/cloud-functions/checkout';
import { CloudFunctionError } from '@/lib/cloud-functions/client';
import { useCartWishlist } from '@/components/shared/CartWishlistProvider';

/**
 * The pay button: opens Razorpay's own window, then has the shop confirm what came back.
 *
 * The amount shown in that window is the one the server priced, not a number from this page.
 * A closed window or a failed payment is reported back so the held pieces are freed at once
 * instead of waiting out their fifteen minutes.
 */

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, handler: (response: unknown) => void) => void };
  }
}

const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

function loadRazorpay(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${SCRIPT}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.Razorpay)));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function RazorpayButton({ address, disabled }: { address: CheckoutAddress; disabled: boolean }) {
  const router = useRouter();
  const { cart, clearCart } = useCartWishlist();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  // One key per attempt at this bag: tapping Pay twice must not write two orders, each
  // holding the same pieces.
  const attempt = useRef<string>('');

  useEffect(() => {
    void loadRazorpay();
  }, []);

  async function pay() {
    setProblem('');
    setBusy(true);
    attempt.current ||= (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

    try {
      if (!(await loadRazorpay())) throw new Error('offline');

      const started = await startPayment(
        cart.map((line) => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity })),
        address,
        attempt.current,
      );

      const checkout = new window.Razorpay!({
        key: started.keyId,
        order_id: started.razorpayOrderId,
        amount: started.amount,
        currency: started.currency,
        name: 'Lakshmi Sarees',
        description: `Order ${started.orderNumber}`,
        prefill: { name: started.customer.name, contact: started.customer.phone, email: started.customer.email },
        theme: { color: '#6b1d2f' },
        handler: async (response: Record<string, string>) => {
          try {
            const result = await confirmPayment({
              orderId: started.orderId,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            clearCart();
            router.push(`/order/${result.orderNumber}`);
          } catch (error) {
            setProblem(
              error instanceof CloudFunctionError
                ? `${error.message} If money left your account, send us the payment id and we will sort it out.`
                : 'The payment went through but we could not confirm it. Please contact the shop before paying again.',
            );
            setBusy(false);
          }
        },
        modal: {
          ondismiss: () => {
            void confirmPayment({ orderId: started.orderId, failed: true, reason: 'Closed the payment window' }).catch(() => undefined);
            setBusy(false);
          },
        },
      });

      checkout.on('payment.failed', (response: unknown) => {
        const reason = (response as { error?: { description?: string } })?.error?.description ?? 'Payment failed';
        void confirmPayment({ orderId: started.orderId, failed: true, reason }).catch(() => undefined);
        setProblem(`${reason}. Nothing has been charged — you can try again.`);
        setBusy(false);
      });

      checkout.open();
    } catch (error) {
      setProblem(
        error instanceof CloudFunctionError
          ? error.message
          : 'Could not open the payment window. Check the connection and try again.',
      );
      setBusy(false);
    }
  }

  return (
    <>
      {problem && (
        <p role="alert" className="mt-4 rounded-lg bg-[#fdecef] px-3 py-2 text-sm text-[#b91c1c]">
          {problem}
        </p>
      )}
      <button
        type="button"
        onClick={pay}
        disabled={disabled || busy || cart.length === 0}
        className="mt-6 w-full rounded-full bg-maroon py-3.5 font-display text-sm font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Opening payment…' : 'Pay now'}
      </button>
    </>
  );
}
