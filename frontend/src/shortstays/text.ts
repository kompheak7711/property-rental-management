// Daily and weekly rent: the words of Tenants › Short stays, in English and Khmer, from the
// mock-up rounds 28, 31 and 35 (DESIGN.md "Short stays"). Khmer marked "new" is not in the
// mock-up and needs the native check.

import type { Language } from "../signInText";

const TEXT = {
  loading: ["Loading…", "កំពុងផ្ទុក…"],
  failed: ["This could not be read just now.", "មិនអាចអានបានទេឥឡូវនេះ។"],
  retry: ["Try again", "សាកម្តងទៀត"],
  no_property: ["Choose a Property first.", "សូមជ្រើសអចលនទ្រព្យជាមុន។"],
  // new
  back: ["Back to Short stays", "ត្រឡប់ទៅការស្នាក់នៅខ្លី"],
  // new
  not_found: ["This booking was not found.", "រកមិនឃើញការកក់នេះទេ។"],
  required: ["required", "ចាំបាច់"],
  cancel: ["Cancel", "បោះបង់"],
  // Page
  sub: [
    "Daily and weekly guests in vacant Units. Full payment before check-in.",
    // new
    "ភ្ញៀវប្រចាំថ្ងៃ និងប្រចាំសប្ដាហ៍ក្នុងបន្ទប់ទំនេរ។ បង់ពេញមុនពេលចូល។",
  ],
  add: ["New booking", "ការកក់ថ្មី"],
  tabs: ["Views", "ទិដ្ឋភាព"],
  tab_cal: ["Calendar", "ប្រតិទិន"],
  tab_list: ["Bookings", "ការកក់"],
  prev: ["Earlier", "មុន"],
  next: ["Later", "បន្ទាប់"],
  this_week: ["Today", "ថ្ងៃនេះ"],
  c_unit: ["Unit", "បន្ទប់"],
  lease: ["Lease", "កិច្ចសន្យា"],
  reserved: ["Reserved", "បានកក់ទុក"],
  not_for_rent: ["Not for rent", "មិនជួល"],
  cal_none: ["There are no Units yet.", "មិនទាន់មានបន្ទប់នៅឡើយទេ។"],
  // List
  c_no: ["No.", "លេខ"],
  c_guest: ["Guest", "ភ្ញៀវ"],
  c_dates: ["Stay", "ការស្នាក់នៅ"],
  c_total: ["Total", "សរុប"],
  c_status: ["Status", "ស្ថានភាព"],
  c_source: ["Booked by", "កក់តាម"],
  none: ["No bookings yet.", "មិនទាន់មានការកក់នៅឡើយទេ។"],
  n1: ["1 booking", "ការកក់ 1"],
  n: ["{0} bookings", "ការកក់ {0}"],
  nights1: ["1 night", "1 យប់"],
  nights: ["{0} nights", "{0} យប់"],
  st_BOOKED: ["Booked", "បានកក់"],
  st_CHECKED_IN: ["Checked in", "បានចូល"],
  st_CHECKED_OUT: ["Checked out", "បានចេញ"],
  st_CANCELLED: ["Cancelled", "បានលុបចោល"],
  st_NO_SHOW: ["No-show", "មិនបានមក"],
  src_WALK_IN: ["Walk-in", "មកផ្ទាល់"],
  src_PHONE: ["Phone", "ទូរស័ព្ទ"],
  src_TELEGRAM: ["Telegram", "តេឡេក្រាម"],
  src_WEBSITE: ["Website", "គេហទំព័រ"],
  src_BOOKING_SITE: ["Booking site", "គេហទំព័រកក់"],
  // New booking
  new_sub: [
    "Pick the Unit and the nights. The price follows the rules in Settings.",
    // new
    "ជ្រើសបន្ទប់ និងយប់។ តម្លៃគិតតាមច្បាប់ក្នុងការកំណត់។",
  ],
  f_unit: ["Unit", "បន្ទប់"],
  f_in: ["Check-in", "ថ្ងៃចូល"],
  f_out: ["Check-out", "ថ្ងៃចេញ"],
  f_guests: ["Guests", "ចំនួនភ្ញៀវ"],
  f_source: ["Booked by", "កក់តាម"],
  f_site: ["Booking site", "គេហទំព័រកក់"],
  f_ref: ["Booking-site number", "លេខកក់របស់គេហទំព័រ"],
  f_note: ["Note", "កំណត់ចំណាំ"],
  f_guest: ["Guest", "ភ្ញៀវ"],
  f_find: ["Find a guest by name or phone", "ស្វែងរកភ្ញៀវតាមឈ្មោះ ឬទូរស័ព្ទ"],
  f_found_none: [
    "No Customer has this name or phone. Add the guest below.",
    // new
    "គ្មានអតិថិជនមានឈ្មោះ ឬទូរស័ព្ទនេះទេ។ បន្ថែមភ្ញៀវខាងក្រោម។",
  ],
  f_new_guest: ["New guest", "ភ្ញៀវថ្មី"],
  f_name: [
    "Full name (as on the ID or passport)",
    "ឈ្មោះពេញ (ដូចអត្តសញ្ញាណប័ណ្ណ ឬលិខិតឆ្លងដែន)",
  ],
  f_phone: ["Phone", "ទូរស័ព្ទ"],
  pick: ["Choose…", "ជ្រើសរើស…"],
  save: ["Book", "កក់"],
  saving: ["Booking…", "កំពុងកក់…"],
  // Price box
  p_title: ["Price", "តម្លៃ"],
  p_pick: [
    "Pick a Unit and the nights to see the price.",
    // new
    "ជ្រើសបន្ទប់ និងយប់ ដើម្បីមើលតម្លៃ។",
  ],
  l_NIGHTS: ["{0} × night {1}", "{0} × យប់ {1}"],
  l_WEEKS: ["{0} × week {1}", "{0} × សប្ដាហ៍ {1}"],
  off: ["{0}% off", "បញ្ចុះ {0}%"],
  total: ["Total to pay before check-in", "សរុបត្រូវបង់មុនពេលចូល"],
  as_weeks: [
    "Charged as whole weeks: a stay never costs more than the next whole week.",
    // new
    "គិតជាសប្ដាហ៍ពេញ៖ ការស្នាក់នៅមិនដែលថ្លៃជាងសប្ដាហ៍ពេញបន្ទាប់ទេ។",
  ],
  hint: [
    "This stay costs more than the 1-month-only rent of {0}. Offer the monthly Lease.",
    // new
    "ការស្នាក់នៅនេះថ្លៃជាងថ្លៃជួលតែ 1 ខែ {0}។ ស្នើកិច្ចសន្យាប្រចាំខែ។",
  ],
  b_PAST: ["The check-in day has passed.", "ថ្ងៃចូលបានកន្លងផុតហើយ។"],
  b_BOOKED: [
    "Another guest has booked one of these nights.",
    // new
    "ភ្ញៀវផ្សេងបានកក់យប់មួយក្នុងចំណោមយប់ទាំងនេះ។",
  ],
  b_LEASE: [
    "A Lease covers one of these nights.",
    // new
    "កិច្ចសន្យាជួលគ្របដណ្តប់យប់មួយក្នុងចំណោមយប់ទាំងនេះ។",
  ],
  b_RESERVED: [
    "The Unit is reserved for a tenant.",
    // new
    "បន្ទប់នេះបានកក់ទុកសម្រាប់អ្នកជួល។",
  ],
  b_NOT_FOR_RENT: ["The Unit is not for rent.", "បន្ទប់នេះមិនជួលទេ។"],
  b_UNIT_UNDER_MAINTENANCE: [
    "The Unit is under maintenance.",
    "បន្ទប់កំពុងជួសជុល។",
  ],
  b_UNIT_OUT_OF_SERVICE: ["The Unit is out of service.", "បន្ទប់ឈប់ប្រើ។"],
  p_too_long: [
    "A short stay is at most 29 nights. A longer stay is a Lease.",
    // new
    "ការស្នាក់នៅខ្លីមិនលើសពី 29 យប់ទេ។ ការស្នាក់នៅយូរជាងនេះគឺកិច្ចសន្យាជួល។",
  ],
  p_no_rent: [
    "This Unit has no monthly Rent, so it has no short-stay price.",
    // new
    "បន្ទប់នេះគ្មានថ្លៃជួលប្រចាំខែ ដូច្នេះគ្មានតម្លៃស្នាក់នៅខ្លីទេ។",
  ],
  // Errors
  e_sum1: ["1 thing needs fixing:", "មាន 1 ចំណុចត្រូវកែ៖"],
  e_sum: ["{0} things need fixing:", "មាន {0} ចំណុចត្រូវកែ៖"],
  e_unit: ["Choose the Unit.", "ជ្រើសបន្ទប់។"],
  e_dates: [
    "The check-out day is after the check-in day.",
    "ថ្ងៃចេញត្រូវនៅក្រោយថ្ងៃចូល។",
  ],
  e_guest: [
    "Choose the guest or add a new one.",
    "ជ្រើសភ្ញៀវ ឬបន្ថែមភ្ញៀវថ្មី។",
  ],
  e_site: ["Name the booking site.", "ដាក់ឈ្មោះគេហទំព័រកក់។"],
  e_guests: ["Guests are 1 to 10.", "ភ្ញៀវពី 1 ដល់ 10 នាក់។"],
  e_free: [
    "These nights cannot be booked in this Unit.",
    // new
    "យប់ទាំងនេះមិនអាចកក់ក្នុងបន្ទប់នេះបានទេ។",
  ],
  f_right: [
    "Your account may not make bookings.",
    // new
    "គណនីរបស់អ្នកមិនអាចធ្វើការកក់បានទេ។",
  ],
  f_taken: [
    "Someone has just booked one of these nights. Pick other nights or another Unit.",
    // new
    "មាននរណាម្នាក់ទើបតែកក់យប់មួយក្នុងចំណោមនេះ។ ជ្រើសយប់ផ្សេង ឬបន្ទប់ផ្សេង។",
  ],
  f_refused: [
    "The server refused this booking. Check what you typed.",
    // new
    "ម៉ាស៊ីនមេបានបដិសេធការកក់នេះ។ ពិនិត្យអ្វីដែលអ្នកបានវាយ។",
  ],
  f_failed: [
    "This was not saved. Check the connection and try again.",
    "មិនបានរក្សាទុកទេ។ ពិនិត្យការតភ្ជាប់ ហើយសាកម្តងទៀត។",
  ],
  // Booking
  made: ["Booking {0} made.", "បានធ្វើការកក់ {0}។"],
  d_stay: ["Stay", "ការស្នាក់នៅ"],
  d_guest: ["Guest", "ភ្ញៀវ"],
  d_guests: ["Guests", "ចំនួនភ្ញៀវ"],
  d_phone: ["Phone", "ទូរស័ព្ទ"],
  d_dates: ["{0} to {1}", "{0} ដល់ {1}"],
  d_price: ["Price", "តម្លៃ"],
  d_hist: ["History", "ប្រវត្តិ"],
  ev_BOOKED: ["Booked", "បានកក់"],
  // Calendar squares and Unit types
  // new
  cal_free: ["Free", "ទំនេរ"],
  // new
  cal_in: ["In stay", "កំពុងស្នាក់"],
  // new
  cal_closed: ["Closed", "បិទ"],
  // new
  cal_book: ["New booking: {0}, night of {1}", "ការកក់ថ្មី៖ {0} យប់ថ្ងៃ {1}"],
  // new
  cal_days: ["{0} to {1}", "{0} ដល់ {1}"],
  t_STUDIO: ["Studio", "ស្ទូឌីយោ"],
  // new
  t_ONE_BEDROOM: ["1 bedroom", "1 បន្ទប់គេង"],
  // new
  t_TWO_BEDROOM: ["2 bedrooms", "2 បន្ទប់គេង"],
  // New booking, more
  // new
  f_nights: ["Nights", "ចំនួនយប់"],
  // new
  f_free_only: [
    "Only Units free on all these nights can be picked.",
    "អាចជ្រើសបានតែបន្ទប់ដែលទំនេរគ្រប់យប់ទាំងនេះ។",
  ],
  // new
  u_busy: ["not free", "មិនទំនេរ"],
  // new
  f_find_b: ["Find", "ស្វែងរក"],
  // new
  f_finding: ["Finding…", "កំពុងស្វែងរក…"],
  // new
  f_id: ["ID or passport number", "លេខអត្តសញ្ញាណប័ណ្ណ ឬលិខិតឆ្លងដែន"],
  // new
  g_choose: ["Choose", "ជ្រើស"],
  // new
  g_change: ["Change guest", "ប្តូរភ្ញៀវ"],
  // new
  g_add_new: ["Add a new guest", "បន្ថែមភ្ញៀវថ្មី"],
  // new
  g_no_right: [
    "Your account may not add Customers. Ask a Manager, or find a guest who is already a Customer.",
    "គណនីរបស់អ្នកមិនអាចបន្ថែមអតិថិជនបានទេ។ សូមសួរអ្នកគ្រប់គ្រង ឬស្វែងរកភ្ញៀវដែលជាអតិថិជនរួចហើយ។",
  ],
  // new
  g_same: [
    "This may be the same person. Use this Customer, or say it is another person.",
    "នេះប្រហែលជាមនុស្សតែមួយ។ ប្រើអតិថិជននេះ ឬបញ្ជាក់ថាជាមនុស្សផ្សេង។",
  ],
  // new
  g_use: ["Use this Customer", "ប្រើអតិថិជននេះ"],
  // new
  g_other: [
    "Another person: add the new guest",
    "មនុស្សផ្សេង៖ បន្ថែមភ្ញៀវថ្មី",
  ],
  // new
  g_id_used: [
    "Another Customer has this ID or passport number. Use that Customer.",
    "អតិថិជនផ្សេងមានលេខអត្តសញ្ញាណប័ណ្ណ ឬលិខិតឆ្លងដែននេះរួចហើយ។ សូមប្រើអតិថិជននោះ។",
  ],
  // new
  g_failed: [
    "The guest was not added. Check the connection and try again.",
    "មិនបានបន្ថែមភ្ញៀវទេ។ ពិនិត្យការតភ្ជាប់ ហើយសាកម្តងទៀត។",
  ],
  // new
  e_in: ["Choose the check-in day.", "ជ្រើសថ្ងៃចូល។"],
  // new
  e_nights: [
    "Type the nights: a whole number, 1 or more.",
    "វាយចំនួនយប់៖ ចំនួនគត់ ចាប់ពី 1 ឡើងទៅ។",
  ],
  // new
  e_name: ["Type the guest's full name.", "វាយឈ្មោះពេញរបស់ភ្ញៀវ។"],
  // new
  e_id: [
    "Type the ID or passport number.",
    "វាយលេខអត្តសញ្ញាណប័ណ្ណ ឬលិខិតឆ្លងដែន។",
  ],
  // Booking page, more
  // new
  d_unit: ["Unit", "បន្ទប់"],
  // new
  d_nights: ["Nights", "ចំនួនយប់"],
  // new
  d_source: ["Booked by", "កក់តាម"],
  // new
  d_site: ["Booking site", "គេហទំព័រកក់"],
  // new
  d_note: ["Note", "កំណត់ចំណាំ"],
  // new
  d_open_customer: ["Open Customer", "បើកអតិថិជន"],
} as const satisfies Record<string, readonly [string, string]>;

export type StaysTextKey = keyof typeof TEXT;

/** The words in the chosen language, with {0}, {1} filled in. */
export function st(
  language: Language,
  key: StaysTextKey,
  ...values: (string | number)[]
): string {
  const words: string = TEXT[key][language === "km" ? 1 : 0];
  return words.replace(/\{(\d+)\}/g, (match, index: string) => {
    const value = values[Number(index)];
    return value === undefined ? match : String(value);
  });
}

export function hasText(key: string): key is StaysTextKey {
  return key in TEXT;
}
