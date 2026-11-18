#!/usr/bin/env python3
"""
TerraShift — Full-Stack Production Server (Flask + REST API + Interactive Web App)
Serves:
  - GET  /                     -> Interactive 6-Page TerraShift Web Application
  - GET  /api/health           -> Health & readiness status
  - GET  /api/nasa             -> Genuine NASA POWER Daily API v2 + fallback agroclimatology
  - GET  /api/crops            -> 13-Crop Karnataka Agronomic Database & Pilot Regions
  - POST /api/farm             -> Validated Farm Profile registration & persistence
  - POST /api/recommendations  -> Two-stage Crop Rotation Recommendation Engine & Custom Simulator
"""

from __future__ import annotations
import os
from flask import Flask, jsonify, request, send_from_directory
from terrashift_engine import (
    KARNATAKA_CROPS,
    KARNATAKA_PILOT_REGIONS,
    CROP_MAP_BY_ID,
    fetch_nasa_power_data,
    generate_crop_rotation_recommendations,
    build_rotation_recommendation,
)

app = Flask(__name__, static_folder="public", static_url_path="")

SAVED_FARMS: dict[str, dict] = {}


def validate_farm_payload(payload: dict) -> tuple[bool, list[str], dict]:
    errors: list[str] = []
    if not isinstance(payload, dict):
        return False, ["Request payload must be a JSON object."], {}

    try:
        lat = float(payload.get("latitude", 14.4644))
        lon = float(payload.get("longitude", 75.9218))
        if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
            errors.append("Coordinates out of bounds: latitude [-90, 90], longitude [-180, 180].")
    except (TypeError, ValueError):
        errors.append("Invalid latitude or longitude format.")
        lat, lon = 14.4644, 75.9218

    try:
        area = float(payload.get("area", 4.5))
        if area <= 0 or area > 50000:
            errors.append("Farm area must be between 0.1 and 50,000.")
    except (TypeError, ValueError):
        errors.append("Invalid farm area.")
        area = 4.5

    soil_type = payload.get("soilType", "red_sandy_loam")
    if soil_type not in {"red_sandy_loam", "red_loam", "black_cotton_clay", "lateritic", "alluvial_loam"}:
        errors.append(f"Unsupported soilType: {soil_type}")

    irr_type = payload.get("irrigationType", "protective_lifesaving")
    if irr_type not in {"rainfed", "protective_lifesaving", "borewell_drip_sprinkler", "canal_command_assured"}:
        errors.append(f"Unsupported irrigationType: {irr_type}")

    prev_crop = payload.get("previousCrop", "maize")
    if prev_crop not in CROP_MAP_BY_ID:
        errors.append(f"Unsupported previousCrop: {prev_crop}")

    def opt_float(key: str, min_v: float, max_v: float):
        v = payload.get(key)
        if v is None or v == "" or v == "unknown":
            return None
        try:
            fv = float(v)
            if not (min_v <= fv <= max_v):
                errors.append(f"{key} must be between {min_v} and {max_v}.")
                return None
            return fv
        except (TypeError, ValueError):
            errors.append(f"{key} must be a valid number or null.")
            return None

    sanitized = {
        "id": payload.get("id") or "farm_default",
        "farmName": str(payload.get("farmName") or "Karnataka Pilot Farm"),
        "district": str(payload.get("district") or "Davanagere"),
        "talukOrVillage": str(payload.get("talukOrVillage") or "Harihar / Davanagere"),
        "state": str(payload.get("state") or "Karnataka"),
        "latitude": lat,
        "longitude": lon,
        "area": area,
        "areaUnit": "hectares" if payload.get("areaUnit") == "hectares" else "acres",
        "soilType": soil_type,
        "soilPH": opt_float("soilPH", 3.5, 10.0),
        "organicCarbonPercent": opt_float("organicCarbonPercent", 0.05, 5.0),
        "nitrogenKgHa": opt_float("nitrogenKgHa", 10.0, 1200.0),
        "phosphorusKgHa": opt_float("phosphorusKgHa", 1.0, 300.0),
        "potassiumKgHa": opt_float("potassiumKgHa", 10.0, 1500.0),
        "drainage": payload.get("drainage", "moderate"),
        "salinity": payload.get("salinity", "non_saline"),
        "previousCrop": prev_crop,
        "irrigationType": irr_type,
        "waterSource": payload.get("waterSource", "borewell_groundwater"),
        "farmerPriority": payload.get("farmerPriority", "balanced_adaptation"),
        "preferredSeasons": payload.get("preferredSeasons") or ["kharif", "rabi", "summer"],
    }
    return len(errors) == 0, errors, sanitized


@app.route("/api/health", methods=["GET"])
def api_health():
    return jsonify({
        "status": "ok",
        "service": "TerraShift Full-Stack Decision-Support Platform",
        "cropsLoaded": len(KARNATAKA_CROPS),
        "pilotRegionsLoaded": len(KARNATAKA_PILOT_REGIONS),
    })


@app.route("/api/crops", methods=["GET"])
def api_crops():
    return jsonify({
        "status": "ok",
        "crops": KARNATAKA_CROPS,
        "pilotRegions": KARNATAKA_PILOT_REGIONS,
    })


@app.route("/api/nasa", methods=["GET"])
def api_nasa():
    try:
        lat = float(request.args.get("latitude", "14.4644"))
        lon = float(request.args.get("longitude", "75.9218"))
        start = request.args.get("startDate", "20210101").replace("-", "")
        end = request.args.get("endDate", "20251231").replace("-", "")
        data = fetch_nasa_power_data(lat, lon, start, end)
        return jsonify({"status": "ok", "data": data})
    except ValueError as ve:
        return jsonify({"status": "error", "error": str(ve)}), 400
    except Exception as exc:
        return jsonify({"status": "error", "error": str(exc)}), 500


@app.route("/api/farm", methods=["GET", "POST"])
def api_farm():
    if request.method == "GET":
        return jsonify({"status": "ok", "profiles": list(SAVED_FARMS.values())})

    payload = request.get_json(silent=True) or {}
    valid, errors, sanitized = validate_farm_payload(payload)
    if not valid:
        return jsonify({"status": "error", "errors": errors}), 400
    SAVED_FARMS[sanitized["id"]] = sanitized
    return jsonify({"status": "ok", "profile": sanitized})


@app.route("/api/recommendations", methods=["POST"])
def api_recommendations():
    payload = request.get_json(silent=True) or {}
    farm_input = payload.get("farmProfile") or payload
    valid, errors, farm = validate_farm_payload(farm_input)
    if not valid:
        return jsonify({"status": "error", "errors": errors}), 400

    nasa_data = payload.get("nasaData")
    if not isinstance(nasa_data, dict) or "seasonalSummaries" not in nasa_data:
        nasa_data = fetch_nasa_power_data(
            farm["latitude"],
            farm["longitude"],
            payload.get("startDate", "20210101"),
            payload.get("endDate", "20251231"),
        )

    weights = payload.get("weights")
    engine_out = generate_crop_rotation_recommendations(farm, nasa_data, weights)

    custom_seq = payload.get("customSequence")
    custom_eval = None
    if isinstance(custom_seq, list) and len(custom_seq) == 3:
        custom_eval = build_rotation_recommendation(
            "balanced",
            [str(custom_seq[0]), str(custom_seq[1]), str(custom_seq[2])],
            ["kharif", "rabi", "summer"],
            farm,
            nasa_data,
            weights,
        )

    return jsonify({
        "status": "ok",
        "farmProfile": farm,
        "nasaData": nasa_data,
        "nasaSummary": {
            "isLiveRetrieval": nasa_data["isLiveRetrieval"],
            "fallbackBannerMessage": nasa_data["fallbackBannerMessage"],
            "meanAnnualRainMm": nasa_data["indicators"]["meanAnnualRainMm"],
            "annualRainCvPercent": nasa_data["indicators"]["annualRainCvPercent"],
            "avgLongestKharifDrySpellDays": nasa_data["indicators"]["avgLongestKharifDrySpellDays"],
            "droughtRiskClass": nasa_data["indicators"]["droughtRiskClass"],
        },
        "cropEvaluationsBySeason": engine_out["cropEvaluationsBySeason"],
        "recommendations": engine_out["recommendations"],
        "customSequenceEvaluation": custom_eval,
    })


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_spa(path: str):
    public_dir = os.path.join(os.path.dirname(__file__), "public")
    if path and os.path.exists(os.path.join(public_dir, path)):
        return send_from_directory(public_dir, path)
    return send_from_directory(public_dir, "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "3000"))
    app.run(host="127.0.0.1", port=port, debug=False)
