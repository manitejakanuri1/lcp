import { isUuid, query } from '../shared/db';
import { placeholderImage } from '../shared/placeholder-image';
import type { Order, OrderLineItem, OrderStatus, OrderSummary } from '../shared/types';

/**
 * A customer's orders (store.orders / order_items / payments / shipments). Always scoped by customer id,
 * so a foreign order id answers exactly like one that does not exist. Orders still awaiting payment
 * ('pending_payment') are not shown: the UI's status set starts at "placed".
 */
const VISIBLE = `o.customer_id = $1 AND o.status <> 'pending_payment'`;

interface SummaryRow {
  id: string;
  order_number: string;
  placed_at: Date;
  status: OrderStatus;
  total: number;
  item_count: number;
  thumbnails: { image: string | null; name: string; slug: string }[];
}

const toSummary = (r: SummaryRow): OrderSummary => ({
  id: r.id,
  orderNumber: r.order_number,
  placedAt: r.placed_at.toISOString(),
  status: r.status,
  total: r.total,
  itemCount: r.item_count,
  thumbnails: r.thumbnails.map((t) => ({ image: t.image ?? placeholderImage(t.slug), name: t.name })),
});

const SUMMARY_SELECT = `
  SELECT o.id, o.order_number, COALESCE(o.placed_at, o.created_at) AS placed_at, o.status::text AS status, o.total,
         COALESCE((SELECT SUM(i.quantity) FROM store.order_items i WHERE i.order_id = o.id), 0)::int AS item_count,
         COALESCE((SELECT json_agg(json_build_object('image', i.image_url, 'name', i.product_name, 'slug', i.product_slug)
                                   ORDER BY i.created_at, i.id)
                     FROM store.order_items i WHERE i.order_id = o.id), '[]'::json) AS thumbnails
    FROM store.orders o`;

export async function listOrders(customerId: string, limit: number, offset: number): Promise<{ items: OrderSummary[]; total: number }> {
  const [page, count] = await Promise.all([
    query<SummaryRow>(`${SUMMARY_SELECT} WHERE ${VISIBLE} ORDER BY COALESCE(o.placed_at, o.created_at) DESC, o.id LIMIT $2 OFFSET $3`, [
      customerId,
      limit,
      offset,
    ]),
    query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM store.orders o WHERE ${VISIBLE}`, [customerId]),
  ]);
  return { items: page.rows.map(toSummary), total: count.rows[0].n };
}

const METHOD_LABEL: Record<string, string> = { upi: 'UPI', card: 'Card', netbanking: 'Net banking', cod: 'Cash on delivery' };

interface DetailRow extends SummaryRow {
  subtotal: number;
  shipping_total: number;
  discount_total: number;
  shipping_address: { name?: string; phone?: string; line1?: string; line2?: string; city?: string; state?: string; pincode?: string };
  pay_method: string | null;
  pay_provider: string | null;
  carrier: string | null;
  tracking_number: string | null;
}

export async function findOrder(customerId: string, id: string): Promise<Order | undefined> {
  if (!isUuid(id)) return undefined;
  const { rows } = await query<DetailRow>(
    `SELECT s.*, o.subtotal, o.shipping_total, o.discount_total, o.shipping_address,
            pay.method AS pay_method, pay.provider AS pay_provider, sh.carrier, sh.tracking_number
       FROM (${SUMMARY_SELECT} WHERE ${VISIBLE} AND o.id = $2) s
       JOIN store.orders o ON o.id = s.id
       LEFT JOIN LATERAL (SELECT method, provider FROM store.payments p
                           WHERE p.order_id = o.id AND p.kind = 'payment' ORDER BY (p.status = 'captured') DESC, p.created_at DESC LIMIT 1) pay ON TRUE
       LEFT JOIN LATERAL (SELECT carrier, tracking_number FROM store.shipments x
                           WHERE x.order_id = o.id ORDER BY x.created_at DESC LIMIT 1) sh ON TRUE`,
    [customerId, id],
  );
  const r = rows[0];
  if (!r) return undefined;

  const lines = await query<{ product_id: string | null; product_slug: string; product_name: string; image_url: string | null; variant_label: string | null; quantity: number; unit_price: number }>(
    `SELECT product_id, product_slug, product_name, image_url, variant_label, quantity, unit_price
       FROM store.order_items WHERE order_id = $1 ORDER BY created_at, id`,
    [id],
  );
  const items: OrderLineItem[] = lines.rows.map((l) => ({
    productId: l.product_id ?? l.product_slug,
    slug: l.product_slug,
    name: l.product_name,
    image: l.image_url ?? placeholderImage(l.product_slug),
    ...(l.variant_label ? { variant: l.variant_label } : {}),
    quantity: l.quantity,
    unitPrice: l.unit_price,
  }));

  const a = r.shipping_address ?? {};
  const method = r.pay_method ? (METHOD_LABEL[r.pay_method] ?? r.pay_method) : r.pay_provider ?? 'Pending';
  return {
    ...toSummary(r),
    items,
    shippingAddress: {
      name: a.name ?? '',
      lines: [a.line1, a.line2, [a.city, [a.state, a.pincode].filter(Boolean).join(' ')].filter(Boolean).join(', '), 'India'].filter(
        (l): l is string => Boolean(l),
      ),
      phone: a.phone ?? '',
    },
    payment: { method, subtotal: r.subtotal, shipping: r.shipping_total, discount: r.discount_total, total: r.total },
    tracking: r.carrier && r.tracking_number ? { carrier: r.carrier, trackingNumber: r.tracking_number } : null,
  };
}
