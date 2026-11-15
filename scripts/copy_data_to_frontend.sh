#!/usr/bin/env bash
# Publish processed pilot-region datasets to the Next.js frontend.
#
#   data/processed/<region_id>/<file>  ->  frontend/public/data/<region_id>/<file>
#
# - The region ID is read from config/pilot_region.json.
# - Only files that already exist are copied; nothing is generated or edited.
# - Source files are never modified (copied with cp -p).
# - Expected files that are missing are reported, and the frontend shows an
#   honest "not generated yet" state for them.
# - climate_daily.csv is only published if its header matches the data
#   contract (docs/METHODOLOGY.md §4.2).
#
# Usage (from anywhere):  bash scripts/copy_data_to_frontend.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$REPO_ROOT/config/pilot_region.json"

if [[ ! -f "$CONFIG" ]]; then
  echo "ERROR: $CONFIG not found." >&2
  exit 1
fi

REGION_ID="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["region"]["id"])' "$CONFIG")"
if [[ ! "$REGION_ID" =~ ^[a-z0-9-]+$ ]]; then
  echo "ERROR: unexpected region id '$REGION_ID' in $CONFIG." >&2
  exit 1
fi

SRC_DIR="$REPO_ROOT/data/processed/$REGION_ID"
DEST_DIR="$REPO_ROOT/frontend/public/data/$REGION_ID"
EXPECTED_HEADER="date,tmean_c,tmax_c,tmin_c,precip_mm,rh_pct,wind_ms,srad_mj_m2,soil_wet_top,soil_wet_root,gdd_c,qc_flag,qc_fields"
EXPECTED_FILES=(climate_daily.csv environment_summary.json rotation_comparison.json)

echo "Region:      $REGION_ID"
echo "Source:      ${SRC_DIR#$REPO_ROOT/}"
echo "Destination: ${DEST_DIR#$REPO_ROOT/}"
echo

mkdir -p "$DEST_DIR"
copied=0
missing=0
rejected=0

for file in "${EXPECTED_FILES[@]}"; do
  src="$SRC_DIR/$file"
  dest="$DEST_DIR/$file"
  if [[ ! -f "$src" ]]; then
    echo "  MISSING   $file (not generated yet; nothing copied)"
    missing=$((missing + 1))
    # Remove a previously published copy so the frontend never shows stale data
    # for a dataset that no longer exists in data/processed.
    if [[ -f "$dest" ]]; then
      rm -f "$dest"
      echo "            removed stale published copy"
    fi
    continue
  fi
  if [[ "$file" == "climate_daily.csv" ]]; then
    header="$(head -n 1 "$src" | tr -d '\r')"
    if [[ "$header" != "$EXPECTED_HEADER" ]]; then
      echo "  REJECTED  $file (header does not match the data contract; not copied)"
      rejected=$((rejected + 1))

      # Remove any previously published copy to prevent stale data.
      if [[ -f "$dest" ]]; then
        rm -f "$dest"
        echo "            removed stale published copy"
      fi

      continue
    fi
  fi
  cp -p "$src" "$dest"
  echo "  COPIED    $file ($(wc -c < "$src" | tr -d ' ') bytes)"
  copied=$((copied + 1))
done

echo
echo "Summary: $copied copied, $missing missing, $rejected rejected."
if [[ $rejected -gt 0 ]]; then
  exit 2
fi
