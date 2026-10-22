import type { PaymentMethod, ProductStatus, UserRole } from './enums';

// Row shapes for the Cloud SQL `pos` schema (the old `profiles` table is now `store.staff_users`). Column names are snake_case exactly as in SQL.
// DECIMAL(10,2) is serialized by PostgREST as a JSON number; TIMESTAMPTZ/DATE as ISO strings.

export type Uuid = string;
export type IsoTimestamp = string; // TIMESTAMPTZ
export type IsoDate = string; // DATE, YYYY-MM-DD

/** public.profiles: 1:1 with auth.users, auto-created by trigger on signup. */
export interface ProfileRow {
  id: Uuid; // FK auth.users(id) ON DELETE CASCADE
  email: string;
  full_name: string | null;
  role: UserRole; // default 'salesman'
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp; // maintained by trigger
}

/** public.products: full row. Founder-only data: contains vendor_name and cost_price. */
export interface ProductRow {
  id: Uuid;
  sku: string; // UNIQUE
  vendor_name: string;
  purchase_date: IsoDate;
  cost_price: number; // >= 0
  selling_price: number; // >= 0
  saree_type: string;
  material: string;
  color: string | null;
  rack_location: string | null;
  image_url: string | null;
  status: ProductStatus; // default 'available'
  created_by: Uuid | null; // FK profiles(id)
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export type ProductInsert = Omit<
  ProductRow,
  'id' | 'status' | 'created_by' | 'created_at' | 'updated_at'
> &
  Partial<Pick<ProductRow, 'id' | 'status' | 'created_by'>>;

export type ProductUpdate = Partial<Omit<ProductRow, 'id' | 'created_at' | 'updated_at'>>;

/** public.products_salesman view: hides vendor_name, cost_price, purchase_date, created_by. */
export type ProductSalesmanRow = Pick<
  ProductRow,
  | 'id'
  | 'sku'
  | 'saree_type'
  | 'material'
  | 'color'
  | 'selling_price'
  | 'rack_location'
  | 'image_url'
  | 'status'
  | 'created_at'
>;

/** public.bills */
export interface BillRow {
  id: Uuid;
  bill_number: string; // UNIQUE, format B-YYYYMMDD-NNNN (see generate_bill_number)
  customer_name: string | null;
  customer_phone: string | null;
  salesman_id: Uuid | null; // FK profiles(id)
  total_amount: number;
  total_cost: number; // default 0
  payment_method: PaymentMethod; // default 'cash'
  notes: string | null;
  created_at: IsoTimestamp;
}

export type BillInsert = Pick<BillRow, 'bill_number' | 'total_amount'> &
  Partial<Omit<BillRow, 'id' | 'bill_number' | 'total_amount' | 'created_at'>>;

/** public.bill_items: inserting a row fires mark_product_sold(), flipping the product to 'sold'. */
export interface BillItemRow {
  id: Uuid;
  bill_id: Uuid | null; // FK bills(id) ON DELETE CASCADE
  product_id: Uuid | null; // FK products(id)
  selling_price: number; // price at time of sale (snapshot)
  cost_price: number; // cost at time of sale (snapshot), default 0
  created_at: IsoTimestamp;
}

export type BillItemInsert = Pick<BillItemRow, 'selling_price'> &
  Partial<Omit<BillItemRow, 'id' | 'selling_price' | 'created_at'>>;

/** Table-name -> row map, handy for generic data-access helpers. */
export interface Tables {
  profiles: ProfileRow;
  products: ProductRow;
  bills: BillRow;
  bill_items: BillItemRow;
}
export interface Views {
  products_salesman: ProductSalesmanRow;
}
