-- 08: the API may count sign-in attempts.
--
-- WHY. The login now refuses after ten tries on one username or fifty from one address in
-- fifteen minutes, so password guessing cannot simply be repeated. The count has to be shared
-- by every copy of the service Cloud Run starts, which means the database rather than the
-- memory of one instance: store.hit_rate_limit already does exactly this for the website, so
-- the shop uses the same counter instead of a second one that could disagree with it.
--
-- pos_api gets execute on that function and the two rights the function needs on its table -
-- nothing more, and in particular no delete, so an attacker who found a way to call it could
-- not wipe their own attempt count.
begin;

grant execute on function store.hit_rate_limit(text, integer, integer) to pos_api;
grant select, insert, update on store.rate_limits to pos_api;

do $$
begin
  if not has_function_privilege('pos_api', 'store.hit_rate_limit(text, integer, integer)', 'execute') then
    raise exception '08 self-check: pos_api cannot count sign-in attempts, so the login limit would fail open';
  end if;
  if has_table_privilege('pos_api', 'store.rate_limits', 'delete') then
    raise exception '08 self-check: pos_api can delete attempt counts; it must only add to them';
  end if;
end $$;

commit;
