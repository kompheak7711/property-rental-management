# 07 Full test results

Date: 17/11/2026. Branch `implementation/foundation`. Tester: Claude Code, at the owner's
request ("review all screens and test the full application").

The rules are in `06_SCREEN_CHECKLIST.md`. This file records round 1 of the full test:
the automatic screen check, then one complete business flow done through the screens,
as a person would do it.

## 1. How the test was done

- **Backup first.** The local database was backed up before any test data was entered:
  `backups/prm-before-full-test-20261117-145346.backup` (8.3 MB, 376 tables, readable by
  the owner only, not tracked by git).
- **Screen check.** `npm run screens` (`frontend/e2e/screens.spec.ts`) with the sizes of the
  owner's rule. Three sizes were added on 17/11/2026 (owner's approval): 1024 × 768,
  2560 × 1440 and 5120 × 1440. It now runs 8 sizes.
- **Business flow.** The test app (`Start test app.command`) on the Mac mini, signed in as
  the Owner, in a separate test browser at about 1200 px wide. Every record was made through
  the screens. Nothing was written to the database directly. All test records start with
  "TEST" and use made-up details.
- **What a check means here.** Amounts were worked out by hand and compared with the screen.
  The server's own records were read back through the app's API where the screen did not
  show them (for example after a payment reversal).

## 2. Results at a glance

| Area | Result |
|---|---|
| Screen check: 33 screens × 8 sizes = 264 checks | All passed |
| Customer: add, edit, required fields, duplicate ID number | Passed |
| Unit: add, default Rent, required Service, two meters | Passed |
| Lease: draft, Initial Rent, signing with the first money, move-in | Passed |
| Quotation to Invoice, price and stock rules | Passed (one low finding) |
| Payments: part payment, overpayment to Credit, reference rule, double click | Passed |
| Payment reversal | Money correct; very hard to do (finding 3) |
| Ledger and Home money cards | **Fail** (finding 1) |
| Move-out and Final Settlement | **Blocked** at step 3 (finding 2) |
| All 26 menu pages open | Passed: no error text, no sideways scroll |

## 3. Findings

Ordered from most serious. Nothing has been changed for any finding. Each fix needs a
preview and the owner's approval first.

### High

**1. Customer money is not in the books, but the app says it is.**
- Seen: Books › Journal entries has only expenses, supplier bills and the opening balance.
  No Payment, Invoice or Security Deposit is posted, although the page says "Each financial
  record in the app posts its own balanced entry automatically". Books › Needs check says
  "Nothing to check. Every money record is in the ledger."
- Effect: Home shows "Cash & bank $470.00" and "Profit this year -$100.00" although
  $2,918.09 was received (Payments page). Financial statements and the bank reconciliation
  use the same books.
- Cause found: posting is done by the billing worker (`ledger_posting_job.py`, run from
  `billing_worker.py`). `scripts/local/start-test-app.sh` does not start the billing
  worker, so on the test app nothing posts. The "Needs check" message only lists records
  that failed to post, not records that were never tried.
- To decide: start the worker with the test app (or a "Post now" button for the test app),
  and have "Needs check" show when posting last ran.

**2. Move-out is blocked at the final meter readings.** *Corrected 17/11/2026, round 2:
this happens only when the Customer moves in and hands back on the same day. The database
(`20261007_72_final_utility_invoice.py`) takes the first reading of a new meter as the start
reading, and refuses when that reading is not before the hand-back day. With a later hand-back
the start reading is found. What stays: a same-day move-out cannot finish step 3 and so cannot
reach the Final Settlement, and the message sends staff to Utilities, which cannot help. Severity
Low. The original notes below are kept as they were written.*
- Steps: new Unit with new meters (first reading 0 on 17/11/2026), new Lease, sign, move-in,
  terminate, hand back, then "Record final readings".
- Seen: the dialog has no box to type a reading. It says "No earlier reading of this meter"
  although the first reading exists. Saving gives "A meter has no starting reading for this
  Lease. Record it in Utilities, then try again." The Utilities screen has no way to do
  that; only the old "Earlier forms" have "Utility baseline", which needs internal
  reference codes.
- Effect: the Final Settlement cannot be finished (it waits for step 3), so the Security
  Deposit cannot be settled.
- Cause to confirm: the new Lease and move-in flow never records the move-in (baseline)
  meter readings for the Lease.

**3. A payment can be reversed only in the old forms, with internal codes, in 3 steps.**
- The Receipt and the payment confirmation say "a Manager reverses it with a reason", but no
  screen has a Reverse button.
- The only way: Payments › Earlier forms, paste the payment's reference code (it is only in
  the browser address bar), then reverse the Allocation, then the Credit, then the Payment,
  each with its own code and reason.
- The money was right afterwards: Invoice INV260024 owed $200.00 again, Credit $0.00,
  Receipt RCP260025 marked REVERSED, the Payments total left it out. The audit log has all
  3 steps with the reason.

### Medium

**4. Bank reconciliation shows the wrong month.** Assets and cash › Bank and cash: the Month
box shows November 2026, but the statement is "on 31/01/2026" and lists a January entry.

**5. Home says the exchange rate is missing when it is not.** Home: "The ABA exchange rate
has not been loaded yet." Receive payment, at the same time: "ABA sell rate · Automatic,
17/11/2026 15:02 · 4,012 ៛".

**6. Internal codes in History.**
- Customer page History: `payment_allocation.posted`, `receipt.issued`,
  `payment.confirmed`, `lease.signing_outcome.recorded`, `deposit.receipt.recorded`.
- Move-out History headings: "move in", "signer.sign", "sign", "draft", and "Every Signer
  signed the paper Lease" twice.
- Audit log wording: "Lease move out final inputs record".

**7. A reversed Receipt looks normal on the Customer page.** "Latest Receipts" lists RCP260025
$250.00 with no "Reversed" mark. The Receipt page and the Payments list do mark it.

**8. "No Lease now" on Units that have a Lease.** Utilities › Meter readings shows "No Lease
now." for T901 and U301, which had active Leases. It seems to mean "no Lease on the reading
day", which the words do not say.

### Low

9. New Lease, "What will be billed": it leaves out the part-month Service ($2.33 for Trash)
   that the signing step then adds to the first money ($662.33).
10. A Quotation for 5 Mattresses is saved with only 4 in stock. It is stopped later, at
    "Customer signed". A warning on the Quotation would save a wasted printout.
11. Error summary wording differs: "Fix 1 thing(s) before recording." (Receive payment) and
    "Fix 1 thing:" (Quotation).
12. The Receipt says "RECEIVED BY CHETANA Owner (Staff)": the Owner is labelled Staff.
13. Unit History shows records of the same minute out of order ("Rent and Services changed"
    above "Unit created").
14. Earlier forms, payment view: "Original channel reference: Not recorded" for a bank
    transfer whose reference TEST-BT-0001 is on the Receipt.
15. The browser tab title is always "Property Rental Management": not the page name, and
    not the app name of DL-074 ("CHETANA Residence Management"). WCAG 2.2 asks for a title
    per page (2.4.2).
16. Units list: U102 shows an empty "Reserved until" line under its status.
17. Users and access: the Owner's "Two-step sign-in" column says "Needed", which can be read
    as "not set up yet".
18. Audit log: the "Record" column is "—" on every row.
19. Question, not a finding: the Customers search says "Search by name, phone, Unit or ID
    number". DL-074 says the top bar search never searches ID numbers. Does that rule also
    cover the Customers list?

## 4. Checked and correct

- **Customer.** Empty save: both required fields marked with how to fix. Same ID number
  again: "Another Customer already has this ID number or passport number" with a link to
  the existing Customer. Edit saved and shown in History.
- **Unit.** Unit T901 saved with a default Rent of $450.00 and the required Service. Meter
  serials filled in by themselves (MEL2026001, MWA2026001), Unit filled in from the page.
- **Lease amounts.** Start 17/11/2026: Initial Rent $450.00 × 14 ÷ 30 = $210.00; Trash
  $5.00 × 14 ÷ 30 = $2.33; Security Deposit $450.00; total $662.33. Due date 22/11/2026.
  All correct.
- **Signing.** Without the tick and the method: two clear errors. With them: one step, Unit
  Occupied, Receipt RCP260023, Invoice INV260023 paid, Deposit $450.00 held.
- **Quotation.** A price above the list price is refused. Signing is refused when stock is
  short. Declining needs a reason. QT260004 made Invoice INV260024 ($300.00) and took 1
  Mattress from stock.
- **Payments.** $100.00 paid part of INV260024. $250.00 paid the other $200.00 and made
  $50.00 Credit, shown before saving. A bank transfer without a reference is refused. A
  double click on "Receive payment" made one Receipt only.
- **Totals.** Invoices: paid $3,678.14 + unpaid $370.00 = $4,048.14. Payments: the cards add
  up to $2,918.09 with the reversed payment left out.
- **Termination and hand-back.** Early termination needs evidence and a reason. Hand-back
  set T901 to Cleaning. The Final Settlement draft lists the unpaid $200.00 and keeps the
  Security Deposit for an early termination, as the rule says.
- **Pop-ups.** The confirmation panel dims the page behind it (rule 7).

## 5. Not tested in this round

- **Permissions** (rule 13g): only the Owner account exists. A staff account is needed.
- **Meter readings, the billing run and late charges**: the reading list opens on 24/11/2026,
  billing runs on 25/11/2026.
- Reservations, viewing requests, short stays, expenses and supplier bills, Month-end close,
  Reports figures, Telegram.
- Printing (the print window stops the test browser).
- No internet, slow network, session expiry, keyboard-only use (rules 12, 13d, 13e, 13h, 14).
- Real devices: iPad Pro 13-inch, the 15-inch 4K laptop, the 27-inch monitor.
- Rule 22 (2560 px cap): not built yet, and the screen check does not test it.
- The screen check covers 33 screens. About 16 more screens (for example the Customers,
  Units and Leases lists) are not in `frontend/e2e/screens.ts` yet.

## 6. Test data left in the database

Money records cannot be deleted, so these stay. All start with TEST or belong to the TEST
Customer.

| Record | State |
|---|---|
| Customer TEST Lim Sophea | Lease terminated |
| Unit T901 (Floor 3), meters MEL2026001 and MWA2026001 | Cleaning |
| Lease T901L0011 | Terminated 17/11/2026; move-out stopped at step 3; Final Settlement started |
| Invoice INV260023 ($212.33) | Paid |
| Invoice INV260024 ($300.00) | $200.00 owed |
| Receipts RCP260023 ($662.33), RCP260024 ($100.00) | Valid |
| Receipt RCP260025 ($250.00) | Reversed |
| Quotations QT260003 (declined), QT260004 (signed) | Closed |
| Stock: 1 Mattress out of W001 · Pallet Racking 1 (SM260005) | Taken |

## 7. Round 2 (17/11/2026, evening): billing worker and staff account

Owner's answers of 17/11/2026: the test app starts the billing worker; a staff account is
added to test what staff are not allowed to do; previews in the order 2, 1, 3.

### Billing worker

- New `scripts/local/billing-worker.sh`, started by `start-test-app.sh`. It finds the
  Property's billing service principal, then runs `property-rental-scheduled-billing` every
  60 seconds (billing runs that are due, late charges, posting to the books, leavers). Log:
  `.local/billing.log`. README "Local run on the Mac mini" says so.
- First pass: 1 catch-up Utility run (period of 28/10/2026, no new Invoice), 0 late charges,
  **107 money records posted to the books**, 0 in Needs check.
- After it: Home shows Cash & bank $7,772.14 and Profit this year $4,648.14. The Balance
  sheet balances ($8,342.14 both sides) and the Profit and loss matches it. Cash & bank equals
  all payments received ($7,176.14, all months) plus the Owner's capital, less what was paid
  out. (The Payments page opens on "This month", which is why it showed $2,918.09.)
- **Finding 1 is fixed for the test app.** What stays open: "Needs check" says "Every money
  record is in the ledger" even when posting has not run. It should say when posting last ran.

**New finding (High): the office server does not run the billing worker either.**
`config/deployment/host` has services for backups, the off-host copy, the daily check, log
retention and Telegram, but none for `property-rental-scheduled-billing`. On the office
server the Rent and Utility runs on the 25th, the late charges and posting to the books
would never happen. To confirm against the deployment plan (V1-059) before go-live.

### Staff account

- Added in Users and access: "TEST Staff Dara", username `teststaff1`, role Staff, no
  two-step sign-in (Staff do not need it). The first sign-in asked for a new password, as it
  should. The new password is in `.local/test-staff-password` (owner only, not in git).
- **Menu:** Staff see Home, Payments, Invoices, Utilities, Leasing, Property, Ledger (Expense
  requests only), Reports and Telegram. They do not see Approvals, Audit log, Staff, Users and
  access or Settings. Home has no Financial summary.
- **Pages opened by address:** Approvals, Journal entries, Financial statements, Month-end
  close, Audit log, Employees, Users and access and Settings all show "Your account cannot
  use this page. Ask the Owner if you need it." with "Go to Home" (rule 13g passes).
- **Buttons:** no "New Unit", no "Terminate Lease"; Expense requests say "You send Expense
  requests and reports. You cannot approve or pay money."
- **Server, called directly as Staff:** the user list, the audit log and a payment reversal
  context answer 403 Forbidden; adding a user answers 403 Forbidden. The server, not only the
  screen, refuses.
- **Question:** Staff can "Deactivate" a Customer. Should that be a Manager action?
- **Low:** for a payment reversal sent as Staff with a made-up payment number the server
  answers 404 (not found) before it answers 403, so it tells Staff whether a number exists.

## 8. Fix 3 built: reverse a payment from its Receipt (DL-245)

Owner's answers of 17/11/2026: the order 3, 1, 2; one server command, all or nothing.

- **Server:** `POST /api/v1/payments/{payment_id}/full-reversal` (`payment_full_reversal.py`,
  route in `allocation_receipt_api.py`). It reads the payment's links; anything other than
  Allocations and unused Credit is refused with `PAYMENT_REVERSAL_BLOCKED` before anything is
  written. Then one database transaction runs the existing commands: each Allocation, each
  Credit, then the payment. Keys derived from the request's key make a second send reverse once.
  Needs `payments.reverse`, `payments.allocations.reverse` and `credits.reverse`. No migration.
- **Screens:** "Reverse payment" on the Receipt page (Managers and the Owner), with the window of
  the preview; "Reversed" on the Customer page's Latest Receipts (finding 7).
- **Docs:** DL-245 in `docs/010_DECISION_LOG.md`; an amendment under UI-073 in
  `docs/006_UI_SPECIFICATION.md`.
- **Tests:** `backend/tests/test_payment_full_reversal.py` (rights, order on one connection,
  replay keys, refusals, nothing committed on a failed step, read errors); the route added to
  `backend/tests/test_allocation_receipt_api.py`; four Receipt page tests in
  `frontend/src/payments/PaymentsList.test.tsx`.
- **Tried in the test app (17/11/2026, 19:34):** RCP260024 ($100.00 cash) reversed with the new
  button. INV260024 owes $300.00 again; the Receipt and the Customer page show "Reversed"; the
  books have JE260117 and JE260118; the audit log has both steps with the reason. Signed in as
  Staff, the Receipt shows no "Reverse payment". The screen check passes for the Receipt at all
  8 sizes. A first try showed the window cut off on the right (a table with a 640 px minimum in a
  560 px window); it now uses the same list as the payment confirmation.
- **Full backend suite:** 5,501 passed. The 5 failures were from this change and are fixed (the
  route list, the local scripts list, the Khmer refusal words, the traceability manifest), except
  `test_the_owner_set_up_says_whether_the_owner_was_made`, which tests owner set-up scripts this
  change did not touch.
- **Still to do:** a native Khmer check of the new words.

## 9. Fix 1 built: the books say when they were last updated (DL-246)

- **Database:** migration `20270808_431` adds `app.gl_posting_status` (one row per Property,
  replaced by each posting pass) and `app.gl_record_posting_pass` (money login). Forward-only; no
  data changed. Applied to the local database on 17/11/2026 21:00; the first row was written by a
  worker pass at 21:00:40.
- **Worker:** each posting pass records its time and counts (`ledger_posting_job.py`).
- **Server:** Needs check returns `meta.last_pass` and `meta.max_age_minutes`; a pass is stale
  after `APP_LEDGER_POSTING_MAX_AGE_MINUTES` (default 1,560; the test app sets 10 in
  `start-api.sh`). Documented in `docs/V1_059_OPERATIONS_RUNBOOK.md`.
- **Screens:** Needs check shows "Books updated {time}", or a warning when the books are behind or
  were never updated; "Every money record is in the ledger" is no longer said. Home's Financial
  summary shows the same line and warning.
- **Tests:** database tests in a throwaway PostgreSQL (3 passed), the posting job and API tests,
  three Needs check states in `LedgerPage.test.tsx`; the migration head pins moved to 431 in 27
  test files, as for every migration.
- **Office server (separate change, owner's approval):** `config/deployment/host/prm-billing-worker.service`
  and `.timer` run the worker every 5 minutes as `prm-ops`; set-up steps in the runbook.
  `scripts/validate-deployment-config.py check-examples` passes; 44 deployment tests pass. Open:
  the booking sites' calendars need HTTPS to hosts other than Telegram.
- **Still to do:** see it in the app after the API restarts; a native Khmer check of the new
  words.

## 10. Fix 2 built: same day, no Utility charge (DL-247)

- **Database:** migration `20270809_432` patches the Final Settlement preview and Home in place:
  a hand-back on or before the Lease Start Date needs no final readings and no final Utility
  Invoice. Forward-only; no data changed. Applied to the local database on 17/11/2026.
- **Screen:** step 3 of the move-out is Done with "Moved in and handed back on {day}: there is no
  day of electricity or water to bill …", and offers no button.
- **Tried in the test app:** Lease T901L0011 (TEST Lim Sophea) now shows step 3 Done; the Final
  Settlement waits only for the cleaning charge and the kept Deposit, as it should.
- **Tests:** database tests in a throwaway PostgreSQL (4 passed with fix 1's); a move-out page
  test; head pins moved to 432.
- **Still to do:** a native Khmer check of the new words.

## 11. Changes made for this test

- `frontend/e2e/screens.ts`: three sizes added (1024 × 768, 2560 × 1440, 5120 × 1440).
- `scripts/local/billing-worker.sh` (new), `scripts/local/start-test-app.sh` and `README.md`:
  the test app starts the billing worker.
- Database: the staff user "TEST Staff Dara" and the ledger entries posted by the worker.
- Local only, not in git: the packages already listed in `frontend/package-lock.json` were
  installed, and the Chromium build that Playwright needs was downloaded.
- Nothing is committed.
