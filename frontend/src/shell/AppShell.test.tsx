import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell, phnomPenhClock } from "./AppShell";
import { MENU, pageFromHash, type PageId } from "./navigation";
import { useHashPage } from "./useHashPage";
import type { Language } from "../signInText";

afterEach(() => {
  cleanup();
  // UI v81 side menu: what the device remembers (Collapse menu, folded groups, sub-lists).
  window.localStorage.clear();
});

const NOW = new Date("2026-10-24T18:30:00Z").getTime();

function renderShell(
  page: PageId = "home",
  language: Language = "en",
  overrides: Partial<Parameters<typeof AppShell>[0]> = {},
) {
  const onSignOut = vi.fn();
  const onLanguageChange = vi.fn();
  render(
    <AppShell
      buildId="test-build"
      displayName="Sokha Chan"
      environment="development"
      language={language}
      notice={null}
      now={() => NOW}
      onLanguageChange={onLanguageChange}
      onSignOut={onSignOut}
      page={page}
      signOutDisabled={false}
      capabilities={null}
      {...overrides}
    >
      <p>Page body</p>
    </AppShell>,
  );
  return { onSignOut, onLanguageChange };
}

describe("V1-058 R1 app shell", () => {
  it("TEST-FE-801 shows the menu groups in the order the owner approved on 24/10/2026 with one link per page", () => {
    renderShell();
    const menu = screen.getByRole("navigation", { name: "Menu" });
    const links = within(menu)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(links).toEqual([
      "Home",
      "Payments",
      "Invoices",
      "Utilities",
      "Approvals",
      "Bookings",
      "Short stays",
      "Leases",
      "Customers",
      "Units",
      // UI v81 round 2 (owner 07/11/2026): Inspections after Units; the menu order of design v81.
      "Inspections",
      "Problem reports",
      "Products",
      "Ledger",
      "Reports",
      "Audit log",
      // Owner 07/11/2026: "Staff", not "Employees and payroll".
      "Staff",
      "Telegram",
      "Users and access",
      "Settings",
    ]);
    for (const group of [
      "Operations",
      "Leasing",
      "Property",
      "Administration",
    ]) {
      expect(within(menu).getByText(group)).toBeInTheDocument();
    }
    expect(MENU.flatMap((group) => group.items)).toHaveLength(20);
  });

  it("TEST-FE-802 marks only the open page in the menu and names the work area after it", () => {
    renderShell("units");
    const menu = screen.getByRole("navigation", { name: "Menu" });
    expect(within(menu).getByRole("link", { name: "Units" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(menu).getByRole("link", { name: "Home" }),
    ).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("main")).toHaveAccessibleName("Units");
    expect(within(menu).getByRole("link", { name: "Units" })).toHaveAttribute(
      "href",
      "#/units",
    );
  });

  it("TEST-FE-803 shows the date as dd/mm/yyyy and the 24-hour time in Phnom Penh", () => {
    // 18:30 UTC is 01:30 the next day in Phnom Penh (UTC+7).
    expect(phnomPenhClock(NOW, "en")).toEqual({
      weekday: "Sunday",
      date: "25/10/2026",
      time: "01:30",
    });
    expect(phnomPenhClock(NOW, "km").weekday).toBe("ថ្ងៃអាទិត្យ");
    renderShell();
    expect(screen.getByText("Sunday 25/10/2026 · 01:30")).toBeInTheDocument();
    expect(screen.getByText("Phnom Penh time")).toBeInTheDocument();
  });

  it("TEST-FE-804 switches the menu to Khmer and back from the top bar", () => {
    const { onLanguageChange } = renderShell("home", "km");
    expect(document.documentElement.lang).toBe("km");
    const menu = screen.getByRole("navigation", { name: "ម៉ឺនុយ" });
    expect(
      within(menu).getByRole("link", { name: "បន្ទប់" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ខ្មែរ" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(onLanguageChange).toHaveBeenCalledWith("en");
    cleanup();
    expect(document.documentElement.lang).toBe("en");
  });

  it("TEST-FE-805 shows the signed-in name, the environment badge and a Sign out button", () => {
    const { onSignOut } = renderShell();
    expect(screen.getByText("Sokha Chan")).toBeInTheDocument();
    expect(screen.getByText("SC")).toBeInTheDocument();
    expect(screen.getByText("DEVELOPMENT")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("TEST-FE-806 hides the environment badge in production and keeps Sign out locked while busy", () => {
    renderShell("home", "en", {
      environment: "production",
      displayName: null,
      signOutDisabled: true,
    });
    expect(screen.queryByText("PRODUCTION")).not.toBeInTheDocument();
    expect(screen.getByText("Signed in")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeDisabled();
  });

  it("TEST-FE-807 opens the slide-in menu as a dialog and closes it with its button or Escape", () => {
    renderShell();
    const button = screen.getByRole("button", { name: "Menu" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    // The focus starts on the first menu link and the page behind is inert.
    expect(screen.getByRole("link", { name: "Home" })).toHaveFocus();
    expect(document.querySelector(".shell-main")).toHaveAttribute("inert");
    fireEvent.click(screen.getByRole("button", { name: "Close the menu" }));
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
    fireEvent.click(button);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
    expect(document.querySelector(".shell-main")).not.toHaveAttribute("inert");
  });

  it("TEST-FE-810 shows only the menu items and tabs the person may use", () => {
    renderShell("moveout", "en", {
      capabilities: new Set(["units.read", "deposits.read", "audit.view"]),
    });
    const menu = screen.getByRole("navigation", { name: "Menu" });
    expect(
      within(menu)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Home", "#/home"],
      ["Leases", "#/moveout"],
      ["Units", "#/units"],
      // UI v81 round 2: Inspections opens with units.read.
      ["Inspections", "#/inspections"],
      // audit.view reads the Audit activity report (V1-060 B6).
      ["Reports", "#/reports"],
      ["Audit log", "#/history"],
    ]);
    expect(within(menu).queryByText("Operations")).not.toBeInTheDocument();
    // One allowed tab: no tab bar.
    expect(
      screen.queryByRole("navigation", { name: "Leases" }),
    ).not.toBeInTheDocument();
  });

  it("TEST-FE-1060 shows Reports to anyone who may read one report and hides it from a person who may read none", () => {
    const shows = (rights: string[]) => {
      renderShell("home", "en", { capabilities: new Set(rights) });
      const menu = screen.getByRole("navigation", { name: "Menu" });
      const shown = within(menu).queryByRole("link", { name: "Reports" });
      cleanup();
      return shown !== null;
    };
    // Payments and Invoices without reports.read read no report (DL-072 answer 5).
    expect(shows(["payments.read", "invoices.read"])).toBe(false);
    expect(shows(["units.read", "reservations.read"])).toBe(false);
    expect(shows(["reports.read"])).toBe(true);
    expect(shows(["utility.read"])).toBe(true);
    expect(shows(["leases.read"])).toBe(true);
    expect(shows(["audit.view"])).toBe(true);
  });

  it("TEST-FE-811 opens My account from the name at the foot of the menu", () => {
    renderShell("account");
    const link = screen.getByRole("link", { name: /Sokha Chan/ });
    expect(link).toHaveAttribute("href", "#/account");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("main")).toHaveAccessibleName("My account");
  });

  it("TEST-FE-812 moves the focus to the new page and starts it at the top", () => {
    const props = {
      buildId: "b",
      capabilities: null,
      displayName: null,
      environment: "production",
      language: "en" as const,
      notice: null,
      now: () => NOW,
      onLanguageChange: vi.fn(),
      onSignOut: vi.fn(),
      signOutDisabled: false,
      children: <p>Body</p>,
    };
    const { rerender } = render(<AppShell {...props} page="home" />);
    // The first page does not take the focus.
    expect(screen.getByRole("main")).not.toHaveFocus();
    document.documentElement.scrollTop = 500;
    rerender(<AppShell {...props} page="units" />);
    expect(screen.getByRole("main")).toHaveFocus();
    expect(document.documentElement.scrollTop).toBe(0);
  });

  it("TEST-FE-809 shows Letters and Move-out as tabs of Leases and keeps Leases marked in the menu", () => {
    renderShell("letters");
    const menu = screen.getByRole("navigation", { name: "Menu" });
    // UI v81 side menu: the Leases item stays marked while its sub-item Notices is the current
    // page (the sub-item carries aria-current, the item its "cur" mark).
    const leasesRow = menu.querySelector(
      '.shell-nitem[data-menu-page="leases"]',
    );
    expect(leasesRow).toHaveClass("cur");
    expect(within(menu).getByRole("link", { name: "Notices" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // UI v81 round 2: the title is the open tab's name; the tab bar is named after the menu item.
    expect(screen.getByRole("main")).toHaveAccessibleName("Notices");
    const tabs = screen.getByRole("navigation", { name: "Leases" });
    expect(
      within(tabs)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Leases", "#/leases"],
      ["Notices", "#/letters"],
      ["Move-outs", "#/moveout"],
    ]);
    expect(within(tabs).getByRole("link", { name: "Notices" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    cleanup();
    renderShell("reservations");
    expect(screen.getByRole("main")).toHaveAccessibleName("Reservations");
    // Telegram bots step 3a (DL-171): Bookings has the Visit requests tab now.
    const bookings = screen.getByRole("navigation", { name: "Bookings" });
    expect(
      within(bookings)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Viewing requests", "#/visitreqs"],
      ["Reservations", "#/reservations"],
    ]);
  });

  // UI v81 side menu (owner 08/11/2026 09:57, section D of 05:43): Collapse menu, folding
  // groups, sub-items, the user card with the role, and the fly-out of the collapsed rail.
  describe("UI v81 side menu", () => {
    const menuOf = () => screen.getByRole("navigation", { name: "Menu" });
    /** One element of the menu by its selector; the test fails when it is missing. */
    const part = (selector: string): HTMLElement => {
      const found = menuOf().querySelector<HTMLElement>(selector);
      if (found === null) throw new Error(`no ${selector} in the menu`);
      return found;
    };
    const hrefsOf = (root: ParentNode, selector: string) =>
      [...root.querySelectorAll<HTMLAnchorElement>(selector)].map((link) => [
        link.textContent,
        link.getAttribute("href"),
      ]);

    it("TEST-FE-1926 Collapse menu shrinks the menu to icons, is remembered on the device and turns into Expand menu", () => {
      renderShell();
      const button = screen.getByRole("button", { name: "Collapse menu" });
      expect(button).toHaveAttribute("aria-pressed", "false");
      expect(document.documentElement).not.toHaveClass("shell-rail");
      fireEvent.click(button);
      expect(document.documentElement).toHaveClass("shell-rail");
      expect(
        screen.getByRole("button", { name: "Expand menu" }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(window.localStorage.getItem("chetana-rail")).toBe("1");
      // The whole menu stays in the page: every item link is still there (icons with a title).
      expect(
        within(menuOf()).getByRole("link", { name: "Payments" }),
      ).toHaveAttribute("title", "Payments");
      // The choice is remembered on the device.
      cleanup();
      renderShell();
      expect(document.documentElement).toHaveClass("shell-rail");
      fireEvent.click(screen.getByRole("button", { name: "Expand menu" }));
      expect(document.documentElement).not.toHaveClass("shell-rail");
      expect(window.localStorage.getItem("chetana-rail")).toBe("0");
      // The Khmer menu says it in Khmer.
      cleanup();
      renderShell("home", "km");
      expect(
        screen.getByRole("button", { name: "បង្រួមម៉ឺនុយ" }),
      ).toBeInTheDocument();
    });

    it("TEST-FE-1927 a group folds and unfolds, shows its item count when folded, is remembered, and the open page's group is always open", () => {
      renderShell();
      const header = () =>
        within(menuOf()).getByRole("button", { name: /^Operations/ });
      expect(header()).toHaveAttribute("aria-expanded", "true");
      expect(
        within(menuOf()).getByRole("link", { name: "Payments" }),
      ).toBeVisible();
      fireEvent.click(header());
      expect(header()).toHaveAttribute("aria-expanded", "false");
      expect(header().querySelector(".shell-cnt")).toHaveTextContent("4");
      // The folded group's items are out of the page (not reachable, not read out).
      expect(
        within(menuOf()).queryByRole("link", { name: "Payments" }),
      ).not.toBeInTheDocument();
      expect(
        JSON.parse(window.localStorage.getItem("chetana-navgrp") ?? "{}"),
      ).toEqual({ operations: true });
      // Remembered on the device.
      cleanup();
      renderShell();
      expect(header()).toHaveAttribute("aria-expanded", "false");
      expect(
        within(menuOf()).getByRole("button", { name: /^Leasing/ }),
      ).toHaveAttribute("aria-expanded", "true");
      // Opening a page of the folded group opens the group (and remembers it open).
      cleanup();
      renderShell("payments");
      expect(header()).toHaveAttribute("aria-expanded", "true");
      expect(header().closest(".shell-group")).toHaveClass("cur");
      expect(
        JSON.parse(window.localStorage.getItem("chetana-navgrp") ?? "{}"),
      ).toEqual({});
      // Enter and Space work because the header is a real button.
      fireEvent.click(header());
      expect(header()).toHaveAttribute("aria-expanded", "false");
      fireEvent.click(header());
      expect(header()).toHaveAttribute("aria-expanded", "true");
    });

    it("TEST-FE-1928 a page with tabs gets a ⌄ whose sub-items link to the same addresses as its tabs; the current sub-item is marked; a page without tabs has none", () => {
      renderShell("letters");
      const menu = menuOf();
      const leasesRow = part('.shell-nitem[data-menu-page="leases"]');
      const toggle = within(leasesRow).getByRole("button", { name: "3 pages" });
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      const tabs = screen.getByRole("navigation", { name: "Leases" });
      const subItems = hrefsOf(menu, "#shell-sub-leases a");
      expect(subItems).toEqual(hrefsOf(tabs, "a"));
      expect(subItems).toEqual([
        ["Leases", "#/leases"],
        ["Notices", "#/letters"],
        ["Move-outs", "#/moveout"],
      ]);
      expect(
        within(menu).getByRole("link", { name: "Notices" }),
      ).toHaveAttribute("aria-current", "page");
      expect(
        menu.querySelector(
          '.shell-nitem[data-menu-page="leases"] > .shell-item',
        ),
      ).not.toHaveAttribute("aria-current");
      // The ⌄ closes and opens the sub-items, and the choice is remembered.
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(menu.querySelector("#shell-sub-leases")).toHaveAttribute("hidden");
      expect(
        JSON.parse(window.localStorage.getItem("chetana-navopen") ?? "{}"),
      ).toEqual({ leases: false });
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      // Approvals: its in-page tabs as sub-items, at the tabs' own addresses.
      expect(hrefsOf(menu, "#shell-sub-approvals a")).toEqual([
        ["Financial approvals", "#/approvals?tab=financial"],
        ["Short-stay approvals", "#/approvals?tab=shortstays"],
      ]);
      // Payments and Utilities have no tabs, so no ⌄.
      expect(
        menu.querySelector(
          '.shell-nitem[data-menu-page="payments"] .shell-subtog',
        ),
      ).toBeNull();
      expect(
        menu.querySelector(
          '.shell-nitem[data-menu-page="utilities"] .shell-subtog',
        ),
      ).toBeNull();
      // On Approvals the sub-item of the open tab is the current one and follows the address.
      cleanup();
      window.history.replaceState(null, "", "#/approvals?tab=shortstays");
      renderShell("approvals");
      expect(
        within(menuOf()).getByRole("link", { name: "Short-stay approvals" }),
      ).toHaveAttribute("aria-current", "page");
      expect(
        within(menuOf()).getByRole("link", { name: "Financial approvals" }),
      ).not.toHaveAttribute("aria-current");
      act(() => {
        window.history.replaceState(null, "", "#/approvals?tab=financial");
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      });
      expect(
        within(menuOf()).getByRole("link", { name: "Financial approvals" }),
      ).toHaveAttribute("aria-current", "page");
    });

    it("TEST-FE-1929 the user card names the person and the role, in English and Khmer, or My account while the role is unknown", () => {
      renderShell("home", "en", { accountClass: "owner" });
      const card = () => screen.getByRole("link", { name: /Sokha Chan/ });
      expect(within(card()).getByText("Owner")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Sign out" }),
      ).toBeInTheDocument();
      cleanup();
      renderShell("home", "km", { accountClass: "owner" });
      expect(within(card()).getByText("ម្ចាស់")).toBeInTheDocument();
      cleanup();
      renderShell("home", "en", { accountClass: "manager" });
      expect(within(card()).getByText("Manager")).toBeInTheDocument();
      cleanup();
      renderShell("home", "en", { accountClass: "staff" });
      expect(within(card()).getByText("Staff")).toBeInTheDocument();
      cleanup();
      renderShell("home", "en", { accountClass: null });
      expect(within(card()).getByText("My account")).toBeInTheDocument();
    });

    it("TEST-FE-1930 the collapsed rail shows the item's name and sub-items in a fly-out on hover or focus; Escape closes it and returns the focus", () => {
      const matchMedia = window.matchMedia as unknown;
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: (query: string) => ({
          matches: query === "(min-width: 1081px)",
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }),
      });
      try {
        renderShell("letters");
        const row = () => part('.shell-nitem[data-menu-page="leases"]');
        const link = () =>
          part('.shell-nitem[data-menu-page="leases"] > .shell-item');
        // The open menu has no fly-out.
        fireEvent.mouseEnter(row());
        expect(document.querySelector(".shell-fly")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Collapse menu" }));
        fireEvent.mouseEnter(row());
        const fly = part(".shell-fly");
        expect(link()).toHaveAttribute("aria-expanded", "true");
        expect(hrefsOf(fly, "a")).toEqual([
          ["Leases", "#/leases"],
          ["Leases", "#/leases"],
          ["Notices", "#/letters"],
          ["Move-outs", "#/moveout"],
        ]);
        expect(
          within(fly).getByRole("link", { name: "Notices" }),
        ).toHaveAttribute("aria-current", "page");
        fireEvent.mouseLeave(row());
        expect(document.querySelector(".shell-fly")).toBeNull();
        // Keyboard: the focus opens it, Escape closes it and the focus goes back to the icon.
        act(() => {
          link().focus();
        });
        expect(document.querySelector(".shell-fly")).not.toBeNull();
        fireEvent.keyDown(window, { key: "Escape" });
        expect(document.querySelector(".shell-fly")).toBeNull();
        expect(link()).toHaveFocus();
      } finally {
        Object.defineProperty(window, "matchMedia", {
          configurable: true,
          writable: true,
          value: matchMedia,
        });
      }
    });
  });

  it("TEST-FE-808 reads the page from the address and follows address changes", () => {
    expect(pageFromHash("#/leases")).toBe("leases");
    expect(pageFromHash("#leases")).toBe("leases");
    expect(pageFromHash("#/nothing")).toBe("home");
    expect(pageFromHash("")).toBe("home");
    function Probe() {
      return <p>{useHashPage()}</p>;
    }
    window.history.replaceState(null, "", "#/invoices");
    render(<Probe />);
    expect(screen.getByText("invoices")).toBeInTheDocument();
    act(() => {
      window.history.replaceState(null, "", "#/letters");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByText("letters")).toBeInTheDocument();
  });
});
