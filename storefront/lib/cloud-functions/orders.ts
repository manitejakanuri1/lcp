import { callFunction } from './client';
import type { Order, OrderSummary, Paginated } from '../types';

/** Paginated order history (05-orders-page.md) — client, on mount. */
export function getOrders(page = 1, pageSize = 10): Promise<Paginated<OrderSummary>> {
  return callFunction('orders-list-get', { query: { page, pageSize }, auth: true });
}

export function getOrder(id: string): Promise<Order> {
  return callFunction<Order>('order-get', { query: { id }, auth: true });
}
