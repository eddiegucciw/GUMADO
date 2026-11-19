/** Row shapes returned by the GUMADO database views and functions. Money is integer minor units. */

export type PlotStatus = 'available' | 'reserved' | 'sold' | 'unavailable';
export type SaleStatus = 'active' | 'cancelled';
export type PaymentStatus = 'pending' | 'confirmed' | 'rejected' | 'reversed';
export type SalePaymentStatus = 'pending' | 'partially_paid' | 'completed' | 'overdue' | 'cancelled';
export type SizeUnit = 'acres' | 'hectares' | 'square_metres' | 'square_feet';
export type DocumentCategory =
  | 'sale_agreement' | 'title_document' | 'payment_receipt' | 'buyer_document' | 'plot_record' | 'plot_photo' | 'other';

export interface Plot {
  id: string;
  reference: string;
  name: string;
  description: string | null;
  county: string;
  town: string | null;
  estate: string | null;
  location: string | null;
  size: number;
  size_unit: SizeUnit;
  size_sq_m: number;
  asking_price: number;
  status: PlotStatus;
  reserved_for_buyer_id: string | null;
  reserved_for_name: string | null;
  reserved_until: string | null;
  reservation_expired: boolean;
  registered_on: string;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  active_sale_id: string | null;
  active_sale_reference: string | null;
  sale_price: number | null;
}

export interface Buyer {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  address: string | null;
  registered_on: string;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  active_sales: number;
  total_purchased: number;
  total_paid: number;
  outstanding: number;
}

export interface BuyerIdentity {
  buyer_id: string;
  id_type: 'national_id' | 'passport' | 'alien_id' | 'company_registration' | 'other';
  id_number: string;
}

export interface Sale {
  id: string;
  reference: string;
  status: SaleStatus;
  sale_date: string;
  balance_due_date: string | null;
  sale_price: number;
  deposit_amount: number;
  payment_terms: string | null;
  notes: string | null;
  created_at: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  plot_id: string;
  plot_reference: string;
  plot_name: string;
  county: string;
  town: string | null;
  estate: string | null;
  buyer_id: string;
  buyer_name: string | null;
  buyer_phone: string | null;
  agent_id: string;
  agent_name: string;
  total_paid: number;
  pending_amount: number;
  outstanding: number;
  payment_status: SalePaymentStatus;
}

export interface Payment {
  id: string;
  receipt_number: string;
  sale_id: string;
  sale_reference: string;
  sale_status: SaleStatus;
  plot_reference: string;
  buyer_id: string;
  buyer_name: string | null;
  amount: number;
  paid_on: string;
  method_id: string;
  method_name: string;
  transaction_reference: string | null;
  status: PaymentStatus;
  notes: string | null;
  recorded_by: string;
  recorded_by_name: string;
  recorded_at: string;
  verified_by: string | null;
  verified_by_name: string | null;
  verified_at: string | null;
  reversed_at: string | null;
  status_reason: string | null;
  agent_id: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  requires_reference: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface DocumentRow {
  id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  category: DocumentCategory;
  description: string | null;
  plot_id: string | null;
  buyer_id: string | null;
  sale_id: string | null;
  uploaded_by: string;
  created_at: string;
  upload_confirmed_at: string | null;
  archived_at: string | null;
}

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  entity_type: 'plot' | 'buyer' | 'sale' | 'payment' | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface AuditEntry {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_fields: string[] | null;
}

export interface PlotHistoryEntry {
  occurred_at: string;
  actor_name: string;
  action: string;
  table_name: string;
  changed_fields: string[] | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
}

export interface StaffMember {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_system: boolean;
}

export interface PermissionDef {
  key: string;
  category: string;
  description: string;
}

export interface BusinessSettings {
  business_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  postal_address: string | null;
  currency_code: string;
  currency_minor_units: number;
  timezone: string;
  plot_sold_on: 'sale_created' | 'fully_paid';
  require_separate_verifier: boolean;
  due_soon_days: number;
  max_upload_mb: number;
  updated_at: string;
}

export interface PeriodMetrics {
  sales_count: number;
  sales_value: number;
  collected: number;
  payments_count: number;
  new_buyers: number | null;
}

export interface DashboardSummary {
  from: string;
  to: string;
  bucket: 'day' | 'month';
  currency: string;
  minor_units: number;
  plots: { total: number; available: number; reserved: number; sold: number; unavailable: number } | null;
  current: PeriodMetrics;
  previous: PeriodMetrics;
  balances: {
    total_sales_value: number;
    total_collected: number;
    outstanding: number;
    overdue_amount: number;
    overdue_count: number;
    awaiting_confirmation: number;
    active_sales: number;
  };
  series: { bucket: string; sales_value: number; collected: number }[];
}

export interface SearchResult {
  kind: 'plot' | 'buyer' | 'sale' | 'payment';
  id: string;
  title: string;
  subtitle: string;
}

export interface Page<T> {
  rows: T[];
  count: number;
}
