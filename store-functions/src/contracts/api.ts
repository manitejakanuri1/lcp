import type { BillItemRow, BillRow, IsoDate, ProductRow, ProductSalesmanRow, Uuid } from './db';
import type { PaymentMethod, ProductStatus } from './enums';
import type { AnalyticsSummaryRow, DailySalesRow } from './rpc';

// Request/response contracts for the store functions. The role in [brackets] is who may call it.
// Success responses are plain JSON; failures use ErrorBody (./errors).

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

// ---- Products ------------------------------------------------------------------------------

/** inventory-products-search [founder, salesman]: founders get ProductRow, salesmen ProductSalesmanRow. */
export interface ProductSearchQuery {
  q?: string; // matches sku / saree_type / material / color
  status?: ProductStatus;
  color?: string;
  sareeType?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  pageSize?: number;
}
export type ProductSearchResponse = Paginated<ProductRow> | Paginated<ProductSalesmanRow>;

/** inventory-product-get [founder, salesman]: lookup by id or sku (one required). */
export interface ProductGetQuery {
  id?: Uuid;
  sku?: string;
}
export type ProductGetResponse = ProductRow | ProductSalesmanRow;

/** inventory-product-create [founder] */
export interface ProductCreateRequest {
  sku: string;
  vendor_name: string;
  purchase_date: IsoDate;
  cost_price: number;
  selling_price: number;
  saree_type: string;
  material: string;
  color?: string | null;
  rack_location?: string | null;
  image_url?: string | null;
}
export type ProductCreateResponse = ProductRow;

/** inventory-product-update [founder] */
export interface ProductUpdateRequest extends Partial<ProductCreateRequest> {
  id: Uuid;
  status?: ProductStatus;
}
export type ProductUpdateResponse = ProductRow;

// ---- Billing -------------------------------------------------------------------------------

/** billing-create [founder, salesman]: server generates bill_number, snapshots prices, computes totals. */
export interface BillCreateRequest {
  customer_name?: string | null;
  customer_phone?: string | null;
  payment_method?: PaymentMethod; // default 'cash'
  notes?: string | null;
  items: { product_id: Uuid; selling_price?: number }[]; // price defaults to product.selling_price
}
export interface BillWithItems extends BillRow {
  items: BillItemRow[];
}
export type BillCreateResponse = BillWithItems;

/** billing-get [founder, salesman (own bills only)] */
export interface BillGetQuery {
  id?: Uuid;
  billNumber?: string;
}
export type BillGetResponse = BillWithItems;

/** billing-list [founder: all, salesman: own] */
export interface BillListQuery {
  from?: IsoDate;
  to?: IsoDate;
  salesmanId?: Uuid; // founder only
  page?: number;
  pageSize?: number;
}
export type BillListResponse = Paginated<BillRow>;

// ---- Analytics [founder] -------------------------------------------------------------------

export interface AnalyticsSummaryQuery {
  from?: IsoDate;
  to?: IsoDate;
}
export type AnalyticsSummaryResponse = AnalyticsSummaryRow;

export interface AnalyticsDailySalesQuery {
  daysBack?: number; // default 30
}
export type AnalyticsDailySalesResponse = { days: DailySalesRow[] };
