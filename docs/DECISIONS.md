# Business rules: decisions for the customer to confirm

GUMADO implements the rules below. Where the brief left a rule open, the default is marked
**[confirm]**. Most are switchable in **Business settings** without code changes.

| # | Rule | Default implemented | How to change |
|---|---|---|---|
| 1 | When does a plot become **Sold**? **[confirm]** | When the sale is recorded. | Settings → "Only when fully paid" (the plot stays *Reserved* for the buyer until confirmed payments cover the price). |
| 2 | Must payments be confirmed by a second person? **[confirm]** | No. Staff with `payments.verify` may record-and-confirm. Agents' payments always start *pending*. | Settings → "Require a second person to confirm payments". |
| 3 | Can a payment exceed the outstanding balance? | No. Amount ≤ price − confirmed − pending. Overpayments must be recorded outside GUMADO. | Code change. |
| 4 | Cancelling a sale with confirmed payments **[confirm]** | Allowed, with a reason. Confirmed payments stay on record; pending ones are rejected; the plot becomes available. **Refunds are handled outside GUMADO.** | Code change (e.g. block cancellation when money is held). |
| 5 | Editing a recorded sale | Terms, due date, notes and agent can be edited (`sales.edit`). Plot, buyer, price and date can't: cancel and re-record. | Code change. |
| 6 | Who can reverse a confirmed payment? | Only roles with `payments.reverse` (Administrator by default, not Finance Officer). | Staff & roles screen. |
| 7 | Expired reservations | Flagged as expired; a person must release them. Nothing auto-releases. | Code change (could add a scheduled release). |
| 8 | Instalment schedules | One "balance due by" date per sale drives *Overdue* and reminders. Terms are free text. | A per-instalment schedule is a possible next phase. |
| 9 | Overdue status | Outstanding > 0 and the balance due date has passed (business timezone). | Code change. |
| 10 | Duplicate payment guard | Same sale + amount + date + method within 15 minutes requires an explicit "it's a separate payment" confirmation. Transaction references can't be reused while live. | Code change. |
| 11 | Agent attribution | Agents record sales under their own name; users with `sales.view_all` may attribute a sale to another active staff member. | Staff & roles. |
| 12 | Buyer ID numbers | Optional; one ID number can't belong to two buyers; can be corrected but not removed. | Code change. |
| 13 | Multi-business | One business per deployment (as agreed). | Requires a tenancy migration. |
| 14 | Currency | KES, 2 decimals; locked after the first sale to protect stored amounts. | Settings (before first sale). |
