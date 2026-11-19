-- Document registration, upload authorisation, and download permissions.
begin;
select tests.fixture();
select tests.login(tests.id('agent'));
select public.create_sale(tests.id('plot1'), tests.id('buyer1'), 150000000, public.business_today());

-- Validation -----------------------------------------------------------------------
select tests.throws($$ select public.begin_document_upload('virus.exe', 'application/x-msdownload', 1000, 'other', null, tests.id('plot1')) $$,
  'FILE_TYPE', 'disallowed file types are refused');
select tests.throws($$ select public.begin_document_upload('big.pdf', 'application/pdf', 21 * 1024 * 1024, 'other', null, tests.id('plot1')) $$,
  'FILE_SIZE', 'files over the size limit are refused');
select tests.throws($$ select public.begin_document_upload('a.pdf', 'application/pdf', 1000, 'other') $$,
  'LINK_REQUIRED', 'documents must be linked to a plot, buyer or sale');
select tests.throws($$ select public.begin_document_upload('id.jpg', 'image/jpeg', 1000, 'buyer_document', null, null, tests.id('buyer1')) $$,
  'FORBIDDEN', 'agents cannot upload buyer ID documents without the sensitive permission');

-- Register → upload → confirm ---------------------------------------------------------
select set_config('t.doc', (public.begin_document_upload('Sale Agreement (signed).pdf', 'application/pdf', 250000, 'sale_agreement',
                                                         'Signed by both parties', null, null,
                                                         (select id from public.sales limit 1)) ->> 'id'), true);
select tests.ok((select storage_path ~ ('^' || current_setting('t.doc') || '/Sale_Agreement_signed_.pdf$') from public.documents),
  'storage paths are generated server-side with a safe file name');
select tests.throws($$ select public.confirm_document_upload(current_setting('t.doc')::uuid) $$, 'UPLOAD_MISSING',
  'a document cannot be confirmed before the file exists');

-- Another user cannot upload into someone else's registered path.
select tests.login(tests.id('finance'));
select tests.throws($$ insert into storage.objects (bucket_id, name) values ('documents', (select storage_path from public.documents d where d.id = current_setting('t.doc')::uuid)) $$,
  '42501', 'other users cannot upload into a path they did not register');

-- Nobody can upload to an unregistered path.
select tests.throws($$ insert into storage.objects (bucket_id, name) values ('documents', 'anything/evil.pdf') $$, '42501',
  'unregistered storage paths are refused');

select tests.login(tests.id('agent'));
select tests.lives($$ insert into storage.objects (bucket_id, name)
                      select 'documents', storage_path from public.documents where id = current_setting('t.doc')::uuid $$,
  'the uploader can upload to their registered path');
select tests.lives($$ select public.confirm_document_upload(current_setting('t.doc')::uuid) $$, 'and confirm the upload');
update storage.objects set name = 'moved.pdf' where bucket_id = 'documents';
delete from storage.objects where bucket_id = 'documents';
select tests.eq((select count(*) from storage.objects where bucket_id = 'documents' and name like current_setting('t.doc') || '/%'), 1::bigint,
  'stored files cannot be renamed or deleted through the API');
select tests.eq((select count(*) from storage.objects where bucket_id = 'documents'), 1::bigint, 'the uploader can read the file');

-- Download permissions follow sale visibility.
select tests.login(tests.id('agent2'));
select tests.eq((select count(*) from public.documents), 0::bigint, 'another agent cannot see documents on a sale that is not theirs');
select tests.eq((select count(*) from storage.objects where bucket_id = 'documents'), 0::bigint,
  'and cannot download the file (no signed URL can be created)');

select tests.login(tests.id('finance'));
select tests.eq((select count(*) from storage.objects where bucket_id = 'documents'), 1::bigint, 'finance can download the agreement');

select tests.login(tests.id('nobody'));
select tests.eq((select count(*) from storage.objects where bucket_id = 'documents'), 0::bigint, 'users without a role cannot download files');

-- Buyer ID documents need the sensitive permission even to view.
select tests.login(tests.id('admin'));
select public.begin_document_upload('national-id.jpg', 'image/jpeg', 5000, 'buyer_document', 'ID copy', null, tests.id('buyer1'));
select tests.logout();
insert into storage.objects (bucket_id, name) select 'documents', storage_path from public.documents where category = 'buyer_document';
update public.documents set upload_confirmed_at = now() where category = 'buyer_document';
select tests.login(tests.id('finance'));
select tests.eq((select count(*) from public.documents where category = 'buyer_document'), 0::bigint,
  'staff without the sensitive permission cannot see buyer ID documents');
select tests.eq((select count(*) from storage.objects o join public.documents d on d.storage_path = o.name where d.category = 'buyer_document'), 0::bigint,
  'or download them');

-- Archiving hides the file; records are never deleted.
select tests.login(tests.id('admin'));
select tests.lives($$ select public.set_document_archived(current_setting('t.doc')::uuid, true) $$, 'administrators can archive documents');
select tests.login(tests.id('finance'));
select tests.eq((select count(*) from storage.objects o where o.name like current_setting('t.doc') || '/%'), 0::bigint,
  'archived documents can no longer be downloaded');
select tests.throws($$ delete from public.documents $$, '42501', 'document records cannot be deleted through the API');

-- The bucket is private.
select tests.logout();
select tests.eq((select public from storage.buckets where id = 'documents'), false, 'the documents bucket is private');
rollback;
