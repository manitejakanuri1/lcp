-- 02: a bill line remembers which colour was sold.
--
-- WHY. The till can scan a colour barcode, and the sale then comes off that colour's own
-- pieces. pos.bill_items had nowhere to record which colour that was, so cancelling such a
-- bill could put the piece back on the saree but never back on the colour - the colour stayed
-- short by one for ever. The old app sent color_id with every line and the dead VPS database
-- had the column; this restores it.
--
-- ONLY ADDS. Existing lines get null, which reads as "a plain saree line", exactly how they
-- behaved before.
begin;

alter table pos.bill_items
  add column if not exists color_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bill_items_color_fk') then
    alter table pos.bill_items
      add constraint bill_items_color_fk foreign key (color_id)
      references pos.product_colors(id) on delete set null;
  end if;
end $$;

create index if not exists pos_bill_items_color on pos.bill_items (color_id) where color_id is not null;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'pos' and table_name = 'bill_items' and column_name = 'color_id') then
    raise exception '02 self-check: bill_items.color_id is missing';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bill_items_color_fk') then
    raise exception '02 self-check: the colour foreign key is missing';
  end if;
end $$;

commit;
