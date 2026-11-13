// The screens the check opens (UI v81). A screen is done only when it passes this check and
// its design-and-app sheet matches. The list grows one module per batch: the pilot (owner
// 08/11/2026) is Lease details and New Lease; then Home (with a Tasks card open) and the side
// menu (owner 08/11/2026 09:57: open, collapsed, and with its groups folded); then Payments
// (owner 12/11/2026 07:41): the list, Receive payment with a Customer chosen, and a Receipt.

export interface Screen {
  /** A short name for the report and the screenshot file. */
  name: string;
  /** The address after the sign-in. */
  hash: string;
  /** The recorded server answers (e2e/fixtures/<fixture>.har.json). */
  fixture: string;
  /** Text that shows once the screen has its data. */
  ready: string;
  /** What the device remembers before the screen opens (the menu's localStorage keys). */
  storage?: Readonly<Record<string, string>>;
  /** "menu": the ☰ button is pressed where it shows (phone, tablet), so the drawer is open. */
  open?: "menu";
}

/** Every menu group folded (the keys of AppShell's chetana-navgrp). */
const ALL_GROUPS_FOLDED = JSON.stringify({
  operations: true,
  leasing: true,
  property: true,
  administration: true,
});

export const SCREENS: readonly Screen[] = [
  {
    name: "home",
    hash: "#/home",
    fixture: "home",
    ready: "Tap a card to see its list.",
  },
  {
    name: "home-tasks",
    hash: "#/home?tasks=later",
    fixture: "home",
    ready: "Tap a card to see its list.",
  },
  // The side menu: on a desktop beside Home; on a phone or tablet the drawer behind ☰.
  {
    name: "menu-open",
    hash: "#/home",
    fixture: "home",
    ready: "Tap a card to see its list.",
    open: "menu",
  },
  // "Collapse menu" (icons only) exists on wide screens only; the drawer ignores it.
  {
    name: "menu-collapsed",
    hash: "#/home",
    fixture: "home",
    ready: "Tap a card to see its list.",
    storage: { "chetana-rail": "1" },
    open: "menu",
  },
  {
    name: "menu-folded",
    hash: "#/home",
    fixture: "home",
    ready: "Tap a card to see its list.",
    storage: { "chetana-navgrp": ALL_GROUPS_FOLDED },
    open: "menu",
  },
  {
    name: "lease-details",
    hash: "#/leases/7510dfbf-1307-4e67-a858-88ea6fe623fa",
    fixture: "pilot",
    ready: "Lease · U206L0022",
  },
  {
    name: "new-lease",
    hash: "#/leases/new",
    fixture: "pilot",
    ready: "What will be billed",
  },
  // Module batch 2, Payments. The list of the month.
  {
    name: "payments",
    hash: "#/payments",
    fixture: "payments",
    ready: "RCP260018",
  },
  // Receive payment for one Customer: the Customer card and the riel rate card beside the form.
  {
    name: "receive-payment",
    hash: "#/payments/receive%3A194daec5-9868-44b6-9294-cc440c986c52",
    fixture: "payments",
    ready: "Unpaid Invoices",
  },
  // One Receipt: the sheet, with "Paid for", the Customer card and "Reprints" beside it.
  {
    name: "receipt",
    hash: "#/payments/receipt%3A154f56c5-df30-4dda-9c77-b3684b4c8cb9",
    fixture: "payments",
    ready: "Unpaid Invoices",
  },
  // Module batch 3, Invoices. The list of the month.
  {
    name: "invoices",
    hash: "#/invoices",
    fixture: "invoices",
    ready: "INV260015",
  },
  // One Invoice: the head with Back, the sheet, and the shared Customer card beside it.
  {
    name: "invoice",
    hash: "#/invoices/inv%3Aa546c656-1297-480b-9aad-bfd7b69bb39f",
    fixture: "invoices",
    ready: "All Invoices for",
  },
  // New Quotation: the shared page head with Back.
  {
    name: "new-quotation",
    hash: "#/quotations/new",
    fixture: "invoices",
    ready: "New Quotation",
  },
  // Module batch 4, Utilities. The readings list (before the reading day) with Import in the head.
  {
    name: "utilities",
    hash: "#/utilities",
    fixture: "utilities",
    ready: "No readings in",
  },
  // The Meters tab: Add meter in the head with "Manager only" beside it.
  {
    name: "meters",
    hash: "#/utilities/meters",
    fixture: "utilities",
    ready: "Electricity meters",
  },
  // One meter: Report broken and Replace meter, each with "Manager only" beside it.
  {
    name: "meter",
    hash: "#/utilities/meter%3A6319db9a-6b85-416e-8491-752ef8af91c4",
    fixture: "utilities",
    ready: "Replace meter",
  },
];

/** The five sizes of the owner's rule (width × height). */
export const SIZES: readonly (readonly [number, number])[] = [
  [390, 844],
  [768, 1024],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
];
