// UI v81 shared layouts (owner 08/11/2026 06:55, point 1). TEST-FE-1917 to TEST-FE-1920.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DetailLayout,
  FactList,
  FieldGrid,
  FormLayout,
  FullRow,
  PageHeader,
  RightNote,
} from "./layouts";
import { PageHeadContext, type PageHeadSlots } from "./pageHead";

afterEach(() => {
  cleanup();
});

function slotsOf(ownHead: PageHeadSlots["ownHead"]): PageHeadSlots {
  return { page: "leases", sub: null, actions: null, ownHead };
}

describe("UI v81 shared layouts", () => {
  it("TEST-FE-1917 PageHeader: Back on top, then the title with its badge and summary, the buttons on the right, and 'Manager only' as text beside a button, never inside it", () => {
    render(
      <PageHeader
        actions={
          <>
            <button type="button">Renew</button>
            <button type="button">Terminate Lease</button>
            <RightNote>Manager only</RightNote>
          </>
        }
        back={<a href="#/leases">Back to Leases</a>}
        badge={<span className="ui-chip">Current</span>}
        numeric
        summary="Keo Vannak · 01/11/2026 – 31/10/2027"
        title="Lease · U206"
      />,
    );
    const head = screen.getByRole("banner");
    const children = Array.from(head.children);
    // The Back link is the first thing in the head, on its own line above the title row.
    expect(children[0]).toBe(
      screen.getByRole("link", { name: "Back to Leases" }),
    );
    const title = screen.getByRole("heading", {
      level: 1,
      name: "Lease · U206",
    });
    expect(title).toHaveClass("ui-num");
    expect(title).toHaveAttribute("data-record-title");
    // The badge sits in the title row, the summary under it, the buttons in the actions box.
    expect(title.parentElement).toContainElement(screen.getByText("Current"));
    expect(
      screen.getByText("Keo Vannak · 01/11/2026 – 31/10/2027"),
    ).toHaveClass("ui-pagehead-sub");
    const actions = head.querySelector(".ui-pagehead-actions");
    expect(actions).toContainElement(
      screen.getByRole("button", { name: "Renew" }),
    );
    // "Manager only" is plain text in the actions row; no button carries it.
    const note = screen.getByText("Manager only");
    expect(actions).toContainElement(note);
    expect(note.closest("button")).toBeNull();
    for (const button of screen.getAllByRole("button"))
      expect(button).not.toHaveTextContent("Manager");
  });

  it("TEST-FE-1918 PageHeader takes the shell's head only while its page box is on screen, and gives it back when it goes", () => {
    const ownHead = vi.fn<PageHeadSlots["ownHead"]>();
    const view = render(
      <PageHeadContext.Provider value={slotsOf(ownHead)}>
        <div className="shell-page">
          <PageHeader title="Lease · U206" />
        </div>
        <div className="shell-page" hidden>
          <PageHeader title="Customers" />
        </div>
      </PageHeadContext.Provider>,
    );
    // The page on screen owns the head: it draws the page title the shell would have drawn.
    expect(ownHead).toHaveBeenCalledWith(true);
    expect(
      screen.getByRole("heading", { name: "Lease · U206" }),
    ).toHaveAttribute("id", "page-title");
    // The hidden page's header stays quiet, so there is one page title at a time.
    expect(ownHead).not.toHaveBeenCalledWith(false);
    expect(document.querySelectorAll("#page-title")).toHaveLength(1);
    view.unmount();
    expect(ownHead).toHaveBeenLastCalledWith(false);
  });

  it("TEST-FE-1919 without a shell page box (a page on its own) PageHeader draws the head in place and claims nothing", () => {
    const ownHead = vi.fn<PageHeadSlots["ownHead"]>();
    render(
      <PageHeadContext.Provider value={slotsOf(ownHead)}>
        <PageHeader title="New Lease" summary="Draft the Lease." />
      </PageHeadContext.Provider>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "New Lease" }),
    ).not.toHaveAttribute("id");
    expect(ownHead).not.toHaveBeenCalled();
  });

  it("TEST-FE-1920 DetailLayout, FormLayout, FieldGrid and FactList give every part its place: main and side columns, one form around the fields, two-per-row fields with full rows, and labelled facts with their notes", () => {
    const onSubmit = vi.fn((event: { preventDefault(): void }) => {
      event.preventDefault();
    });
    render(
      <>
        <DetailLayout
          main={<section aria-label="Lease">Lease card</section>}
          side={<section aria-label="Deposits">Deposits card</section>}
        />
        <FormLayout
          className="ui-leaseform"
          main={
            <FieldGrid>
              <label>
                Unit <input name="unit" />
              </label>
              <label>
                Primary tenant <input name="tenant" />
              </label>
              <FullRow>
                <button type="submit">Save as draft</button>
              </FullRow>
            </FieldGrid>
          }
          onSubmit={onSubmit}
          side={<aside aria-label="What will be billed">Billing</aside>}
        />
        <FactList
          facts={[
            { key: "unit", label: "Unit", value: "U206" },
            {
              key: "rent",
              label: "Monthly rent",
              value: "$330.00",
              note: "Fixed for the whole term",
            },
          ]}
        />
      </>,
    );
    // Detail: the main column holds the Lease card, the side column the Deposits card.
    const main = screen.getByLabelText("Lease").parentElement;
    const side = screen.getByLabelText("Deposits").parentElement;
    expect(main).toHaveClass("ui-stack");
    expect(side).toHaveClass("ui-stack", "ui-detail-side");
    expect(main?.parentElement).toHaveClass("ui-detail");
    expect(main?.parentElement).toBe(side?.parentElement);
    // Form: one form holds the fields and the side panel; Save submits it.
    const form = screen
      .getByRole("button", { name: "Save as draft" })
      .closest("form");
    expect(form).toHaveClass("ui-formlayout", "ui-leaseform");
    expect(form).toHaveAttribute("novalidate");
    expect(form).toContainElement(screen.getByLabelText("What will be billed"));
    expect(
      screen.getByLabelText("What will be billed").parentElement,
    ).toHaveClass("ui-formlayout-side");
    expect(screen.getByLabelText("Unit").closest(".ui-fields")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Save as draft" }).parentElement,
    ).toHaveClass("ui-span2");
    fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    // Facts: a term over each value; the note only where one is given.
    const facts = screen.getByText("Monthly rent").closest("dl");
    expect(facts).toHaveClass("ui-factlist");
    const unit = screen.getByText("Unit", { selector: "dt" }).parentElement;
    expect(unit?.querySelectorAll("dd")).toHaveLength(1);
    const rent = screen.getByText("Monthly rent").parentElement;
    expect(rent?.querySelectorAll("dd")).toHaveLength(2);
    expect(screen.getByText("Fixed for the whole term")).toHaveClass(
      "ui-factlist-note",
    );
  });
});
