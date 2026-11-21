import { useRef, useState } from 'react';
import { Archive, Download, Eye, FileText, Image as ImageIcon, Upload } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import {
  ACCEPT_ATTR, DOCUMENT_CATEGORIES, documentUrl, formatBytes, listDocuments, setDocumentArchived, uploadDocument, validateFile,
  type DocumentLink, type DocumentWithUploader,
} from '../data/documents';
import type { DocumentCategory } from '../data/types';
import { formatDateTime } from '../lib/dates';
import { useQuery } from '../lib/useQuery';
import { Button, Card, CardHeader, Field, IconButton, Input, Select } from '../ui/core';
import { ConfirmDialog, Dialog, EmptyState, ErrorState, LoadingRows, useToast } from '../ui/feedback';

export function categoryLabel(c: DocumentCategory) {
  return DOCUMENT_CATEGORIES.find((x) => x.value === c)?.label ?? c;
}

export function UploadDocumentDialog({ open, onClose, link, defaultCategory = 'other', onUploaded }: {
  open: boolean; onClose: () => void; link: DocumentLink; defaultCategory?: DocumentCategory; onUploaded: () => void;
}) {
  const { business, can } = useAuth();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<DocumentCategory>(defaultCategory);
  const [description, setDescription] = useState('');
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const categories = DOCUMENT_CATEGORIES.filter((c) => c.value !== 'buyer_document' || (link.buyerId && can('buyers.view_sensitive')));

  const reset = () => {
    setFile(null);
    setDescription('');
    setError(null);
    setStage(null);
    setCategory(defaultCategory);
  };

  const submit = async () => {
    if (!file) return setError('Choose a file to upload.');
    const v = validateFile(file, business.maxUploadMb);
    if (v) return setError(v);
    setError(null);
    try {
      await uploadDocument(file, { category, description: description.trim() || null, ...link }, (s) =>
        setStage(s === 'registering' ? 'Checking…' : s === 'uploading' ? 'Uploading…' : 'Finishing…'));
      toast.success('Document uploaded.');
      reset();
      onUploaded();
      onClose();
    } catch (e) {
      setStage(null);
      toast.error(e);
    }
  };

  return (
    <Dialog open={open} onClose={() => { if (!stage) { reset(); onClose(); } }} title="Upload document"
      description={`PDF, images, Word or Excel up to ${business.maxUploadMb} MB. Stored privately.`}
      footer={<>
        <Button onClick={() => { reset(); onClose(); }} disabled={!!stage}>Cancel</Button>
        <Button variant="primary" loading={!!stage} onClick={submit} icon={<Upload className="h-4 w-4" />}>{stage ?? 'Upload'}</Button>
      </>}>
      <div className="space-y-4">
        <Field label="File" required error={error}>
          {(id, d, inv) => (
            <div>
              <input ref={input} id={id} type="file" accept={ACCEPT_ATTR} aria-describedby={d} aria-invalid={inv} className="sr-only"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} />
              <button type="button" onClick={() => input.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line-strong px-4 py-6 text-center hover:border-accent">
                <Upload className="h-5 w-5 text-muted" />
                <span className="text-sm font-semibold text-ink">{file ? file.name : 'Choose a file'}</span>
                <span className="text-xs text-muted">{file ? formatBytes(file.size) : 'Tap to browse, or use your camera on a phone'}</span>
              </button>
            </div>
          )}
        </Field>
        <Field label="Document type" required>
          {(id) => (
            <Select id={id} value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
              {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Description" hint="For example: “Signed agreement, both parties”.">
          {(id, d) => <Input id={id} aria-describedby={d} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-muted">
          GUMADO stores documents for your records. It does not verify the legal validity of land documents.
        </p>
      </div>
    </Dialog>
  );
}

export function DocumentList({ docs, onArchive }: { docs: DocumentWithUploader[]; onArchive?: (d: DocumentWithUploader) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const open = async (d: DocumentWithUploader, download: boolean) => {
    setBusy(d.id);
    // Open the tab synchronously (avoids pop-up blockers), then point it at the short-lived signed URL.
    const win = download ? null : window.open('', '_blank');
    if (win) win.opener = null;
    try {
      const url = await documentUrl(d, download);
      if (win) win.location.href = url;
      else window.location.assign(url);
    } catch (e) {
      win?.close();
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <ul className="divide-y divide-line">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
            {d.mime_type.startsWith('image/') ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{d.file_name}</p>
            <p className="truncate text-xs text-muted">
              {categoryLabel(d.category)} · {formatBytes(d.size_bytes)} · {formatDateTime(d.created_at)}{d.uploader ? ` · ${d.uploader.full_name}` : ''}
            </p>
            {d.description && <p className="mt-0.5 truncate text-xs text-ink-2">{d.description}</p>}
          </div>
          <div className="flex shrink-0 items-center">
            {(d.mime_type.startsWith('image/') || d.mime_type === 'application/pdf') && (
              <IconButton label={`View ${d.file_name}`} disabled={busy === d.id} onClick={() => open(d, false)}><Eye className="h-4 w-4" /></IconButton>
            )}
            <IconButton label={`Download ${d.file_name}`} disabled={busy === d.id} onClick={() => open(d, true)}><Download className="h-4 w-4" /></IconButton>
            {onArchive && <IconButton label={`Archive ${d.file_name}`} onClick={() => onArchive(d)}><Archive className="h-4 w-4" /></IconButton>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Documents attached to a plot, buyer or sale. */
export function DocumentsPanel({ link, defaultCategory, title = 'Documents' }: { link: DocumentLink; defaultCategory?: DocumentCategory; title?: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const docs = useQuery(() => listDocuments(link), [link.plotId, link.buyerId, link.saleId], { enabled: can('documents.view') });
  const [uploading, setUploading] = useState(false);
  const [archiving, setArchiving] = useState<DocumentWithUploader | null>(null);
  if (!can('documents.view')) return null;

  return (
    <Card>
      <CardHeader title={title} description="Private files. Download links expire after 60 seconds."
        actions={can('documents.upload') && <Button size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => setUploading(true)}>Upload</Button>} />
      {docs.error ? <ErrorState compact error={docs.error} onRetry={docs.reload} /> : !docs.data ? <LoadingRows rows={2} /> :
        docs.data.length === 0 ? <EmptyState compact icon={<FileText className="h-5 w-5" />} title="No documents yet" /> :
          <DocumentList docs={docs.data} onArchive={can('documents.archive') ? setArchiving : undefined} />}
      <UploadDocumentDialog open={uploading} onClose={() => setUploading(false)} link={link} defaultCategory={defaultCategory} onUploaded={docs.reload} />
      <ConfirmDialog open={!!archiving} onClose={() => setArchiving(null)} title="Archive document?" confirmLabel="Archive"
        message={<>“{archiving?.file_name}” will be hidden and can no longer be downloaded. The record is kept in the audit trail.</>}
        onConfirm={async () => {
          await setDocumentArchived(archiving!.id, true);
          toast.success('Document archived.');
          docs.reload();
        }} />
    </Card>
  );
}
