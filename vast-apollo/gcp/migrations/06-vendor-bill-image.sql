-- 06: a purchase bill remembers the photo it was read from.
--
-- WHY. The Add Purchase screen uploads the paper bill, the reader pulls the rows out of it, and
-- the screen then sends bill_image_path back with the saved bill. There was no column for it,
-- so it was quietly dropped: the figures were kept and the picture they came from was lost,
-- which is exactly what somebody checking a GST return a year later wants to see.
begin;

alter table pos.vendor_bills
  add column if not exists bill_image_path text;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'pos' and table_name = 'vendor_bills'
                    and column_name = 'bill_image_path') then
    raise exception '06 self-check: vendor_bills.bill_image_path is missing';
  end if;
end $$;

commit;
