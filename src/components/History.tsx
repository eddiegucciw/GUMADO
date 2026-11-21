import { useAuth } from '../auth/AuthProvider';
import { formatDate, formatDateTime } from '../lib/dates';
import { formatMoney } from '../lib/money';

const ACTION_LABELS: Record<string, string> = {
  'plots.insert': 'Plot registered',
  'plots.update': 'Plot details edited',
  'plot.reserve': 'Plot reserved',
  'plot.release': 'Reservation released',
  'plot.archive': 'Plot archived',
  'plot.restore': 'Plot restored',
  'sale.create': 'Sale recorded',
  'sale.edit': 'Sale terms edited',
  'sale.cancel': 'Sale cancelled',
  'payment.record': 'Payment recorded',
  'payment.confirm': 'Payment confirmed',
  'payment.reject': 'Payment rejected',
  'payment.reverse': 'Payment reversed',
  'buyers.insert': 'Buyer registered',
  'buyers.update': 'Buyer details edited',
  'buyer.archive': 'Buyer archived',
  'buyer.restore': 'Buyer restored',
  'document.register': 'Document upload started',
  'document.upload': 'Document uploaded',
  'document.archive': 'Document archived',
  'profiles.update': 'Staff profile changed',
  'profiles.insert': 'Staff account created',
  'business_settings.update': 'Business settings changed',
  'roles.insert': 'Role created',
  'roles.update': 'Role edited',
  'roles.delete': 'Role deleted',
  'role_permissions.insert': 'Permission granted to role',
  'role_permissions.delete': 'Permission removed from role',
  'payment_methods.insert': 'Payment method added',
  'payment_methods.update': 'Payment method edited',
  'buyer_identities.insert': 'Identification added',
  'buyer_identities.update': 'Identification changed',
};

const FIELD_LABELS: Record<string, string> = {
  asking_price: 'Asking price', sale_price: 'Sale price', status: 'Status', reserved_for_buyer_id: 'Reserved for', reserved_until: 'Reserved until',
  name: 'Name', reference: 'Reference', county: 'County', town: 'Town', estate: 'Estate', location: 'Location', size: 'Size', size_unit: 'Unit',
  notes: 'Notes', description: 'Description', archived_at: 'Archived', balance_due_date: 'Balance due', payment_terms: 'Payment terms',
  agent_id: 'Agent', cancellation_reason: 'Cancellation reason', full_name: 'Name', phone: 'Phone', email: 'Email', role_id: 'Role',
  is_active: 'Active', amount: 'Amount', status_reason: 'Reason', registered_on: 'Registered on', latitude: 'Latitude', longitude: 'Longitude',
};

const MONEY_FIELDS = new Set(['asking_price', 'sale_price', 'amount', 'deposit_amount']);
const HIDDEN = new Set(['id', 'created_at', 'updated_at', 'created_by', 'archived_by', 'cancelled_by', 'verified_by', 'verified_at', 'reversed_by', 'reversed_at', 'updated_by']);

export function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/[._]/g, ' ');
}

export function ChangeSummary({ fields, before, after }: { fields: string[] | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  const { business } = useAuth();
  const fmt = (k: string, v: unknown) => {
    if (v == null || v === '') return '—';
    if (MONEY_FIELDS.has(k) && typeof v === 'number') return formatMoney(v, business.currency);
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return formatDate(v);
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDateTime(v, business.timezone);
    if (typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v)) return 'linked record';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return String(v).length > 80 ? String(v).slice(0, 80) + '…' : String(v);
  };
  const keys = (fields ?? []).filter((k) => !HIDDEN.has(k));
  if (!keys.length) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-muted">
      {keys.slice(0, 8).map((k) => (
        <li key={k}><span className="font-medium text-ink-2">{FIELD_LABELS[k] ?? k}:</span> {before ? `${fmt(k, before[k])} → ` : ''}{fmt(k, after?.[k])}</li>
      ))}
    </ul>
  );
}

export function Timeline({ items }: { items: { at: string; who: string; action: string; fields: string[] | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null }[] }) {
  const { business } = useAuth();
  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {items.map((h, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[1.6rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent" />
          <p className="text-sm font-semibold text-ink">{actionLabel(h.action)}</p>
          <p className="text-xs text-muted">{h.who} · {formatDateTime(h.at, business.timezone)}</p>
          <ChangeSummary fields={h.fields} before={h.before} after={h.after} />
        </li>
      ))}
    </ol>
  );
}
