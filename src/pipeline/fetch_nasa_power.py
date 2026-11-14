"""Fetch daily NASA POWER data for the TerraShift pilot region.

Implements data contract v1.0, section 4.1 (docs/METHODOLOGY.md):

* The API response is saved byte-for-byte, never edited:
  data/raw/nasa_power/{region_id}_daily_{YYYYMMDD}_{YYYYMMDD}.json
* A companion file with the same name ending in ``.request.json`` records
  the request, the API version reported by the response and a SHA-256
  checksum of the saved bytes.

Standard library only. Coordinates, parameters, community and period come
from config/pilot_region.json (coordinates from ``region.internal_point``).

Usage (from the repository root):
    python3 -m src.pipeline.fetch_nasa_power
    python3 -m src.pipeline.fetch_nasa_power --start 2024-06-01 --end 2024-06-03
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Callable, Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = REPO_ROOT / "config" / "pilot_region.json"
DEFAULT_RAW_DIR = REPO_ROOT / "data" / "raw" / "nasa_power"
SCHEMA_VERSION = "1.0"

# HTTP status codes worth retrying; any other HTTP error fails immediately.
RETRYABLE_STATUS = {429, 500, 502, 503, 504}


class PowerFetchError(RuntimeError):
    """Raised when NASA POWER cannot be fetched or returns an unusable response."""


# --------------------------------------------------------------------------- config


def load_config(path: Path = DEFAULT_CONFIG) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def iso_to_compact(date_iso: str) -> str:
    """'1991-01-01' -> '19910101' (validates the date)."""
    return dt.date.fromisoformat(date_iso).strftime("%Y%m%d")


def build_request(config: dict, start: Optional[str] = None, end: Optional[str] = None) -> dict:
    """Return the request description for the configured region and period.

    ``start``/``end`` are ISO dates; they default to the configured climate period.
    """
    region = config["region"]
    point = region["internal_point"]
    power = config["nasa_power"]
    period = config["analysis_period"]

    start = start or period["climate_start"]
    end = end or period["climate_end"]
    if dt.date.fromisoformat(start) > dt.date.fromisoformat(end):
        raise ValueError(f"start {start} is after end {end}")

    query = {
        "parameters": ",".join(power["parameters"]),
        "community": power["community"],
        "longitude": point["longitude"],
        "latitude": point["latitude"],
        "start": iso_to_compact(start),
        "end": iso_to_compact(end),
        "format": "JSON",
    }
    url = power["endpoint"] + "?" + urllib.parse.urlencode(query, safe=",")
    return {
        "region_id": region["id"],
        "url": url,
        "community": power["community"],
        "parameters": list(power["parameters"]),
        "latitude": point["latitude"],
        "longitude": point["longitude"],
        "start": start,
        "end": end,
    }


def raw_paths(raw_dir: Path, region_id: str, start: str, end: str) -> tuple[Path, Path]:
    stem = f"{region_id}_daily_{iso_to_compact(start)}_{iso_to_compact(end)}"
    return raw_dir / f"{stem}.json", raw_dir / f"{stem}.request.json"


# --------------------------------------------------------------------------- HTTP


def fetch_bytes(
    url: str,
    *,
    retries: int = 3,
    backoff_s: float = 5.0,
    timeout_s: float = 300.0,
    opener: Callable = urllib.request.urlopen,
    sleep: Callable[[float], None] = time.sleep,
) -> bytes:
    """GET ``url`` and return the body bytes.

    Retries network errors and HTTP 429/5xx up to ``retries`` extra times with
    exponential backoff. Other HTTP errors (e.g. 400, 422) fail immediately.
    """
    request = urllib.request.Request(url, headers={"User-Agent": "TerraShift/0.1 (NASA Space Apps)"})
    last_error: Optional[Exception] = None
    for attempt in range(retries + 1):
        try:
            with opener(request, timeout=timeout_s) as response:
                return response.read()
        except urllib.error.HTTPError as e:
            if e.code not in RETRYABLE_STATUS:
                detail = ""
                try:
                    detail = e.read().decode("utf-8", "replace")[:500]
                except Exception:
                    pass
                raise PowerFetchError(f"HTTP {e.code} from NASA POWER: {detail}") from e
            last_error = e
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last_error = e
        if attempt < retries:
            sleep(backoff_s * (2**attempt))
    raise PowerFetchError(f"NASA POWER request failed after {retries + 1} attempts: {last_error}")


# --------------------------------------------------------------------------- validation


def parse_and_check(body: bytes, parameters: list[str]) -> dict:
    """Parse the response and confirm it has what the cleaning step needs.

    Returns the parsed JSON. Does not modify ``body``.
    """
    try:
        data = json.loads(body)
    except json.JSONDecodeError as e:
        raise PowerFetchError(f"Response is not valid JSON: {e}") from e

    try:
        values = data["properties"]["parameter"]
        header = data["header"]
    except (KeyError, TypeError) as e:
        raise PowerFetchError(f"Response is missing expected structure: {e}") from e

    missing = [p for p in parameters if p not in values]
    if missing:
        raise PowerFetchError(f"Response is missing parameters: {missing}; messages={data.get('messages')}")
    if "fill_value" not in header:
        raise PowerFetchError("Response header has no fill_value")
    if not api_version_of(data):
        raise PowerFetchError("Response header has no api.version")
    return data


def api_version_of(data: dict) -> Optional[str]:
    api = data.get("header", {}).get("api") or {}
    return api.get("version")


# --------------------------------------------------------------------------- save


def sha256_hex(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def build_companion(request: dict, data: dict, body: bytes, retrieved_at: dt.datetime) -> dict:
    """Companion record exactly as specified in METHODOLOGY.md section 4.1."""
    return {
        "schema_version": SCHEMA_VERSION,
        "region_id": request["region_id"],
        "request_url": request["url"],
        "community": request["community"],
        "parameters": request["parameters"],
        "latitude": request["latitude"],
        "longitude": request["longitude"],
        "start": request["start"],
        "end": request["end"],
        "retrieved_at_utc": retrieved_at.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "api_version": api_version_of(data),
        "sha256": sha256_hex(body),
    }


def save_raw(body: bytes, companion: dict, raw_path: Path, companion_path: Path) -> None:
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    raw_path.write_bytes(body)  # byte-for-byte, never re-serialised
    with open(companion_path, "w", encoding="utf-8") as f:
        json.dump(companion, f, indent=2)
        f.write("\n")


# --------------------------------------------------------------------------- orchestration


def run(
    config_path: Path = DEFAULT_CONFIG,
    raw_dir: Path = DEFAULT_RAW_DIR,
    start: Optional[str] = None,
    end: Optional[str] = None,
    **fetch_kwargs,
) -> tuple[Path, Path, dict]:
    config = load_config(config_path)
    request = build_request(config, start, end)
    retrieved_at = dt.datetime.now(dt.timezone.utc)
    body = fetch_bytes(request["url"], **fetch_kwargs)
    data = parse_and_check(body, request["parameters"])
    companion = build_companion(request, data, body, retrieved_at)
    raw_path, companion_path = raw_paths(raw_dir, request["region_id"], request["start"], request["end"])
    save_raw(body, companion, raw_path, companion_path)
    return raw_path, companion_path, companion


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR)
    parser.add_argument("--start", help="ISO date; default: config climate_start")
    parser.add_argument("--end", help="ISO date; default: config climate_end")
    parser.add_argument("--retries", type=int, default=3)
    args = parser.parse_args(argv)
    try:
        raw_path, companion_path, companion = run(
            args.config, args.raw_dir, args.start, args.end, retries=args.retries
        )
    except (PowerFetchError, ValueError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    print(f"raw:       {raw_path}")
    print(f"companion: {companion_path}")
    print(f"api:       {companion['api_version']}  sha256: {companion['sha256']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
