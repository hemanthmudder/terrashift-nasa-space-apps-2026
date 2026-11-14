"""Mocked tests for the NASA POWER pipeline against data contract v1.0.

No network access: HTTP is replaced with fakes. Fixtures use the real nested
config/pilot_region.json so tests break if the approved config changes.

Run from the repository root:
    python3 -m unittest discover -s tests -p "test_nasa_power.py" -v
"""

from __future__ import annotations

import csv
import datetime as dt
import hashlib
import io
import json
import sys
import tempfile
import unittest
import urllib.error
import urllib.parse
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from src.pipeline import clean_nasa_power as clean  # noqa: E402
from src.pipeline import fetch_nasa_power as fetch  # noqa: E402

CONFIG_PATH = REPO_ROOT / "config" / "pilot_region.json"
CONFIG = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
PARAMS = CONFIG["nasa_power"]["parameters"]

UNITS = {
    "T2M": "C", "T2M_MAX": "C", "T2M_MIN": "C", "PRECTOTCORR": "mm/day", "RH2M": "%",
    "WS2M": "m/s", "ALLSKY_SFC_SW_DWN": "MJ/m^2/day", "GWETTOP": "1", "GWETROOT": "1",
}
GOOD_DAY = {
    "T2M": 20.46, "T2M_MAX": 25.36, "T2M_MIN": 15.0, "PRECTOTCORR": 0.75, "RH2M": 76.95,
    "WS2M": 1.7, "ALLSKY_SFC_SW_DWN": 21.51, "GWETTOP": 0.57, "GWETROOT": 0.53,
}


def make_response(days: dict[str, dict], start: str, end: str, *, version="v9.9.9-test", units=None) -> dict:
    """Build a response shaped like the live POWER Daily API (checked 2026-11-14)."""
    units = units or UNITS
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [-93.4661, 42.0375, 310.22]},
        "properties": {"parameter": {p: {d: v[p] for d, v in days.items() if p in v} for p in PARAMS}},
        "header": {
            "title": "NASA/POWER Source Native Resolution Daily Data",
            "api": {"version": version, "name": "POWER Daily API"},
            "sources": ["MERRA2", "SYN1DEG", "POWER"],
            "fill_value": -999.0,
            "time_standard": "LST",
            "start": start,
            "end": end,
        },
        "messages": [],
        "parameters": {p: {"units": units[p], "longname": p} for p in PARAMS},
        "times": {"data": 0.1, "process": 0.1},
    }


def one_day(**overrides) -> dict:
    d = dict(GOOD_DAY)
    d.update(overrides)
    return d


def clean_one(**overrides) -> dict:
    data = make_response({"20240601": one_day(**overrides)}, "20240601", "20240601")
    return clean.clean_rows(data)[0]


class FakeHTTPResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


class FakeOpener:
    """Returns queued results in order: bytes -> success, Exception -> raised."""

    def __init__(self, *results):
        self.results = list(results)
        self.calls = []

    def __call__(self, request, timeout=None):
        self.calls.append(request.full_url)
        result = self.results.pop(0)
        if isinstance(result, Exception):
            raise result
        return FakeHTTPResponse(result)


def http_error(code: int) -> urllib.error.HTTPError:
    return urllib.error.HTTPError("https://example", code, f"HTTP {code}", {}, io.BytesIO(b'{"message":"x"}'))


# =========================================================================== fetch


class TestBuildRequest(unittest.TestCase):
    def test_uses_nested_config_internal_point_and_ag(self):
        req = fetch.build_request(CONFIG)
        q = urllib.parse.parse_qs(urllib.parse.urlparse(req["url"]).query)
        self.assertEqual(req["latitude"], CONFIG["region"]["internal_point"]["latitude"])
        self.assertEqual(req["longitude"], CONFIG["region"]["internal_point"]["longitude"])
        self.assertEqual(q["latitude"], ["42.0375"])
        self.assertEqual(q["longitude"], ["-93.4661"])
        self.assertEqual(q["community"], ["AG"])
        self.assertEqual(q["format"], ["JSON"])
        self.assertTrue(req["url"].startswith("https://power.larc.nasa.gov/api/temporal/daily/point?"))

    def test_all_nine_parameters(self):
        req = fetch.build_request(CONFIG)
        q = urllib.parse.parse_qs(urllib.parse.urlparse(req["url"]).query)
        self.assertEqual(q["parameters"][0].split(","), PARAMS)
        self.assertEqual(len(PARAMS), 9)

    def test_default_period_is_approved_climate_period(self):
        req = fetch.build_request(CONFIG)
        q = urllib.parse.parse_qs(urllib.parse.urlparse(req["url"]).query)
        self.assertEqual((req["start"], req["end"]), ("1991-01-01", "2025-12-31"))
        self.assertEqual((q["start"], q["end"]), (["19910101"], ["20251231"]))

    def test_rejects_reversed_dates(self):
        with self.assertRaises(ValueError):
            fetch.build_request(CONFIG, "2024-06-03", "2024-06-01")

    def test_raw_paths_follow_contract(self):
        raw, comp = fetch.raw_paths(fetch.DEFAULT_RAW_DIR, "ia-story-19169", "1991-01-01", "2025-12-31")
        self.assertEqual(raw.relative_to(REPO_ROOT).as_posix(),
                         "data/raw/nasa_power/ia-story-19169_daily_19910101_20251231.json")
        self.assertEqual(comp.name, "ia-story-19169_daily_19910101_20251231.request.json")


class TestFetchBytes(unittest.TestCase):
    def test_retries_then_succeeds(self):
        opener = FakeOpener(http_error(503), urllib.error.URLError("down"), b"{}")
        sleeps = []
        body = fetch.fetch_bytes("https://x", retries=3, backoff_s=1, opener=opener, sleep=sleeps.append)
        self.assertEqual(body, b"{}")
        self.assertEqual(len(opener.calls), 3)
        self.assertEqual(sleeps, [1, 2])  # exponential backoff

    def test_non_retryable_http_error_fails_immediately(self):
        opener = FakeOpener(http_error(422))
        with self.assertRaises(fetch.PowerFetchError) as ctx:
            fetch.fetch_bytes("https://x", opener=opener, sleep=lambda s: None)
        self.assertIn("422", str(ctx.exception))
        self.assertEqual(len(opener.calls), 1)

    def test_gives_up_after_retries(self):
        opener = FakeOpener(*[http_error(500)] * 3)
        with self.assertRaises(fetch.PowerFetchError):
            fetch.fetch_bytes("https://x", retries=2, opener=opener, sleep=lambda s: None)
        self.assertEqual(len(opener.calls), 3)


class TestParseAndCheck(unittest.TestCase):
    def test_rejects_invalid_json(self):
        with self.assertRaises(fetch.PowerFetchError):
            fetch.parse_and_check(b"<html>", PARAMS)

    def test_rejects_missing_parameter(self):
        data = make_response({"20240601": GOOD_DAY}, "20240601", "20240601")
        del data["properties"]["parameter"]["GWETROOT"]
        with self.assertRaises(fetch.PowerFetchError):
            fetch.parse_and_check(json.dumps(data).encode(), PARAMS)

    def test_rejects_missing_api_version(self):
        data = make_response({"20240601": GOOD_DAY}, "20240601", "20240601")
        del data["header"]["api"]
        with self.assertRaises(fetch.PowerFetchError):
            fetch.parse_and_check(json.dumps(data).encode(), PARAMS)


class TestRunAndSave(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raw_dir = Path(self.tmp.name) / "data" / "raw" / "nasa_power"
        data = make_response({"20240601": GOOD_DAY, "20240602": GOOD_DAY}, "20240601", "20240602")
        # Deliberately odd formatting: raw bytes must be kept exactly, not re-serialised.
        self.body = json.dumps(data, indent=3, sort_keys=False).encode() + b"\n\n"

    def tearDown(self):
        self.tmp.cleanup()

    def run_fetch(self):
        return fetch.run(CONFIG_PATH, self.raw_dir, "2024-06-01", "2024-06-02",
                         opener=FakeOpener(self.body), sleep=lambda s: None)

    def test_raw_bytes_preserved_exactly(self):
        raw_path, _, _ = self.run_fetch()
        self.assertEqual(raw_path.read_bytes(), self.body)

    def test_companion_matches_contract(self):
        raw_path, comp_path, _ = self.run_fetch()
        comp = json.loads(comp_path.read_text())
        self.assertEqual(set(comp), {
            "schema_version", "region_id", "request_url", "community", "parameters", "latitude",
            "longitude", "start", "end", "retrieved_at_utc", "api_version", "sha256"})
        self.assertEqual(comp["schema_version"], "1.0")
        self.assertEqual(comp["region_id"], "ia-story-19169")
        self.assertEqual((comp["latitude"], comp["longitude"]), (42.0375, -93.4661))
        self.assertEqual((comp["start"], comp["end"]), ("2024-06-01", "2024-06-02"))
        self.assertEqual(comp["community"], "AG")
        self.assertEqual(comp["parameters"], PARAMS)
        self.assertEqual(comp["sha256"], hashlib.sha256(raw_path.read_bytes()).hexdigest())
        dt.datetime.strptime(comp["retrieved_at_utc"], "%Y-%m-%dT%H:%M:%SZ")

    def test_api_version_comes_from_response(self):
        _, comp_path, _ = self.run_fetch()
        self.assertEqual(json.loads(comp_path.read_text())["api_version"], "v9.9.9-test")


# =========================================================================== clean


class TestGDD(unittest.TestCase):
    def test_formula_cases(self):
        cases = [
            ((25.36, 15.0), 10.18),   # no clamping
            ((35.0, 5.0), 10.0),      # tmax capped at 30, tmin raised to 10
            ((8.0, 2.0), 0.0),        # both raised to 10
            ((32.0, 31.0), 20.0),     # both capped at 30
            ((10.0, 10.0), 0.0),
        ]
        for (tmax, tmin), expected in cases:
            with self.subTest(tmax=tmax, tmin=tmin):
                self.assertAlmostEqual(clean.gdd_corn(tmax, tmin), expected, places=6)

    def test_gdd_empty_when_temperature_missing(self):
        row = clean_one(T2M_MAX=-999.0)
        self.assertIsNone(row["gdd_c"])


class TestQCRules(unittest.TestCase):
    def test_clean_day_is_ok(self):
        row = clean_one()
        self.assertEqual(row["qc_flag"], "ok")
        self.assertEqual(row["qc_fields"], "")
        self.assertAlmostEqual(row["gdd_c"], 10.18)

    def test_fill_value_becomes_empty_and_missing(self):
        row = clean_one(PRECTOTCORR=-999.0)
        self.assertIsNone(row["precip_mm"])
        self.assertEqual(row["qc_flag"], "missing")
        self.assertEqual(row["qc_fields"], "precip_mm")

    def test_physical_range_rules(self):
        cases = {
            "precip_mm": {"PRECTOTCORR": -0.1},
            "rh_pct": {"RH2M": 100.5},
            "wind_ms": {"WS2M": -1.0},
            "srad_mj_m2": {"ALLSKY_SFC_SW_DWN": -0.01},
            "soil_wet_top": {"GWETTOP": 1.2},
            "soil_wet_root": {"GWETROOT": -0.1},
        }
        for column, override in cases.items():
            with self.subTest(column=column):
                row = clean_one(**override)
                self.assertIsNone(row[column])
                self.assertEqual(row["qc_flag"], "out_of_range")
                self.assertEqual(row["qc_fields"], column)

    def test_boundaries_are_valid(self):
        row = clean_one(RH2M=100.0, GWETTOP=0.0, GWETROOT=1.0, PRECTOTCORR=0.0)
        self.assertEqual(row["qc_flag"], "ok")

    def test_tmax_below_tmin_blanks_both(self):
        row = clean_one(T2M_MAX=10.0, T2M_MIN=12.0)
        self.assertIsNone(row["tmax_c"])
        self.assertIsNone(row["tmin_c"])
        self.assertIsNone(row["gdd_c"])
        self.assertEqual(row["qc_flag"], "out_of_range")
        self.assertEqual(row["qc_fields"], "tmax_c;tmin_c")
        self.assertAlmostEqual(row["tmean_c"], 20.46)  # tmean is not covered by rule 3

    def test_out_of_range_takes_precedence_over_missing(self):
        row = clean_one(T2M=-999.0, RH2M=150.0)
        self.assertEqual(row["qc_flag"], "out_of_range")
        self.assertEqual(row["qc_fields"], "tmean_c;rh_pct")  # both listed, column order, ';'

    def test_qc_fields_semicolon_separated_in_column_order(self):
        row = clean_one(GWETROOT=-999.0, T2M_MIN=-999.0, WS2M=-999.0)
        self.assertEqual(row["qc_fields"], "tmin_c;wind_ms;soil_wet_root")


class TestCalendarAndNoGapFilling(unittest.TestCase):
    def test_absent_day_gets_row_and_is_not_interpolated(self):
        days = {"20240601": one_day(T2M=10.0), "20240603": one_day(T2M=30.0)}  # 06-02 absent
        rows = clean.clean_rows(make_response(days, "20240601", "20240603"))
        self.assertEqual([r["date"] for r in rows], ["2024-06-01", "2024-06-02", "2024-06-03"])
        gap = rows[1]
        self.assertIsNone(gap["tmean_c"])  # not 20.0
        self.assertTrue(all(gap[c] is None for c, _ in clean.COLUMN_SOURCES))
        self.assertEqual(gap["qc_flag"], "missing")

    def test_full_period_has_12784_days(self):
        days = clean.calendar_days(dt.date(1991, 1, 1), dt.date(2025, 12, 31))
        self.assertEqual(len(days), 12784)
        self.assertEqual(len(set(days)), 12784)

    def test_leap_day_included(self):
        rows = clean.clean_rows(make_response({}, "20240228", "20240301"))
        self.assertEqual([r["date"] for r in rows], ["2024-02-28", "2024-02-29", "2024-03-01"])


class TestUnits(unittest.TestCase):
    def test_solar_kwh_converted_to_mj(self):
        units = dict(UNITS, ALLSKY_SFC_SW_DWN="kW-hr/m^2/day")
        data = make_response({"20240601": one_day(ALLSKY_SFC_SW_DWN=5.0)}, "20240601", "20240601", units=units)
        self.assertAlmostEqual(clean.clean_rows(data)[0]["srad_mj_m2"], 18.0)

    def test_unexpected_unit_stops(self):
        units = dict(UNITS, ALLSKY_SFC_SW_DWN="W/m^2")
        data = make_response({"20240601": GOOD_DAY}, "20240601", "20240601", units=units)
        with self.assertRaises(clean.CleanError):
            clean.clean_rows(data)

    def test_missing_unit_metadata_stops(self):
        data = make_response({"20240601": GOOD_DAY}, "20240601", "20240601")
        del data["parameters"]["T2M"]
        with self.assertRaises(clean.CleanError):
            clean.clean_rows(data)


class TestCSVOutput(unittest.TestCase):
    def test_schema_paths_and_empty_cells(self):
        with tempfile.TemporaryDirectory() as tmp:
            raw = Path(tmp) / "raw.json"
            days = {"20240601": GOOD_DAY, "20240602": one_day(PRECTOTCORR=-999.0)}
            raw.write_text(json.dumps(make_response(days, "20240601", "20240602")))
            out = Path(tmp) / "processed" / "ia-story-19169" / "climate_daily.csv"
            path, _ = clean.run(raw, CONFIG_PATH, out)
            with open(path, newline="") as f:
                reader = csv.reader(f)
                header = next(reader)
                rows = list(reader)
        self.assertEqual(header, [
            "date", "tmean_c", "tmax_c", "tmin_c", "precip_mm", "rh_pct", "wind_ms", "srad_mj_m2",
            "soil_wet_top", "soil_wet_root", "gdd_c", "qc_flag", "qc_fields"])
        self.assertEqual(rows[0][0], "2024-06-01")
        self.assertEqual(rows[0][-2:], ["ok", ""])
        self.assertEqual(rows[0][10], "10.18")
        self.assertEqual(rows[1][4], "")  # precip empty, not -999 or 0
        self.assertEqual(rows[1][-2:], ["missing", "precip_mm"])

    def test_default_processed_path(self):
        self.assertEqual(clean.processed_path(CONFIG).relative_to(REPO_ROOT).as_posix(),
                         "data/processed/ia-story-19169/climate_daily.csv")


if __name__ == "__main__":
    unittest.main()
