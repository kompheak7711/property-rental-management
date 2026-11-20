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
