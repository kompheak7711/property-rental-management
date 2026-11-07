// UI v81 round 2: Property › Inspections. TEST-FE-1914.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { InspectionsPage } from "./InspectionsPage";

afterEach(() => {
  cleanup();
});

describe("Inspections (UI v81 round 2)", () => {
  it("TEST-FE-1914 says the Joint Inspection and Unit Check records come in V1.2 and opens Move-outs and Problem reports", () => {
    render(<InspectionsPage language="en" />);
    expect(
      screen.getByText(
        "Joint Inspections and Unit Checks are built in V1.2, after the design is approved. Until then:",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open Move-outs" }),
    ).toHaveAttribute("href", "#/moveout");
    expect(
      screen.getByRole("link", { name: "Open Problem reports" }),
    ).toHaveAttribute("href", "#/problems");
    cleanup();
    render(<InspectionsPage language="km" />);
    expect(
      screen.getByRole("link", { name: "បើកការចាកចេញ" }),
    ).toBeInTheDocument();
  });
});
