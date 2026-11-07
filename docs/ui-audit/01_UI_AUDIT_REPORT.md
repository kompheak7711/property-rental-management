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
| 4 | Fixes: Document numbering shows names (never codes) and fits its card; the count on a dark selected filter is readable; report group titles are not ALL CAPS; "1 days" reads "1 day" (English only, every screen); Short stays tabs are underlined tabs; Problem reports has two tabs, Reports and Monthly report. Builds: Approvals tabs (Financial approvals, Short-stay approvals: damage charges waiting, for short_stays.approve); Audit log has one Export button and the window asks Excel or PDF | (batch 4) |
| 5 | Wording: all 657 approved rows of 03 applied in the screens and the customer and tenant bots (03 Status column: every row "Done"). Ledger key `from` split (From date label; new `source` for the journal source column). `st_open` comparison left as it is (no new value was proposed). The words before a server detail are plain now ("This could not be saved: ..."); the detail itself still shows (open question 8). Early check-out window states the owner money rule. 04_GLOSSARY.md written | (batch 5) |

## B6 UI checklist

Checked on the code and the frontend tests (2182 pass) after batch 5. "Yes" means every screen in 00_SCREEN_INVENTORY.md follows it.

| # | Rule | Result |
|---|---|---|
| 1 | Menu names are the 02/11 names (Operations, Leasing, Property, Administration; Approvals, Viewing requests, Notices, Move-outs, Audit log, Storage locations) | Yes |
| 2 | Every record page has one Back link, "Back to X", to the page you came from (or the parent list when opened directly) | Yes |
| 3 | Lease, Unit and Customer stay on one page; History shows the latest 5 with a History button; Customer Latest Receipts 5 with All Receipts; Customer statement shows Balance due with Full statement | Yes |
| 4 | Pages with more than one table use the sub-tab row (Settings, Users and access, Approvals, Short stays, Problem reports); the chosen tab is kept in the address | Yes |
| 5 | Add and Edit forms open as a drawer; money windows keep their own close rules (DL-112) | Yes |
| 6 | Buttons are short; a role shows beside the button ("Manager only") | Yes |
| 7 | No ALL CAPS titles (reports fixed); no code names on screen (document numbering fixed) | Yes |
| 8 | The count on a selected dark filter is readable | Yes |
| 9 | "1 day", "1 person", "1 Unit": one of a thing reads as one (English) | Yes |
| 10 | Words match 04_GLOSSARY.md (Enter, Choose, Select; Pending approval; Rejected; Audit log; Notices; Viewing) | Yes, for every text in text.ts and the bot texts. The old "Earlier forms" (still kept, open question 1) have English written in the component and were not reworded |
| 11 | Phone width (375): sub-tabs and tab lines scroll in one row; tables scroll inside their card | Yes (CSS); see screenshots note |
| 12 | Khmer: only new words added, each marked `// new` | Yes |

**Screenshots of the app.** The design screenshots (before and after, 375 and 1280) are in `screenshots/design-v81/`. Screenshots of the running app at 375, 768 and 1280 could not be taken here: the app needs its database and API, which start only with Docker (the Mac test app). They were not faked. To see the changes, pull `ui-v81` on the Mac and double-click "Start test app.command".

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
6. **Inspections menu (Joint Inspection, Unit Check) is not built yet.** The server has no list of inspections for a Property: Move-out inspections are read one Lease at a time, and Unit Checks are saved only by the Staff bot with no read route. A menu over them needs a new server read. That is more than a layout change, so it waits for an OK. Proposal: one read route "inspections of a Property" (Move-out inspections and Unit Checks, newest first), then the menu with two tabs.
7. **Early check-out money (owner rule 07/11 10:04, from the Database v1.2 review thread).** Unused nights stay paid; there is no money back by itself. Only the Owner, a Manager or a person with the credit right may give Credit for unused nights, with a reason, the same way as a late cancel. The "Check out early" window now says this. Decided: DL-200, added in a separate docs change by the Database v1.2 review thread.
8. **Server detail after an error.** A few messages (Ledger, Employees and payroll, Settings users) still add the server's own detail after the plain sentence, for example "This could not be saved: Enter a reason". Most server details are already plain English; Khmer screens show the Khmer words for known codes (V1-061). Hiding the detail completely needs a list of each module's error codes in the screens. Proposal: do it module by module in a later step, so a useful reason is never lost.
