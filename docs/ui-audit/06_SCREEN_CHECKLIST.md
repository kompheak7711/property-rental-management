# 06 Screen checklist

Date: 16/11/2026. Branch `ui-v81`.

One list to check every screen against: new screens before they are merged, and
existing screens during a review. 22 rules. Each rule is a yes/no question.

Where a rule repeats a rule in `docs/006_UI_SPECIFICATION.md`, the UI number is
given. The UI specification wins if the two ever disagree.

## How to review a screen

1. Pick the screen from `00_SCREEN_INVENTORY.md`.
2. Open it with real-looking data, then with no data, then while it loads.
3. Check it at the five sizes of `05_RESPONSIVE_CHECKS.md`: 390 × 844 (phone),
   768 × 1024 (iPad upright), 1366 × 768, 1440 × 900 and 1920 × 1080. Add
   1024 × 768 (iPad on its side): DL-074 asks for both iPad directions, and the
   five sizes do not cover this one yet. Add 2560 × 1440 (large monitor) and
   5120 × 1440 (super-wide monitor). A quick review may use only 390 × 844 and
   1366 × 768, the two hardest sizes.
4. Answer every question below: **OK**, **Fix** (with what to change) or
   **N/A** (the screen has no such part).
5. Write the result in the review record at the end of this file.

## A. Numbers and money

| # | Question | Source |
|---|---|---|
| 1 | Are amounts right-aligned, with digits that line up (`tabular-nums`), and the currency shown in the heading or in each cell? | UI-020 · design reel "Align" |
| 2 | Does a missing value show a dash (–), never a blank, and never a 0 the server did not send? | UI-013 · design reel "Cells" |

## B. Forms and choices

| # | Question | Source |
|---|---|---|
| 3 | Does the form fill in what the app already knows (tenant, Unit, rent, today's date)? Only from server data: a default must never make a new rule. | UI-001, section 1 · Parkinson's law |
| 4 | Are menus, tabs, filters and pick lists kept short, with rarely used items grouped or tucked away? | Choice overload |

## C. Layout

| # | Question | Source |
|---|---|---|
| 5 | On a phone, does each list row fit in two lines (name left, amount right, state below), with no sideways scrolling? | `05_RESPONSIVE_CHECKS.md` · design reel "Stack" |
| 6 | Do corner radius values come from one scale, with no one-off values (see note below)? | Design reel "Radius scale" |
| 7 | When a pop-up opens (confirm a payment, void, delete), is the page behind it dimmed? | Figure-ground |
| 8 | Do warnings (late rent, urgent problems, expiring items) look like part of the content, not like an advert banner? | Banner blindness |
| 9 | Are related things close together (a tenant's name, Unit and balance), with space between unrelated groups? | Proximity |

## D. Feel and speed

| # | Question | Source |
|---|---|---|
| 10 | Do tables, forms and buttons work the way people expect from other apps? | Jakob's law |
| 11 | Is every button, switch, tab and number card at least 44 px tall, at every size, including the tighter look on short desktop screens? | UI-101 (DL-074) · `05_RESPONSIVE_CHECKS.md` round 12 · Fitts's law |
| 12 | Does every click answer within about 0.4 seconds, or show at once that something is happening? | Doherty threshold · UI-012 |

## E. Rules this repo already has

| # | Question | Source |
|---|---|---|
| 13 | Does the screen handle every state in the list below that applies to it? | UI-012 to UI-017 · `AGENTS.md` |
| 14 | Can it be used with the keyboard only, with visible focus and a label on every field (WCAG 2.2 AA)? | UI-007 · `AGENTS.md` |
| 15 | Does it follow the existing design system (for example: only one filled green button per area)? | `05_RESPONSIVE_CHECKS.md` · `AGENTS.md` |

## F. Screen sizes

| # | Question | Source |
|---|---|---|
| 16 | Does the page stay inside the screen width at every size? A wide table or tab strip scrolls sideways inside its own box, never the whole page. | `05_RESPONSIVE_CHECKS.md` §1 point 1, §2 "Other" |
| 17 | Is no label, value, button, heading, tab or chip cut off or ended with "…"? Amounts are never cut. Text stays within 2 lines (a card note 3, or 4 on a phone; the sentence under a page title may wrap). | `05_RESPONSIVE_CHECKS.md` §1 points 2–3 |
| 18 | Do number-card grids follow the set layout? Under 640 px: money cards 1 per row, other cards 2. From 640 to 1023 px: money cards 2, other cards 3. From 1024 px: 4 per row. Cards in one row have the same height, and a value never wraps. | `05_RESPONSIVE_CHECKS.md` §2 "Card grids" |
| 19 | On a list page at 1024 × 700 or larger, does the page fit the screen, with only the table scrolling, its headings stuck at the top and pagination at the bottom? On a smaller screen, does the page scroll normally, with the headings stuck under the top bar? The page and the table never both scroll. | `05_RESPONSIVE_CHECKS.md` §2 "List pages" |
| 20 | On an iPad, upright and on its side, can all the work be done, not only viewed? On a phone, does the screen show in full, with viewing and confirming possible and the money facts still visible? | UI-101 (DL-074) |
| 21 | After opening a record and pressing Back, does the list come back at the same scroll position, tab and selected card? | `05_RESPONSIVE_CHECKS.md` §2 "Home" and "List pages" |
| 22 | On a screen wider than 2560 px (for example 5120 × 1440), does the page content stop at 2560 px wide and stay centred, so it looks as it does at 2560 × 1440 (a 27-inch monitor)? | Owner, 17/11/2026 · Proximity |

## Rule 13: the 10 screen states

Mark rule 13 **Fix** if any state that applies is missing, and name it under the
review record (for example "13d no internet").

| # | State | What the screen must do | Limit in this app | Source |
|---|---|---|---|---|
| 13a | Empty | Say why it is empty, then give one next step. | Never suggest an amount is 0 unless the server says so. A next step only when the person has the right to take it. | UI-013 |
| 13b | Loading | Show the shape of the page that is coming, not only a spinner. | Block a second click on a button that already sent a command. | UI-012 |
| 13c | Error | Say what went wrong and how to fix it. Offer Retry when reading again is safe. | No stack traces, SQL or hidden records. Show the reference number. | UI-014 |
| 13d | No internet | Keep the page on screen and say what still works. | Mark old numbers as old. Block every save while offline. Never queue a payment or any money action to send later. | UI-003 |
| 13e | Slow network | Show progress, not a frozen spinner. | Never let a slow save be sent twice. | UI-012 |
| 13f | No search results | Suggest a fix ("Did you mean…?") or another search, not a dead end. | Never change the search by itself: a wrong invoice, receipt or phone number opens the wrong tenant. Never search or show ID numbers. | UI-010 |
| 13g | Permission denied | Say which right is missing and who can give it. Give a way back. | Never show or hint at the hidden data. | UI-016 |
| 13h | Session expired | Keep what the person typed, ask them to sign in, then let them check it and send again. | Never re-send a money action by itself after sign-in. Never store tenant data in the browser. | UI-015, UI-016 |
| 13i | Form validation | Mark the exact field, next to it, with how to fix it. | The server's answer is final; client checks only help. | UI-003, UI-014 |
| 13j | Success | Confirm it, say what happens next, link to the new record. | Show the amount, currency and new state. No confetti or celebration: a void or refund is not a party. | UI-017 |

## Note on rule 6 (corner radius)

The app has one radius token today, `--radius: 8px` in `frontend/src/shell/shell.css`.
Many places still use their own value instead (6px, 7px, 10px, 12px, `0.375rem`
and others). A possible scale is: 4px for chips and badges, 8px for buttons and
text boxes, 12px for cards, 999px for pills and avatars. **This scale is not
decided yet.** It needs the owner's approval before any screen is changed to it.
Until then, rule 6 only asks: does the screen use `var(--radius)` or a value
that is already common in the app?

## Note on group F (screen-size breakpoints)

The rules above use the app's layout points: 640 px and 1024 px wide, and
1000 px tall for the tighter desktop look. The CSS in `frontend/src` also has
other values (`max-width` 639px ×21 and 640px ×13, 760px ×7, 1080px ×4, 620px,
700px, 36rem, and others). 639px and 640px disagree at exactly 640 px. One design
reel used `@container (max-width: 700px)` for tables; the app does not adopt it.
**Which layout points stay is not decided yet.** It needs the owner's approval
before any screen is changed. Until then, a new screen uses 640 px and 1024 px.

## Review record

Copy one row per screen reviewed. List each Fix under the table.

| Date | Screen | Size | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | Reviewer |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | | | | | | | | | | | | | |
