import Link from 'next/link';

export const dynamic = 'force-dynamic';

/**
 * The page a shopper lands on straight after paying.
 *
 * It states the order number and nothing it cannot stand behind: the shop has not yet said
 * how many days it takes to dispatch, so this does not invent a date. The order itself, with
 * its lines and status, is on the account page, which reads it from the server.
 */
export default async function OrderPlacedPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-16 text-center md:px-8">
      <p className="font-body text-xs font-bold uppercase tracking-[0.2em] text-gold">Thank you</p>
      <h1 className="mt-2 font-display text-3xl font-bold text-maroon">Your order is placed</h1>

      <p className="mt-6 rounded-2xl border border-gold/30 bg-white px-6 py-5 font-display text-2xl font-bold text-maroon">
        {decodeURIComponent(orderNumber)}
      </p>

      <p className="mt-6 text-sm leading-relaxed text-muted">
        The shop has your order and your address. Keep this number — quote it in any message
        about the order, and it is on your orders page too.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/account/orders"
          className="rounded-full bg-maroon px-6 py-3 font-display text-sm font-bold uppercase tracking-wide text-white"
        >
          My orders
        </Link>
        <Link
          href="/collections/shop"
          className="rounded-full border border-gold/40 px-6 py-3 font-display text-sm font-bold uppercase tracking-wide text-maroon"
        >
          Keep shopping
        </Link>
      </div>
    </main>
  );
}
