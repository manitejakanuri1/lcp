-- 03: a purchase bill keeps the vendor's GST number.
--
-- WHY. The Purchases screen shows it, filters on it, edits it, and uses it to spot a bill
-- already entered for the same vendor (AddPurchaseModal). It is also what a GST return is
-- checked against. Migration 01 rebuilt vendor_bills from the insert statements in the API
-- and missed this one, because the column is only ever read back, never inserted.
begin;

alter table pos.vendor_bills
  add column if not exists vendor_gst_number text;

-- Two bills from the same vendor share the number, so it is only indexed, not unique.
create index if not exists pos_vendor_bills_gst on pos.vendor_bills (vendor_gst_number)
  where vendor_gst_number is not null;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'pos' and table_name = 'vendor_bills'
                    and column_name = 'vendor_gst_number') then
    raise exception '03 self-check: vendor_bills.vendor_gst_number is missing';
  end if;
end $$;

commit;
