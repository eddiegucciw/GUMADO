#!/usr/bin/env bash
# Concurrency tests: real simultaneous database sessions.
#   1. Two agents try to sell the same plot at the same moment → exactly one succeeds.
#   2. Two payments that together exceed the balance arrive at once → only one is accepted.
set -euo pipefail
DB="${1:-gumado_test}"
P=(psql -X -q -t -A -v ON_ERROR_STOP=1 -d "$DB")

# Committed fixture (outside a transaction so other sessions can see it).
"${P[@]}" -c "delete from public.notifications" >/dev/null
ids=$("${P[@]}" -c "select tests.fixture()")
get() { python3 -c "import json,sys; print(json.loads(sys.argv[1])['$1'])" "$ids"; }
AGENT=$(get agent); AGENT2=$(get agent2); FIN=$(get finance); PLOT=$(get plot1); B1=$(get buyer1); B2=$(get buyer2); CASH=$(get cash)

as_user() { # $1 user, $2 sql  → runs as an API user in its own transaction
  "${P[@]}" -c "begin; select set_config('request.jwt.claim.sub', '$1', true); set local role authenticated; $2; commit;" 2>&1 || true
}

# ---- 1. Concurrent sales of one plot -------------------------------------------------
# Session A takes the plot lock and holds it for 2 s; session B starts while A is holding it.
( as_user "$AGENT"  "select public.create_sale('$PLOT', '$B1', 150000000, public.business_today()); select pg_sleep(2)" > /tmp/gumado_a.out ) &
sleep 0.5
( as_user "$AGENT2" "select public.create_sale('$PLOT', '$B2', 150000000, public.business_today())" > /tmp/gumado_b.out ) &
wait

active=$("${P[@]}" -c "select count(*) from public.sales where plot_id = '$PLOT' and status = 'active'")
if [[ "$active" == "1" ]] && grep -q "no longer available\|cannot be sold\|already has an active sale" /tmp/gumado_b.out; then
  printf '✔ %-38s exactly one sale won the race\n' "concurrency: same plot"
else
  echo "✘ concurrency: same plot — active sales: $active"; cat /tmp/gumado_a.out /tmp/gumado_b.out; exit 1
fi

# ---- 2. Concurrent payments exceeding the balance --------------------------------------
SALE=$("${P[@]}" -c "select id from public.sales where plot_id = '$PLOT' and status = 'active'")
( as_user "$FIN" "select public.record_payment('$SALE', 100000000, public.business_today(), '$CASH', p_confirm => true); select pg_sleep(2)" > /tmp/gumado_c.out ) &
sleep 0.5
( as_user "$AGENT" "select public.record_payment('$SALE', 100000000, public.business_today(), '$CASH', p_allow_possible_duplicate => true)" > /tmp/gumado_d.out ) &
wait

live=$("${P[@]}" -c "select coalesce(sum(amount),0) from public.payments where sale_id = '$SALE' and status in ('pending','confirmed')")
if [[ "$live" == "100000000" ]] && grep -q "more than the outstanding balance" /tmp/gumado_d.out; then
  printf '✔ %-38s balance cannot be over-collected\n' "concurrency: payments"
else
  echo "✘ concurrency: payments — live total: $live"; cat /tmp/gumado_c.out /tmp/gumado_d.out; exit 1
fi
