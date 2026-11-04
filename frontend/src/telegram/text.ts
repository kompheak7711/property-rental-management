// Telegram bots step 2c (DL-128): the words of Office › Telegram, Linked tenants and Telegram
// health, in English and Khmer, from the mock-up round 29 (i18n34.js, keys tg_*). Khmer marked
// "new" is not in the mock-up and needs the native check.

import type { Language } from "../signInText";

const TEXT = {
  loading: ["Loading…", "កំពុងផ្ទុក…"],
  failed: ["This could not be read just now.", "មិនអាចអានបានទេឥឡូវនេះ។"],
  retry_read: ["Try again", "សាកម្តងទៀត"],
  no_property: ["Choose a Property first.", "សូមជ្រើសអចលនទ្រព្យជាមុន។"],
  cancel: ["Cancel", "បោះបង់"],
  hours: ["{0} hours", "{0} ម៉ោង"],
  e_403: [
    "You do not have the right to do this.",
    // new
    "អ្នកមិនមានសិទ្ធិធ្វើការនេះទេ។",
  ],
  e_save: [
    "This could not be saved just now. Try again.",
    // new
    "មិនអាចរក្សាទុកបានទេឥឡូវនេះ។ សូមសាកម្តងទៀត។",
  ],
  // Linked tenants
  links_sub: [
    "Tenant bot accounts linked to a Lease. A link ends by itself when the Lease ends.",
    "គណនីបូតអ្នកជួលដែលភ្ជាប់នឹងកិច្ចសន្យា។ ការភ្ជាប់បញ្ចប់ដោយខ្លួនឯង ពេលកិច្ចសន្យាបញ្ចប់។",
  ],
  linked_now: ["Linked now", "កំពុងភ្ជាប់"],
  c_acc: ["Telegram account", "គណនីតេឡេក្រាម"],
  c_cust: ["Customer", "អតិថិជន"],
  c_unit: ["Unit", "បន្ទប់"],
  c_lease_end: [
    "Lease ends",
    // new
    "កិច្ចសន្យាបញ្ចប់",
  ],
  c_on: ["Linked on", "ភ្ជាប់នៅ"],
  c_how: ["How", "របៀប"],
  how: ["Phone, name and Unit matched", "ទូរស័ព្ទ ឈ្មោះ និងបន្ទប់ត្រូវគ្នា"],
  remove: ["Remove link", "ដកការភ្ជាប់"],
  links_n: [
    "A link needs the phone, the name and the Unit to match an active Lease. There is no code. Several people on one Lease can each link.",
    "ការភ្ជាប់ត្រូវការទូរស័ព្ទ ឈ្មោះ និងបន្ទប់ ត្រូវនឹងកិច្ចសន្យាសកម្ម។ គ្មានលេខកូដ។ មនុស្សច្រើននាក់ក្នុងកិច្ចសន្យាតែមួយ អាចភ្ជាប់ម្នាក់ៗ។",
  ],
  none_linked: [
    "No tenant is linked yet.",
    // new
    "មិនទាន់មានអ្នកជួលភ្ជាប់នៅឡើយទេ។",
  ],
  tries_t: [
    "Link tries that did not match: {0} Telegram accounts.",
    "ការភ្ជាប់មិនត្រូវ៖ គណនីតេឡេក្រាម {0}។",
  ],
  tries_h: ["Link tries that did not match", "ការភ្ជាប់ដែលមិនត្រូវ"],
  c_phone: ["Phone", "ទូរស័ព្ទ"],
  c_name: ["Name typed", "ឈ្មោះដែលវាយ"],
  c_unit_t: ["Unit typed", "បន្ទប់ដែលវាយ"],
  c_tries: ["Tries", "ចំនួនដង"],
  c_last: [
    "Last try",
    // new
    "ការព្យាយាមចុងក្រោយ",
  ],
  blocked: ["Blocked until {0}", "បិទរហូតដល់ {0}"],
  left: ["{0} tries left", "នៅសល់ {0} ដង"],
  tries_n: [
    "The bot never says which part was wrong. {0} failed tries block linking for {1}. Tries are kept 90 days.",
    "បូតមិនដែលប្រាប់ថាផ្នែកណាខុសទេ។ ខុស {0} ដង បិទការភ្ជាប់ {1}។ រក្សាទុកការព្យាយាម ៩០ ថ្ងៃ។",
  ],
  none_tries: [
    "No link tries failed in the last 24 hours.",
    // new
    "គ្មានការភ្ជាប់មិនត្រូវក្នុង ២៤ ម៉ោងចុងក្រោយទេ។",
  ],
  ended: ["Ended links", "ការភ្ជាប់ដែលបានបញ្ចប់"],
  ended_sub: [
    "The last {0} days.",
    // new
    "{0} ថ្ងៃចុងក្រោយ។",
  ],
  c_end: ["Ended on", "បញ្ចប់នៅ"],
  c_why: ["Why", "ហេតុអ្វី"],
  end_LEASE_ENDED: ["The Lease ended", "កិច្ចសន្យាបានបញ្ចប់"],
  end_REMOVED: [
    "Removed by the office",
    // new
    "ដកចេញដោយការិយាល័យ",
  ],
  end_NEW_LINK: [
    "A new link took its place",
    // new
    "ការភ្ជាប់ថ្មីបានជំនួស",
  ],
  none_ended: [
    "No link ended in this time.",
    // new
    "គ្មានការភ្ជាប់បានបញ្ចប់ក្នុងរយៈពេលនេះទេ។",
  ],
  rm_t: ["Remove link", "ដកការភ្ជាប់"],
  rm_q: [
    "Remove the Telegram link of {0} ({1}, {2})? The Tenant bot then shows only Link my Lease.",
    "ដកការភ្ជាប់តេឡេក្រាមរបស់ {0} ({1}, {2})? បន្ទាប់មក បូតអ្នកជួលបង្ហាញតែ ភ្ជាប់កិច្ចសន្យារបស់ខ្ញុំ។",
  ],
  rm_reason: ["Reason", "មូលហេតុ"],
  rm_ph: [
    "For example: lost phone, or wrong person",
    "ឧទាហរណ៍៖ បាត់ទូរស័ព្ទ ឬមនុស្សខុស",
  ],
  rm_n: [
    "It stops working in the bot within a minute. The link stays in the history.",
    "វាឈប់ដំណើរការក្នុងបូតក្នុងមួយនាទី។ ការភ្ជាប់នៅក្នុងប្រវត្តិ។",
  ],
  rm_done: ["Link of {0} removed.", "បានដកការភ្ជាប់របស់ {0}។"],
  e_reason: [
    "Type a reason.",
    // new
    "សូមវាយមូលហេតុ។",
  ],
  e_rm_409: [
    "This link has already ended. The list is read again.",
    // new
    "ការភ្ជាប់នេះបានបញ្ចប់រួចហើយ។ បញ្ជីត្រូវបានអានម្ដងទៀត។",
  ],
  // Telegram health
  h_sub: [
    "Is everything going in and out? The app pulls from the relay every minute.",
    "តើអ្វីៗចូល និងចេញបានល្អទេ? កម្មវិធីទាញពីរ៉េឡេរៀងរាល់មួយនាទី។",
  ],
  h_lock: [
    "Only the Owner and the Manager see this page.",
    "មានតែម្ចាស់ និងអ្នកគ្រប់គ្រងទេដែលឃើញទំព័រនេះ។",
  ],
  k_pull: ["Last relay pull", "ការទាញពីរ៉េឡេចុងក្រោយ"],
  k_pull_s: ["{0} items saved", "បានរក្សាទុក {0}"],
  k_pull_none: [
    "Not pulled yet",
    // new
    "មិនទាន់បានទាញទេ",
  ],
  k_wait: ["Waiting to send", "រង់ចាំផ្ញើ"],
  k_wait_s: [
    "The app tries again by itself",
    "កម្មវិធីព្យាយាមម្ដងទៀតដោយខ្លួនឯង",
  ],
  k_bad: ["Failed to send", "ផ្ញើមិនបាន"],
  k_bad_s: ["Failing for 12 hours or more", "មិនបានជាង ១២ ម៉ោង"],
  k_old: ["Not pulled after 7 days", "មិនបានទាញក្រោយ ៧ ថ្ងៃ"],
  k_old_s: [
    "The relay deletes them; check if above 0",
    "រ៉េឡេលុបវាចោល សូមពិនិត្យបើលើសពី ០",
  ],
  last_err: ["Last error at {0}: {1}.", "កំហុសចុងក្រោយនៅ {0}៖ {1}។"],
  bots: ["Bots", "បូត"],
  c_bot: ["Bot", "បូត"],
  c_in: ["Last message in", "សារចូលចុងក្រោយ"],
  c_out: ["Last message out", "សារចេញចុងក្រោយ"],
  c_state: [
    "State",
    // new
    "ស្ថានភាព",
  ],
  working: ["Working", "ដំណើរការ"],
  problem: ["Problem", "មានបញ្ហា"],
  never: [
    "Never",
    // new
    "មិនដែល",
  ],
  bot_CUSTOMER: [
    "Customer bot",
    // new
    "បូតអតិថិជន",
  ],
  bot_TENANT: [
    "Tenant bot",
    // new
    "បូតអ្នកជួល",
  ],
  bot_STAFF: [
    "Staff bot",
    // new
    "បូតបុគ្គលិក",
  ],
  keys: [
    "No bot keys are ever shown here. The keys are files on the office computer, never in the app, a log or a screenshot.",
    "មិនដែលបង្ហាញសោបូតនៅទីនេះទេ។ សោជាឯកសារនៅលើកុំព្យូទ័រការិយាល័យ មិនដែលនៅក្នុងកម្មវិធី កំណត់ហេតុ ឬរូបថតអេក្រង់ឡើយ។",
  ],
  outbox: ["Messages not sent yet", "សារមិនទាន់ផ្ញើ"],
  c_to: ["To", "ទៅ"],
  c_since: ["Since", "តាំងពី"],
  c_err: ["Last error", "កំហុសចុងក្រោយ"],
  to_chat: [
    "Telegram chat",
    // new
    "ការជជែកតេឡេក្រាម",
  ],
  st_WAITING: [
    "The app tries again",
    // new
    "កម្មវិធីកំពុងព្យាយាមម្ដងទៀត",
  ],
  st_GAVE_UP: [
    "Stopped after 7 days",
    // new
    "បានឈប់ក្រោយ ៧ ថ្ងៃ",
  ],
  retried: [
    "Sent again",
    // new
    "បានផ្ញើម្ដងទៀត",
  ],
  retry: ["Retry", "ព្យាយាមម្ដងទៀត"],
  retry_done: [
    "{0}: the message waits to be sent again. It goes out within a minute.",
    // new
    "{0}៖ សាររង់ចាំផ្ញើម្ដងទៀត។ វានឹងចេញក្នុងមួយនាទី។",
  ],
  e_retry_409: [
    "This message was already sent again, or it is still being tried. The list is read again.",
    // new
    "សារនេះបានផ្ញើម្ដងទៀតរួចហើយ ឬកំពុងព្យាយាមនៅឡើយ។ បញ្ជីត្រូវបានអានម្ដងទៀត។",
  ],
  outbox_n: [
    "Every message waits in the outbox first, so nothing is lost if Telegram is slow.",
    "សារនីមួយៗរង់ចាំក្នុងប្រអប់ចេញជាមុន ដូច្នេះគ្មានអ្វីបាត់ទេ បើតេឡេក្រាមយឺត។",
  ],
  none_outbox: [
    "Every message was sent.",
    // new
    "សារទាំងអស់បានផ្ញើរួចហើយ។",
  ],
  err_telegram_blocked_by_person: [
    "The person blocked the bot",
    "អ្នកនោះបានបិទបូត",
  ],
  err_telegram_unreachable: [
    "Telegram did not answer in time",
    "តេឡេក្រាមមិនឆ្លើយទាន់ពេល",
  ],
  err_telegram_too_many: [
    "Telegram asked the app to slow down",
    // new
    "តេឡេក្រាមសុំឱ្យកម្មវិធីផ្ញើយឺតបន្តិច",
  ],
  err_relay_unreachable: [
    "The relay did not answer; tried again next minute",
    "រ៉េឡេមិនឆ្លើយ ហើយបានព្យាយាមម្ដងទៀតនៅនាទីបន្ទាប់",
  ],
  pulls: ["Last relay pulls", "ការទាញពីរ៉េឡេចុងក្រោយ"],
  c_at: ["Time", "ម៉ោង"],
  c_items: ["Items", "ចំនួន"],
  c_res: ["Result", "លទ្ធផល"],
  pull_OK: ["OK", "ល្អ"],
  pull_FAILED: [
    "Failed",
    // new
    "មិនបាន",
  ],
  none_pulls: [
    "The app has not pulled from the relay yet.",
    // new
    "កម្មវិធីមិនទាន់បានទាញពីរ៉េឡេនៅឡើយទេ។",
  ],
} as const satisfies Record<string, readonly [string, string]>;

export type TelegramTextKey = keyof typeof TEXT;

/** The words in the chosen language, with {0}, {1} filled in. */
export function tt(
  language: Language,
  key: TelegramTextKey,
  ...values: (string | number)[]
): string {
  const words: string = TEXT[key][language === "km" ? 1 : 0];
  return words.replace(/\{(\d+)\}/g, (match, index: string) => {
    const value = values[Number(index)];
    return value === undefined ? match : String(value);
  });
}

/** A server code with its own words; an unknown code shows as it is. */
export function hasText(key: string): key is TelegramTextKey {
  return key in TEXT;
}
