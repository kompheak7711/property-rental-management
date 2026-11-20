// DL-254 (owner answer Q6): a Parking agreement may run month to month, with no end date. The
// Lease keeps this End Date so every Lease rule still has a date; the screens say
// "Month to month" instead.

import { dayText } from "../shell/format";
import type { Language } from "../signInText";
import { lt } from "./text";

export const MONTH_TO_MONTH_END = "2099-12-31";

/** The End Date as staff read it: "Month to month" for the far date, else the day. */
export function endDayText(language: Language, end: string | null): string {
  return end === MONTH_TO_MONTH_END
    ? lt(language, "pa_month_to_month")
    : dayText(end);
}
