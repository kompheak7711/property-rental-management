// DL-253 (parking step 2): the words of the Parking page in English and Khmer. Every line is
// new and the Khmer needs the native check before the app is used.

import type { Language } from "../signInText";
import { singular } from "../shell/plural";

const TEXT = {
  sub: ["{0} parking spaces", "កន្លែងចំណត {0}"],
  loading: ["Loading the parking spaces…", "កំពុងផ្ទុកកន្លែងចំណត…"],
  failed: [
    "The parking spaces could not be loaded. Retry when the service is available.",
    "មិនអាចអានកន្លែងចំណតបានទេ។ សូមព្យាយាមម្តងទៀតពេលសេវាអាចប្រើបាន។",
  ],
  retry: ["Retry", "ព្យាយាមម្តងទៀត"],
  no_property: [
    "The Property is not known yet, so the parking spaces cannot be shown.",
    "មិនទាន់ស្គាល់អគារ ដូច្នេះមិនអាចបង្ហាញកន្លែងចំណតបានទេ។",
  ],
  new_space: ["New space", "កន្លែងថ្មី"],
  edit_space: ["Edit space", "កែកន្លែង"],
  all_types: ["All types", "គ្រប់ប្រភេទ"],
  type: ["Parking Type", "ប្រភេទចំណត"],
  c_all: ["All spaces", "កន្លែងទាំងអស់"],
  c_free: ["Free", "ទំនេរ"],
  c_used: ["In use", "កំពុងប្រើ"],
  c_guests: ["Kept for short-stay guests", "ទុកសម្រាប់ភ្ញៀវស្នាក់ខ្លី"],
  none: ["No parking spaces to show.", "គ្មានកន្លែងចំណតត្រូវបង្ហាញទេ។"],
  showing: ["Showing: {0}", "កំពុងបង្ហាញ៖ {0}"],
  show_all: ["Show all", "បង្ហាញទាំងអស់"],
  col_space: ["Space", "កន្លែង"],
  col_area: ["Area", "តំបន់"],
  col_places: ["Places used", "កន្លែងបានប្រើ"],
  col_price: ["Price a month", "តម្លៃក្នុងមួយខែ"],
  col_held: ["Held by", "កាន់កាប់ដោយ"],
  places_of: ["{0} of {1}", "{0} នៃ {1}"],
  from_type: ["{0} (type price)", "{0} (តម្លៃប្រភេទ)"],
  no_price: ["No price", "គ្មានតម្លៃ"],
  free: ["Free", "ទំនេរ"],
  guests_chip: ["Short-stay guests", "ភ្ញៀវស្នាក់ខ្លី"],
  with_room: ["{0}, room {1}", "{0} បន្ទប់ {1}"],
  agreement: ["Parking agreement", "កិច្ចព្រមព្រៀងចំណត"],
  number: ["Space number", "លេខកន្លែង"],
  required: ["Required", "ត្រូវការ"],
  area: ["Area", "តំបន់"],
  area_help: [
    "Where the space is, such as “Ground floor” or “Back yard”.",
    "ទីតាំងកន្លែង ដូចជា «ជាន់ផ្ទាល់ដី» ឬ «ទីធ្លាខាងក្រោយ»។",
  ],
  capacity: ["Number of places", "ចំនួនកន្លែង"],
  capacity_help: [
    "1 for one car space. A shared area, such as the motorbike area, holds more.",
    "1 សម្រាប់កន្លែងឡានមួយ។ តំបន់រួម ដូចជាតំបន់ម៉ូតូ អាចមានច្រើន។",
  ],
  kept: ["Keep for short-stay guests", "ទុកសម្រាប់ភ្ញៀវស្នាក់ខ្លី"],
  kept_help: [
    "Tenants cannot hold a space kept for short-stay guests.",
    "អ្នកជួលមិនអាចកាន់កាប់កន្លែងដែលទុកសម្រាប់ភ្ញៀវស្នាក់ខ្លីបានទេ។",
  ],
  use_type: ["Use the Parking Type price", "ប្រើតម្លៃប្រភេទចំណត"],
  type_price: [
    "Parking Type price: {0} a month",
    "តម្លៃប្រភេទចំណត៖ {0} ក្នុងមួយខែ",
  ],
  type_no_price: [
    "This Parking Type has no price yet. Set it in Settings › Unit setup › Parking Types, or type a price for this space.",
    "ប្រភេទចំណតនេះមិនទាន់មានតម្លៃទេ។ កំណត់វានៅ ការកំណត់ › ការរៀបចំបន្ទប់ › ប្រភេទចំណត ឬវាយតម្លៃសម្រាប់កន្លែងនេះ។",
  ],
  price: ["Price a month (USD)", "តម្លៃក្នុងមួយខែ (ដុល្លារ)"],
  price_help: [
    "New parking on a Lease starts at this price. Leases that already exist do not change.",
    "ការចំណតថ្មីលើកិច្ចសន្យាចាប់ផ្តើមនៅតម្លៃនេះ។ កិច្ចសន្យាដែលមានរួចមិនផ្លាស់ប្តូរទេ។",
  ],
  e_number: ["Enter the space number.", "បញ្ចូលលេខកន្លែង។"],
  e_area: ["Enter where the space is.", "បញ្ចូលទីតាំងកន្លែង។"],
  e_type: ["Pick a Parking Type.", "ជ្រើសប្រភេទចំណត។"],
  e_capacity: [
    "Enter a whole number from 1 to 500.",
    "បញ្ចូលចំនួនគត់ពី 1 ដល់ 500។",
  ],
  e_price: [
    "Enter an amount, such as 35.00.",
    "បញ្ចូលចំនួនទឹកប្រាក់ ដូចជា 35.00។",
  ],
  r_NUMBER_TAKEN: [
    "Another Unit or space already has this number.",
    "បន្ទប់ ឬកន្លែងផ្សេងមានលេខនេះរួចហើយ។",
  ],
  r_TYPE_HAS_NO_PRICE: [
    "This Parking Type has no price yet. Set it in Settings › Unit setup › Parking Types, or type a price for this space.",
    "ប្រភេទចំណតនេះមិនទាន់មានតម្លៃទេ។ កំណត់វានៅ ការកំណត់ › ការរៀបចំបន្ទប់ › ប្រភេទចំណត ឬវាយតម្លៃសម្រាប់កន្លែងនេះ។",
  ],
  r_PARKING_CAPACITY: [
    "More vehicles hold this space than the new number of places.",
    "យានយន្តកាន់កាប់កន្លែងនេះច្រើនជាងចំនួនកន្លែងថ្មី។",
  ],
  r_VEHICLE_TYPE: [
    "A vehicle that holds this space is not of the new Parking Type.",
    "យានយន្តដែលកាន់កាប់កន្លែងនេះមិនមែនប្រភេទចំណតថ្មីទេ។",
  ],
  r_PARKING_KEPT_FOR_GUESTS: [
    "A tenant holds this space, so it cannot be kept for short-stay guests now.",
    "អ្នកជួលកំពុងកាន់កាប់កន្លែងនេះ ដូច្នេះមិនអាចទុកសម្រាប់ភ្ញៀវស្នាក់ខ្លីឥឡូវនេះបានទេ។",
  ],
  r_CHANGED: [
    "Someone changed this space meanwhile. The list was read again; please try again.",
    "មាននរណាម្នាក់បានកែកន្លែងនេះ។ បញ្ជីត្រូវបានអានម្តងទៀត សូមព្យាយាមម្តងទៀត។",
  ],
  r_INVALID: [
    "The space was not saved. Check the boxes and try again.",
    "កន្លែងមិនត្រូវបានរក្សាទេ។ សូមពិនិត្យប្រអប់ ហើយព្យាយាមម្តងទៀត។",
  ],
  r_UNAVAILABLE: [
    "Your account cannot change parking spaces.",
    "គណនីរបស់អ្នកមិនអាចកែកន្លែងចំណតបានទេ។",
  ],
  r_FAILED: [
    "The space was not saved. Check your connection and try again.",
    "កន្លែងមិនត្រូវបានរក្សាទេ។ សូមពិនិត្យការតភ្ជាប់ ហើយព្យាយាមម្តងទៀត។",
  ],
  saved_new: ["Space {0} was added.", "បានបន្ថែមកន្លែង {0}។"],
  saved: ["Space {0} was saved.", "បានរក្សាកន្លែង {0}។"],
  save: ["Save", "រក្សាទុក"],
  cancel: ["Cancel", "បោះបង់"],
  types_failed: [
    "The Parking Types could not be loaded, so spaces cannot be added or changed now.",
    "មិនអាចអានប្រភេទចំណតបានទេ ដូច្នេះមិនអាចបន្ថែម ឬកែកន្លែងបានឥឡូវនេះ។",
  ],
  note: [
    "A tenant gets parking on the Lease of a room, or on a Parking agreement.",
    "អ្នកជួលទទួលបានការចំណតលើកិច្ចសន្យាជួលបន្ទប់ ឬលើកិច្ចព្រមព្រៀងចំណត។",
  ],
  // Step 3a: the Vehicles card on the Customer page.
  v_title: ["Vehicles", "យានយន្ត"],
  v_loading: ["Loading the vehicles…", "កំពុងផ្ទុកយានយន្ត…"],
  v_failed: ["The vehicles could not be loaded.", "មិនអាចអានយានយន្តបានទេ។"],
  v_none: ["No vehicles yet.", "មិនទាន់មានយានយន្តទេ។"],
  v_add: ["Add vehicle", "បន្ថែមយានយន្ត"],
  v_edit: ["Edit vehicle", "កែយានយន្ត"],
  v_edit_plate: ["Edit {0}", "កែ {0}"],
  v_CAR: ["Car", "ឡាន"],
  v_MOTORBIKE: ["Motorbike", "ម៉ូតូ"],
  v_TUK_TUK: ["Tuk-tuk", "តុកតុក"],
  v_FOOD_CART: ["Food cart", "រទេះលក់ម្ហូប"],
  v_type: ["Vehicle type", "ប្រភេទយានយន្ត"],
  v_plate: ["Plate number", "ស្លាកលេខ"],
  v_plate_help: [
    "As it is written on the plate, such as 2A-1234.",
    "ដូចដែលសរសេរលើស្លាក ដូចជា 2A-1234។",
  ],
  v_colour: ["Colour", "ពណ៌"],
  v_brand: ["Brand and model", "ម៉ាក និងម៉ូដែល"],
  v_sticker: ["Sticker number", "លេខស្ទីគ័រ"],
  v_optional: ["Optional", "មិនចាំបាច់"],
  v_e_plate: ["Enter the plate number.", "បញ្ចូលស្លាកលេខ។"],
  v_parks: ["Parks in {0}", "ចតនៅ {0}"],
  v_parks_lease: ["Parks in {0} · {1}", "ចតនៅ {0} · {1}"],
  v_no_space: ["No space today", "គ្មានកន្លែងថ្ងៃនេះ"],
  v_sticker_line: ["Sticker {0}", "ស្ទីគ័រ {0}"],
  v_note: [
    "A vehicle is corrected, never deleted. A space is given on the Lease.",
    "យានយន្តត្រូវបានកែ មិនដែលលុបទេ។ កន្លែងចតត្រូវបានផ្តល់លើកិច្ចសន្យា។",
  ],
  v_saved_new: ["Vehicle {0} was added.", "បានបន្ថែមយានយន្ត {0}។"],
  v_saved: ["Vehicle {0} was saved.", "បានរក្សាយានយន្ត {0}។"],
  v_r_VEHICLE_TYPE: [
    "This vehicle holds a space of another Parking Type today, so its type cannot change now.",
    "យានយន្តនេះកំពុងកាន់កាប់កន្លែងនៃប្រភេទចំណតផ្សេងនៅថ្ងៃនេះ ដូច្នេះមិនអាចប្តូរប្រភេទឥឡូវនេះបានទេ។",
  ],
  v_r_CHANGED: [
    "Someone changed this vehicle meanwhile. The list was read again; please try again.",
    "មាននរណាម្នាក់បានកែយានយន្តនេះ។ បញ្ជីត្រូវបានអានម្តងទៀត សូមព្យាយាមម្តងទៀត។",
  ],
  v_r_INVALID: [
    "The vehicle was not saved. Check the boxes and try again.",
    "យានយន្តមិនត្រូវបានរក្សាទេ។ សូមពិនិត្យប្រអប់ ហើយព្យាយាមម្តងទៀត។",
  ],
  v_r_UNAVAILABLE: [
    "Your account cannot change vehicles.",
    "គណនីរបស់អ្នកមិនអាចកែយានយន្តបានទេ។",
  ],
  v_r_FAILED: [
    "The vehicle was not saved. Check your connection and try again.",
    "យានយន្តមិនត្រូវបានរក្សាទេ។ សូមពិនិត្យការតភ្ជាប់ ហើយព្យាយាមម្តងទៀត។",
  ],
  // Step 3b: the Parking card of a room Lease.
  lp_title: ["Parking", "ចំណត"],
  lp_failed: [
    "The parking of this Lease could not be loaded.",
    "មិនអាចអានការចំណតនៃកិច្ចសន្យានេះបានទេ។",
  ],
  lp_period: ["From {0} to {1}", "ពី {0} ដល់ {1}"],
  lp_period_open: ["From {0}", "ពី {0}"],
  lp_space: ["Space {0}", "កន្លែង {0}"],
  lp_price: ["{0} a month, fixed", "{0} ក្នុងមួយខែ ថេរ"],
  lp_no_vehicle: ["No vehicle yet", "មិនទាន់មានយានយន្ត"],
  lp_none: [
    "No space picked yet. Pick a space before you sign the Lease.",
    "មិនទាន់ជ្រើសកន្លែងទេ។ សូមជ្រើសកន្លែងមុនពេលចុះហត្ថលេខាលើកិច្ចសន្យា។",
  ],
  lp_pick: ["Pick space", "ជ្រើសកន្លែង"],
  lp_pick_title: ["Pick a space · {0}", "ជ្រើសកន្លែង · {0}"],
  lp_space_field: ["Parking space", "កន្លែងចំណត"],
  lp_space_option: ["{0} · {1} · {2} a month", "{0} · {1} · {2} ក្នុងមួយខែ"],
  lp_no_free: [
    "No space of a fitting type is free on these days.",
    "គ្មានកន្លែងប្រភេទសមរម្យទំនេរនៅថ្ងៃទាំងនេះទេ។",
  ],
  lp_vehicle_field: ["Vehicle", "យានយន្ត"],
  lp_vehicle_help: [
    "A vehicle of someone on the Lease. Add vehicles on the Customer page.",
    "យានយន្តរបស់អ្នកនៅលើកិច្ចសន្យា។ បន្ថែមយានយន្តនៅទំព័រអតិថិជន។",
  ],
  lp_fixed_note: [
    "The tenant pays this space's price on the Rent Invoice. The price is kept from today and does not change later.",
    "អ្នកជួលបង់តម្លៃកន្លែងនេះលើវិក្កយបត្រជួល។ តម្លៃត្រូវរក្សាពីថ្ងៃនេះ ហើយមិនផ្លាស់ប្តូរពេលក្រោយទេ។",
  ],
  lp_saved: ["Space {0} was picked.", "បានជ្រើសកន្លែង {0}។"],
  lp_r_PARKING_ALREADY_HELD: [
    "This parking already has a space. The card was read again.",
    "ការចំណតនេះមានកន្លែងរួចហើយ។ កាតត្រូវបានអានម្តងទៀត។",
  ],
  lp_r_PARKING_SPACE_TAKEN: [
    "Another vehicle holds this space on these days. Pick another space.",
    "យានយន្តផ្សេងកាន់កាប់កន្លែងនេះនៅថ្ងៃទាំងនេះ។ សូមជ្រើសកន្លែងផ្សេង។",
  ],
  lp_r_VEHICLE_TYPE: [
    "This vehicle cannot park in this Parking Type.",
    "យានយន្តនេះមិនអាចចតក្នុងប្រភេទចំណតនេះបានទេ។",
  ],
  lp_r_VEHICLE_NOT_OF_LEASE: [
    "The vehicle belongs to nobody on this Lease.",
    "យានយន្តនេះមិនមែនរបស់អ្នកណាម្នាក់នៅលើកិច្ចសន្យានេះទេ។",
  ],
  lp_r_PARKING_KEPT_FOR_GUESTS: [
    "This space is kept for short-stay guests.",
    "កន្លែងនេះទុកសម្រាប់ភ្ញៀវស្នាក់ខ្លី។",
  ],
  lp_r_TYPE_HAS_NO_PRICE: [
    "This space has no price. Set the Parking Type price in Settings first.",
    "កន្លែងនេះគ្មានតម្លៃ។ សូមកំណត់តម្លៃប្រភេទចំណតក្នុងការកំណត់ជាមុនសិន។",
  ],
  lp_r_LEASE_CLOSED: [
    "Only a drafted or signed Lease takes a parking space.",
    "មានតែកិច្ចសន្យាព្រាង ឬបានចុះហត្ថលេខាទេ ដែលអាចមានកន្លែងចំណត។",
  ],
  lp_r_UNAVAILABLE: [
    "Your account cannot pick parking spaces.",
    "គណនីរបស់អ្នកមិនអាចជ្រើសកន្លែងចំណតបានទេ។",
  ],
  lp_r_FAILED: [
    "The space was not picked. Check your connection and try again.",
    "កន្លែងមិនត្រូវបានជ្រើសទេ។ សូមពិនិត្យការតភ្ជាប់ ហើយព្យាយាមម្តងទៀត។",
  ],
  lp_r_AGREEMENT_DATES_MISSING: [
    "Add the start date first (Edit draft).",
    "សូមបញ្ចូលថ្ងៃចាប់ផ្តើមជាមុនសិន (កែសេចក្តីព្រាង)។",
  ],
  pa_title: ["Parking agreement", "កិច្ចសន្យាចំណត"],
  pa_space: ["Space {0} · {1}", "កន្លែង {0} · {1}"],
  pa_month_to_month: ["Month to month, from {0}", "ប្រចាំខែ ចាប់ពី {0}"],
  pa_vehicle_none: [
    "No vehicle picked yet. Pick the vehicle before you sign.",
    "មិនទាន់ជ្រើសយានយន្តទេ។ សូមជ្រើសយានយន្តមុនពេលចុះហត្ថលេខា។",
  ],
  pa_vehicle_pick: ["Pick vehicle", "ជ្រើសយានយន្ត"],
  pa_vehicle_change: ["Change vehicle", "ប្តូរយានយន្ត"],
  pa_vehicle_title: ["Vehicle for space {0}", "យានយន្តសម្រាប់កន្លែង {0}"],
  pa_vehicle_help: [
    "A vehicle of the customer on this agreement. Add vehicles on the Customer page.",
    "យានយន្តរបស់អតិថិជនក្នុងកិច្ចសន្យានេះ។ បន្ថែមយានយន្តនៅទំព័រអតិថិជន។",
  ],
  pa_no_vehicles: [
    "This customer has no vehicle yet. Add one on the Customer page first.",
    "អតិថិជននេះមិនទាន់មានយានយន្តទេ។ សូមបន្ថែមនៅទំព័រអតិថិជនជាមុនសិន។",
  ],
  pa_vehicle_saved: ["Vehicle {0} was picked.", "បានជ្រើសយានយន្ត {0}។"],
  pa_new: ["New Parking agreement", "កិច្ចសន្យាចំណតថ្មី"],
  pc_title: ["Change vehicle · space {0}", "ប្តូរយានយន្ត · កន្លែង {0}"],
  pc_new_vehicle: ["New vehicle", "យានយន្តថ្មី"],
  pc_day: ["From", "ចាប់ពី"],
  pc_reason: ["Reason", "មូលហេតុ"],
  pc_no_other: [
    "There is no other vehicle on this Lease. Add one on the Customer page first.",
    "គ្មានយានយន្តផ្សេងទៀតក្នុងកិច្ចសន្យានេះទេ។ សូមបន្ថែមនៅទំព័រអតិថិជនជាមុនសិន។",
  ],
  pc_saved: ["The vehicle is now {0}.", "យានយន្តឥឡូវគឺ {0}។"],
  lp_r_VEHICLE_SAME: [
    "This vehicle already parks here.",
    "យានយន្តនេះចតនៅទីនេះរួចហើយ។",
  ],
  lp_r_CHANGE_DATE: [
    "Pick a day on which this space is held.",
    "សូមជ្រើសថ្ងៃដែលកន្លែងនេះត្រូវបានកក់។",
  ],
  lp_r_CHANGE_REASON: [
    "Give a short reason for the change.",
    "សូមផ្តល់មូលហេតុខ្លីសម្រាប់ការប្តូរ។",
  ],
  // DL-258 (parking step 5c): End agreement and Close agreement.
  pe_end: ["End agreement", "បញ្ចប់កិច្ចសន្យា"],
  pe_title: ["End agreement · space {0}", "បញ្ចប់កិច្ចសន្យា · កន្លែង {0}"],
  pe_who: ["Who gave notice", "អ្នកផ្តល់ការជូនដំណឹង"],
  pe_customer: ["The customer told us", "អតិថិជនបានប្រាប់យើង"],
  pe_owner: ["The owner gives a 30-day letter", "ម្ចាស់ផ្តល់លិខិត ៣០ ថ្ងៃ"],
  pe_day_customer: ["Day the customer told us", "ថ្ងៃដែលអតិថិជនបានប្រាប់"],
  pe_day_owner: ["Day the letter is given", "ថ្ងៃប្រគល់លិខិត"],
  pe_note: ["Note", "កំណត់ចំណាំ"],
  pe_last: ["Last day: {0}", "ថ្ងៃចុងក្រោយ៖ {0}"],
  pe_rule_customer: [
    "Told before the 25th: the agreement ends at the end of this month. Told on the 25th or later: at the end of next month.",
    "ប្រាប់មុនថ្ងៃទី ២៥៖ កិច្ចសន្យាបញ្ចប់នៅចុងខែនេះ។ ប្រាប់ថ្ងៃទី ២៥ ឬក្រោយ៖ នៅចុងខែក្រោយ។",
  ],
  pe_rule_owner: [
    "The agreement ends 30 days after the letter is given.",
    "កិច្ចសន្យាបញ្ចប់ ៣០ ថ្ងៃក្រោយការប្រគល់លិខិត។",
  ],
  pe_rule_money: [
    "A month already billed is never cut. On the last day close the agreement; the deposit goes back, less any money owed.",
    "ខែដែលបានចេញវិក្កយបត្ររួច មិនត្រូវកាត់ទេ។ នៅថ្ងៃចុងក្រោយ សូមបិទកិច្ចសន្យា។ ប្រាក់កក់ត្រូវប្រគល់វិញ ដកប្រាក់ដែលនៅជំពាក់។",
  ],
  pe_saved: ["The agreement ends on {0}.", "កិច្ចសន្យាបញ្ចប់នៅ {0}។"],
  pe_ends: [
    "Ends on {0} · notice given on {1}",
    "បញ្ចប់នៅ {0} · បានជូនដំណឹងនៅ {1}",
  ],
  pe_close: ["Close agreement", "បិទកិច្ចសន្យា"],
  pe_close_title: ["Close agreement · space {0}", "បិទកិច្ចសន្យា · កន្លែង {0}"],
  pe_close_text: [
    "The agreement reached its last day, {0}. Closing it ends it on that day. It is not an early ending, so the deposit goes back, less any money owed, in the Final Settlement.",
    "កិច្ចសន្យាដល់ថ្ងៃចុងក្រោយ {0}។ ការបិទនឹងបញ្ចប់វានៅថ្ងៃនោះ។ វាមិនមែនជាការបញ្ចប់មុនកាលកំណត់ទេ ដូច្នេះប្រាក់កក់ត្រូវប្រគល់វិញ ដកប្រាក់ដែលនៅជំពាក់ ក្នុងការទូទាត់ចុងក្រោយ។",
  ],
  pe_closed: [
    "The agreement was closed on {0}.",
    "កិច្ចសន្យាត្រូវបានបិទនៅ {0}។",
  ],
  pe_settlement: ["Open the Final Settlement", "បើកការទូទាត់ចុងក្រោយ"],
  pe_close_failed: [
    "The agreement was not closed. Check your connection and try again.",
    "កិច្ចសន្យាមិនត្រូវបានបិទទេ។ សូមពិនិត្យការតភ្ជាប់ ហើយព្យាយាមម្តងទៀត។",
  ],
  lp_r_LEASE_NOT_MONTH_TO_MONTH: [
    "Only a signed month-to-month Parking agreement ends by notice.",
    "មានតែកិច្ចសន្យាចំណតប្រចាំខែដែលបានចុះហត្ថលេខាទេ ដែលបញ្ចប់ដោយការជូនដំណឹង។",
  ],
  lp_r_ENDING_ALREADY_SET: [
    "This agreement already has its last day.",
    "កិច្ចសន្យានេះមានថ្ងៃចុងក្រោយរួចហើយ។",
  ],
  lp_r_TOLD_DATE: [
    "Pick a day from the Start Date to today.",
    "សូមជ្រើសថ្ងៃពីថ្ងៃចាប់ផ្តើមដល់ថ្ងៃនេះ។",
  ],
  lp_r_DRAFT_AFTER_END: [
    "A draft Invoice bills a day after the last day. Delete that draft first.",
    "មានវិក្កយបត្រព្រាងគិតថ្ងៃក្រោយថ្ងៃចុងក្រោយ។ សូមលុបវិក្កយបត្រព្រាងនោះជាមុនសិន។",
  ],
  col_actions: ["Actions", "សកម្មភាព"],
  ptype_COVERED: ["Covered", "ចំណតមានដំបូល"],
  ptype_UNCOVERED: ["Uncovered", "ចំណតគ្មានដំបូល"],
  ptype_MOTORBIKE: ["Motorbike", "ម៉ូតូ"],
  ptype_TUK_TUK_FOOD_CART: ["Tuk-Tuk/Food Cart", "តុកតុក/រទេះលក់ម្ហូប"],
} as const;

export type ParkingTextKey = keyof typeof TEXT;

export function pt(
  language: Language,
  key: ParkingTextKey,
  ...values: (string | number)[]
): string {
  return singular(
    TEXT[key][language === "en" ? 0 : 1].replace(/\{(\d)\}/g, (_, n) =>
      String(values[Number(n)] ?? ""),
    ),
  );
}
