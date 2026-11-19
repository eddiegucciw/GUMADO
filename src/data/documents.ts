import { DOCUMENTS_BUCKET } from '../lib/supabase';
import { supabase, unwrap } from './db';
import type { DocumentCategory, DocumentRow } from './types';

export const DOCUMENT_CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: 'sale_agreement', label: 'Sale agreement' },
  { value: 'title_document', label: 'Title-related document' },
  { value: 'payment_receipt', label: 'Payment receipt' },
  { value: 'buyer_document', label: 'Buyer identification document' },
  { value: 'plot_record', label: 'Plot record' },
  { value: 'plot_photo', label: 'Plot photograph' },
  { value: 'other', label: 'Other supporting document' },
];

export const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
};

export const ACCEPT_ATTR = Object.keys(ALLOWED_TYPES).join(',') + ',.pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx';

export interface DocumentLink {
  plotId?: string | null;
  buyerId?: string | null;
  saleId?: string | null;
}

export interface DocumentWithUploader extends DocumentRow {
  uploader: { full_name: string } | null;
}

export async function listDocuments(link: DocumentLink & { includeArchived?: boolean }): Promise<DocumentWithUploader[]> {
  let q = supabase.from('documents').select('*, uploader:profiles!documents_uploaded_by_fkey(full_name)').not('upload_confirmed_at', 'is', null);
  if (link.plotId) q = q.eq('plot_id', link.plotId);
  if (link.buyerId) q = q.eq('buyer_id', link.buyerId);
  if (link.saleId) q = q.eq('sale_id', link.saleId);
  if (!link.includeArchived) q = q.is('archived_at', null);
  return unwrap<DocumentWithUploader[]>(q.order('created_at', { ascending: false }).limit(200));
}

export function validateFile(file: File, maxMb: number): string | null {
  if (!ALLOWED_TYPES[file.type]) return 'Upload a PDF, JPEG, PNG, WebP, Word (.docx) or Excel (.xlsx) file.';
  if (file.size > maxMb * 1024 * 1024) return `Files must be smaller than ${maxMb} MB.`;
  if (file.size === 0) return 'This file is empty.';
  return null;
}

/**
 * Secure upload: (1) the database validates and registers the document and
 * returns a server-generated path, (2) the file is uploaded to that exact path
 * (storage RLS only allows registered paths), (3) the upload is confirmed.
 */
export async function uploadDocument(
  file: File,
  meta: { category: DocumentCategory; description: string | null } & DocumentLink,
  onProgress?: (stage: 'registering' | 'uploading' | 'confirming') => void,
): Promise<string> {
  onProgress?.('registering');
  const reg = await unwrap<{ id: string; storage_path: string }>(
    supabase.rpc('begin_document_upload', {
      p_file_name: file.name,
      p_mime_type: file.type,
      p_size_bytes: file.size,
      p_category: meta.category,
      p_description: meta.description,
      p_plot_id: meta.plotId ?? null,
      p_buyer_id: meta.buyerId ?? null,
      p_sale_id: meta.saleId ?? null,
    }),
  );
  onProgress?.('uploading');
  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(reg.storage_path, file, {
    contentType: file.type,
    upsert: false,
    cacheControl: '3600',
  });
  if (error) throw error;
  onProgress?.('confirming');
  await unwrap(supabase.rpc('confirm_document_upload', { p_document_id: reg.id }));
  return reg.id;
}

/** Short-lived (60 s) signed URL. Storage RLS refuses users who can't see the document. */
export async function documentUrl(doc: DocumentRow, download = true): Promise<string> {
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(doc.storage_path, 60, download ? { download: doc.file_name } : undefined);
  if (error || !data) throw error ?? new Error('No URL');
  return data.signedUrl;
}

export async function setDocumentArchived(id: string, archived: boolean): Promise<void> {
  await unwrap(supabase.rpc('set_document_archived', { p_document_id: id, p_archived: archived }));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
