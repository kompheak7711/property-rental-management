// V1-058 R6: the words of Home in English and Khmer, from the owner's mock-up (i18n.js,
// i18n10.js). Khmer needs the native check before the app is used. Lines marked "new" are not
// in the mock-up.

import type { Language } from "../signInText";
import { singular } from "../shell/plural";

const TEXT = {
  as_of: ["As of {0}", "គិតត្រឹមម៉ោង {0}"],
  // UI v81 round 2: the head line "CHETANA Residence · Tuesday 03/11/2026 · As of 10:30".
  property: ["CHETANA Residence", "CHETANA Residence"],
  qa_record: ["Receive payment", "ទទួលការបង់ប្រាក់"],
  qa_readings: ["Enter meter readings", "បញ្ចូលអំណាននាឡិកាស្ទង់"],
  // new
  loading: ["Loading Home…", "កំពុងផ្ទុកទំព័រដើម…"],
  // new
  failed: [
    "Home could not be loaded. Check the connection and try again.",
    "មិនអាចអានទំព័រដើមបានទេឥឡូវនេះ។ សូមពិនិត្យការតភ្ជាប់ ហើយព្យាយាមម្តងទៀត។",
  ],
  // new
  not_allowed: [
    "Your account cannot see the Home numbers. Use the menu to open your work.",
    "គណនីរបស់អ្នកមិនអាចមើលលេខទំព័រដើមបានទេ។ សូមប្រើម៉ឺនុយ ដើម្បីបើកការងាររបស់អ្នក។",
  ],
  retry: ["Retry", "ព្យាយាមម្តងទៀត"],

  // UI v81 round 2 (design v81 i18n25): the card names of the design.
  k_occ: ["Occupancy", "អត្រាស្នាក់នៅ"],
  k_occ_s: ["{0} reserved · {1} vacant", "បានកក់ {0} · ទំនេរ {1}"],
  k_pend: ["Pending payment", "ប្រាក់មិនទាន់បង់"],
  k_pend_s: ["{0} Invoices not fully paid", "វិក្កយបត្រ {0} មិនទាន់បង់គ្រប់"],
  // new
  k_pend_s1: ["1 Invoice not fully paid", "វិក្កយបត្រ 1 មិនទាន់បង់គ្រប់"],
  k_paid: ["Paid this month", "បានបង់ខែនេះ"],
  k_paid_s: ["{0}% of {1} due in {2}", "{0}% នៃ {1} ដល់កំណត់ក្នុង {2}"],
  // new
  k_paid_none: [
    "Nothing billed for this month yet",
    "មិនទាន់មានវិក្កយបត្រសម្រាប់ខែនេះ",
  ],
  // new
  k_paid_recv: [
    "Received this month · {0} payments",
    "បានទទួលខែនេះ · ការបង់ប្រាក់ {0}",
  ],
  // new
  k_paid_recv1: [
    "Received this month · 1 payment",
    "បានទទួលខែនេះ · ការបង់ប្រាក់ 1",
  ],
  k_over: ["Overdue", "ហួសកំណត់"],
  k_over_s: [
    "{0} Invoices past the due date",
    "វិក្កយបត្រ {0} ហួសថ្ងៃកំណត់បង់",
  ],
  // new
  k_over_s1: ["1 Invoice past the due date", "វិក្កយបត្រ 1 ហួសថ្ងៃកំណត់បង់"],
  n_lease: ["Leases ending soon", "កិច្ចសន្យាជិតផុតកំណត់"],
  n_lease_s: ["End before {0}", "ផុតកំណត់មុន {0}"],
  n_appr: ["Approvals", "រង់ចាំការអនុម័ត"],
  // "Refunds pending" is the approved word for money out (docs/ui-audit/04_GLOSSARY.md).
  n_appr_s: [
    "{0} to confirm · Refunds pending {1}",
    "{0} ត្រូវបញ្ជាក់ · ការសងប្រាក់កំពុងរង់ចាំ {1}",
  ],
  // new
  n_appr_c: ["{0} to confirm", "{0} ត្រូវបញ្ជាក់"],
  n_read: ["Meter readings missing", "អំណានដែលខ្វះ"],
  n_read_s: ["Reading day {0}", "ថ្ងៃអាន {0}"],
  n_letters: ["Notices due", "លិខិតត្រូវផ្តល់"],
  // Owner 07/11/2026: "notices", not "letters". Khmer is new and needs the native check.
  n_letters_s: [
    "Day-20 and day-30 notices",
    "សេចក្ដីជូនដំណឹងថ្ងៃទី២០ និងថ្ងៃទី៣០",
  ],
  // DL-131 (mock-up round 32 A10); Khmer is new and needs the native check.
  n_problems: ["Problem reports", "របាយការណ៍បញ្ហា"],
  // Design v81 i18n13 (Viewing requests waiting on Home). Khmer from the design.
  n_vr: ["Viewing requests waiting", "សំណើមើលបន្ទប់កំពុងរង់ចាំ"],
  n_vr_s: [
    "{0} late · {1} visits this week",
    "{0} យឺត · {1} ការមកមើលសប្តាហ៍នេះ",
  ],
  n_problems_s: ["{0} urgent · {1} late", "{0} បន្ទាន់ · {1} យឺត"],
  n_costs: ["Repair costs to check", "ថ្លៃជួសជុលត្រូវពិនិត្យ"],
  // UI v81 round 4 (owner 08/11/2026): the Birthdays and Paid on time cards (design i18n).
  n_bday: ["Birthdays", "ថ្ងៃកំណើត"],
  n_week_s: ["Today to {0}", "ថ្ងៃនេះ ដល់ {0}"],
  n_ontime: ["Paid on time", "បង់ទាន់ពេល"],
  n_ontime_s: [
    "{0} of {1} Invoices, last 12 months",
    "{0} ក្នុងចំណោម {1} វិក្កយបត្រ 12 ខែចុងក្រោយ",
  ],
  n_ontime_none: [
    "No Invoice was due in the last 12 months",
    "គ្មានវិក្កយបត្រដល់កំណត់ក្នុង 12 ខែចុងក្រោយ",
  ],

  todo_t: ["Tasks", "ការងារត្រូវធ្វើ"],
  g_overdue: ["Overdue", "ហួសកំណត់"],
  g_today: ["Today", "ថ្ងៃនេះ"],
  g_this_week: ["This week", "សប្តាហ៍នេះ"],
  g_later: ["Later", "ពេលក្រោយ"],
  g_over_none: ["Nothing is overdue.", "គ្មានអ្វីហួសកំណត់ទេ។"],
  g_none: ["Nothing here.", "គ្មានអ្វីទេ។"],
  show_more: ["Show {0}", "បង្ហាញ {0}"],
  show_less: ["Hide", "លាក់"],
  // UI v81 round 3 (owner 07/11/2026 17:30): the Tasks are four cards, one list open at a time.
  tk_oldest: ["Oldest: {0}", "ចាស់បំផុត៖ {0}"], // new (UI v81 round 3)
  tk_today_s: ["Do them today", "ធ្វើថ្ងៃនេះ"], // new (UI v81 round 3)
  tk_next: ["Next: {0}", "បន្ទាប់៖ {0}"], // new (UI v81 round 3)
  tk_none: ["Nothing here", "គ្មានអ្វីទេ"], // new (UI v81 round 3)
  tk_over_none: ["Nothing overdue", "គ្មានអ្វីហួសកំណត់"], // new (UI v81 round 3)
  tk_hint: [
    "Tap a card to see its list. Tap it again to close the list.",
    "ចុចកាតដើម្បីមើលបញ្ជី។ ចុចម្ដងទៀតដើម្បីបិទ។",
  ], // new (UI v81 round 3)

  r_over: ["{0}: {1} not paid", "{0}៖ {1} មិនទាន់បង់"],
  // new
  r_over_d: ["{0} · {1} · Initial Rent", "{0} · {1} · ថ្លៃឈ្នួលដំបូង"],
  r_resv: ["Reservation for {0} ends", "ការកក់ {0} ផុតកំណត់"],
  r_read: ["Meter reading day", "ថ្ងៃអាននាឡិកាស្ទង់"],
  // new
  r_read_d: [
    "{0} meters not read yet. Invoices go out the next day.",
    "នាឡិកាស្ទង់ {0} មិនទាន់អាន។ វិក្កយបត្រចេញនៅថ្ងៃបន្ទាប់។",
  ],
  r_lease: ["Lease for {0} ends", "កិច្ចសន្យា {0} ផុតកំណត់"],
  r_lease_d: ["{0}. Ask about renewing.", "{0}។ សួរអំពីការបន្ត។"],
  r_appr: ["{0} pending approval", "{0} រង់ចាំការអនុម័ត"],
  r_letter: ["{0} letter due: {1}", "លិខិត{0} ត្រូវផ្តល់៖ {1}"],
  // new
  r_letter_d: ["{0} · {1} still owed", "{0} · {1} នៅជំពាក់"],
  day20: ["Day 20", "ថ្ងៃទី២០"],
  day30: ["Day 30", "ថ្ងៃទី៣០"],
  r_depdec: [
    "Deposit pending a decision: {0}",
    "ប្រាក់កក់រង់ចាំការសម្រេច៖ {0}",
  ],
  // new
  r_settle: ["Final Settlement still open: {0}", "ការទូទាត់ចុងក្រោយនៅបើក៖ {0}"],
  // new
  r_refund: ["Deposit refund due: {0}", "ត្រូវសងប្រាក់កក់វិញ៖ {0}"],
  // new
  r_refund_d: ["{0} · {1} held", "{0} · កាន់កាប់ {1}"],
  // new
  dk_REFUND: ["Refund", "ការសងប្រាក់វិញ"],
  // new
  dk_DEPOSIT_FORFEITURE: ["Deposit kept", "ការរក្សាប្រាក់កក់"],
  // new
  dk_PAYMENT_MOVE: ["Payment move", "ការផ្លាស់ការបង់ប្រាក់"],
  // new
  dk_FINAL_SETTLEMENT: ["Final Settlement", "ការទូទាត់ចុងក្រោយ"],
  // new
  dk_SETTLEMENT_CORRECTION: ["Settlement correction", "ការកែការទូទាត់"],
  // new
  dk_other: ["A draft", "សេចក្តីព្រាង"],
  // new
  r_appr_d: ["Prepared on {0}", "រៀបចំថ្ងៃ {0}"],

  rel_today: ["today", "ថ្ងៃនេះ"],
  rel_tomorrow: ["tomorrow", "ថ្ងៃស្អែក"],
  rel_in: ["in {0} days", "ក្នុង {0} ថ្ងៃទៀត"],
  rel_ago: ["{0} days ago", "{0} ថ្ងៃមុន"],
  rel_yesterday: ["yesterday", "ម្សិលមិញ"],
  rel_late: ["{0} days late", "យឺត {0} ថ្ងៃ"],
  rel_late1: ["1 day late", "យឺត 1 ថ្ងៃ"],

  job_bill: [
    "Rent and Utility Invoices made on {0}",
    "វិក្កយបត្រថ្លៃឈ្នួល និងទឹកភ្លើង ចេញថ្ងៃ {0}",
  ],
  // new
  job_bill_none: [
    "No billing run has finished yet",
    "មិនទាន់មានការចេញវិក្កយបត្របានបញ្ចប់នៅឡើយ",
  ],
  job_rate: [
    "ABA exchange rate updated on {0}",
    "អត្រាប្តូរប្រាក់ ABA ធ្វើបច្ចុប្បន្នភាពថ្ងៃ {0}",
  ],
  // new
  job_rate_none: [
    "The ABA exchange rate has not been loaded yet.",
    "មិនទាន់អានអត្រាប្តូរប្រាក់ ABA នៅឡើយ",
  ],
  job_next: ["Next Invoices: {0}", "វិក្កយបត្របន្ទាប់៖ {0}"],
  tip_inv: ["Open Invoice", "បើកវិក្កយបត្រ"],
  tip_resv: ["Open Reservation", "បើកការកក់"],
  tip_read: ["Open meter readings", "បើកអំណាននាឡិកាស្ទង់"],
  tip_lease: ["Open Lease", "បើកកិច្ចសន្យា"],
  tip_appr: ["Open the draft", "បើកសេចក្តីព្រាង"],
  tip_letter: ["Open Notices", "បើកលិខិត"],
  // UI v81 (design v81 Home): Owner money and Attendance.
  om_t: ["Owner money", "ប្រាក់ម្ចាស់"], // new
  om_only: ["Only the Owner sees this", "មានតែម្ចាស់ឃើញ"], // new
  om_cash: ["Cash and bank today", "សាច់ប្រាក់ និងធនាគារថ្ងៃនេះ"], // new
  om_cash_s: ["Opens the Balance sheet", "បើកតារាងតុល្យការ"], // new
  om_owe: ["Customers owe", "អតិថិជនជំពាក់"], // new
  om_owe_s: ["Opens Accounts receivable aging", "បើកអាយុបំណុលអតិថិជន"], // new
  om_over: ["Owed over 30 days", "ជំពាក់លើស ៣០ ថ្ងៃ"], // new
  om_spent: ["Spent this month", "ចំណាយខែនេះ"], // new
  om_spent_s: ["Budget {0}", "ថវិកា {0}"], // new
  om_nobudget: ["No budget for this month", "គ្មានថវិកាសម្រាប់ខែនេះ"], // new
  om_profit: ["Profit this year", "ចំណេញឆ្នាំនេះ"], // new
  om_profit_s: ["{0} so far", "{0} រហូតមកដល់ពេលនេះ"], // new
  at_t: ["Attendance needs attention", "វត្តមានត្រូវយកចិត្តទុកដាក់"], // new
  at_n: [
    "{0} to check: Needs check {1}, No check-out {2}.",
    "{0} ត្រូវពិនិត្យ៖ ត្រូវពិនិត្យ {1} គ្មានការចុះចេញ {2}។",
  ], // new
  at_0: ["Nothing to check today.", "ថ្ងៃនេះគ្មានអ្វីត្រូវពិនិត្យ។"], // new
  at_open: ["Open the daily sheet", "បើកតារាងប្រចាំថ្ងៃ"], // new
} as const satisfies Record<string, readonly [string, string]>;

export type HomeTextKey = keyof typeof TEXT;

export function hmt(
  language: Language,
  key: HomeTextKey,
  ...values: (string | number)[]
): string {
  const text = TEXT[key][language === "en" ? 0 : 1];
  return singular(
    text.replace(/\{(\d+)\}/g, (match, index: string) => {
      const value = values[Number(index)];
      return value === undefined ? match : String(value);
    }),
  );
}

const WEEKDAYS = {
  en: [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ],
  km: [
    "ថ្ងៃអាទិត្យ",
    "ថ្ងៃច័ន្ទ",
    "ថ្ងៃអង្គារ",
    "ថ្ងៃពុធ",
    "ថ្ងៃព្រហស្បតិ៍",
    "ថ្ងៃសុក្រ",
    "ថ្ងៃសៅរ៍",
  ],
};

/** "2026-11-03" → "Tuesday". */
export function weekdayText(language: Language, day: string): string {
  const date = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return WEEKDAYS[language][date.getUTCDay()] ?? "";
}
