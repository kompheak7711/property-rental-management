// UI v81 round 3 (owner 07/11/2026 17:30): on a list page the table scrolls and the top stays in
// place.
//
// On a screen at least 1024px wide and 700px tall the page fits the screen: the title, tabs,
// filters and number cards stay where they are and only the page's main table scrolls, in its own
// area that fills the rest of the screen, with its column headings stuck at the top of that area.
// "Load more" and footers under the table stay under the area. On a phone, a tablet or a short
// screen the page scrolls as usual and only the headings stick under the top bar, when the table
// is not wider than the screen (a browser cannot stick a heading across a box that scrolls
// sideways). Back returns to the same place in the table.
//
// The main table is the visible table with the most rows on the page; a record page (an address
// with a record, "#/invoices/<id>") and dialogs are left alone. Nothing here changes what a page
// shows: only sizes, classes and scroll positions.

import { detailFromHash } from "./navigation";

export const FIT_MIN_WIDTH = 1024;
export const FIT_MIN_HEIGHT = 700;
/** Under this height the number cards take one line each, so eight table rows still show. */
export const SHORT_HEIGHT = 1000;
/** The table area is never smaller than this; a page that cannot give it scrolls as usual. */
export const MIN_TABLE_HEIGHT = 240;
/** Rows a desktop list should show; a tall screen that shows fewer takes the tighter look. */
export const MIN_ROWS = 8;

export interface FitMeasure {
  /** The screen (the browser window's inner size). */
  width: number;
  height: number;
  /** The table box's top edge from the top of the page, and its natural height. */
  tableTop: number;
  tableHeight: number;
  /** The whole page's height with the table at its natural height. */
  pageHeight: number;
  /** The table is wider than its box (it scrolls sideways). */
  tableWider: boolean;
}

export type FitPlan =
  | { mode: "fit"; maxHeight: number; short: boolean }
  | { mode: "flow" }
  | { mode: "plain" };

/** What to do with the main table, from the measurements. */
export function planFit(m: FitMeasure): FitPlan {
  const flowOrPlain: FitPlan = m.tableWider
    ? { mode: "plain" }
    : { mode: "flow" };
  if (m.width < FIT_MIN_WIDTH || m.height < FIT_MIN_HEIGHT) return flowOrPlain;
  const below = m.pageHeight - (m.tableTop + m.tableHeight);
  const maxHeight = Math.floor(m.height - m.tableTop - below);
  if (maxHeight < MIN_TABLE_HEIGHT) return flowOrPlain;
  return { mode: "fit", maxHeight, short: m.height < SHORT_HEIGHT };
}

/** The key the scroll position of a page is kept under, for Back. */
/** The height of the column headings and the first `rows` rows of the table in `box`. */
export function rowsHeight(box: HTMLElement, rows: number): number {
  const head = box.querySelector<HTMLElement>("thead");
  const row = box.querySelector<HTMLElement>("tbody tr");
  if (row === null) return 0;
  return (head === null ? 0 : head.offsetHeight) + row.offsetHeight * rows;
}

export function scrollKey(hash: string): string {
  return `ui-tablefit:${hash === "" ? "#/" : hash}`;
}

interface SavedScroll {
  table: number;
  page: number;
}

const isVisible = (element: HTMLElement) =>
  typeof element.checkVisibility === "function"
    ? element.checkVisibility()
    : true;

function readSaved(key: string): SavedScroll | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as SavedScroll).table === "number" &&
      typeof (parsed as SavedScroll).page === "number"
    )
      return parsed as SavedScroll;
  } catch {
    // No session storage: Back starts at the top, nothing else changes.
  }
  return null;
}

function writeSaved(key: string, value: SavedScroll): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // No session storage: nothing to keep.
  }
}

/** The page's main table box, or null when the page has none to fit. */
export function mainTableBox(root: ParentNode): HTMLElement | null {
  if (detailFromHash(window.location.hash) !== null) return null;
  const boxes = Array.from(
    root.querySelectorAll<HTMLElement>(".ui-tablewrap"),
  ).filter(
    (box) =>
      box.closest("[role='dialog'], dialog, [hidden]") === null &&
      box.querySelector("tbody tr") !== null &&
      isVisible(box),
  );
  if (boxes.length === 0) return null;
  const rows = (box: HTMLElement) => box.querySelectorAll("tbody tr").length;
  return boxes.reduce((best, box) => (rows(box) > rows(best) ? box : best));
}

/**
 * Starts fitting the page's main table and keeping its scroll position; returns the function
 * that stops it. Call it once, from the shell.
 */
export function installTableFit(): () => void {
  const root = document.body;
  let current: HTMLElement | null = null;
  let queued = 0;
  let key = scrollKey(window.location.hash);
  let pending = readSaved(key);
  let restoreTimer = 0;

  function clear(box: HTMLElement | null) {
    if (box === null) return;
    box.classList.remove("ui-tscroll", "ui-tflow");
    box.style.maxHeight = "";
  }

  function save() {
    // Until Back has put the page where it was, a scroll made by the shell is not the person's.
    if (pending !== null) return;
    writeSaved(key, {
      table: current === null ? 0 : current.scrollTop,
      page: window.scrollY,
    });
  }

  function restore(box: HTMLElement, plan: FitPlan) {
    if (pending === null) return;
    const wanted = pending;
    const tableReady =
      plan.mode !== "fit" ||
      box.scrollHeight - box.clientHeight >= wanted.table;
    const pageReady =
      document.documentElement.scrollHeight - window.innerHeight >= wanted.page;
    if (!tableReady || !pageReady) return;
    if (plan.mode === "fit") box.scrollTop = wanted.table;
    window.scrollTo(0, wanted.page);
    pending = null;
    window.clearTimeout(restoreTimer);
  }

  function apply() {
    queued = 0;
    const topbar = document.querySelector<HTMLElement>(".shell-topbar");
    root.style.setProperty(
      "--ui-top",
      `${String(topbar === null ? 0 : topbar.offsetHeight)}px`,
    );
    const box = mainTableBox(root);
    if (box !== current) {
      clear(current);
      current = box;
    }
    if (box === null) {
      root.classList.remove("ui-fit", "ui-short");
      return;
    }
    const fitScreen =
      window.innerWidth >= FIT_MIN_WIDTH &&
      window.innerHeight >= FIT_MIN_HEIGHT;
    // Measure with the fitted spacing on, since it moves the table.
    root.classList.toggle("ui-fit", fitScreen);
    root.classList.toggle(
      "ui-short",
      fitScreen && window.innerHeight < SHORT_HEIGHT,
    );
    box.classList.remove("ui-tflow");
    box.classList.toggle("ui-tscroll", fitScreen);
    box.style.maxHeight = "";
    const measure = () => {
      const rect = box.getBoundingClientRect();
      return planFit({
        width: window.innerWidth,
        height: window.innerHeight,
        tableTop: rect.top + window.scrollY,
        tableHeight: box.offsetHeight,
        pageHeight: document.documentElement.scrollHeight,
        tableWider: box.scrollWidth > box.clientWidth + 1,
      });
    };
    let plan = measure();
    // A tall screen whose table area would still show fewer than MIN_ROWS rows (two rows of
    // cards, a tall head) takes the tighter look of a short screen too, then measures again.
    if (
      plan.mode === "fit" &&
      !root.classList.contains("ui-short") &&
      plan.maxHeight < rowsHeight(box, MIN_ROWS)
    ) {
      root.classList.add("ui-short");
      plan = measure();
    }
    if (plan.mode === "fit") {
      box.style.maxHeight = `${String(plan.maxHeight)}px`;
      // A second look: whatever still runs past the screen comes off the table area.
      const over = document.documentElement.scrollHeight - window.innerHeight;
      if (over > 0 && plan.maxHeight - over >= MIN_TABLE_HEIGHT)
        box.style.maxHeight = `${String(plan.maxHeight - over)}px`;
    } else {
      // No room for a table area (tall blocks above the list): the page scrolls and the headings
      // stick under the top bar. A fitting screen keeps its tighter spacing.
      if (!fitScreen) root.classList.remove("ui-fit", "ui-short");
      box.classList.remove("ui-tscroll");
      box.classList.toggle("ui-tflow", plan.mode === "flow");
    }
    restore(box, plan);
  }

  function queue() {
    if (queued !== 0) return;
    queued = window.requestAnimationFrame(apply);
  }

  function onHashChange() {
    key = scrollKey(window.location.hash);
    pending = readSaved(key);
    window.clearTimeout(restoreTimer);
    if (pending !== null) {
      // A page that never grows back to where it was (rows gone) starts at the top.
      restoreTimer = window.setTimeout(() => {
        pending = null;
      }, 3000);
    }
    queue();
  }

  function onScroll(event: Event) {
    if (event.target === document || event.target === current) save();
  }

  const observer = new MutationObserver(queue);
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener("resize", queue);
  window.addEventListener("hashchange", onHashChange);
  document.addEventListener("scroll", onScroll, true);
  if (pending !== null) {
    restoreTimer = window.setTimeout(() => {
      pending = null;
    }, 3000);
  }
  queue();
  return () => {
    observer.disconnect();
    window.removeEventListener("resize", queue);
    window.removeEventListener("hashchange", onHashChange);
    document.removeEventListener("scroll", onScroll, true);
    window.cancelAnimationFrame(queued);
    window.clearTimeout(restoreTimer);
    clear(current);
    root.classList.remove("ui-fit", "ui-short");
  };
}
