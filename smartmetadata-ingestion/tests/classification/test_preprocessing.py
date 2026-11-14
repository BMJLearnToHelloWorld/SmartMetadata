# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Fresh spec tests for classification preprocessing (design §2.5)."""

from __future__ import annotations

import importlib.util
import logging
from datetime import datetime

import pytest

from smartmetadata_ingestion.classification.preprocessing import (
    MAX_VALUE_CHARS,
    PreparedValues,
    column_content_valid,
    normalize_match_span,
    prepare_column_values,
    spells_a_date,
    split_column_name,
)

needs_dateutil = pytest.mark.skipif(
    importlib.util.find_spec("dateutil") is None,
    reason="python-dateutil not installed",
)


def test_strings_pass_through_stripped_and_empties_dropped() -> None:
    prepared = prepare_column_values(["  alice@example.com ", "", "   ", "bob"])
    assert prepared == PreparedValues(texts=["alice@example.com", "bob"], truncated=0)


def test_nulls_never_become_the_string_none() -> None:
    prepared = prepare_column_values([None, None])
    assert prepared.texts == []


def test_binary_is_skipped() -> None:
    prepared = prepare_column_values([b"\x00\x01", bytearray(b"abc"), "kept"])
    assert prepared.texts == ["kept"]


def test_numbers_and_dates_take_the_string_form() -> None:
    prepared = prepare_column_values([42, 3.14, True, datetime(2026, 3, 14, 10, 30)])
    assert prepared.texts == ["42", "3.14", "True", "2026-03-14 10:30:00"]


def test_sequences_and_mappings_flatten_recursively() -> None:
    prepared = prepare_column_values(
        [["a", ["b", ("c",)]], {"key": "value", "dropped_key": None}, {"x", "y"}]
    )
    assert sorted(prepared.texts) == ["a", "b", "c", "value", "x", "y"]


def test_mapping_keys_never_reach_the_text() -> None:
    prepared = prepare_column_values([{"email": "a@b.com"}])
    assert prepared.texts == ["a@b.com"]


def test_no_case_normalization() -> None:
    prepared = prepare_column_values(["ABC", "AbC"])
    assert prepared.texts == ["ABC", "AbC"]


def test_long_values_truncate_and_count() -> None:
    long_value = "x" * (MAX_VALUE_CHARS + 10)
    prepared = prepare_column_values([long_value, "short"])
    assert prepared.texts == ["x" * MAX_VALUE_CHARS, "short"]
    assert prepared.truncated == 1


def test_content_valid_requires_a_surviving_string() -> None:
    assert column_content_valid([]) is False


def test_content_valid_rejects_a_single_repeated_value_at_scale() -> None:
    assert column_content_valid(["same"] * 200) is False


def test_content_valid_accepts_enough_distinctness() -> None:
    assert column_content_valid(["a"] * 99 + ["b"]) is True
    assert column_content_valid(["only"]) is True


def test_split_column_name_delimiters() -> None:
    assert split_column_name("user_name") == ["user", "name"]
    assert split_column_name("user-name.first/last name") == [
        "user",
        "name",
        "first",
        "last",
        "name",
    ]
    assert split_column_name("a__b") == ["a", "b"]
    assert split_column_name("") == []


def test_split_column_name_camel_case_only_lower_to_upper() -> None:
    assert split_column_name("userName") == ["user", "name"]
    assert split_column_name("userEmail") == ["user", "email"]
    assert split_column_name("userID") == ["user", "id"]
    # Acronym->word and digit->upper are NOT boundaries: the whole
    # piece stays one token.
    assert split_column_name("SSNNumber") == ["ssnnumber"]
    assert split_column_name("IDNumber") == ["idnumber"]
    assert split_column_name("field2Name") == ["field2name"]
    assert split_column_name("email2Address") == ["email2address"]
    assert split_column_name("EMAIL") == ["email"]


def test_spells_a_date_full_and_partial() -> None:
    assert spells_a_date("2018-03-14") is True
    assert spells_a_date("2018/03/14") is True
    assert spells_a_date("2018.03.14") is True
    assert spells_a_date("14 March 2018") is True
    assert spells_a_date("March 14, 2018") is True
    assert spells_a_date("2018-03-14T10:30:00") is True
    assert spells_a_date("2018-03-14T10:30:00Z") is True
    assert spells_a_date("2018-03-14 10:30:00") is True
    assert spells_a_date("Monday, March 14, 2018") is True
    assert spells_a_date("2018-03") is True
    assert spells_a_date("03-2018") is True
    assert spells_a_date("March 14") is True
    assert spells_a_date("14 March") is True
    assert spells_a_date("March 2018") is True
    assert spells_a_date("2018 March") is True
    assert spells_a_date("03/14") is True
    # "14/03" is parser-defined: dateutil raises, the stdlib emulation
    # accepts. Asserted in the availability-branched tests below.


def test_spells_a_date_two_digit_years_and_ordinals() -> None:
    # Two-digit years spell dates when month/day are also present.
    assert spells_a_date("03/14/18") is True
    assert spells_a_date("14-Mar-18") is True
    assert spells_a_date("Mar-18") is True
    assert spells_a_date("March 99") is True
    # Ordinal day spellings spell dates.
    assert spells_a_date("March 14th") is True
    assert spells_a_date("14th March 2018") is True
    assert spells_a_date("March 1st, 2018") is True
    assert spells_a_date("2nd February 2020") is True
    # Abbreviated months, dotted abbreviations, and "sept".
    assert spells_a_date("Mar. 14, 2018") is True
    assert spells_a_date("Sept 5, 2020") is True


def test_spells_a_date_rejects_bare_years_prices_and_garbage() -> None:
    assert spells_a_date("2018") is False
    assert spells_a_date("19.99") is False
    assert spells_a_date("29.99") is False
    assert spells_a_date("") is False
    assert spells_a_date("hello") is False
    assert spells_a_date("2026-13-45") is False
    assert spells_a_date("13/14/2018") is False
    assert spells_a_date("March") is False
    assert spells_a_date("14") is False
    assert spells_a_date("10:30") is False
    # "on March 14" is parser-defined: dateutil accepts, the stdlib
    # emulation rejects. Asserted in the availability-branched tests below.
    assert spells_a_date("March April 14") is False
    assert spells_a_date("2018-03-14 25:00") is False


def test_spells_a_date_validates_real_calendar_dates() -> None:
    assert spells_a_date("Feb 29, 2000") is True
    assert spells_a_date("Feb 29, 1900") is False
    assert spells_a_date("02-29-2000") is True
    assert spells_a_date("02-29-2019") is False
    assert spells_a_date("Feb 29") is False
    assert spells_a_date("February 29 00") is True
    assert spells_a_date("February 30, 2018") is False


@needs_dateutil
def test_spells_a_date_dateutil_edges() -> None:
    # Observed dateutil 2.9.0.post0 behavior under the two-default rule
    # (supplement §4.2): the parser defines the outcomes, including the
    # four former emulation edges and the two cases where the emulation
    # diverged from the parser.
    assert spells_a_date("March 32") is True  # "32" reads as year 2032
    assert spells_a_date("12.31") is False  # only the day agrees
    assert spells_a_date("3.14") is False  # only the day agrees
    assert spells_a_date("20180314") is True  # the compact date parses
    assert spells_a_date("14/03") is False  # the parser raises
    assert spells_a_date("on March 14") is True  # the parser accepts


def test_spells_a_date_fallback_emulation_warns_once(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    # With python-dateutil unavailable the stdlib emulation applies and
    # warns loudly, once per process. The emulation's known edges are
    # asserted here so a fallback-only environment stays characterized.
    monkeypatch.setattr(
        "smartmetadata_ingestion.classification.preprocessing._dateutil_parse",
        None,
    )
    monkeypatch.setattr(
        "smartmetadata_ingestion.classification.preprocessing._DATEUTIL_FALLBACK_WARNED",
        False,
    )
    with caplog.at_level(
        logging.WARNING,
        logger="smartmetadata_ingestion.classification.preprocessing",
    ):
        assert spells_a_date("March 32") is True
        assert spells_a_date("12.31") is True
        assert spells_a_date("3.14") is True
        assert spells_a_date("20180314") is False
        assert spells_a_date("14/03") is True
        assert spells_a_date("on March 14") is False
    assert caplog.text.count("python-dateutil is not installed") == 1


def test_normalize_match_span_folds_case_and_whitespace() -> None:
    assert normalize_match_span("  Foo   Bar ") == "foo bar"
    assert normalize_match_span("ABC") == "abc"
    assert normalize_match_span("a\tb\nc") == "a b c"
