-- 07: the POS API gets its own database login, with only the rights it actually uses.
--
-- WHY. Until now the API connected as schema_admin, which owns the pos schema and can drop any
-- table in it. A web service reachable from the internet should not hold that. The login
-- pos_api was created through Cloud SQL (its password lives in Secret Manager as
-- pos-api-db-password and appears in no file); this file gives it exactly the table, sequence
-- and function rights the code in api/index.js uses, and nothing else - no DDL, no ownership,
-- no access to the customer website's tables beyond the one staff table it must read.
--
-- app_functions is deliberately NOT reused: that role belongs to the storefront Cloud
-- Functions, and it has only SELECT and INSERT on bills, so cancelling a bill (which the shop
-- does) would fail under it. Two services, two roles, each with its own rights.
begin;

grant usage on schema pos to pos_api;

-- The shop's own records: the till adds, corrects and cancels, so all four rights.
grant select, insert, update, delete on
  pos.products, pos.product_colors, pos.bills, pos.bill_items,
  pos.vendor_bills, pos.expenses
  to pos_api;

-- The day's bill counter is written by pos.generate_bill_number(), which runs as the caller.
grant select, insert, update on pos.bill_counters to pos_api;

-- The salesman's view of stock (no cost, no vendor).
grant select on pos.products_salesman to pos_api;

-- Barcodes are handed out by the sequence's default on insert.
grant usage on sequence pos.barcode_seq to pos_api;

grant execute on function
  pos.generate_bill_number(),
  pos.get_analytics_summary(date, date),
  pos.get_daily_sales(integer)
  to pos_api;

-- Staff: sign-in reads the row, the Users screen adds one and changes a name, role or the
-- active flag. No delete: a staff member is switched off, never erased, so their bills keep
-- pointing at a real person.
grant usage on schema store to pos_api;
grant select, insert, update on store.staff_users to pos_api;

-- Nothing else in the customer website's schema is reachable, and no DDL anywhere.
revoke all on schema public from pos_api;

do $$
declare
  missing text;
  extra text;
begin
  -- Every table the API writes must be writable...
  select string_agg(t, ', ') into missing from unnest(array[
    'pos.products', 'pos.product_colors', 'pos.bills', 'pos.bill_items',
    'pos.vendor_bills', 'pos.expenses']) t
   where not (has_table_privilege('pos_api', t, 'select')
          and has_table_privilege('pos_api', t, 'insert')
          and has_table_privilege('pos_api', t, 'update')
          and has_table_privilege('pos_api', t, 'delete'));
  if missing is not null then
    raise exception '07 self-check: pos_api cannot fully write %', missing;
  end if;

  if not has_table_privilege('pos_api', 'store.staff_users', 'select') then
    raise exception '07 self-check: pos_api cannot read store.staff_users, so nobody could sign in';
  end if;
  if has_table_privilege('pos_api', 'store.staff_users', 'delete') then
    raise exception '07 self-check: pos_api can delete staff rows; it must only switch them off';
  end if;

  -- ...and nothing of the customer website's own data must be reachable.
  select string_agg(c.relname, ', ') into extra
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'store' and c.relkind in ('r', 'v')
     and c.relname <> 'staff_users'
     and has_table_privilege('pos_api', c.oid, 'select');
  if extra is not null then
    raise exception '07 self-check: pos_api can read customer website tables: %', extra;
  end if;

  if has_schema_privilege('pos_api', 'pos', 'create') then
    raise exception '07 self-check: pos_api can create objects in pos; it must not';
  end if;
  if not has_function_privilege('pos_api', 'pos.generate_bill_number()', 'execute') then
    raise exception '07 self-check: pos_api cannot get a bill number';
  end if;
end $$;

commit;
