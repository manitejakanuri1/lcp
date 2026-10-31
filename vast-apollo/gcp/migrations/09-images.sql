-- 09: one row per photo that was uploaded straight to storage.
--
-- WHY. Photos used to pass through the API (multer -> sharp -> bucket) and the URL was written
-- to image_url in the same request, so there was nothing to track. Now the browser sends the
-- file to a signed URL and a storage-triggered function makes the sizes some seconds later, so
-- the API needs to remember three things between those steps: who asked for the upload, what
-- it was for, and whether it has been used yet. This table is that memory.
--
-- The row does NOT hold the picture's address; the address is derived from kind + owner + id
-- (api/image-naming.js), so the two can never disagree.
--
-- status: pending  - signed URL issued, nothing proven about the bytes yet
--         attached - a saree/colour row now points at this photo
--         discarded - replaced or removed; the files are deleted
begin;

create table if not exists pos.images (
  id           uuid primary key,
  kind         text not null check (kind in ('product', 'colour', 'category', 'cms')),
  owner_id     uuid not null,
  status       text not null default 'pending' check (status in ('pending', 'attached', 'discarded')),
  created_by   uuid,
  created_at   timestamptz not null default now(),
  attached_at  timestamptz
);

-- "which uploads of mine are still waiting" and the orphan sweep both read by status and age.
create index if not exists pos_images_status_created on pos.images (status, created_at);
create index if not exists pos_images_owner          on pos.images (kind, owner_id);

grant select, insert, update on pos.images to pos_api;

do $$
begin
  if not has_table_privilege('pos_api', 'pos.images', 'insert') then
    raise exception '09 self-check: pos_api cannot record uploads, so every photo handshake would fail';
  end if;
  if has_table_privilege('pos_api', 'pos.images', 'delete') then
    raise exception '09 self-check: pos_api can delete upload records; they are the audit trail and must only change status';
  end if;
end $$;

commit;
