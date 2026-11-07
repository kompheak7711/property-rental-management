// UI v81 round 3: a list page's main table scrolls in its own area; the page top stays in place.

import { afterEach, describe, expect, it } from "vitest";

import { installTableFit, mainTableBox, planFit, scrollKey } from "./tableFit";

afterEach(() => {
  document.body.innerHTML = "";
  document.body.className = "";
  window.history.replaceState(null, "", "#/");
  window.sessionStorage.clear();
});

const tick = () =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, 40);
  });

describe("tableFit", () => {
  it("TEST-FE-1916 plans the table area: on a desktop the page fits the screen and the table takes the rest (one-line cards under 1000px tall); a phone, a tablet or a too-small area lets the page scroll with stuck headings; a table wider than its box gets no stuck headings; the main table is the visible one with the most rows and a record page is left alone", async () => {
    // 1440 x 900: the table starts 300px down and 80px of the page sits under it.
    expect(
      planFit({
        width: 1440,
        height: 900,
        tableTop: 300,
        tableHeight: 1200,
        pageHeight: 1580,
        tableWider: false,
      }),
    ).toEqual({ mode: "fit", maxHeight: 520, short: true });
    expect(
      planFit({
        width: 1920,
        height: 1080,
        tableTop: 300,
        tableHeight: 1200,
        pageHeight: 1580,
        tableWider: false,
      }),
    ).toEqual({ mode: "fit", maxHeight: 700, short: false });
    // 1366 x 768 with 500px above the table: 188px would be left, under the 240px floor.
    expect(
      planFit({
        width: 1366,
        height: 768,
        tableTop: 500,
        tableHeight: 1200,
        pageHeight: 1780,
        tableWider: false,
      }),
    ).toEqual({ mode: "flow" });
    expect(
      planFit({
        width: 390,
        height: 844,
        tableTop: 300,
        tableHeight: 400,
        pageHeight: 800,
        tableWider: false,
      }),
    ).toEqual({ mode: "flow" });
    expect(
      planFit({
        width: 390,
        height: 844,
        tableTop: 300,
        tableHeight: 400,
        pageHeight: 800,
        tableWider: true,
      }),
    ).toEqual({ mode: "plain" });
    expect(
      planFit({
        width: 1024,
        height: 699,
        tableTop: 100,
        tableHeight: 400,
        pageHeight: 600,
        tableWider: false,
      }),
    ).toEqual({ mode: "flow" });

    expect(scrollKey("")).toBe("ui-tablefit:#/");
    expect(scrollKey("#/invoices?tab=open")).toBe(
      "ui-tablefit:#/invoices?tab=open",
    );

    document.body.innerHTML = `<main>
      <div class="ui-tablewrap" id="one"><table><tbody><tr><td>1</td></tr></tbody></table></div>
      <div class="ui-tablewrap" id="two"><table><tbody><tr><td>1</td></tr><tr><td>2</td></tr></tbody></table></div>
      <div role="dialog"><div class="ui-tablewrap" id="in-dialog"><table><tbody><tr><td>1</td></tr><tr><td>2</td></tr><tr><td>3</td></tr></tbody></table></div></div>
      <div class="ui-tablewrap" id="empty"><table><tbody></tbody></table></div>
    </main>`;
    window.history.replaceState(null, "", "#/invoices");
    expect(mainTableBox(document.body)?.id).toBe("two");
    window.history.replaceState(null, "", "#/invoices/inv-1");
    expect(mainTableBox(document.body)).toBeNull();

    // Installed: the main table gets its scrolling area (the test window counts as a desktop)
    // and the place it is scrolled to is kept for Back.
    window.history.replaceState(null, "", "#/invoices");
    window.sessionStorage.setItem(
      scrollKey("#/invoices"),
      JSON.stringify({ table: 0, page: 0 }),
    );
    const stop = installTableFit();
    await tick();
    const two = document.getElementById("two");
    expect(two?.classList.contains("ui-tscroll")).toBe(true);
    expect(two?.style.maxHeight).toBe(`${String(window.innerHeight)}px`);
    expect(document.body.classList.contains("ui-fit")).toBe(true);
    two?.dispatchEvent(new Event("scroll"));
    const kept: unknown = JSON.parse(
      window.sessionStorage.getItem(scrollKey("#/invoices")) ?? "null",
    );
    expect(kept).toEqual({ table: 0, page: 0 });
    stop();
    expect(two?.classList.contains("ui-tscroll")).toBe(false);
    expect(document.body.classList.contains("ui-fit")).toBe(false);
  });
});
