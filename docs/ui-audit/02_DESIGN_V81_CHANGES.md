# 02 Design v81 changes

Date 07/11/2026. Branch `ui-v81`.

## Where the design is

- Design v81 (clickable): https://claude.ai/artifact/CLyBzHBQEb9HQrPQMpLDqv (new link, so the v80 link stays as it was).
- File: `/mnt/project-files/ui-design/chetana-app-v81.html`. Mock-up v80 is unchanged at `/mnt/project-files/ui-design/chetana-app.html` and https://claude.ai/artifact/88HdZkSvKAKHmzPEDpUW71.
- Source: `/mnt/project-files/ui-design/round4-source/app42.js` and `i18n42.js` (build.py loads them after round 36). v81 was found in the same place as v80, so nothing was saved under `docs/ui-audit/design/`.
- Check run on v81: every menu screen, tab, 66 record pages and 146 buttons and dialogs, in English and Khmer, at 1180 and 390 wide. No script errors and no missing words.

## What changed

1. **Wording.** The A1 review (03_WORDING_REVIEW.md) applied to the design: 148 design texts changed (list below). Ledger names 1100/1110 Accounts receivable, 2210 Unapplied payments, 3900 Retained earnings. Khmer is not changed except the new words, which are marked `// new` in the source.
2. **Sub-tab rule (B2).** Settings (and any list page with more than one table) shows a sub-tab row. Record pages (Lease, Customer, Unit, Employee, Reservation) stay on one page, as the owner asked on 07/11 07:55 (see 8). Settings sub-tabs: "Details" (records) or "General" (Settings) first, holding the cards, then one sub-tab per table with a count badge. Number cards stay above. A page with one table and no cards has no sub-tab row. Pills on desktop, one scrolling row on a phone. The chosen sub-tab is kept in the address (`#unit?tab=t1`) and does not add a Back step. Keyboard: arrow keys, Home and End.
3. **Back rule (B3).** The Back link reads "Back to X" (the page you came from). It returns to that page with its tab, filters and scroll place. Opened directly, it goes to the parent list. The browser Back button does the same, and closes an open drawer first. Changing a section tab or sub-tab adds no history step.
4. **Drawer forms (B2).** Add and Edit forms open as a right drawer (full-screen sheet at 640 px or less), with the Save row fixed at the bottom. Closing with changes asks first. Confirm dialogs without fields stay in the middle.
5. **Audit log Export.** One "Export" button; the dialog asks Excel (.xlsx) or PDF.
6. **Items the app already has**, now in the design: riel bank 1021 (Bank and cash sub-tab with "Riel in the bank" and the ABA riel statement match), the riel account per Payment Method, the riel amount for a Refund paid from 1021 in Needs check, and the Short stays Quotes tab.
7. Footer and banner say "Design v81".
8. **Owner changes after Part A (07/11 07:55).**
   - Record pages stay on one page, no sub-tabs. The History card shows the latest 5 with a "History" button to a full History page. Customer: Latest Receipts shows 5 with "All Receipts"; Customer statement shows only the balance due with "Full statement". Unit and Lease work the same way.
   - Buttons stay short: a role badge never sits inside a button. "Reduce or waive MANAGER" is now "Adjust charge" with "Manager only" beside it. This applies to every button with a role badge.
   - Short stays: pressing Check out before the booked check-out day shows "Not the check-out date" with "Keep the stay" or "Check out early".

## Not changed in v81 (on purpose)

- Viewing dashboard, Field reports, Birthdays, Guests and the collapsible menu stay in the design but are not built (owner: do not build them now). The app will not show them.
- Dates stay dd/mm/yyyy (see Open question 1 in 03).
- Export buttons cannot save a file inside the artifact viewer. This is a mock-up limit only.

## Before and after

### 1. Home

Banner now says design v81; menu, cards and to-do list keep the 02/11 words.

| Before (v80, 1280) | After (v81, 1280) |
|---|---|
| ![01-home before 1280](screenshots/design-v81/01-home-before-1280.png) | ![01-home after 1280](screenshots/design-v81/01-home-after-1280.png) |

Phone (v81, 375): ![01-home after 375](screenshots/design-v81/01-home-after-375.png)

### 2. Unit record (U101)

"Back to Units" instead of "Back". The record stays on one page; the History card shows the latest 5 with a History button (owner 07/11 07:55).

| Before (v80, 1280) | After (v81, 1280) |
|---|---|
| ![02-unit-record before 1280](screenshots/design-v81/02-unit-record-before-1280.png) | ![02-unit-record after 1280](screenshots/design-v81/02-unit-record-after-1280.png) |

Phone (v81, 375): ![02-unit-record after 375](screenshots/design-v81/02-unit-record-after-375.png)

### 3. Settings

First tab renamed General (sub-tab rule); General holds the settings cards, each table (Business rules, Problem types, Payment Methods, Document numbering) gets its own sub-tab.

| Before (v80, 1280) | After (v81, 1280) |
|---|---|
| ![03-settings before 1280](screenshots/design-v81/03-settings-before-1280.png) | ![03-settings after 1280](screenshots/design-v81/03-settings-after-1280.png) |

Phone (v81, 375): ![03-settings after 375](screenshots/design-v81/03-settings-after-375.png)

### 4. Ledger, Bank and cash

Pills become sub-tabs: ABA USD account (1020), ABA KHR account (1021), Cash count. New 1021 sub-tab: Riel in the bank, month-end rate, value in dollars, exchange gain or loss (4100), and the ABA riel statement match.

| Before (v80, 1280) | After (v81, 1280) |
|---|---|
| ![04-bank-and-cash before 1280](screenshots/design-v81/04-bank-and-cash-before-1280.png) | ![04-bank-and-cash after 1280](screenshots/design-v81/04-bank-and-cash-after-1280.png) |

Phone (v81, 375): ![04-bank-and-cash after 375](screenshots/design-v81/04-bank-and-cash-after-375.png)

### 5. Ledger, Needs check

New "Refunds paid from the riel account" list: "Enter the riel paid for this Refund". Payment Method accounts table gets a "Riel account" column (ABA PAY and KHQR use 1021).

| Before (v80, 1280) | After (v81, 1280) |
|---|---|
| ![05-needs-check before 1280](screenshots/design-v81/05-needs-check-before-1280.png) | ![05-needs-check after 1280](screenshots/design-v81/05-needs-check-after-1280.png) |

Phone (v81, 375): ![05-needs-check after 375](screenshots/design-v81/05-needs-check-after-375.png)

### 6. Short stays, Quotes

Before: the short-stay quotes list sat under Invoices › Quotations. After: its own Quotes tab in Short stays, as in the app.

| Before (v80, 1280) | After (v81, 1280) |
|---|---|
| ![06-short-stay-quotes before 1280](screenshots/design-v81/06-short-stay-quotes-before-1280.png) | ![06-short-stay-quotes after 1280](screenshots/design-v81/06-short-stay-quotes-after-1280.png) |

Phone (v81, 375): ![06-short-stay-quotes after 375](screenshots/design-v81/06-short-stay-quotes-after-375.png)

### 7. Audit log, Export

One "Export" button (was "Export audit" with an ALL CAPS badge). The dialog asks Excel (.xlsx) or PDF.

| Before (v80, 1280) | After (v81, 1280) |
|---|---|
| ![07-audit-log-export before 1280](screenshots/design-v81/07-audit-log-export-before-1280.png) | ![07-audit-log-export after 1280](screenshots/design-v81/07-audit-log-export-after-1280.png) |

Phone (v81, 375): ![07-audit-log-export after 375](screenshots/design-v81/07-audit-log-export-after-375.png)

### 8. Employees and payroll, Attendance

Staff use Clock-in and Clock-out (owner decision 4); guests keep Check-in and Check-out.

| Before (v80, 1280) | After (v81, 1280) |
|---|---|
| ![08-attendance before 1280](screenshots/design-v81/08-attendance-before-1280.png) | ![08-attendance after 1280](screenshots/design-v81/08-attendance-after-1280.png) |

Phone (v81, 375): ![08-attendance after 375](screenshots/design-v81/08-attendance-after-375.png)

### 9. Add and Edit form

Forms open as a right drawer (full-screen sheet on a phone). Closing with changes asks "Discard your changes?" with Keep editing or Discard.

| Before (v80, 1280) | After (v81, 1280) |
|---|---|
| ![09-edit-form before 1280](screenshots/design-v81/09-edit-form-before-1280.png) | ![09-edit-form after 1280](screenshots/design-v81/09-edit-form-after-1280.png) |

Phone (v81, 375): ![09-edit-form after 375](screenshots/design-v81/09-edit-form-after-375.png)

### Customer record

One page. Statement shows the balance due and "Full statement"; Latest Receipts shows 5 and "All Receipts"; History shows 5 and "History".

| v81, 1280 | v81, 375 |
|---|---|
| ![10-customer-record 1280](screenshots/design-v81/10-customer-record-after-1280.png) | ![10-customer-record 375](screenshots/design-v81/10-customer-record-after-375.png) |

### Lease record

Signers, Occupants and History together on one page; History shows the latest 5 and a History button.

| v81, 1280 | v81, 375 |
|---|---|
| ![11-lease-record 1280](screenshots/design-v81/11-lease-record-after-1280.png) | ![11-lease-record 375](screenshots/design-v81/11-lease-record-after-375.png) |

### Late-payment charge button

"Adjust charge" with "Manager only" beside the button.

| v81, 1280 | v81, 375 |
|---|---|
| ![12-late-charge-button 1280](screenshots/design-v81/12-late-charge-button-after-1280.png) | ![12-late-charge-button 375](screenshots/design-v81/12-late-charge-button-after-375.png) |

### Short stay early check-out

Warning before checking out a paid stay before its check-out day.

| v81, 1280 | v81, 375 |
|---|---|
| ![13-early-checkout-warning 1280](screenshots/design-v81/13-early-checkout-warning-after-1280.png) | ![13-early-checkout-warning 375](screenshots/design-v81/13-early-checkout-warning-after-375.png) |

## Wording changed in the design (v80 → v81)

| Key | v80 | v81 |
|---|---|---|
| `mgr_badge` | MANAGER | Manager |
| `cu_former` | Former tenant | Past tenant |
| `rv_5` | Utilities, Meter readings. Type a number lower than the last reading, then a very high one. Type 302 in the Unit box. Try 6 months, then Import and Use the sample file. | Utilities, Meter readings. Enter a number lower than the last reading, then a very high one. Enter 302 in the Unit box. Try 6 months, then Import and Use the sample file. |
| `rv_9` | Payments. Check the eight cards at the top. Tap a card to show only those payments. Try All, This month, Last month and Pick dates. | Payments. Check the eight cards at the top. Tap a card to show only those payments. Try All, This month, Last month and Choose dates. |
| `ni_w4` | Everything is saved in History. | Everything is saved in the audit log. |
| `ni_dlg_c` | The Customer does not owe it until a Manager issues it. This is saved in History. | The Customer does not owe it until a Manager issues it. This is saved in the audit log. |
| `ut_unit_bad` | No Unit "{0}". Type U101 to U406, or clear the box to see all Units. | No Unit "{0}". Enter U101 to U406, or clear the box to see all Units. |
| `im_mock` | Mock-up: the check uses sample rows, not the file you pick. | Mock-up: the check uses sample rows, not the file you choose. |
| `im_note` | Each reading is checked again when it is saved, the same as typing it in. This is saved in History. | Each reading is checked again when it is saved, the same as entering it in. This is saved in the audit log. |
| `mt_report_c` | Its readings stop being used. Use from the day after the last good reading ({0}) will be estimated once a new meter is in. Replace it before reading day {1}. This is saved in History. | Its readings stop being used. Use from the day after the last good reading ({0}) will be estimated once a new meter is in. Replace it before reading day {1}. This is saved in the audit log. |
| `mt_replace_c` | {0} stops on the day before. It stays in the history. The new meter is used from the day it is put in. A Manager approves the estimate before it is billed. This is saved in History. | {0} stops on the day before. It stays in the history. The new meter is used from the day it is put in. A Manager approves the estimate before it is billed. This is saved in the audit log. |
| `es_lock` | The app works this out. Nobody can type an estimate. | The app works this out. Nobody can enter an estimate. |
| `u_edit_note` | Changes are dated and kept in History. The Unit number cannot change. | Changes are dated and kept in the audit log. The Unit number cannot change. |
| `u_inv_note` | Type the number of each item in the Unit. 0 removes it from the list. | Enter the number of each item in the Unit. 0 removes it from the list. |
| `rp_staff_note` | Staff see the operational reports only. Money totals, audit and exports are for the Owner and Managers (V1-057). | Staff see the operational reports only. Money totals, audit and exports are for the Owner and Managers. |
| `ex_logged` | Every export is written to History with who, when and which filters. Small files are not kept; big files are kept 24 hours. | Every export is written to the audit log with who, when and which filters. Small files are not kept; big files are kept 24 hours. |
| `ex_toast` | {0} exported as {1} and written to History. | {0} exported as {1} and written to the audit log. |
| `hi_export` | Export audit | Export |
| `hi_note` | Each search here is itself written to History (V1-057). Record pages show the same events for one record. | Each search here is itself written to the audit log. Record pages show the same events for one record. |
| `ev_signin_mfa` | Signed in with MFA code | Signed in with two-step sign-in |
| `se_sub` | Changed by the Owner, or by a user the Owner allows. Every change is dated and kept in History. | Changed by the Owner, or by a user the Owner allows. Every change is dated and kept in the audit log. |
| `se_signin_2` | Owner and Managers must use a second code (MFA app), with recovery codes kept safe. | Owner and Managers must use two-step sign-in, with recovery codes kept safe. |
| `se_user_note` | The new user sets a password at first sign-in. Owners and Managers must also set up the MFA app. | The new user sets a password at first sign-in. Owners and Managers must also set up two-step sign-in. |
| `rs_note` | This is the usual price. Staff may change the price on an Invoice. A new price here is used for new Invoices only; Invoices already made never change. Every change is kept in History. | This is the usual price. Staff may change the price on an Invoice. A new price here is used for new Invoices only; Invoices already made never change. Every change is kept in the audit log. |
| `no_prefix` | Letters | Prefix |
| `lt_waived_s` | No charge is owed. The reason is kept in History. | No charge is owed. The reason is kept in the audit log. |
| `au_fact2` | Owner and Managers also type a code from their phone. | Owner and Managers also enter a code from their phone. |
| `au_e_user` | Type your username. | Enter your username. |
| `au_e_pw` | Type your password. | Enter your password. |
| `au_code_s` | Open the authenticator app on your phone and type the 6-digit code for CHETANA. | Open the authenticator app on your phone and enter the 6-digit code for CHETANA. |
| `au_e_code` | Type the 6 digits from your phone. | Enter the 6 digits from your phone. |
| `au_e_code_bad` | That code is not right. Type the newest code from your phone. | That code is not right. Enter the newest code from your phone. |
| `au_e_rc` | Type a recovery code, like 7KQ4-M2XD. | Enter a recovery code, like 7KQ4-M2XD. |
| `au_fg_lost` | Lost both your phone and your recovery codes? Only the server emergency procedure can help. It is done on the office computer itself, by the person who set the app up. | Lost both your phone and your recovery codes? Only the emergency reset can help. It is done on the office computer itself, by the person who set the app up. |
| `au_np_change` | Type your current password, then your new one. | Enter your current password, then your new one. |
| `au_new2` | Type the new password again | Enter the new password again |
| `au_e_cur` | Type your current password. | Enter your current password. |
| `au_su_key` | Cannot scan? Type this key instead: | Cannot scan? Enter this key instead: |
| `au_su_3` | Type the 6-digit code the app shows. | Enter the 6-digit code the app shows. |
| `au_mock_h` | Any username from Settings, Users and any password work. Type “wrong” as the password to see the error. Codes: any 6 digits; 000000 is wrong. | Any username from Settings, Users and any password work. Enter “wrong” as the password to see the error. Codes: any 6 digits; 000000 is wrong. |
| `ur_conseq` | {0} is signed out everywhere at once. This is written to History. | {0} is signed out everywhere at once. This is written to the audit log. |
| `im_e_empty` | Empty. Type the reading. | Empty. Enter the reading. |
| `n_letters` | Letters due | Notices due |
| `tip_letter` | Open Letters | Open Notices |
| `ap_rule` | The person who prepared a draft may also confirm it only if they have approval rights. Both names are kept in History. | The person who prepared a draft may also confirm it only if they have approval rights. Both names are kept in the audit log. |
| `ltc_due` | Letters due | Notices due |
| `lt_d_no` | Letter number | Notice number |
| `pb_conf_b` | Chan Dara saved a change to {0} at {1}, while you were editing it. Your change was not saved. What you typed is kept below. | Chan Dara saved a change to {0} at {1}, while you were editing it. Your change was not saved. What you entered is kept below. |
| `pb_conf_yours` | You typed | You entered |
| `lt_due_t` | Letters not given yet | Notices not given yet |
| `mr_worker_h` | Type the name: staff or an outside repairer. | Enter the name: staff or an outside repairer. |
| `mg_e_worker` | Type who does the work. | Enter who does the work. |
| `vs_body` | The request is hidden from the open list but kept in History. | The request is hidden from the open list but kept in the audit log. |
| `l13_err_name` | Type a name. | Enter a name. |
| `l13_err_price` | Type a price above $0.00. | Enter a price above $0.00. |
| `ft_note` | Remove works only while no feature uses the type. Every change is kept in History. | Remove works only while no feature uses the type. Every change is kept in the audit log. |
| `uf_note` | Feature types come from the Feature types list. Remove works only while no Unit uses the feature. Every change is kept in History. | Feature types come from the Feature types list. Remove works only while no Unit uses the feature. Every change is kept in the audit log. |
| `iv13_note` | Where lists this Unit's own features. Each save is dated and kept in History. | Where lists this Unit's own features. Each save is dated and kept in the audit log. |
| `n13_pick` | Pick a Regular service… | Choose a Regular service… |
| `n13_svc_note` | The price comes from Settings › Regular services and cannot be typed here. A Manager changes a price only in Settings. | The price comes from Settings › Regular services and cannot be entered here. A Manager changes a price only in Settings. |
| `n13_dmg_intro` | A Damage charge always comes from a finding: pick one below. The finding is the proof. | A Damage charge always comes from a finding: choose one below. The finding is the proof. |
| `n13_e_find` | Pick the finding to bill. | Choose the finding to bill. |
| `day_unreal` | This is not a real day. Type it as dd/mm/yyyy, for example 28/02/2026. | This is not a real day. Enter it as dd/mm/yyyy, for example 28/02/2026. |
| `n18_svc_pick` | Pick a Regular service… | Choose a Regular service… |
| `r18_refused` | Refused: {0} | Rejected: {0} |
| `p19_sugg_from_typed` | typed by {0} | entered by {0} |
| `p19_cost_e` | Type a cost above $0.00. | Enter a cost above $0.00. |
| `p19_e_name` | Type the name in English. | Enter the name in English. |
| `p19_e_price` | Type a price above $0.00. | Enter a price above $0.00. |
| `sm_sale_note` | A Sale is never typed here. It is made by the app when the Customer signs a Quotation and the Invoice is issued. A voided Invoice puts the items back. | A Sale is never entered here. It is made by the app when the Customer signs a Quotation and the Invoice is issued. A voided Invoice puts the items back. |
| `sm_e_qty` | Type a whole number from 1 to 999. | Enter a whole number from 1 to 999. |
| `sm_e_cost` | Type the cost for one. | Enter the cost for one. |
| `sm_e_ref` | Type the receipt or shop. | Enter the receipt or shop. |
| `sm_e_reason` | Type the reason. | Enter the reason. |
| `lc_e` | Type a name. | Enter a name. |
| `lc_unit_note` | Locations are never typed. A Location is a Unit and one of its places, so the name and the Unit can never disagree. | Locations are never entered. A Location is a Unit and one of its places, so the name and the Unit can never disagree. |
| `q19_new_sub` | Pick products. Price comes from Products. The Customer signs the printed Quotation, then the Invoice is issued. | Choose products. Price comes from Products. The Customer signs the printed Quotation, then the Invoice is issued. |
| `se20_units_n` | Counted from the Units list each time. Never typed. | Counted from the Units list each time. Never entered. |
| `se20_e_name` | Type a name. | Enter a name. |
| `nr_letters` | Letters | Prefix |
| `pb21_e_name` | Type the product name. | Enter the product name. |
| `br_e_val` | Type a value that fits the unit. | Enter a value that fits the unit. |
| `br_e_date` | Type a real date, dd/mm/yyyy. | Enter a real date, dd/mm/yyyy. |
| `br_e_name` | Type the rule name. | Enter the rule name. |
| `ro_e_name` | Type the role name. | Enter the role name. |
| `pm_APPR_OPEN` | Open Waiting for approval | Open Approvals |
| `gl_newest` | Newest {0} entries. Pick a month to see all of it. | Newest {0} entries. Choose a month to see all of it. |
| `gl_x_e_sup` | Type the supplier. | Enter the supplier. |
| `gl_x_e_amt` | Type the amount. | Enter the amount. |
| `gl_bc_1` | Customer debt (1100) equals the unpaid Invoices | Accounts receivable (1100) equals the unpaid Invoices |
| `er_c_wait` | Waiting for approval | Pending approval |
| `er_e_amt` | Type the amount. | Enter the amount. |
| `er_e_date` | Type a date as dd/mm/yyyy, not after today. | Enter a date as dd/mm/yyyy, not after today. |
| `er_st_WAIT` | Waiting for approval | Pending approval |
| `gl_k_MOVE` | Money moved | Fund transfer |
| `gl26_e_date` | Type a date as dd/mm/yyyy, in an open month and not after today. | Enter a date as dd/mm/yyyy, in an open month and not after today. |
| `fa_e_name` | Type the item name. | Enter the item name. |
| `fa_e_life` | Type the number of years, 1 to 50. | Enter the number of years, 1 to 50. |
| `bu_edit_n` | Tap an account to type its amounts for each month. | Tap an account to enter its amounts for each month. |
| `bk_stmt_h` | Type the closing balance printed on the ABA statement. | Enter the closing balance printed on the ABA statement. |
| `cc_e_all` | Type what you counted in every box. | Enter what you counted in every box. |
| `aj_st_VOID` | Not approved | Rejected |
| `gl_r_sub` | Made from the journal entries. Pick a statement and a month. | Made from the journal entries. Choose a statement and a month. |
| `gl_r_ar` | Customer debt aging | Accounts receivable aging |
| `ag_ar_check` | Total equals Customer debt (1100 + 1110): {0}. | Total equals Accounts receivable (1100 + 1110): {0}. |
| `cl_books_d` | Every record has its entry, every entry is balanced, Customer debt equals the unpaid Invoices. | Every record has its entry, every entry is balanced, Accounts receivable equals the unpaid Invoices. |
| `ye_sub` | After December is closed, the Owner closes the year. The year's profit moves to 3900 Profit kept from past years. | After December is closed, the Owner closes the year. The year's profit moves to 3900 Retained earnings. |
| `emp_hist_n` | A change adds a new line with its start date and reason. Old lines are never typed over. | A change adds a new line with its start date and reason. Old lines are never entered over. |
| `tq_no` | Refuse | Reject |
| `tq_h_no` | Telegram request from {0} refused. | Telegram request from {0} rejected. |
| `sl_st_VOID` | Not approved | Rejected |
| `mm_n` | For riel, type the riel amount and the rate. The app works out the gain or loss. Petty cash moves only by Top up petty cash. | For riel, enter the riel amount and the rate. The app works out the gain or loss. Petty cash moves only by Top up petty cash. |
| `mm_done` | Money moved. Entry {0}. | Funds transferred. Entry {0}. |
| `mm_e_same` | Pick two different places. | Choose two different places. |
| `mm_e_riel` | Type the riel amount and the rate. | Enter the riel amount and the rate. |
| `at_in` | Check-in | Clock-in |
| `at_out` | Check-out | Clock-out |
| `at_st_noin` | No check-in | No clock-in |
| `at_f_W_h` | For Worked, the app shows Present or Late from the check-in time (late after {0} minutes). | For Worked, the app shows Present or Late from the clock-in time (late after {0} minutes). |
| `at_e_time` | Type the time like 07:05. | Enter the time like 07:05. |
| `at_day_n` | The night shift belongs to the day it starts. Late means the check-in is more than {0} minutes after the shift starts. | The night shift belongs to the day it starts. Late means the clock-in is more than {0} minutes after the shift starts. |
| `at_no` | Refuse | Reject |
| `at_no_t` | Refuse {0} | Reject {0} |
| `at_ot_NO` | Refused | Rejected |
| `at_e_before` | Overtime must be approved before the work. Pick today or a later day. | Overtime must be approved before the work. Choose today or a later day. |
| `at_h_no` | Overtime {0} refused for {1}: {2} | Overtime {0} rejected for {1}: {2} |
| `at_m_no` | Not approved | Rejected |
| `a31_h_acc` | Check-in of {0} on {1} accepted ({2}). | Clock-in of {0} on {1} accepted ({2}). |
| `f31_none` | Nothing needs attention. Every check-in is fine. | Nothing needs attention. Every clock-in is fine. |
| `p31_kind_in` | Check-in | Clock-in |
| `p31_kind_out` | Check-out | Clock-out |
| `q31_n` | Staff check in and out by scanning the QR at a place. The phone must be within {0} of the pin. Check-in opens {1} before the shift. | Staff clock in and out by scanning the QR at a place. The phone must be within {0} of the pin. Clock-in opens {1} before the shift. |
| `q31_area` | Check-in area | Clock-in area |
| `q31_pin_h` | Type the pin like 11.6045, 104.8902 (from Google Maps: press and hold the place). | Enter the pin like 11.6045, 104.8902 (from Google Maps: press and hold the place). |
| `q31_e_pin` | Type two numbers with a comma, like 11.6045, 104.8902. | Enter two numbers with a comma, like 11.6045, 104.8902. |
| `brn_ATT_QR_EARLY` | Earliest check-in | Earliest clock-in |
| `ss_dmg_nod` | Not approved by {0} | Rejected by {0} |
| `ss_e_lbusy` | This unit has a short-stay booking then. The booking stays: pick another unit or a later date. | This unit has a short-stay booking then. The booking stays: choose another unit or a later date. |
| `ss_nod` | Not approved | Rejected |
| `tr_e_time` | Pick a time later than now. | Choose a time later than now. |
| `tr_e_line` | Type one short line for the technician. | Enter one short line for the technician. |
| `tr_e_amt` | Type the amount. | Enter the amount. |
| `tg_c_name` | Name typed | Name entered |
| `tg_c_unit` | Unit typed | Unit entered |
| `tg_ph_try` | Try: {0} typed "{1}", Unit {2}. | Try: {0} entered "{1}", Unit {2}. |
| `tg_e_phone` | Type a phone number. | Enter a phone number. |
| `pr_join_s` | Pick the main report. Only open reports of the same kind are shown: the same Unit for a Unit Problem. | Choose the main report. Only open reports of the same kind are shown: the same Unit for a Unit Problem. |
| `pr_e_name` | Type the name. | Enter the name. |
