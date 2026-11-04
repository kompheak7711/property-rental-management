// General Ledger phase 6 step 6: the words of the ledger screens, in English and Khmer, from
// the mock-up (i18n22.js, i18n26.js, i18n29.js, i18n34.js). Khmer marked "new" is not in the
// mock-up and needs the native check, like every Khmer text before the app is used.

import type { Language } from "../signInText";
import type { AccountType } from "./ledgerClient";

const TEXT = {
  loading: ["Loading…", "កំពុងផ្ទុក…"],
  failed: [
    "This list could not be read just now.",
    "មិនអាចអានបញ្ជីនេះបានទេឥឡូវនេះ។",
  ],
  retry: ["Try again", "សាកម្តងទៀត"],
  no_property: ["Choose the Property first.", "សូមជ្រើសរើសអចលនទ្រព្យជាមុនសិន។"],
  cancel: ["Cancel", "បោះបង់"],
  close: ["Close", "បិទ"],
  save: ["Save", "រក្សាទុក"],
  required: ["Required", "ត្រូវការ"],
  back: ["Back", "ត្រឡប់ក្រោយ"],
  // new
  f_right: [
    "You do not have the right to do this.",
    "អ្នកមិនមានសិទ្ធិធ្វើការនេះទេ។",
  ],
  // new
  f_failed: ["This was not saved. Try again.", "មិនបានរក្សាទុកទេ។ សាកម្តងទៀត។"],
  // new
  f_refused: ["The app refused this: {0}", "កម្មវិធីបានបដិសេធ៖ {0}"],
  // new
  not_found: [
    "This entry is not in the ledger.",
    "ធាតុនេះមិនមាននៅក្នុងសៀវភៅបញ្ជីទេ។",
  ],
  // Journal entries
  j_title: ["Journal entries", "ធាតុទិនានុប្បវត្តិ"],
  j_sub: [
    "Every money record makes its own balanced entry by itself. Entries are never edited; a mistake gets a reversing entry.",
    "កំណត់ត្រាប្រាក់នីមួយៗបង្កើតធាតុដែលមានតុល្យភាពដោយខ្លួនឯង។ ធាតុមិនត្រូវកែទេ។ កំហុសត្រូវមានធាតុបញ្ច្រាស។",
  ],
  month: ["Month", "ខែ"],
  all_months: ["All months", "គ្រប់ខែ"],
  no: ["No.", "លេខ"],
  date: ["Date", "កាលបរិច្ឆេទ"],
  what: ["What happened", "អ្វីបានកើតឡើង"],
  from: ["From", "ពី"],
  amount: ["Amount", "ចំនួន"],
  debit: ["Debit", "ឥណពន្ធ"],
  credit: ["Credit", "ឥណទាន"],
  account: ["Account", "គណនី"],
  balance: ["Balance", "សមតុល្យ"],
  total: ["Total", "សរុប"],
  newest: [
    "Newest {0} entries. Pick a month to see all of it.",
    "ធាតុថ្មីបំផុត {0}។ ជ្រើសខែ ដើម្បីមើលទាំងអស់។",
  ],
  // new
  j_none: [
    "No journal entries yet. The ledger starts on 1 January 2027.",
    "មិនទាន់មានធាតុទិនានុប្បវត្តិទេ។ សៀវភៅបញ្ជីចាប់ផ្ដើមថ្ងៃទី១ ខែមករា ឆ្នាំ២០២៧។",
  ],
  balanced: ["Balanced", "មានតុល្យភាព"],
  je_note: [
    "This entry is never edited. To fix a mistake, reverse it and record it again.",
    "ធាតុនេះមិនត្រូវកែទេ។ ដើម្បីកែកំហុស សូមបញ្ច្រាស ហើយកត់ត្រាម្ដងទៀត។",
  ],
  rev_ctl: [
    "Entries made from app records are fixed through the record itself (void, correction).",
    "ធាតុពីកំណត់ត្រាកម្មវិធីត្រូវកែតាមកំណត់ត្រានោះ (លុបចោល ការកែតម្រូវ)។",
  ],
  rev_done: ["Reversed by {0}", "បានបញ្ច្រាសដោយ {0}"],
  rev_of: ["Reverses {0}", "បញ្ច្រាស {0}"],
  posted_by: ["Recorded by", "កត់ត្រាដោយ"],
  // new
  app: ["The app", "កម្មវិធី"],
  // new
  approved_by: ["Approved by", "អនុម័តដោយ"],
  // new
  reason: ["Reason", "មូលហេតុ"],
  // new
  closed_month: ["Its month is closed.", "ខែរបស់វាបានបិទ។"],
  // Entry kinds (mock-up gl_k_*)
  k_AUTO: ["From an app record", "ពីកំណត់ត្រាកម្មវិធី"],
  k_RENT_TO_INCOME: ["Rent moves to income", "ឈ្នួលចូលចំណូល"],
  k_DEPRECIATION: ["Depreciation", "រំលោះ"],
  k_FX_REVALUATION: [
    "Riel cash valued at month end",
    "វាយតម្លៃសាច់ប្រាក់រៀលចុងខែ",
  ],
  k_OPENING: ["Opening balance", "សមតុល្យដើម"],
  k_ADJUSTING: ["Adjusting entry", "ធាតុកែតម្រូវ"],
  k_REVERSAL: ["Reversal", "ការបញ្ច្រាស"],
  k_YEAR_END_CLOSE: ["Year-end close", "បិទចុងឆ្នាំ"],
  // Record kinds (source types)
  s_INVOICE: ["Invoice issued", "វិក្កយបត្រចេញ"],
  s_INVOICE_LINE: ["Invoice line", "បន្ទាត់វិក្កយបត្រ"],
  s_INVOICE_ADJUSTMENT: ["Invoice corrected", "វិក្កយបត្របានកែ"],
  s_LATE_PAYMENT_CHARGE: ["Late-payment charge", "ថ្លៃបង់យឺត"],
  s_LATE_PAYMENT_CHARGE_CORRECTION: [
    "Late-payment charge corrected",
    "ថ្លៃបង់យឺតបានកែ",
  ],
  s_PAYMENT: ["Payment received", "ការបង់ប្រាក់បានទទួល"],
  s_PAYMENT_ALLOCATION: [
    "Payment used for an Invoice",
    "ប្រាក់ប្រើសម្រាប់វិក្កយបត្រ",
  ],
  s_DEPOSIT_RECEIPT: ["Deposit received", "ប្រាក់កក់បានទទួល"],
  s_DEPOSIT_APPLICATION: ["Deposit used", "ប្រាក់កក់បានប្រើ"],
  s_DEPOSIT_DISPOSITION: ["Deposit kept or returned", "ប្រាក់កក់រក្សាទុក ឬសង"],
  s_CUSTOMER_CREDIT: ["Customer Credit", "ឥណទានអតិថិជន"],
  s_CREDIT_APPLICATION: ["Customer Credit used", "ឥណទានអតិថិជនបានប្រើ"],
  s_REFUND: ["Refund paid", "ការសងប្រាក់"],
  s_REFUND_CORRECTION: ["Refund correction", "ការកែការសងប្រាក់"],
  s_EXPENSE: ["Expense", "ចំណាយ"],
  s_EXPENSE_REQUEST: ["Staff advance", "ប្រាក់បុរេប្រទានបុគ្គលិក"],
  s_STAFF_PAYBACK: ["Staff paid back", "សងប្រាក់បុគ្គលិក"],
  s_BILL_PAYMENT: ["Supplier bill paid", "វិក្កយបត្រអ្នកផ្គត់ផ្គង់បានបង់"],
  s_MONEY_MOVE: ["Money moved", "ផ្ទេរប្រាក់"],
  s_OWNER_MONEY: ["Owner money", "ប្រាក់ម្ចាស់"],
  s_PETTY_CASH_TOPUP: ["Petty cash top-up", "បំពេញសាច់ប្រាក់រាយ"],
  s_CASH_COUNT: ["Cash count difference", "ភាពខុសគ្នានៃការរាប់សាច់ប្រាក់"],
  // Chart of accounts
  a_title: ["Chart of accounts", "តារាងគណនី"],
  a_sub: [
    "The chart of accounts. Only the Owner adds accounts. An account with entries is turned off, never deleted.",
    "តារាងគណនី។ មានតែម្ចាស់ទេដែលបន្ថែមគណនីបាន។ គណនីដែលមានធាតុត្រូវបិទ មិនលុបចោលទេ។",
  ],
  code: ["Code", "លេខកូដ"],
  t_ASSET: ["Assets", "ទ្រព្យសកម្ម"],
  t_LIABILITY: ["Liabilities", "បំណុល"],
  t_EQUITY: ["Owner's equity", "មូលធនម្ចាស់"],
  t_INCOME: ["Income", "ចំណូល"],
  t_COST_OF_SALES: ["Cost of products sold", "ថ្លៃដើមផលិតផលលក់"],
  t_EXPENSE: ["Expenses", "ចំណាយ"],
  ctl: ["App records only", "តែកំណត់ត្រាកម្មវិធី"],
  ctl_s: [
    "Changes only through app records, so the books always match the app.",
    "ប្ដូរតែតាមកំណត់ត្រាកម្មវិធី ដូច្នេះសៀវភៅតែងតែត្រូវនឹងកម្មវិធី។",
  ],
  off: ["Turned off", "បានបិទ"],
  tax: ["No entries yet", "មិនទាន់មានធាតុ"],
  tax_n: [
    "No entries until a tax agent confirms the rules.",
    "មិនមានធាតុរហូតដល់ភ្នាក់ងារពន្ធបញ្ជាក់ច្បាប់។",
  ],
  off_n: [
    "This account is turned off. Old entries stay. No new entries can use it.",
    "គណនីនេះបានបិទ។ ធាតុចាស់នៅដដែល។ ធាតុថ្មីមិនអាចប្រើវាបានទេ។",
  ],
  used_n: [
    "This account has entries, so it can be turned off but never deleted.",
    "គណនីនេះមានធាតុ ដូច្នេះអាចបិទបាន តែមិនអាចលុបបានទេ។",
  ],
  ad_sub: [
    "Every entry in this account, newest first, with the balance after each one.",
    "ធាតុទាំងអស់ក្នុងគណនីនេះ ថ្មីមុន ជាមួយសមតុល្យក្រោយនីមួយៗ។",
  ],
  // new
  ad_open: ["Opening balance", "សមតុល្យដើម"],
  // Needs check
  nc_title: ["Needs check", "ត្រូវពិនិត្យ"],
  nc_sub: [
    "App money records that could not go to the ledger yet",
    "កំណត់ត្រាប្រាក់ក្នុងកម្មវិធីដែលមិនទាន់ចូលសៀវភៅបញ្ជីបាន",
  ],
  nc_open: ["To fix", "ត្រូវកែ"],
  nc_record: ["Record", "កំណត់ត្រា"],
  nc_reason: ["Reason", "មូលហេតុ"],
  nc_none: [
    "Nothing to check. Every money record is in the ledger.",
    "គ្មានអ្វីត្រូវពិនិត្យទេ។ កំណត់ត្រាប្រាក់ទាំងអស់នៅក្នុងសៀវភៅបញ្ជី។",
  ],
  nc_note: [
    "Nothing is lost: each record goes to the ledger as soon as its reason is fixed. A Refund corrected after it was paid posts by itself; it shows here only when its Refund method has no ledger account.",
    "គ្មានអ្វីបាត់ទេ៖ កំណត់ត្រានីមួយៗចូលសៀវភៅបញ្ជីភ្លាម ពេលកែមូលហេតុរួច។ ការសងប្រាក់ដែលកែក្រោយបានសង ចូលសៀវភៅបញ្ជីដោយខ្លួនឯង; វាបង្ហាញនៅទីនេះតែពេលមធ្យោបាយសងប្រាក់គ្មានគណនីសៀវភៅបញ្ជីប៉ុណ្ណោះ។",
  ],
  nc_r_pay: [
    "No ledger account is set for the Payment Method {0}",
    "មិនទាន់កំណត់គណនីសៀវភៅបញ្ជីសម្រាប់មធ្យោបាយបង់ប្រាក់ {0}",
  ],
  nc_r_refund: [
    "No ledger account is set for the Refund method {0}",
    "មិនទាន់កំណត់គណនីសៀវភៅបញ្ជីសម្រាប់មធ្យោបាយសងប្រាក់ {0}",
  ],
  // new
  nc_r_other: [
    "The ledger could not post this record. It tries again after each change; if it stays here, tell the person who set up the app.",
    "សៀវភៅបញ្ជីមិនអាចកត់ត្រាកំណត់ត្រានេះបានទេ។ វាសាកម្ដងទៀតក្រោយការផ្លាស់ប្ដូរនីមួយៗ; បើវានៅតែនៅទីនេះ សូមប្រាប់អ្នកដែលរៀបចំកម្មវិធី។",
  ],
  nc_set: ["Set the account", "កំណត់គណនី"],
  nc_set_m: ["Set the method's account", "កំណត់គណនីរបស់មធ្យោបាយ"],
  nc_change: ["Change", "ប្ដូរ"],
  nc_macc: ["Payment Method accounts", "គណនីមធ្យោបាយបង់ប្រាក់"],
  nc_macc_s: [
    "Which cash or bank account each Payment Method uses in the ledger.",
    "គណនីសាច់ប្រាក់ ឬធនាគារដែលមធ្យោបាយបង់ប្រាក់នីមួយៗប្រើក្នុងសៀវភៅបញ្ជី។",
  ],
  // new
  nc_racc: ["Refund method accounts", "គណនីមធ្យោបាយសងប្រាក់"],
  nc_method: ["Payment Method", "មធ្យោបាយបង់ប្រាក់"],
  // new
  nc_rmethod: ["Refund method", "មធ្យោបាយសងប្រាក់"],
  nc_notset: ["Not set", "មិនទាន់កំណត់"],
  nc_owner_only: [
    "Only the Owner sets these accounts.",
    "មានតែម្ចាស់ទេដែលកំណត់គណនីទាំងនេះ។",
  ],
  nc_acc_t: ["Ledger account for {0}", "គណនីសៀវភៅបញ្ជីសម្រាប់ {0}"],
  nc_acc_future: [
    "New payments with this method use this account from now on.",
    "ការបង់ប្រាក់ថ្មីតាមមធ្យោបាយនេះប្រើគណនីនេះចាប់ពីឥឡូវ។",
  ],
  // new
  nc_from: ["From", "ចាប់ពី"],
  // new
  nc_since: ["since {0}", "ចាប់ពី {0}"],
  // new
  nc_saved: ["{0} now uses account {1}.", "{0} ឥឡូវប្រើគណនី {1}។"],
  // Financial statements
  r_title: ["Financial statements", "របាយការណ៍ហិរញ្ញវត្ថុ"],
  r_sub: [
    "Made from the journal entries. Pick a statement and a month.",
    "បង្កើតពីធាតុទិនានុប្បវត្តិ។ ជ្រើសរបាយការណ៍ និងខែ។",
  ],
  r_profit_and_loss: ["Profit and loss", "ចំណេញ និងខាត"],
  r_balance_sheet: ["Balance sheet", "តារាងតុល្យការ"],
  r_cash_flow: ["Cash flow", "លំហូរសាច់ប្រាក់"],
  r_trial_balance: ["Trial balance", "តុល្យភាពសាកល្បង"],
  r_account_detail: ["Account detail", "ព័ត៌មានលម្អិតគណនី"],
  r_customer_aging: ["Customer debt aging", "អាយុបំណុលអតិថិជន"],
  r_bills_aging: ["Supplier bill aging", "អាយុវិក្កយបត្រអ្នកផ្គត់ផ្គង់"],
  r_budget: ["Budget vs actual", "ថវិកាធៀបនឹងជាក់ស្ដែង"],
  r_books_check: ["Books check", "ការត្រួតពិនិត្យសៀវភៅ"],
  xlsx: ["Export Excel", "នាំចេញ Excel"],
  pdf: ["Export PDF (A4)", "នាំចេញ PDF (A4)"],
  st_closed: ["Closed", "បានបិទ"],
  st_open: ["Open, may still change", "បើក អាចនៅប្ដូរ"],
  // new
  st_today: ["As at today", "គិតត្រឹមថ្ងៃនេះ"],
  ok: ["Matches", "ត្រូវគ្នា"],
  bad: ["Does not match", "មិនត្រូវគ្នា"],
  // new
  as_of: ["As at", "គិតត្រឹម"],
  // new
  to: ["To", "ដល់"],
  // new
  r_none: ["Nothing to show.", "គ្មានអ្វីត្រូវបង្ហាញទេ។"],
  // new
  r_check: ["Check", "ការត្រួតពិនិត្យ"],
  // new
  r_english: [
    "Statement words come from the ledger in English; account names follow your language.",
    "ពាក្យក្នុងរបាយការណ៍មកពីសៀវភៅបញ្ជីជាភាសាអង់គ្លេស ឈ្មោះគណនីតាមភាសារបស់អ្នក។",
  ],
  // new
  x_done: ["Downloaded {0}.", "បានទាញយក {0}។"],
  // Books check lines (gl_books_check)
  bc_CUSTOMER_DEBT: [
    "Customer debt (1100 + 1110) equals the unpaid Invoices and late-payment charges",
    "បំណុលអតិថិជន (1100 + 1110) ស្មើវិក្កយបត្រ និងថ្លៃបង់យឺតមិនទាន់បង់",
  ],
  bc_RENT_IN_ADVANCE: [
    "Rent billed in advance (2050) equals the app's list",
    "ឈ្នួលចេញវិក្កយបត្រជាមុន (2050) ស្មើបញ្ជីក្នុងកម្មវិធី",
  ],
  bc_SECURITY_DEPOSITS: [
    "Security Deposits held (2100) equals the app's list",
    "ប្រាក់កក់ធានាដែលកាន់ (2100) ស្មើបញ្ជីក្នុងកម្មវិធី",
  ],
  bc_PET_DEPOSITS: [
    "Pet Deposits held (2110) equals the app's list",
    "ប្រាក់កក់សត្វចិញ្ចឹម (2110) ស្មើបញ្ជីក្នុងកម្មវិធី",
  ],
  bc_CUSTOMER_CREDIT: [
    "Customer Credit (2200) equals the app's list",
    "ឥណទានអតិថិជន (2200) ស្មើបញ្ជីក្នុងកម្មវិធី",
  ],
  bc_MONEY_NOT_USED: [
    "Money not used yet (2210) equals the app's list",
    "ប្រាក់មិនទាន់ប្រើ (2210) ស្មើបញ្ជីក្នុងកម្មវិធី",
  ],
  bc_EVERY_RECORD_POSTED: [
    "Every app money record has its entry",
    "កំណត់ត្រាប្រាក់ក្នុងកម្មវិធីនីមួយៗមានធាតុរបស់វា",
  ],
  bc_EVERY_ENTRY_BALANCED: ["Every entry is balanced", "ធាតុនីមួយៗមានតុល្យភាព"],
  // new
  bc_in_books: ["In the books", "ក្នុងសៀវភៅ"],
  // new
  bc_in_app: ["In the app", "ក្នុងកម្មវិធី"],
  // new
  bc_waiting: ["{0} waiting", "{0} កំពុងរង់ចាំ"],
} as const satisfies Record<string, readonly [string, string]>;

export type LedgerTextKey = keyof typeof TEXT;

export function lt(
  language: Language,
  key: LedgerTextKey,
  ...values: string[]
): string {
  const text = TEXT[key][language === "en" ? 0 : 1];
  return values.reduce(
    (out, value, index) => out.replace(`{${String(index)}}`, value),
    text,
  );
}

export function hasLedgerText(key: string): key is LedgerTextKey {
  return Object.prototype.hasOwnProperty.call(TEXT, key);
}

export function typeName(language: Language, type: AccountType): string {
  return lt(language, `t_${type}`);
}

/** "2027-01-01" → "January 2027" in the chosen language. */
const MONTHS = [
  ["January", "មករា"],
  ["February", "កុម្ភៈ"],
  ["March", "មីនា"],
  ["April", "មេសា"],
  ["May", "ឧសភា"],
  ["June", "មិថុនា"],
  ["July", "កក្កដា"],
  ["August", "សីហា"],
  ["September", "កញ្ញា"],
  ["October", "តុលា"],
  ["November", "វិច្ឆិកា"],
  ["December", "ធ្នូ"],
] as const;

export function monthLabel(language: Language, day: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(day);
  if (match === null) return day;
  const [, year = "", month = "1"] = match;
  const names = MONTHS[Number(month) - 1];
  return names === undefined
    ? day
    : `${names[language === "en" ? 0 : 1]} ${year}`;
}
