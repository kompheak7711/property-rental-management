"""DL-250 step 4: the reports by building.

The building chosen in the side menu narrows the Totals reports, the registers and the report
files to the Units of that building, the same way a floor does: money with no Unit counts only in
the All buildings report. With no building chosen every answer is the same as before DL-250.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from typing import Any, cast

from property_rental.report_exports import heading_lines
from property_rental.report_registers import RegisterFilter, build_register
from property_rental.report_totals import TotalsFilter, build_totals, payment_facts

B1, B2 = uuid.uuid4(), uuid.uuid4()
U1, U2 = uuid.uuid4(), uuid.uuid4()
UNITS: list[dict[str, object]] = [
    {
        "id": U1,
        "unit_number": "U101",
        "floor": "1",
        "unit_type": "STUDIO",
        "status": "OCCUPIED",
        "building_id": B1,
        "building_name": "CHETANA Residence",
    },
    {
        "id": U2,
        "unit_number": "B101",
        "floor": "1",
        "unit_type": "STUDIO",
        "status": "OCCUPIED",
        "building_id": B2,
        "building_name": "Building Two",
    },
]
PAYMENTS: list[dict[str, object]] = [
    {
        "unit_id": U1,
        "month": date(2026, 10, 1),
        "kind": "INVOICES",
        "category": "RENT",
        "amount_usd_cents": 30_000,
    },
    {
        "unit_id": U2,
        "month": date(2026, 10, 1),
        "kind": "INVOICES",
        "category": "RENT",
        "amount_usd_cents": 45_000,
    },
    {
        "unit_id": None,
        "month": date(2026, 10, 1),
        "kind": "NOT_ALLOCATED",
        "category": None,
        "amount_usd_cents": 5_000,
    },
]


def test_a_building_keeps_the_totals_of_its_units_and_all_buildings_keeps_everything() -> None:
    facts = payment_facts(PAYMENTS)
    every = cast(dict[str, Any], build_totals("total_payment", facts, UNITS, TotalsFilter()))
    assert every["summary"]["total"] == 80_000
    assert "building_id" not in every["filter"]
    two = cast(
        dict[str, Any],
        build_totals("total_payment", facts, UNITS, TotalsFilter(building_id=B2)),
    )
    assert two["summary"]["total"] == 45_000
    assert two["summary"]["no_unit_amount"] == 0
    assert two["filter"]["building_id"] == str(B2)
    assert two["filter"]["building_name"] == "Building Two"
    one_floor = cast(
        dict[str, Any],
        build_totals("total_payment", facts, UNITS, TotalsFilter(floor="1", building_id=B1)),
    )
    assert one_floor["summary"]["total"] == 30_000


def test_a_building_keeps_the_register_rows_of_its_units() -> None:
    rows: list[dict[str, object]] = [
        {
            "unit_id": unit,
            "unit_status": "OCCUPIED",
            "lease_id": None,
            "lease_number": None,
            "customer_name": None,
            "start_date": None,
            "end_date": None,
            "rent_usd_cents": None,
        }
        for unit in (U1, U2)
    ]
    every = build_register("unit_occupancy", rows, UNITS, RegisterFilter(), money=True)
    assert every["row_count"] == 2
    assert "building_id" not in cast(dict[str, object], every["filter"])
    two = build_register("unit_occupancy", rows, UNITS, RegisterFilter(building_id=B2), money=True)
    assert two["row_count"] == 1
    assert [row["unit_number"] for row in cast(list[dict[str, object]], two["rows"])] == ["B101"]
    assert cast(dict[str, object], two["filter"])["building_name"] == "Building Two"


def test_a_report_file_of_one_building_names_it_in_the_heading() -> None:
    made = datetime(2026, 11, 20, 3, 0, tzinfo=UTC)
    assert heading_lines(generated_at=made)[0] == "Scope: Whole Property"
    assert heading_lines(generated_at=made, building="Building Two")[0] == "Scope: Building Two"
    assert (
        heading_lines(generated_at=made, building="Building Two", floor="1")[0]
        == "Scope: Building Two · Floor 1"
    )
    assert heading_lines(generated_at=made, building="Building Two", unit_number="B101")[0] == (
        "Scope: Unit B101"
    )
