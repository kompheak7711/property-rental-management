"""Add employee needs the ID; office hours; the caretaker's rest day (migration 20270504_304).

Owner 06/11/2026 09:05: a new employee comes with the ID type and number, the date of birth, the
home address and a photo of the ID. Only the Property caretaker works shifts; every other job
works 07:00-11:00 and 13:00-17:00 with a usual day off. The caretaker has no usual day off, and
the Weekly plan marks a 7th work day in a row (Labour Law Art. 146: at most six days a week).
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import timedelta
from typing import Any

import pytest

from test_hr_employees_migration import (
    ADD,
    IDENTITY,
    HrDatabase,
    add_employee,
    id_document,
    job_id,
    make_hr_database,
    read,
    refused,
    run,
    step,
)
from test_move_in_migration import migrated_database_url as migrated_database_url

CHOICES = "SELECT app.hr_choices(%s, %s)"
WEEK = "SELECT app.hr_attendance_week(%s, %s, %s)"
DAY = "SELECT app.hr_attendance_day(%s, %s, %s)"
ENTRY = "SELECT app.hr_attendance_entry(%s, %s::jsonb, %s, NULL)"
PLAN = "SELECT app.hr_plan_day(%s, %s::jsonb, %s, NULL)"


@pytest.fixture(scope="module")
def hr_database(migrated_database_url: str) -> Iterator[HrDatabase]:
    assert migrated_database_url
    yield from make_hr_database("prm_hr_office")


def form(db: HrDatabase, **change: Any) -> str:
    body: dict[str, Any] = {
        "name_en": "Sample New",
        "name_km": "គំរូ ថ្មី",
        "job_title_id": job_id(db, "CLEANER"),
        "usual_day_off": 7,
        "start_date": str(db.today),
        "identity": IDENTITY,
        "id_document": id_document(),
    } | change
    return json.dumps({key: value for key, value in body.items() if value is not None})


def test_add_employee_needs_the_id_details_and_photo(hr_database: HrDatabase) -> None:
    db = hr_database
    for change, message in (
        ({"identity": None}, "Choose ID card or passport"),
        ({"identity": IDENTITY | {"id_type": "OTHER"}}, "Choose ID card or passport"),
        ({"identity": IDENTITY | {"id_number": " "}}, "Enter the ID number"),
        ({"identity": IDENTITY | {"home_address": ""}}, "Enter the home address"),
        ({"identity": {k: v for k, v in IDENTITY.items() if k != "date_of_birth"}}, "birth"),
        ({"id_document": None}, "Add a photo of the ID card or passport"),
    ):
        assert message in refused(
            db.runtime_url, "22023", ADD, db.property_id, form(db, **change), db.manager
        )
    # Labour Law Art. 177: at least 15 years old on the start date.
    young = str(db.today - timedelta(days=14 * 365))
    assert "15 years" in refused(
        db.runtime_url,
        "22023",
        ADD,
        db.property_id,
        form(db, identity=IDENTITY | {"date_of_birth": young}),
        db.manager,
    )
    person = add_employee(
        db,
        db.manager,
        job_title_id=job_id(db, "CLEANER"),
        usual_day_off=7,
        identity=IDENTITY | {"id_type": "PASSPORT", "id_number": "N1234567"},
    )
    found = read(db, person)
    assert found["identity"]["id_type"] == "PASSPORT"
    assert [(item["kind"], item["title"]) for item in found["documents"]] == [
        ("ID_CARD", "Passport")
    ]


def test_only_the_caretaker_works_shifts(hr_database: HrDatabase) -> None:
    db = hr_database
    choices = run(db.runtime_url, CHOICES, db.property_id, db.manager)
    shifts = {item["code"]: item for item in choices["shifts"]}
    office = shifts["OFFICE"]
    assert (office["starts_at"], office["break_starts_at"]) == ("07:00", "11:00")
    assert (office["break_ends_at"], office["ends_at"]) == ("13:00", "17:00")
    assert shifts["MORNING"]["break_starts_at"] is None
    uses = {item["code"]: item["uses_shifts"] for item in choices["job_titles"]}
    assert [code for code, used in uses.items() if used] == ["CARETAKER"]

    # A caretaker needs one of the three shifts and has no usual day off.
    caretaker = {"job_title_id": job_id(db, "CARETAKER"), "usual_day_off": 3}
    assert "Choose the shift" in refused(
        db.runtime_url, "22023", ADD, db.property_id, form(db, **caretaker), db.manager
    )
    assert "Choose the shift" in refused(
        db.runtime_url,
        "22023",
        ADD,
        db.property_id,
        form(db, **caretaker, shift_code="OFFICE"),
        db.manager,
    )
    guard = add_employee(db, db.manager, shift_code="NIGHT", usual_day_off=3)
    assert (read(db, guard)["shift_code"], read(db, guard)["usual_day_off"]) == ("NIGHT", None)
    # Any other job works office hours and needs its usual day off.
    assert "usual day off" in refused(
        db.runtime_url,
        "22023",
        ADD,
        db.property_id,
        form(db, usual_day_off=None, shift_code="MORNING"),
        db.manager,
    )
    # Moving the caretaker to the front desk asks for the usual day off.
    with pytest.raises(Exception, match="usual day off"):
        step(
            db,
            guard,
            "JOB",
            effective_date=str(db.today),
            job_title_id=job_id(db, "FRONT_DESK"),
            reason="Front desk",
        )
    step(
        db,
        guard,
        "JOB",
        effective_date=str(db.today),
        job_title_id=job_id(db, "FRONT_DESK"),
        usual_day_off=7,
        reason="Front desk",
    )
    assert (read(db, guard)["shift_code"], read(db, guard)["usual_day_off"]) == ("OFFICE", 7)


def test_office_late_counts_from_seven(hr_database: HrDatabase) -> None:
    db = hr_database
    clerk = add_employee(db, db.manager, job_title_id=job_id(db, "FRONT_DESK"), usual_day_off=7)
    day = db.today - timedelta(days=1)
    if day.isoweekday() == 7:
        day -= timedelta(days=1)
    entry = {
        "employee_id": str(clerk),
        "work_date": str(day),
        "status": "WORKED",
        "check_in": "07:25",
        "check_out": "17:00",
        "reason": "Paper sheet",
    }
    run(db.runtime_url, ENTRY, db.property_id, json.dumps(entry), db.manager)
    sheet = run(db.runtime_url, DAY, db.property_id, day, db.manager)
    line = next(item for item in sheet["people"] if item["employee_id"] == str(clerk))
    assert (line["shift_code"], line["late_minutes"], line["uses_shifts"]) == ("OFFICE", 25, False)


def test_the_weekly_plan_marks_a_seventh_work_day(hr_database: HrDatabase) -> None:
    db = hr_database
    caretaker = add_employee(db, db.manager, shift_code="MORNING")
    cleaner = add_employee(db, db.manager, job_title_id=job_id(db, "CLEANER"), usual_day_off=7)
    monday = db.today + timedelta(days=14 - db.today.weekday())
    wednesday = monday + timedelta(days=2)
    run(
        db.runtime_url,
        PLAN,
        db.property_id,
        json.dumps({"employee_id": str(caretaker), "work_date": str(wednesday), "reason": "Rest"}),
        db.manager,
    )

    def week_of(person: object) -> dict[str, Any]:
        week = run(db.runtime_url, WEEK, db.property_id, monday, db.manager)
        return next(item for item in week["people"] if item["employee_id"] == str(person))

    planned = week_of(caretaker)
    assert planned["uses_shifts"] is True
    # Monday and Tuesday follow six work days; after the Wednesday rest no day is the 7th.
    assert [day["seventh_day"] for day in planned["days"]] == [
        True,
        True,
        False,
        False,
        False,
        False,
        False,
    ]
    assert [day["day_off"] for day in planned["days"]][:3] == [False, False, True]
    office = week_of(cleaner)
    assert office["uses_shifts"] is False
    assert not any(day["seventh_day"] for day in office["days"])
    assert [day["shift_code"] for day in office["days"]][-2:] == ["OFFICE", None]
