// UI v81 (owner 08/11/2026 06:55, point 4): every screen in e2e/screens.ts at the five sizes.
// The check FAILS on: horizontal page overflow; a button, link or tab under 44 × 44 px; colour
// contrast under 4.5:1 (axe-core); cut-off text or numbers; a role badge inside a button; a
// card alone in a grid row on a desktop; two stacked tables. The problems are listed in the
// failure message. A screenshot of each screen and size goes to e2e/results/shots.

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { replay } from "./replay";
import { SCREENS, SIZES } from "./screens";

const SHOTS = join(import.meta.dirname, "results", "shots");

/** Runs in the page: the layout checks that need the drawn boxes. */
function audit(desktop: boolean): string[] {
  const problems: string[] = [];
  const view = document.getElementById("shell-view") ?? document.body;
  const visible = (el: Element): boolean => {
    if (el.closest("[hidden]") !== null) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const box = el.getBoundingClientRect();
    // A 1 × 1 box is a heading for screen readers only (.ui-sr), not drawn text.
    return box.width > 1 && box.height > 1;
  };
  const describe = (el: Element): string => {
    const text = el.textContent.trim().replace(/\s+/g, " ").slice(0, 40);
    const cls = el.getAttribute("class");
    return `<${el.tagName.toLowerCase()}${cls ? ` class="${cls}"` : ""}> "${text}"`;
  };
  const round = (box: DOMRect) =>
    `${String(Math.round(box.width))}×${String(Math.round(box.height))}`;

  // 1. Horizontal page overflow.
  const pageWidth = Math.max(
    document.documentElement.scrollWidth,
    document.body.scrollWidth,
  );
  if (pageWidth > window.innerWidth + 1)
    problems.push(
      `horizontal overflow: the page is ${String(pageWidth)}px wide in a ${String(window.innerWidth)}px window`,
    );

  // 2. Buttons, links and tabs under 44 × 44 px (a checkbox or radio counts with its label).
  const targets = view.querySelectorAll<HTMLElement>(
    'a[href], button, [role="button"], [role="tab"], summary, input[type="checkbox"], input[type="radio"]',
  );
  for (const el of targets) {
    if (!visible(el)) continue;
    const measured =
      el instanceof HTMLInputElement ? (el.closest("label") ?? el) : el;
    const box = measured.getBoundingClientRect();
    if (box.width < 44 - 0.5 || box.height < 44 - 0.5)
      problems.push(`target under 44×44 (${round(box)}): ${describe(el)}`);
  }

  // 3. Cut-off text or numbers: text clipped inside a box that does not scroll, or a number
  //    that runs past its box.
  for (const el of view.querySelectorAll<HTMLElement>("*")) {
    if (!visible(el)) continue;
    const style = getComputedStyle(el);
    const clips = (value: string) => value === "hidden" || value === "clip";
    const clipped =
      (clips(style.overflowX) && el.scrollWidth > el.clientWidth + 1) ||
      (clips(style.overflowY) && el.scrollHeight > el.clientHeight + 1);
    if (clipped && el.textContent.trim() !== "")
      problems.push(
        `cut-off text in ${describe(el)} (${String(el.scrollWidth)}×${String(el.scrollHeight)} in ${String(el.clientWidth)}×${String(el.clientHeight)})`,
      );
    if (
      style.whiteSpace === "nowrap" &&
      el.children.length === 0 &&
      el.textContent.trim() !== ""
    ) {
      const parent = el.parentElement;
      if (parent !== null) {
        const box = el.getBoundingClientRect();
        const outer = parent.getBoundingClientRect();
        if (box.right > outer.right + 1 || box.left < outer.left - 1)
          problems.push(
            `text runs past its box: ${describe(el)} in ${describe(parent)}`,
          );
      }
    }
  }

  // 4. A role badge inside a button.
  for (const el of view.querySelectorAll<HTMLElement>(
    'button, a.ui-btn, [role="button"]',
  )) {
    if (!visible(el)) continue;
    if (
      el.querySelector(".ui-badge, .ui-chip") !== null ||
      /\b(manager|owner)\b/i.test(el.textContent)
    )
      problems.push(`role badge inside a button: ${describe(el)}`);
  }

  // 5. A card alone in a grid row on a desktop.
  if (desktop) {
    const grids = new Set<HTMLElement>();
    for (const card of view.querySelectorAll<HTMLElement>(
      ".ui-card, .ui-kpi, .ui-tile, [class*='card']",
    )) {
      const parent = card.parentElement;
      if (parent !== null && visible(card)) grids.add(parent);
    }
    for (const grid of grids) {
      const cards = [...grid.children].filter(
        (child): child is HTMLElement =>
          child instanceof HTMLElement &&
          /\b(ui-card|ui-kpi|ui-tile)\b|card/.test(child.className) &&
          visible(child),
      );
      if (cards.length < 2) continue;
      const rows = new Map<number, number>();
      for (const card of cards) {
        const top = Math.round(card.getBoundingClientRect().top);
        rows.set(top, (rows.get(top) ?? 0) + 1);
      }
      const counts = [...rows.values()];
      if (counts.length > 1 && Math.max(...counts) > 1 && counts.includes(1))
        problems.push(
          `a card alone in a grid row: ${describe(grid)} (rows of ${counts.join(", ")})`,
        );
    }
  }

  // 6. Two stacked tables.
  const tables = [...view.querySelectorAll("table")]
    .filter(visible)
    .map((table) => table.getBoundingClientRect());
  for (let i = 0; i < tables.length; i += 1)
    for (let j = i + 1; j < tables.length; j += 1) {
      const a = tables[i];
      const b = tables[j];
      if (a === undefined || b === undefined) continue;
      const sideBySide = a.right <= b.left + 1 || b.right <= a.left + 1;
      if (!sideBySide)
        problems.push(`two stacked tables (${round(a)} and ${round(b)})`);
    }
  return problems;
}

async function contrast(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .include("#shell-view")
    .withRules(["color-contrast"])
    .analyze();
  return results.violations.flatMap((violation) =>
    violation.nodes.map(
      (node) =>
        `contrast under 4.5:1: ${node.target.join(" ")} — ${node.failureSummary?.split("\n")[1] ?? violation.help}`,
    ),
  );
}

test.beforeAll(() => {
  mkdirSync(SHOTS, { recursive: true });
});

for (const screen of SCREENS) {
  for (const [width, height] of SIZES) {
    test(`${screen.name} at ${String(width)}×${String(height)}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await replay(page, screen.fixture);
      await page.goto(`/${screen.hash}`);
      await expect(page.getByText(screen.ready).first()).toBeVisible({
        timeout: 30_000,
      });
      // The pages draw their data in a few steps; let the last one settle.
      await page.waitForTimeout(600);
      await page.screenshot({
        path: join(
          SHOTS,
          `${screen.name}-${String(width)}x${String(height)}.png`,
        ),
        fullPage: true,
      });
      const problems = [
        ...(await page.evaluate(audit, width >= 1024)),
        ...(await contrast(page)),
      ];
      expect(
        problems,
        `${screen.name} at ${String(width)}×${String(height)}:\n${problems.join("\n")}`,
      ).toEqual([]);
    });
  }
}
