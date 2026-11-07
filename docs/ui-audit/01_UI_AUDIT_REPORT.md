# 01 UI audit report (UI v81)

Branch `ui-v81` (from `implementation/foundation` 816cba57). Owner task 07/11/2026 06:07; Part A approved 07/11 07:55 with changes. If a session restarts, read this file and `git log` on the branch.

Rules kept in every batch: layout, navigation and display text only. No change to business logic, calculations, permissions, enum values, API keys or field names. The only data change is the Ledger account display names (migration 360). No document number prefix, issued document or history changes.

## Progress log

| Batch | What changed | Commit |
|---|---|---|
| Part A | Wording review (03), design v81 (02), screenshots | 9a157cde, ff79942b, 3b7e3467 |
| 1 | Shared parts (SubTabs, PanelHeader, drawer forms, DataTable, FilterBar, ColumnToggle, EmptyState, StatusBadge, Skeleton); one Back helper ("Back to X") on every record page; menu names (Operations, Leasing, Property, Administration; Approvals, Viewing requests, Notices, Move-outs, Audit log, Storage locations) | a678ff0b |
| Owner 07:55 | Lease, Unit, Customer on one page; History latest 5 + History page; Customer Latest Receipts 5 + All Receipts page; Balance due + Full statement; "Adjust charge" with "Manager only" beside it (also on Notices); early check-out warning on short stays | (batch 1b) |
| B5 data | Migration 20270626_360: English names of 1100, 1110, 2210, 3900 in `gl_chart_template` and `gl_accounts` | (batch 1b) |
| B1 | 00_SCREEN_INVENTORY.md | (batch 1b) |
| 2 | Users and access is its own menu item (Users, Roles, Sign-in and security, History). Settings tabs: General, Utility rates, Monthly services, Unit setup, System health. An old `#/settings/users` address opens Users and access | (batch 2) |

| 3 | Home: Owner money (Cash and bank today, Customers owe, Owed over 30 days, Spent this month against budget, Profit this year; Owner only: ledger.owner_money with ledger.read) from the Ledger reports; Attendance card (scans to check, no check-out) from today's sheet. Top-bar search for Customers (name or phone) and Units (number) | (batch 3) |

## Open questions

1. **Earlier forms, Settings and Users and access.** Each earlier form was checked against the rebuilt screens. They stay for now because some actions exist only there:
   - Users and access: role bundles (create and assign), administrative account recovery and the full list of access changes. The rebuilt Roles section edits roles but not bundles. Proposal: move these into Roles and History in a later step.
   - Settings › Utility rates: confirming the riel exchange rate. No rebuilt screen does it yet.
   - Settings › General: the earlier form also opens the Property ("Load business configuration") when none is open. The rest repeats the General tab. It can go once the app opens the one Property by itself in every case.
   - Payments, Invoices, Utilities, Leases, Notices, Move-outs: earlier forms are checked in their own module batch.
2. **Discard question on forms.** Add/Edit forms open as a drawer. The "Discard your changes?" question is on only where a form's Close just closes. Money windows keep their own close rules (DL-112), so they do not get it.
3. **Customer Latest Receipts** come from the Customer's ledger lines (Payment received), newest first, up to 1,000. The line shows the payment number, the payment day and the amount, and opens the Receipt. A reversed payment still shows, with its reversal in the full statement.
4. **Top-bar search** finds Customers and Units. Invoice, Receipt and Lease numbers are not searched: the server has no number search for them yet. Adding one is a server change, so it waits for an OK.
5. **Owner money "Spent this month"** adds the expense lines 5000 to 6999 of Budget vs actual. Profit this year is the "Profit (or loss)" line, year to date, of Profit and loss.
