import type { PaymentStatus, PlotStatus, SalePaymentStatus } from '../data/types';
import { Badge, type Tone } from './core';

const PLOT: Record<PlotStatus, [string, Tone]> = {
  available: ['Available', 'success'],
  reserved: ['Reserved', 'warning'],
  sold: ['Sold', 'accent'],
  unavailable: ['Unavailable', 'neutral'],
};
const SALE: Record<SalePaymentStatus, [string, Tone]> = {
  pending: ['Pending', 'neutral'],
  partially_paid: ['Partially paid', 'info'],
  completed: ['Completed', 'success'],
  overdue: ['Overdue', 'danger'],
  cancelled: ['Cancelled', 'neutral'],
};
const PAYMENT: Record<PaymentStatus, [string, Tone]> = {
  pending: ['Awaiting confirmation', 'warning'],
  confirmed: ['Confirmed', 'success'],
  rejected: ['Rejected', 'danger'],
  reversed: ['Reversed', 'neutral'],
};

export const PlotStatusBadge = ({ status }: { status: PlotStatus }) => <Badge tone={PLOT[status][1]}>{PLOT[status][0]}</Badge>;
export const SaleStatusBadge = ({ status }: { status: SalePaymentStatus }) => <Badge tone={SALE[status][1]}>{SALE[status][0]}</Badge>;
export const PaymentStatusBadge = ({ status }: { status: PaymentStatus }) => <Badge tone={PAYMENT[status][1]}>{PAYMENT[status][0]}</Badge>;

export const plotStatusLabel = (s: PlotStatus) => PLOT[s][0];
export const salePaymentStatusLabel = (s: SalePaymentStatus) => SALE[s][0];
export const paymentStatusLabel = (s: PaymentStatus) => PAYMENT[s][0];
