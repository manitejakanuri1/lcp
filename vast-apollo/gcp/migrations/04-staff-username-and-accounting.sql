-- 04: staff can sign in with a username, and the accounting role is allowed.
--
-- WHY. Shop staff sign in with a short username, not an email - that is what the POS login
-- screen has always asked for, and some staff have no email of their own. Sign-in itself now
-- goes through Firebase Auth, which only knows emails, so the username has to live beside the
-- staff row and be translated to the email behind the scenes.
--
-- The POS app also has an accounting role (requireStaff = founder or accounting) that the role
-- check did not allow, so an accounts person could not be created at all. The check is widened,
-- never narrowed: every role it allowed before is still allowed.
--
-- store.staff_users is shared with the customer website, whose functions only ever read
-- founder and salesman, so neither change affects them.
begin;

alter table store.staff_users
  add column if not exists username citext;

-- Older website staff rows may have no username; only the filled ones must be unique.
create unique index if not exists staff_users_username_key on store.staff_users (username)
  where username is not null;

alter table store.staff_users drop constraint if exists staff_users_role_check;
alter table store.staff_users add constraint staff_users_role_check
  check (role = any (array['founder', 'salesman', 'accounting', 'admin', 'merchandiser', 'editor', 'support']));

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'store' and table_name = 'staff_users' and column_name = 'username') then
    raise exception '04 self-check: staff_users.username is missing';
  end if;
  -- Every role that was allowed before, plus accounting, must still pass the check.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'store.staff_users'::regclass and conname = 'staff_users_role_check'
       and pg_get_constraintdef(oid) like '%accounting%'
       and pg_get_constraintdef(oid) like '%founder%'
       and pg_get_constraintdef(oid) like '%salesman%'
       and pg_get_constraintdef(oid) like '%admin%'
       and pg_get_constraintdef(oid) like '%merchandiser%'
       and pg_get_constraintdef(oid) like '%editor%'
       and pg_get_constraintdef(oid) like '%support%') then
    raise exception '04 self-check: the role check lost a role it used to allow';
  end if;
end $$;

commit;
