import type { OrderStatus } from '@/lib/types';

const STYLES: Record<OrderStatus, string> = {
  placed: 'border-gold/40 bg-gold-soft text-maroon',
  processing: 'border-gold/40 bg-gold-soft text-maroon',
  shipped: 'border-sky-200 bg-sky-50 text-sky-800',
  delivered: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  cancelled: 'border-line bg-cream-deep text-muted',
  returned: 'border-rose-200 bg-rose-50 text-berry',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${STYLES[status]}`}>{status}</span>
  );
}
