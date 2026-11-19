-- ============================================================================
-- GUMADO · 0700 · Private document storage
-- Files can only be read by users who can read the matching public.documents
-- row (RLS applies inside the policy subquery). Nothing is ever public.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 50 * 1024 * 1024, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Upload: only to a path registered via begin_document_upload() by the same user, within an hour.
create policy "gumado documents: upload registered files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.storage_path = storage.objects.name
        and d.uploaded_by = (select auth.uid())
        and d.upload_confirmed_at is null
        and d.created_at > now() - interval '1 hour'
    )
  );

-- Download (signed URLs): only if the user can see the document record.
create policy "gumado documents: read permitted files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.storage_path = storage.objects.name and d.archived_at is null
    )
  );

-- No update or delete policies: stored files are immutable from the API.
