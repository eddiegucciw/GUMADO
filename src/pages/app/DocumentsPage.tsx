import { useState } from 'react';
import { FileText } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { DocumentList } from '../../components/DocumentsPanel';
import { DOCUMENT_CATEGORIES, listDocuments, setDocumentArchived, type DocumentWithUploader } from '../../data/documents';
import { useQuery } from '../../lib/useQuery';
import { Card, Select } from '../../ui/core';
import { FilterBar, PageHeader, SearchInput } from '../../ui/data';
import { ConfirmDialog, EmptyState, ErrorState, LoadingRows, useToast } from '../../ui/feedback';

export default function DocumentsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const docs = useQuery(() => listDocuments({}), []);
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [archiving, setArchiving] = useState<DocumentWithUploader | null>(null);

  const rows = docs.data?.filter((d) => (!category || d.category === category) && (!q || `${d.file_name} ${d.description ?? ''}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <PageHeader title="Documents" description="All documents you can access. Upload new documents from a plot, buyer or sale so they're linked correctly." />
      <Card>
        <FilterBar>
          <SearchInput value={q} onChange={setQ} placeholder="File name or description" className="sm:w-72" />
          <Select aria-label="Document type" className="sm:w-56" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All document types</option>
            {DOCUMENT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </FilterBar>
        {docs.error ? <ErrorState error={docs.error} onRetry={docs.reload} /> : !rows ? <LoadingRows /> :
          rows.length === 0 ? <EmptyState icon={<FileText className="h-5 w-5" />} title="No documents found" /> :
            <DocumentList docs={rows} onArchive={can('documents.archive') ? setArchiving : undefined} />}
        {docs.data && docs.data.length >= 200 && <p className="border-t border-line px-5 py-3 text-xs text-muted">Showing the 200 most recent documents. Open a plot, buyer or sale to see all of its documents.</p>}
      </Card>
      <ConfirmDialog open={!!archiving} onClose={() => setArchiving(null)} title="Archive document?" confirmLabel="Archive"
        message={<>“{archiving?.file_name}” will be hidden and can no longer be downloaded.</>}
        onConfirm={async () => { await setDocumentArchived(archiving!.id, true); toast.success('Document archived.'); docs.reload(); }} />
    </>
  );
}
