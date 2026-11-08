// The screens the check opens (UI v81). A screen is done only when it passes this check and
// its design-and-app sheet matches. The list grows one module per batch; the pilot (owner
// 08/11/2026) is Lease details and New Lease.

export interface Screen {
  /** A short name for the report and the screenshot file. */
  name: string;
  /** The address after the sign-in. */
  hash: string;
  /** The recorded server answers (e2e/fixtures/<fixture>.har.json). */
  fixture: string;
  /** Text that shows once the screen has its data. */
  ready: string;
}

export const SCREENS: readonly Screen[] = [
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
];

/** The five sizes of the owner's rule (width × height). */
export const SIZES: readonly (readonly [number, number])[] = [
  [390, 844],
  [768, 1024],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
];
