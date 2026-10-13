-- 05: the analytics numbers count pieces, and count them for the period asked for.
--
-- WHY. Both functions were written when a saree was one unique piece that was either available
-- or sold. The shop app counts pieces: a saree row carries a quantity, and a colour carries its
-- own pieces. Against that, the old bodies were wrong in three ways:
--   * total_items_sold counted saree ROWS with status 'sold', so a saree sold 4 times counted
--     once, and one piece sold out of 6 counted not at all;
--   * total_items_sold ignored the date range completely - it was an all-time number sitting in
--     a report the shop reads per month;
--   * total_items_in_stock counted rows too, so 40 sarees of 6 pieces read as 40, not 240.
--
-- The returned columns, their names and their types are unchanged, so the website's
-- analytics-summary function keeps working and simply gets the right numbers.
begin;

create or replace function pos.get_analytics_summary(p_from date default null, p_to date default null)
returns table(total_sales numeric, total_cost numeric, total_profit numeric,
              total_items_sold bigint, total_items_in_stock bigint)
language sql
stable
as $$
  with period as (
    select b.id, b.total_amount, b.total_cost
      from pos.bills b
     where (p_from is null or b.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata'))
       and (p_to   is null or b.created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Kolkata'))
  )
  select coalesce((select sum(total_amount) from period), 0),
         coalesce((select sum(total_cost) from period), 0),
         coalesce((select sum(total_amount - total_cost) from period), 0),
         -- Pieces sold on the bills of this period, not saree rows marked sold for ever.
         coalesce((select sum(i.quantity)::bigint from pos.bill_items i
                    where i.bill_id in (select id from period)), 0),
         -- Pieces on the shelf: the colours of a saree that has them, the saree's own count
         -- where it has none, so nothing is counted twice.
         coalesce((select sum(case when c.pieces is not null then c.pieces else p.quantity end)::bigint
                     from pos.products p
                     left join pos.product_colors c on c.product_id = p.id
                    where p.status = 'available'), 0);
$$;

create or replace function pos.get_daily_sales(p_days_back integer default 30)
returns table(sale_date date, total_amount numeric, total_profit numeric, bill_count bigint)
language sql
stable
as $$
  select (b.created_at at time zone 'Asia/Kolkata')::date,
         sum(b.total_amount),
         sum(b.total_amount - b.total_cost),
         count(*)
    from pos.bills b
   where b.created_at >= now() - make_interval(days => greatest(p_days_back, 1))
   group by 1
   order by 1 desc;
$$;

grant execute on function pos.get_analytics_summary(date, date), pos.get_daily_sales(integer) to app_functions;

do $$
declare r record;
begin
  -- Prove the shapes did not change, and that an empty shop answers zeroes rather than nulls.
  select * into r from pos.get_analytics_summary(null, null);
  if r.total_sales is null or r.total_items_sold is null or r.total_items_in_stock is null then
    raise exception '05 self-check: the summary returned a null where it must return 0';
  end if;
  if (select count(*) from information_schema.routines
       where routine_schema = 'pos' and routine_name in ('get_analytics_summary', 'get_daily_sales')) <> 2 then
    raise exception '05 self-check: one of the two functions is missing';
  end if;
end $$;

commit;
