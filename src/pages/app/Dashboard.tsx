import { AlertTriangle, ArrowDownRight, ArrowUpRight, Clock, LayoutGrid, Plus, Receipt, TrendingUp, Wallet } from 'lucide-react';
import { useAuth, Can } from '../../auth/AuthProvider';
import { dashboardSummary } from '../../data/reports';
import { listPayments } from '../../data/payments';
import { listSales } from '../../data/sales';
import { listBuyers } from '../../data/buyers';
import { formatDate } from '../../lib/dates';
import { formatMoney, formatMoneyCompact, percentChange, toMajorNumber } from '../../lib/money';
import { Link } from '../../lib/router';
import { useQuery } from '../../lib/useQuery';
import { BarChart, StackedBar } from '../../ui/charts';
import { ButtonLink, Card, CardHeader, cx } from '../../ui/core';
import { PageHeader, StatCard } from '../../ui/data';
import { EmptyState, ErrorState, LoadingRows } from '../../ui/feedback';
import { DateRangePicker, useDateRange } from '../../ui/inputs';
import { PaymentStatusBadge, SaleStatusBadge } from '../../ui/status';

function Delta({ current, previous }: { current: number; previous: number }) {
  const p = percentChange(current, previous);
  if (p == null) return <span>No data for the previous period</span>;
  const up = p >= 0;
  return (
    <span className={cx('inline-flex items-center gap-0.5 font-semibold', up ? 'text-success' : 'text-danger')}>
      {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {Math.abs(p).toFixed(p > -10 && p < 10 ? 1 : 0)}% <span className="font-normal text-muted">vs previous period</span>
    </span>
  );
}

export default function Dashboard() {
  const { access, business, can, canAny } = useAuth();
  const [range, setRange] = useDateRange('30d');
  const money = (v: number) => formatMoney(v, business.currency);
  const compact = (v: number) => formatMoneyCompact(v, business.currency);
  const canSales = canAny('sales.view_all', 'sales.view_own');

  const summary = useQuery(() => dashboardSummary(range.from, range.to), [range.from, range.to]);
  const recentPayments = useQuery(() => listPayments({}, 1), [], { enabled: can('payments.view') });
  const recentSales = useQuery(() => listSales({}, 1), [], { enabled: canSales });
  const recentBuyers = useQuery(() => listBuyers({}, 1), [], { enabled: can('buyers.view') });

  const d = summary.data;
  const firstName = (access?.full_name || '').split(' ')[0];

  return (
    <>
      <PageHeader
        title={<span><span className="font-serif text-[1.9rem] font-semibold">Good day{firstName ? `, ${firstName}` : ''}</span></span>}
        description={`${business.name} · figures from confirmed records`}
        actions={<>
          <DateRangePicker value={range} onChange={setRange} />
          <Can permission="sales.create"><ButtonLink to="/app/sales/new" variant="primary" icon={<Plus className="h-4 w-4" />}>New sale</ButtonLink></Can>
        </>}
      />

      {summary.error ? (
        <Card><ErrorState error={summary.error} onRetry={summary.reload} /></Card>
      ) : !d ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="h-28 rounded-2xl border border-line bg-surface" />)}</div>
      ) : (
        <div className={cx('space-y-4 sm:space-y-5', summary.loading && 'opacity-70 transition-opacity')}>
          {/* Money */}
          {canSales && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Sales in period" value={compact(d.current.sales_value)} icon={<TrendingUp className="h-4 w-4" />}
                sub={<><span className="block">{d.current.sales_count} sale{d.current.sales_count === 1 ? '' : 's'}</span><Delta current={d.current.sales_value} previous={d.previous.sales_value} /></>} />
              <StatCard label="Collected in period" value={compact(d.current.collected)} icon={<Wallet className="h-4 w-4" />} tone="success"
                sub={<><span className="block">{d.current.payments_count} confirmed payment{d.current.payments_count === 1 ? '' : 's'}</span><Delta current={d.current.collected} previous={d.previous.collected} /></>} />
              <StatCard label="Outstanding" value={compact(d.balances.outstanding)} icon={<Receipt className="h-4 w-4" />}
                sub={`Across ${d.balances.active_sales} active sale${d.balances.active_sales === 1 ? '' : 's'}`} href="/app/sales?balance=1" />
              <StatCard label="Overdue" value={compact(d.balances.overdue_amount)} icon={<AlertTriangle className="h-4 w-4" />} tone="danger"
                sub={`${d.balances.overdue_count} sale${d.balances.overdue_count === 1 ? '' : 's'} past due date`} href="/app/sales?pay=overdue" />
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-3 sm:gap-5">
            {/* Chart */}
            {canSales && (
              <Card className="lg:col-span-2">
                <CardHeader title="Sales performance" description={`${formatDate(d.from)} – ${formatDate(d.to)} · by ${d.bucket}`} />
                <div className="p-4 sm:p-5">
                  {d.series.every((s) => !s.sales_value && !s.collected) ? (
                    <EmptyState compact icon={<TrendingUp className="h-5 w-5" />} title="No sales or confirmed payments in this period" description="Try a longer period." />
                  ) : (
                    <BarChart
                      title="Sales value and money collected over time"
                      data={d.series.map((s) => ({ ...s, sv: toMajorNumber(s.sales_value, d.minor_units), c: toMajorNumber(s.collected, d.minor_units) }))}
                      xKey="bucket"
                      series={[{ key: 'sv', label: 'Sales value', color: 'var(--chart-2)' }, { key: 'c', label: 'Collected', color: 'var(--chart-1)' }]}
                      formatX={(v) => (d.bucket === 'day' ? formatDate(v).replace(/ \d{4}$/, '') : formatDate(v).replace(/^\d+ /, ''))}
                      formatY={(v) => formatMoneyCompact(Math.round(v * 10 ** d.minor_units), business.currency)}
                    />
                  )}
                </div>
              </Card>
            )}

            {/* Inventory */}
            {d.plots && (
              <Card className={cx(!canSales && 'lg:col-span-3')}>
                <CardHeader title="Plot inventory" description={`${d.plots.total} registered plot${d.plots.total === 1 ? '' : 's'}`}
                  actions={<Link to="/app/plots" className="text-xs font-semibold text-accent hover:underline">View all</Link>} />
                <div className="p-4 sm:p-5">
                  {d.plots.total === 0 ? (
                    <EmptyState compact icon={<LayoutGrid className="h-5 w-5" />} title="No plots registered yet"
                      action={<Can permission="plots.manage"><ButtonLink to="/app/plots?new=1" variant="primary" size="sm">Register a plot</ButtonLink></Can>} />
                  ) : (
                    <>
                      <StackedBar total={d.plots.total} parts={[
                        { label: 'Available', value: d.plots.available, color: 'var(--success)' },
                        { label: 'Reserved', value: d.plots.reserved, color: 'var(--warning)' },
                        { label: 'Sold', value: d.plots.sold, color: 'var(--accent)' },
                        { label: 'Unavailable', value: d.plots.unavailable, color: 'var(--line-strong)' },
                      ]} />
                      {canSales && (
                        <dl className="mt-5 space-y-2.5 border-t border-line pt-4 text-sm">
                          <div className="flex justify-between gap-3"><dt className="text-muted">Total sales value</dt><dd className="font-semibold text-ink tabular">{money(d.balances.total_sales_value)}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-muted">Total collected</dt><dd className="font-semibold text-ink tabular">{money(d.balances.total_collected)}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-muted">Awaiting confirmation</dt><dd className="font-semibold text-warning tabular">{money(d.balances.awaiting_confirmation)}</dd></div>
                        </dl>
                      )}
                    </>
                  )}
                </div>
              </Card>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-3 sm:gap-5">
            {can('payments.view') && (
              <Card className="lg:col-span-1">
                <CardHeader title="Payment activity" actions={<Link to="/app/payments" className="text-xs font-semibold text-accent hover:underline">All payments</Link>} />
                {recentPayments.error ? <ErrorState compact error={recentPayments.error} onRetry={recentPayments.reload} /> : !recentPayments.data ? <LoadingRows rows={4} /> :
                  recentPayments.data.rows.length === 0 ? <EmptyState compact icon={<Wallet className="h-5 w-5" />} title="No payments recorded yet" /> : (
                  <ul className="divide-y divide-line">
                    {recentPayments.data.rows.slice(0, 6).map((p) => (
                      <li key={p.id}>
                        <Link to={`/app/payments?open=${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 sm:px-5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-ink">{p.buyer_name ?? p.sale_reference}</p>
                            <p className="truncate text-xs text-muted">{formatDate(p.paid_on)} · {p.method_name}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-ink tabular">{money(p.amount)}</p>
                            <PaymentStatusBadge status={p.status} />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
            {canSales && (
              <Card className="lg:col-span-1">
                <CardHeader title="Recent transactions" actions={<Link to="/app/sales" className="text-xs font-semibold text-accent hover:underline">All sales</Link>} />
                {recentSales.error ? <ErrorState compact error={recentSales.error} onRetry={recentSales.reload} /> : !recentSales.data ? <LoadingRows rows={4} /> :
                  recentSales.data.rows.length === 0 ? <EmptyState compact icon={<Receipt className="h-5 w-5" />} title="No sales recorded yet"
                    action={<Can permission="sales.create"><ButtonLink to="/app/sales/new" size="sm" variant="primary">Record a sale</ButtonLink></Can>} /> : (
                  <ul className="divide-y divide-line">
                    {recentSales.data.rows.slice(0, 6).map((s) => (
                      <li key={s.id}>
                        <Link to={`/app/sales/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 sm:px-5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-ink">Plot {s.plot_reference}</p>
                            <p className="truncate text-xs text-muted">{s.buyer_name ?? '—'} · {formatDate(s.sale_date)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-ink tabular">{compact(s.sale_price)}</p>
                            <SaleStatusBadge status={s.payment_status} />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
            {can('buyers.view') && (
              <Card className="lg:col-span-1">
                <CardHeader title="Buyers" description={d.current.new_buyers != null ? `${d.current.new_buyers} registered in this period` : undefined}
                  actions={<Link to="/app/buyers" className="text-xs font-semibold text-accent hover:underline">All buyers</Link>} />
                {recentBuyers.error ? <ErrorState compact error={recentBuyers.error} onRetry={recentBuyers.reload} /> : !recentBuyers.data ? <LoadingRows rows={4} /> :
                  recentBuyers.data.rows.length === 0 ? <EmptyState compact title="No buyers registered yet" /> : (
                  <ul className="divide-y divide-line">
                    {[...recentBuyers.data.rows].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6).map((b) => (
                      <li key={b.id}>
                        <Link to={`/app/buyers/${b.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 sm:px-5">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-bold text-ink-2">{b.full_name.slice(0, 1)}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-ink">{b.full_name}</p>
                            <p className="truncate text-xs text-muted">{b.phone}</p>
                          </div>
                          {b.outstanding > 0 && <span className="text-xs font-semibold text-warning tabular">{compact(b.outstanding)} due</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>

          {d.balances.awaiting_confirmation > 0 && can('payments.verify') && (
            <Link to="/app/payments?status=pending" className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
              <Clock className="h-5 w-5 shrink-0" />
              <span><strong>{money(d.balances.awaiting_confirmation)}</strong> in recorded payments is awaiting confirmation. It is not counted as collected until confirmed.</span>
            </Link>
          )}
        </div>
      )}
    </>
  );
}
