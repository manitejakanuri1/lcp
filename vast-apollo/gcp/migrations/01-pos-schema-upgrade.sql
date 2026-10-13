-- 01: bring pos up to what the POS app actually reads and writes.
--
-- WHY. The pos schema in Cloud SQL is the original base schema: products, bills, bill_items,
-- bill_counters. The app that ran on the VPS grew past it - colour-wise stock, vendor bills with
-- GST, expenses, a short printable barcode, price tiers - and those columns were added straight
-- onto that server, which is gone, so no migration file for them exists. This file rebuilds that
-- shape from the only remaining authority: the app's own code. Column names are taken from the
-- queries in api/index.js and the screens, so nothing has to be renamed later.
--
-- ONLY ADDS. No existing column is changed or dropped, and the store schema (the customer
-- website) is not touched. products_salesman is replaced, but only by appending columns to the
-- end of its select list, which is what create or replace view allows - the cost, vendor and
-- purchase-date columns a salesman must not see are still absent from it.
begin;

-- A short barcode: Code128 packs digit pairs, so an 8-digit number prints at about half the width
-- of the SKU text and still fits a 50 mm label. Sarees and colours draw from one sequence so a
-- scan can never mean two things.
create sequence if not exists pos.barcode_seq start with 10000000 increment by 1;

alter table pos.products
  add column if not exists saree_name        text,
  add column if not exists quantity          integer not null default 0,
  add column if not exists selling_price_a   numeric(12,2),
  add column if not exists selling_price_b   numeric(12,2),
  add column if not exists cost_code         text,
  add column if not exists hsn_code          text,
  add column if not exists main_color_pieces integer,
  add column if not exists on_website        boolean not null default false,
  add column if not exists barcode_no        bigint default nextval('pos.barcode_seq'),
  add column if not exists vendor_bill_id    uuid,
  add column if not exists updated_by        uuid;

alter table pos.bill_items
  add column if not exists quantity integer not null default 1;

-- A purchase bill from a vendor. GST is kept as the rates printed on the paper plus the rupee
-- amount, because a later rate change must not rewrite last year's bill.
create table if not exists pos.vendor_bills (
  id                   uuid primary key default gen_random_uuid(),
  company_name         text not null,
  bill_number          text,
  bill_date            date,
  subtotal             numeric(12,2) not null default 0,
  gst_amount           numeric(12,2) not null default 0,
  total_amount         numeric(12,2) not null default 0,
  cgst_rate            numeric(5,2),
  sgst_rate            numeric(5,2),
  igst_rate            numeric(5,2),
  is_local_transaction boolean not null default true,
  notes                text,
  created_by           uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- One row per colour of a saree, with its own pieces, photo and barcode. A till scanning a colour
-- barcode takes the piece off that colour, not off the saree as a whole.
create table if not exists pos.product_colors (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references pos.products(id) on delete cascade,
  color_name  text not null,
  sku         text not null unique,
  barcode_no  bigint default nextval('pos.barcode_seq'),
  image_url   text,
  pieces      integer not null default 0,
  sort_order  integer not null default 0,
  status      text not null default 'available',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists pos.expenses (
  id           uuid primary key default gen_random_uuid(),
  category     text not null,
  amount       numeric(12,2) not null,
  description  text,
  expense_date date not null default current_date,
  created_by   uuid,
  created_at   timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_vendor_bill_fk') then
    alter table pos.products
      add constraint products_vendor_bill_fk foreign key (vendor_bill_id)
      references pos.vendor_bills(id) on delete set null;
  end if;
end $$;

-- Lookups the screens do on every page load, plus the two barcode uniqueness guards.
create unique index if not exists pos_products_barcode_key on pos.products (barcode_no);
create unique index if not exists pos_colors_barcode_key   on pos.product_colors (barcode_no);
create index if not exists pos_products_vendor_bill on pos.products (vendor_bill_id);
create index if not exists pos_colors_product       on pos.product_colors (product_id, sort_order);
create index if not exists pos_vendor_bills_date    on pos.vendor_bills (bill_date desc);
create index if not exists pos_expenses_date        on pos.expenses (expense_date desc);
create index if not exists pos_products_website     on pos.products (on_website) where on_website;

-- The salesman's view of stock: the new columns are appended; cost_price, cost_code, vendor_name,
-- vendor_bill_id and purchase_date stay out of it.
create or replace view pos.products_salesman as
  select id, sku, saree_type, material, color, selling_price, rack_location, image_url, status, created_at,
         saree_name, quantity, selling_price_a, selling_price_b, main_color_pieces, barcode_no, on_website
    from pos.products;

grant select, insert, update, delete on pos.vendor_bills, pos.product_colors, pos.expenses to app_functions;
grant usage on sequence pos.barcode_seq to app_functions;

do $$
declare missing text;
begin
  select string_agg(x, ', ') into missing from (
    select c from unnest(array['saree_name','quantity','selling_price_a','selling_price_b','cost_code',
                              'hsn_code','main_color_pieces','on_website','barcode_no','vendor_bill_id']) c
     where not exists (select 1 from information_schema.columns
                        where table_schema = 'pos' and table_name = 'products' and column_name = c)
    union all
    select t from unnest(array['vendor_bills','product_colors','expenses']) t
     where not exists (select 1 from information_schema.tables
                        where table_schema = 'pos' and table_name = t)
    union all
    select 'bill_items.quantity' where not exists (select 1 from information_schema.columns
      where table_schema = 'pos' and table_name = 'bill_items' and column_name = 'quantity')
  ) s(x);
  if missing is not null then
    raise exception '01 self-check: still missing %', missing;
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'pos' and table_name = 'products_salesman'
         and column_name in ('cost_price','cost_code','vendor_name','purchase_date','vendor_bill_id')) > 0 then
    raise exception '01 self-check: products_salesman exposes a cost or vendor column';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'pos' and table_name = 'products_salesman'
         and column_name in ('saree_name','quantity','selling_price_a','barcode_no')) <> 4 then
    raise exception '01 self-check: products_salesman is missing one of the new columns';
  end if;
end $$;

commit;
