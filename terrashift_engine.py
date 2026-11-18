#!/usr/bin/env python3
"""
TerraShift — Core NASA Agroclimatology & Crop Rotation Recommendation Engine
100% Parity Implementation for Python 3.14 Server & Verification Suite
NASA Space Apps Challenge 2026 | Field Shift: Adapting Farms with NASA Data
"""

from __future__ import annotations
import math
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
import requests

NASA_POWER_DAILY_ENDPOINT = "https://power.larc.nasa.gov/api/temporal/daily/point"
DRY_DAY_THRESHOLD_MM = 2.5
HEAT_STRESS_THRESHOLD_C = 35.0
MISSING_CODE = -999
MAX_FEASIBLE_ANNUAL_CROP_DAYS = 315

FALLBACK_BANNER_MESSAGE = (
    "NASA data temporarily unavailable. The displayed demonstration dataset is illustrative and is not a live NASA observation."
)

MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

_NASA_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
CACHE_TTL_SECONDS = 1800

KARNATAKA_PILOT_REGIONS: List[Dict[str, Any]] = [
    {
        "id": "davanagere",
        "name": "Davanagere (Central Dry Zone / Bhadra Transitional)",
        "kannadaName": "ದಾವಣಗೆರೆ (ಮಧ್ಯ ಶುಷ್ಕ ವಲಯ)",
        "district": "Davanagere",
        "agroClimaticZone": "Zone 4 — Central Dry Zone & Bhadra Command Fringe",
        "latitude": 14.4644,
        "longitude": 75.9218,
        "defaultSoilType": "red_sandy_loam",
        "typicalpH": 6.4,
        "typicalOC": 0.42,
        "typicalIrrigation": "protective_lifesaving",
        "typicalWaterSource": "borewell_groundwater",
        "commonPreviousCrop": "maize",
        "description": "Primary pilot region in central Karnataka with bimodal rainfall (May pre-monsoon and September peak), extensive Kharif maize and ragi cultivation, and declining organic carbon on continuous cereal plots.",
        "illustrativeMonthlyBaseline": [
            {"month": 1, "rainMm": 2.1, "t2m": 23.4, "t2mMax": 30.2, "t2mMin": 16.6, "rh2m": 52, "solarRad": 20.1, "gwettop": 0.28, "gwetroot": 0.36},
            {"month": 2, "rainMm": 3.4, "t2m": 25.8, "t2mMax": 33.1, "t2mMin": 18.5, "rh2m": 45, "solarRad": 22.3, "gwettop": 0.24, "gwetroot": 0.33},
            {"month": 3, "rainMm": 11.2, "t2m": 28.6, "t2mMax": 36.0, "t2mMin": 21.2, "rh2m": 42, "solarRad": 24.0, "gwettop": 0.22, "gwetroot": 0.30},
            {"month": 4, "rainMm": 38.5, "t2m": 29.9, "t2mMax": 37.1, "t2mMin": 22.8, "rh2m": 51, "solarRad": 23.8, "gwettop": 0.31, "gwetroot": 0.34},
            {"month": 5, "rainMm": 86.4, "t2m": 28.7, "t2mMax": 35.2, "t2mMin": 22.4, "rh2m": 62, "solarRad": 22.1, "gwettop": 0.44, "gwetroot": 0.42},
            {"month": 6, "rainMm": 78.2, "t2m": 25.6, "t2mMax": 30.4, "t2mMin": 21.3, "rh2m": 75, "solarRad": 17.5, "gwettop": 0.56, "gwetroot": 0.51},
            {"month": 7, "rainMm": 94.6, "t2m": 24.4, "t2mMax": 28.6, "t2mMin": 20.8, "rh2m": 79, "solarRad": 15.8, "gwettop": 0.63, "gwetroot": 0.58},
            {"month": 8, "rainMm": 98.1, "t2m": 24.3, "t2mMax": 28.7, "t2mMin": 20.5, "rh2m": 79, "solarRad": 16.4, "gwettop": 0.65, "gwetroot": 0.61},
            {"month": 9, "rainMm": 132.5, "t2m": 24.8, "t2mMax": 29.8, "t2mMin": 20.4, "rh2m": 77, "solarRad": 18.2, "gwettop": 0.68, "gwetroot": 0.64},
            {"month": 10, "rainMm": 114.3, "t2m": 24.7, "t2mMax": 30.1, "t2mMin": 19.6, "rh2m": 73, "solarRad": 18.9, "gwettop": 0.61, "gwetroot": 0.60},
            {"month": 11, "rainMm": 31.8, "t2m": 23.5, "t2mMax": 29.3, "t2mMin": 17.8, "rh2m": 64, "solarRad": 18.7, "gwettop": 0.45, "gwetroot": 0.50},
            {"month": 12, "rainMm": 7.4, "t2m": 22.6, "t2mMax": 28.9, "t2mMin": 16.2, "rh2m": 57, "solarRad": 18.9, "gwettop": 0.34, "gwetroot": 0.41},
        ],
    },
    {
        "id": "tumakuru",
        "name": "Tumakuru (Central / Eastern Dry Zone)",
        "kannadaName": "ತುಮಕೂರು (ಮಧ್ಯ / ಪೂರ್ವ ಶುಷ್ಕ ವಲಯ)",
        "district": "Tumakuru",
        "agroClimaticZone": "Zone 4 & 5 — Rainfed Ragi & Groundnut Belt",
        "latitude": 13.3379,
        "longitude": 77.1173,
        "defaultSoilType": "red_sandy_loam",
        "typicalpH": 6.1,
        "typicalOC": 0.38,
        "typicalIrrigation": "rainfed",
        "typicalWaterSource": "monsoon_only",
        "commonPreviousCrop": "ragi",
        "description": "Rainfed red sandy loam (Alfisol) region dominated by finger millet (ragi), groundnut, and pigeon pea with pronounced September–October rainfall peak.",
        "illustrativeMonthlyBaseline": [
            {"month": 1, "rainMm": 3.2, "t2m": 22.1, "t2mMax": 28.8, "t2mMin": 15.4, "rh2m": 55, "solarRad": 20.4, "gwettop": 0.27, "gwetroot": 0.35},
            {"month": 2, "rainMm": 5.1, "t2m": 24.5, "t2mMax": 31.6, "t2mMin": 17.3, "rh2m": 47, "solarRad": 22.6, "gwettop": 0.23, "gwetroot": 0.32},
            {"month": 3, "rainMm": 14.8, "t2m": 27.3, "t2mMax": 34.5, "t2mMin": 20.0, "rh2m": 44, "solarRad": 24.2, "gwettop": 0.22, "gwetroot": 0.29},
            {"month": 4, "rainMm": 46.2, "t2m": 28.8, "t2mMax": 35.6, "t2mMin": 21.9, "rh2m": 54, "solarRad": 23.6, "gwettop": 0.33, "gwetroot": 0.35},
            {"month": 5, "rainMm": 108.5, "t2m": 27.6, "t2mMax": 33.8, "t2mMin": 21.5, "rh2m": 65, "solarRad": 21.8, "gwettop": 0.48, "gwetroot": 0.45},
            {"month": 6, "rainMm": 68.4, "t2m": 25.1, "t2mMax": 30.1, "t2mMin": 20.4, "rh2m": 73, "solarRad": 18.1, "gwettop": 0.52, "gwetroot": 0.49},
            {"month": 7, "rainMm": 82.0, "t2m": 24.2, "t2mMax": 28.9, "t2mMin": 19.9, "rh2m": 76, "solarRad": 16.9, "gwettop": 0.57, "gwetroot": 0.53},
            {"month": 8, "rainMm": 112.4, "t2m": 24.0, "t2mMax": 28.7, "t2mMin": 19.8, "rh2m": 77, "solarRad": 17.2, "gwettop": 0.62, "gwetroot": 0.58},
            {"month": 9, "rainMm": 164.2, "t2m": 24.3, "t2mMax": 29.2, "t2mMin": 19.7, "rh2m": 78, "solarRad": 18.4, "gwettop": 0.69, "gwetroot": 0.65},
            {"month": 10, "rainMm": 142.6, "t2m": 23.8, "t2mMax": 28.8, "t2mMin": 18.9, "rh2m": 76, "solarRad": 18.1, "gwettop": 0.66, "gwetroot": 0.63},
            {"month": 11, "rainMm": 48.3, "t2m": 22.4, "t2mMax": 27.6, "t2mMin": 17.2, "rh2m": 69, "solarRad": 17.9, "gwettop": 0.49, "gwetroot": 0.53},
            {"month": 12, "rainMm": 11.5, "t2m": 21.4, "t2mMax": 27.2, "t2mMin": 15.6, "rh2m": 62, "solarRad": 18.6, "gwettop": 0.36, "gwetroot": 0.43},
        ],
    },
    {
        "id": "dharwad",
        "name": "Dharwad (Northern Transition Zone — Vertisols)",
        "kannadaName": "ಧಾರವಾಡ (ಉತ್ತರ ಪರಿವರ್ತನಾ ವಲಯ)",
        "district": "Dharwad",
        "agroClimaticZone": "Zone 8 — Northern Transition Zone",
        "latitude": 15.4589,
        "longitude": 75.0078,
        "defaultSoilType": "black_cotton_clay",
        "typicalpH": 7.4,
        "typicalOC": 0.54,
        "typicalIrrigation": "protective_lifesaving",
        "typicalWaterSource": "farm_pond_harvested",
        "commonPreviousCrop": "sorghum",
        "description": "Medium-to-deep black cotton soils (Vertisols) supporting Kharif greengram/groundnut/maize followed by Rabi sorghum and chickpea on conserved moisture.",
        "illustrativeMonthlyBaseline": [
            {"month": 1, "rainMm": 1.5, "t2m": 23.0, "t2mMax": 30.4, "t2mMin": 15.8, "rh2m": 50, "solarRad": 20.5, "gwettop": 0.32, "gwetroot": 0.42},
            {"month": 2, "rainMm": 2.2, "t2m": 25.4, "t2mMax": 33.2, "t2mMin": 17.6, "rh2m": 43, "solarRad": 22.8, "gwettop": 0.27, "gwetroot": 0.37},
            {"month": 3, "rainMm": 9.8, "t2m": 28.1, "t2mMax": 36.1, "t2mMin": 20.3, "rh2m": 41, "solarRad": 24.3, "gwettop": 0.24, "gwetroot": 0.33},
            {"month": 4, "rainMm": 42.1, "t2m": 29.4, "t2mMax": 36.9, "t2mMin": 22.0, "rh2m": 52, "solarRad": 23.9, "gwettop": 0.34, "gwetroot": 0.37},
            {"month": 5, "rainMm": 78.6, "t2m": 28.2, "t2mMax": 34.8, "t2mMin": 21.9, "rh2m": 64, "solarRad": 22.2, "gwettop": 0.46, "gwetroot": 0.45},
            {"month": 6, "rainMm": 118.4, "t2m": 24.9, "t2mMax": 29.1, "t2mMin": 21.1, "rh2m": 80, "solarRad": 16.5, "gwettop": 0.64, "gwetroot": 0.58},
            {"month": 7, "rainMm": 154.2, "t2m": 23.6, "t2mMax": 27.2, "t2mMin": 20.6, "rh2m": 85, "solarRad": 14.6, "gwettop": 0.74, "gwetroot": 0.69},
            {"month": 8, "rainMm": 116.8, "t2m": 23.5, "t2mMax": 27.4, "t2mMin": 20.3, "rh2m": 84, "solarRad": 15.5, "gwettop": 0.72, "gwetroot": 0.68},
            {"month": 9, "rainMm": 124.0, "t2m": 24.2, "t2mMax": 28.9, "t2mMin": 20.1, "rh2m": 80, "solarRad": 17.8, "gwettop": 0.70, "gwetroot": 0.67},
            {"month": 10, "rainMm": 106.5, "t2m": 24.6, "t2mMax": 30.1, "t2mMin": 19.3, "rh2m": 72, "solarRad": 19.1, "gwettop": 0.63, "gwetroot": 0.63},
            {"month": 11, "rainMm": 26.4, "t2m": 23.4, "t2mMax": 29.6, "t2mMin": 17.2, "rh2m": 60, "solarRad": 19.2, "gwettop": 0.47, "gwetroot": 0.54},
            {"month": 12, "rainMm": 5.2, "t2m": 22.5, "t2mMax": 29.4, "t2mMin": 15.6, "rh2m": 54, "solarRad": 19.4, "gwettop": 0.37, "gwetroot": 0.46},
        ],
    },
    {
        "id": "raichur",
        "name": "Raichur (North Eastern Dry Zone — High Heat Stress)",
        "kannadaName": "ರಾಯಚೂರು (ಈಶಾನ್ಯ ಶುಷ್ಕ ವಲಯ)",
        "district": "Raichur",
        "agroClimaticZone": "Zone 2 — North Eastern Dry Zone",
        "latitude": 16.2076,
        "longitude": 77.3463,
        "defaultSoilType": "black_cotton_clay",
        "typicalpH": 7.8,
        "typicalOC": 0.39,
        "typicalIrrigation": "rainfed",
        "typicalWaterSource": "monsoon_only",
        "commonPreviousCrop": "pigeonpea",
        "description": "Semi-arid northern plain experiencing lower total rainfall (~625 mm), high summer temperatures (>38°C), and strong reliance on drought-hardy pigeon pea, sorghum, chickpea, and sunflower.",
        "illustrativeMonthlyBaseline": [
            {"month": 1, "rainMm": 1.8, "t2m": 24.6, "t2mMax": 31.8, "t2mMin": 17.5, "rh2m": 46, "solarRad": 20.8, "gwettop": 0.25, "gwetroot": 0.34},
            {"month": 2, "rainMm": 2.5, "t2m": 27.3, "t2mMax": 34.9, "t2mMin": 19.8, "rh2m": 39, "solarRad": 23.0, "gwettop": 0.21, "gwetroot": 0.30},
            {"month": 3, "rainMm": 7.4, "t2m": 30.6, "t2mMax": 38.4, "t2mMin": 22.9, "rh2m": 35, "solarRad": 24.6, "gwettop": 0.18, "gwetroot": 0.26},
            {"month": 4, "rainMm": 21.6, "t2m": 32.8, "t2mMax": 40.3, "t2mMin": 25.4, "rh2m": 38, "solarRad": 24.5, "gwettop": 0.22, "gwetroot": 0.27},
            {"month": 5, "rainMm": 42.3, "t2m": 32.4, "t2mMax": 39.6, "t2mMin": 25.6, "rh2m": 45, "solarRad": 23.4, "gwettop": 0.29, "gwetroot": 0.31},
            {"month": 6, "rainMm": 84.5, "t2m": 28.6, "t2mMax": 34.1, "t2mMin": 23.6, "rh2m": 64, "solarRad": 19.2, "gwettop": 0.46, "gwetroot": 0.43},
            {"month": 7, "rainMm": 112.0, "t2m": 26.9, "t2mMax": 31.8, "t2mMin": 22.6, "rh2m": 71, "solarRad": 17.4, "gwettop": 0.55, "gwetroot": 0.51},
            {"month": 8, "rainMm": 118.4, "t2m": 26.5, "t2mMax": 31.4, "t2mMin": 22.2, "rh2m": 73, "solarRad": 17.8, "gwettop": 0.58, "gwetroot": 0.55},
            {"month": 9, "rainMm": 136.2, "t2m": 26.6, "t2mMax": 31.7, "t2mMin": 22.0, "rh2m": 73, "solarRad": 18.8, "gwettop": 0.62, "gwetroot": 0.59},
            {"month": 10, "rainMm": 78.4, "t2m": 26.2, "t2mMax": 31.8, "t2mMin": 20.8, "rh2m": 65, "solarRad": 19.6, "gwettop": 0.51, "gwetroot": 0.53},
            {"month": 11, "rainMm": 16.2, "t2m": 24.6, "t2mMax": 30.8, "t2mMin": 18.4, "rh2m": 55, "solarRad": 19.5, "gwettop": 0.37, "gwetroot": 0.44},
            {"month": 12, "rainMm": 3.4, "t2m": 23.6, "t2mMax": 30.4, "t2mMin": 16.8, "rh2m": 50, "solarRad": 19.7, "gwettop": 0.29, "gwetroot": 0.38},
        ],
    },
    {
        "id": "mandya",
        "name": "Mandya (Southern Dry Zone / Cauvery Command)",
        "kannadaName": "ಮಂಡ್ಯ (ದಕ್ಷಿಣ ಶುಷ್ಕ ವಲಯ)",
        "district": "Mandya",
        "agroClimaticZone": "Zone 6 — Southern Dry Zone",
        "latitude": 12.5218,
        "longitude": 76.8951,
        "defaultSoilType": "red_loam",
        "typicalpH": 6.7,
        "typicalOC": 0.48,
        "typicalIrrigation": "canal_command_assured",
        "typicalWaterSource": "canal_bhadra_tungabhadra",
        "commonPreviousCrop": "paddy",
        "description": "Southern Karnataka belt featuring canal-irrigated paddy and sugarcane alongside rainfed ragi, pulses, sesame, and green manure rotations.",
        "illustrativeMonthlyBaseline": [
            {"month": 1, "rainMm": 3.8, "t2m": 22.6, "t2mMax": 29.4, "t2mMin": 15.9, "rh2m": 58, "solarRad": 20.6, "gwettop": 0.34, "gwetroot": 0.42},
            {"month": 2, "rainMm": 6.2, "t2m": 24.8, "t2mMax": 32.0, "t2mMin": 17.6, "rh2m": 51, "solarRad": 22.7, "gwettop": 0.30, "gwetroot": 0.38},
            {"month": 3, "rainMm": 18.4, "t2m": 27.2, "t2mMax": 34.6, "t2mMin": 20.1, "rh2m": 49, "solarRad": 24.1, "gwettop": 0.29, "gwetroot": 0.35},
            {"month": 4, "rainMm": 64.5, "t2m": 28.1, "t2mMax": 34.8, "t2mMin": 21.6, "rh2m": 60, "solarRad": 23.2, "gwettop": 0.42, "gwetroot": 0.42},
            {"month": 5, "rainMm": 128.0, "t2m": 26.9, "t2mMax": 32.8, "t2mMin": 21.2, "rh2m": 69, "solarRad": 21.1, "gwettop": 0.56, "gwetroot": 0.52},
            {"month": 6, "rainMm": 62.4, "t2m": 24.8, "t2mMax": 29.6, "t2mMin": 20.3, "rh2m": 75, "solarRad": 18.0, "gwettop": 0.54, "gwetroot": 0.52},
            {"month": 7, "rainMm": 71.2, "t2m": 24.1, "t2mMax": 28.6, "t2mMin": 19.9, "rh2m": 77, "solarRad": 17.1, "gwettop": 0.56, "gwetroot": 0.54},
            {"month": 8, "rainMm": 96.5, "t2m": 24.1, "t2mMax": 28.8, "t2mMin": 19.8, "rh2m": 77, "solarRad": 17.6, "gwettop": 0.61, "gwetroot": 0.58},
            {"month": 9, "rainMm": 148.6, "t2m": 24.3, "t2mMax": 29.3, "t2mMin": 19.7, "rh2m": 78, "solarRad": 18.6, "gwettop": 0.68, "gwetroot": 0.64},
            {"month": 10, "rainMm": 156.4, "t2m": 23.9, "t2mMax": 28.7, "t2mMin": 19.2, "rh2m": 79, "solarRad": 17.9, "gwettop": 0.70, "gwetroot": 0.66},
            {"month": 11, "rainMm": 54.2, "t2m": 22.7, "t2mMax": 27.8, "t2mMin": 17.7, "rh2m": 72, "solarRad": 17.8, "gwettop": 0.53, "gwetroot": 0.57},
            {"month": 12, "rainMm": 14.1, "t2m": 21.8, "t2mMax": 27.6, "t2mMin": 16.1, "rh2m": 65, "solarRad": 18.8, "gwettop": 0.40, "gwetroot": 0.47},
        ],
    },
]

KARNATAKA_CROPS: List[Dict[str, Any]] = [
    {
        "id": "ragi",
        "name": "Ragi (Finger Millet)",
        "kannadaName": "ರಾಗಿ (Ragi)",
        "scientificName": "Eleusine coracana",
        "family": "Poaceae",
        "category": "millet",
        "seasons": ["kharif", "rabi", "summer"],
        "duration": {"minDays": 100, "maxDays": 125, "typicalDays": 110},
        "waterRequirement": "low",
        "rainfallRequirements": {"minSeasonalMm": 350, "optimalMinMm": 450, "optimalMaxMm": 750, "maxTolerableMm": 1000, "droughtTolerance": "very_high"},
        "temperatureRange": {"minC": 18, "optimalMinC": 22, "optimalMaxC": 32, "maxC": 37},
        "soilPreferences": ["red_sandy_loam", "red_loam", "lateritic", "alluvial_loam"],
        "pHRange": {"min": 5.0, "optimalMin": 5.5, "optimalMax": 7.5, "max": 8.2, "verified": True},
        "rootingDepth": "medium_45_90cm",
        "nutrientRole": "moderate_feeder",
        "sowingWindows": {"kharif": "June–July (Agro-climatic monsoon onset)", "rabi": "September–October", "summer": "January–February (Irrigated)"},
        "rotationCompatibility": {
            "goodPredecessors": ["groundnut", "pigeonpea", "chickpea", "greengram", "blackgram", "sunnhemp", "dhaincha"],
            "goodSuccessors": ["chickpea", "greengram", "blackgram", "groundnut", "sunnhemp", "dhaincha", "sunflower"],
            "incompatiblePredecessors": ["ragi"],
            "minGapSeasonsSameCrop": 2,
        },
        "managementBenefits": [
            "High resilience to mid-season dry spells (up to 15–20 days) in Southern and Central Dry Zones of Karnataka.",
            "Dense fibrous root system improves topsoil structure and leaves palatable crop residue for livestock.",
        ],
        "constraints": [
            "Sensitive to waterlogging during early seedling establishment.",
            "Repeated continuous cultivation without legume rotation depletes available soil nitrogen and potassium.",
        ],
        "sources": [
            {"institution": "TNAU Agritech Portal", "title": "Ragi (Eleusine coracana) Cultivation Practices", "url": "https://agritech.tnau.ac.in/agriculture/millets_ragi.html"},
            {"institution": "ICRISAT", "title": "Finger Millet Crop Overview", "url": "https://www.icrisat.org/crops/finger-millet/overview"},
        ],
    },
    {
        "id": "maize",
        "name": "Maize (Corn)",
        "kannadaName": "ಮೆಕ್ಕೆಜೋಳ (Mekkejola)",
        "scientificName": "Zea mays",
        "family": "Poaceae",
        "category": "cereal",
        "seasons": ["kharif", "rabi", "summer"],
        "duration": {"minDays": 95, "maxDays": 120, "typicalDays": 105},
        "waterRequirement": "moderate",
        "rainfallRequirements": {"minSeasonalMm": 450, "optimalMinMm": 500, "optimalMaxMm": 800, "maxTolerableMm": 1100, "droughtTolerance": "moderate"},
        "temperatureRange": {"minC": 15, "optimalMinC": 21, "optimalMaxC": 32, "maxC": 38},
        "soilPreferences": ["red_loam", "red_sandy_loam", "black_cotton_clay", "alluvial_loam"],
        "pHRange": {"min": 5.5, "optimalMin": 6.0, "optimalMax": 7.5, "max": 8.0, "verified": True},
        "rootingDepth": "medium_45_90cm",
        "nutrientRole": "heavy_nitrogen_feeder",
        "sowingWindows": {"kharif": "May end–June", "rabi": "October–November", "summer": "January–February"},
        "rotationCompatibility": {
            "goodPredecessors": ["chickpea", "pigeonpea", "groundnut", "greengram", "blackgram", "sunnhemp", "dhaincha"],
            "goodSuccessors": ["chickpea", "greengram", "blackgram", "groundnut", "sunnhemp", "dhaincha"],
            "incompatiblePredecessors": ["maize", "sorghum"],
            "minGapSeasonsSameCrop": 2,
        },
        "managementBenefits": [
            "High biomass productivity and strong market linkage in Davanagere and Haveri districts.",
            "Responds strongly to preceding legume or green-manure incorporation.",
        ],
        "constraints": [
            "Heavy nitrogen and phosphorus feeder; continuous maize monocropping depletes soil organic carbon and micronutrients.",
            "Highly sensitive to moisture stress and heat waves (>36°C) during tasseling and silking.",
        ],
        "sources": [
            {"institution": "TNAU Agritech Portal", "title": "Maize (Zea mays L.) Crop Management", "url": "https://agritech.tnau.ac.in/agriculture/millets_maize.html"},
            {"institution": "ICAR-IIMR", "title": "El-Nino & Moisture Stress Advisory", "url": "https://www.iimr.res.in/storage/el-nino-advisory/1784453091_398833.pdf"},
        ],
    },
    {
        "id": "paddy",
        "name": "Paddy (Rice)",
        "kannadaName": "ಭತ್ತ (Bhatta)",
        "scientificName": "Oryza sativa",
        "family": "Poaceae",
        "category": "cereal",
        "seasons": ["kharif", "summer"],
        "duration": {"minDays": 115, "maxDays": 145, "typicalDays": 130},
        "waterRequirement": "high",
        "rainfallRequirements": {"minSeasonalMm": 800, "optimalMinMm": 1000, "optimalMaxMm": 1500, "maxTolerableMm": 2200, "droughtTolerance": "low"},
        "temperatureRange": {"minC": 20, "optimalMinC": 24, "optimalMaxC": 34, "maxC": 38},
        "soilPreferences": ["alluvial_loam", "black_cotton_clay", "red_loam"],
        "pHRange": {"min": 5.0, "optimalMin": 5.5, "optimalMax": 7.5, "max": 8.5, "verified": True},
        "rootingDepth": "shallow_30_45cm",
        "nutrientRole": "heavy_nitrogen_feeder",
        "sowingWindows": {"kharif": "June–July (Canal command)", "summer": "January–February (Assured canal irrigation)"},
        "rotationCompatibility": {
            "goodPredecessors": ["sunnhemp", "dhaincha", "greengram", "blackgram", "chickpea"],
            "goodSuccessors": ["blackgram", "greengram", "sunnhemp", "dhaincha", "sesame", "chickpea"],
            "incompatiblePredecessors": ["paddy"],
            "minGapSeasonsSameCrop": 2,
        },
        "managementBenefits": [
            "Well-adapted to lowland clay/alluvial soils and canal command areas (Bhadra, Tungabhadra, Cauvery).",
            "Allows short-duration rice-fallow pulses (blackgram/greengram) on residual moisture.",
        ],
        "constraints": [
            "Unsuitable for rainfed dryland farms without assured canal irrigation.",
            "Puddling degrades soil structure unless followed by pulses or green manure.",
        ],
        "sources": [
            {"institution": "TNAU Agritech Portal", "title": "Paddy Climate and Soils", "url": "https://agritech.tnau.ac.in/org_farm/orgfarm_prac_agri_paddy_climate.html"},
        ],
    },
    {
        "id": "sorghum",
        "name": "Sorghum (Jowar)",
        "kannadaName": "ಜೋಳ (Jola)",
        "scientificName": "Sorghum bicolor",
        "family": "Poaceae",
        "category": "millet",
        "seasons": ["kharif", "rabi"],
        "duration": {"minDays": 100, "maxDays": 120, "typicalDays": 110},
        "waterRequirement": "low",
        "rainfallRequirements": {"minSeasonalMm": 350, "optimalMinMm": 400, "optimalMaxMm": 700, "maxTolerableMm": 950, "droughtTolerance": "very_high"},
        "temperatureRange": {"minC": 16, "optimalMinC": 24, "optimalMaxC": 34, "maxC": 40},
        "soilPreferences": ["black_cotton_clay", "red_loam", "red_sandy_loam"],
        "pHRange": {"min": 5.5, "optimalMin": 6.0, "optimalMax": 8.2, "max": 8.5, "verified": True},
        "rootingDepth": "deep_90_150cm",
        "nutrientRole": "moderate_feeder",
        "sowingWindows": {"kharif": "June–July", "rabi": "September–October (receding monsoon moisture)"},
        "rotationCompatibility": {
            "goodPredecessors": ["chickpea", "groundnut", "pigeonpea", "greengram", "blackgram"],
            "goodSuccessors": ["chickpea", "groundnut", "blackgram", "greengram", "sunflower"],
            "incompatiblePredecessors": ["sorghum", "maize"],
            "minGapSeasonsSameCrop": 2,
        },
        "managementBenefits": [
            "Exceptional drought and heat tolerance; Rabi Jowar thrives on residual moisture in black cotton soils.",
            "Provides dual-purpose grain and high-value livestock fodder.",
        ],
        "constraints": [
            "High C:N ratio stubbles temporarily immobilize soil nitrogen unless followed by a nitrogen-fixing legume.",
        ],
        "sources": [
            {"institution": "TNAU Agritech Portal", "title": "Sorghum (Sorghum bicolor) Crop Production", "url": "https://agritech.tnau.ac.in/agriculture/CropProduction/Millets/millets_sorghum.html"},
            {"institution": "ICRISAT", "title": "Sorghum Varieties Developed", "url": "https://www.icrisat.org/crops/sorghum/varieties-developed"},
        ],
    },
    {
        "id": "pigeonpea",
        "name": "Pigeon Pea (Tur / Red Gram)",
        "kannadaName": "ತೊಗರಿ (Togari)",
        "scientificName": "Cajanus cajan",
        "family": "Fabaceae",
        "category": "pulse_legume",
        "seasons": ["kharif"],
        "duration": {"minDays": 135, "maxDays": 175, "typicalDays": 155},
        "waterRequirement": "low",
        "rainfallRequirements": {"minSeasonalMm": 400, "optimalMinMm": 500, "optimalMaxMm": 850, "maxTolerableMm": 1100, "droughtTolerance": "high"},
        "temperatureRange": {"minC": 18, "optimalMinC": 22, "optimalMaxC": 35, "maxC": 40},
        "soilPreferences": ["red_sandy_loam", "red_loam", "black_cotton_clay", "alluvial_loam"],
        "pHRange": {"min": 5.5, "optimalMin": 6.0, "optimalMax": 7.8, "max": 8.2, "verified": True},
        "rootingDepth": "deep_90_150cm",
        "nutrientRole": "nitrogen_fixing_legume",
        "sowingWindows": {"kharif": "June–July (135–175 days; harvest in Nov–Dec overlaps early Rabi sowing unless 120-day super-early varieties are used)"},
        "rotationCompatibility": {
            "goodPredecessors": ["maize", "ragi", "sorghum", "sunflower", "sesame"],
            "goodSuccessors": ["maize", "ragi", "sorghum", "sunflower", "sesame"],
            "incompatiblePredecessors": ["pigeonpea", "chickpea"],
            "minGapSeasonsSameCrop": 3,
        },
        "managementBenefits": [
            "Deep taproot (90–150 cm) breaks subsoil hardpans and accesses deep soil moisture during dry spells.",
            "Symbiotic Rhizobium nodulation fixes atmospheric nitrogen and sheds nutrient-rich leaf litter.",
        ],
        "constraints": [
            "Longer duration (135–175 days, harvesting Nov–Dec) prevents timely October Rabi sowing on the same plot.",
            "Sensitive to waterlogging and poor soil drainage (increases wilt and blight risk).",
        ],
        "sources": [
            {"institution": "TNAU Agritech Portal", "title": "Redgram (Cajanus cajan) Crop Production", "url": "https://agritech.tnau.ac.in/agriculture/CropProduction/Pulses/pulses_redgram.html"},
            {"institution": "ICRISAT", "title": "Pigeonpea Overview", "url": "https://www.icrisat.org/crops/pigeonpea/overview"},
        ],
    },
    {
        "id": "chickpea",
        "name": "Chickpea (Bengal Gram)",
        "kannadaName": "ಕಡಲೆ (Kadale)",
        "scientificName": "Cicer arietinum",
        "family": "Fabaceae",
        "category": "pulse_legume",
        "seasons": ["rabi"],
        "duration": {"minDays": 90, "maxDays": 110, "typicalDays": 100},
        "waterRequirement": "very_low",
        "rainfallRequirements": {"minSeasonalMm": 100, "optimalMinMm": 150, "optimalMaxMm": 400, "maxTolerableMm": 600, "droughtTolerance": "high"},
        "temperatureRange": {"minC": 12, "optimalMinC": 18, "optimalMaxC": 29, "maxC": 34},
        "soilPreferences": ["black_cotton_clay", "red_loam", "alluvial_loam", "red_sandy_loam"],
        "pHRange": {"min": 6.0, "optimalMin": 6.2, "optimalMax": 7.8, "max": 8.2, "verified": True},
        "rootingDepth": "medium_45_90cm",
        "nutrientRole": "nitrogen_fixing_legume",
        "sowingWindows": {"rabi": "October–November (residual monsoon moisture)"},
        "rotationCompatibility": {
            "goodPredecessors": ["maize", "ragi", "sorghum", "paddy", "sesame", "sunflower"],
            "goodSuccessors": ["maize", "ragi", "sorghum", "sesame", "sunflower", "sunnhemp", "dhaincha"],
            "incompatiblePredecessors": ["chickpea", "pigeonpea"],
            "minGapSeasonsSameCrop": 2,
        },
        "managementBenefits": [
            "Ideal Rabi rotation crop after Kharif cereals or oilseeds; grows effectively on conserved soil moisture.",
            "Contributes biological nitrogen fixation and breaks cereal pest cycles.",
        ],
        "constraints": [
            "Sensitive to excessive irrigation during flowering and strongly acidic soils.",
        ],
        "sources": [
            {"institution": "TNAU Agritech Portal", "title": "Bengalgram (Cicer arietinum) Crop Production", "url": "https://agritech.tnau.ac.in/agriculture/CropProduction/Pulses/pulses_bengalgram.html"},
            {"institution": "ICAR-CRIDA", "title": "Chickpea-Based Production Systems", "url": "https://www.icar-crida.res.in/assets/img/Books/2005-06/chickpea.pdf"},
        ],
    },
    {
        "id": "greengram",
        "name": "Green Gram (Moong)",
        "kannadaName": "ಹೆಸರುಕಾಳು (Hesaru Kaalu)",
        "scientificName": "Vigna radiata",
        "family": "Fabaceae",
        "category": "pulse_legume",
        "seasons": ["kharif", "rabi", "summer"],
        "duration": {"minDays": 60, "maxDays": 75, "typicalDays": 65},
        "waterRequirement": "very_low",
        "rainfallRequirements": {"minSeasonalMm": 200, "optimalMinMm": 300, "optimalMaxMm": 550, "maxTolerableMm": 750, "droughtTolerance": "high"},
        "temperatureRange": {"minC": 20, "optimalMinC": 25, "optimalMaxC": 35, "maxC": 38},
        "soilPreferences": ["red_sandy_loam", "red_loam", "black_cotton_clay", "alluvial_loam"],
        "pHRange": {"min": 5.8, "optimalMin": 6.2, "optimalMax": 7.5, "max": 8.0, "verified": True},
        "rootingDepth": "shallow_30_45cm",
        "nutrientRole": "nitrogen_fixing_legume",
        "sowingWindows": {"kharif": "Early June–July", "rabi": "October–November", "summer": "February–April / May pre-monsoon (65-day catch crop)"},
        "rotationCompatibility": {
            "goodPredecessors": ["maize", "ragi", "paddy", "sorghum", "sunflower"],
            "goodSuccessors": ["maize", "ragi", "sorghum", "paddy", "sunflower", "sesame"],
            "incompatiblePredecessors": ["greengram", "blackgram"],
            "minGapSeasonsSameCrop": 2,
        },
        "managementBenefits": [
            "Short 60–75 day maturity fits between main crops or as a summer catch crop.",
            "Rapid canopy cover suppresses weeds and leaves decomposable low-C:N residue.",
        ],
        "constraints": [
            "Requires Yellow Mosaic Virus (YMV) tolerant varieties during summer.",
        ],
        "sources": [
            {"institution": "TNAU Agritech Portal", "title": "Greengram (Vigna radiata L.) Crop Production", "url": "https://agritech.tnau.ac.in/agriculture/pulses_greengram.html"},
        ],
    },
    {
        "id": "blackgram",
        "name": "Black Gram (Urad)",
        "kannadaName": "ಉದ್ದಿನಕಾಳು (Uddina Kaalu)",
        "scientificName": "Vigna mungo",
        "family": "Fabaceae",
        "category": "pulse_legume",
        "seasons": ["kharif", "rabi", "summer"],
        "duration": {"minDays": 65, "maxDays": 80, "typicalDays": 72},
        "waterRequirement": "low",
        "rainfallRequirements": {"minSeasonalMm": 250, "optimalMinMm": 350, "optimalMaxMm": 650, "maxTolerableMm": 850, "droughtTolerance": "high"},
        "temperatureRange": {"minC": 20, "optimalMinC": 25, "optimalMaxC": 35, "maxC": 38},
        "soilPreferences": ["black_cotton_clay", "red_loam", "alluvial_loam", "red_sandy_loam"],
        "pHRange": {"min": 5.8, "optimalMin": 6.0, "optimalMax": 7.5, "max": 8.0, "verified": True},
        "rootingDepth": "shallow_30_45cm",
        "nutrientRole": "nitrogen_fixing_legume",
        "sowingWindows": {"kharif": "June–July", "rabi": "October–November (rice fallows)", "summer": "February–March"},
        "rotationCompatibility": {
            "goodPredecessors": ["paddy", "maize", "sorghum", "ragi", "sunflower"],
            "goodSuccessors": ["maize", "sorghum", "ragi", "paddy", "sesame"],
            "incompatiblePredecessors": ["blackgram", "greengram"],
            "minGapSeasonsSameCrop": 2,
        },
        "managementBenefits": [
            "Excellent rotation partner after Paddy, Sorghum, or Maize; improves soil aggregate stability.",
        ],
        "constraints": [
            "Sensitive to soil salinity and prolonged water stagnation.",
        ],
        "sources": [
            {"institution": "TNAU Agritech Portal", "title": "Blackgram (Vigna mungo L.) Crop Production", "url": "https://agritech.tnau.ac.in/agriculture/pulses_blackgram.html"},
        ],
    },
    {
        "id": "groundnut",
        "name": "Groundnut (Peanut)",
        "kannadaName": "ಶೇಂಗಾ / ನೆಲಗಡಲೆ (Shenga)",
        "scientificName": "Arachis hypogaea",
        "family": "Fabaceae",
        "category": "oilseed",
        "seasons": ["kharif", "summer"],
        "duration": {"minDays": 100, "maxDays": 120, "typicalDays": 110},
        "waterRequirement": "low",
        "rainfallRequirements": {"minSeasonalMm": 350, "optimalMinMm": 450, "optimalMaxMm": 750, "maxTolerableMm": 1000, "droughtTolerance": "high"},
        "temperatureRange": {"minC": 20, "optimalMinC": 24, "optimalMaxC": 33, "maxC": 38},
        "soilPreferences": ["red_sandy_loam", "red_loam", "alluvial_loam"],
        "pHRange": {"min": 5.5, "optimalMin": 6.0, "optimalMax": 7.2, "max": 7.8, "verified": True},
        "rootingDepth": "medium_45_90cm",
        "nutrientRole": "nitrogen_fixing_legume",
        "sowingWindows": {"kharif": "June–July (Rainfed red sandy loam; harvests Sep–Oct)", "summer": "January–February (Irrigated)"},
        "rotationCompatibility": {
            "goodPredecessors": ["ragi", "maize", "sorghum", "sunflower", "sesame"],
            "goodSuccessors": ["ragi", "maize", "sorghum", "sesame", "sunflower"],
            "incompatiblePredecessors": ["groundnut"],
            "minGapSeasonsSameCrop": 2,
        },
        "managementBenefits": [
            "Dual-benefit legume oilseed: fixes atmospheric nitrogen via Rhizobium while yielding oilseed pods and haulm fodder.",
        ],
        "constraints": [
            "Heavy clay soils crust and impede peg penetration and pod harvesting.",
        ],
        "sources": [
            {"institution": "TNAU Agritech Portal", "title": "Groundnut Soil Fertility and Water Management", "url": "https://agritech.tnau.ac.in/org_farm/orgfarm_prac_agri_groundnut_soilwater.html"},
            {"institution": "ICAR-CRIDA", "title": "Rainfed Groundnut Technologies", "url": "https://www.icar-crida.res.in/assets/img/Books/2004-05/Groundnut.pdf"},
        ],
    },
    {
        "id": "sunflower",
        "name": "Sunflower",
        "kannadaName": "ಸೂರ್ಯಕಾಂತಿ (Suryakanthi)",
        "scientificName": "Helianthus annuus",
        "family": "Asteraceae",
        "category": "oilseed",
        "seasons": ["kharif", "rabi", "summer"],
        "duration": {"minDays": 85, "maxDays": 100, "typicalDays": 90},
        "waterRequirement": "low",
        "rainfallRequirements": {"minSeasonalMm": 300, "optimalMinMm": 400, "optimalMaxMm": 650, "maxTolerableMm": 850, "droughtTolerance": "high"},
        "temperatureRange": {"minC": 15, "optimalMinC": 20, "optimalMaxC": 32, "maxC": 37},
        "soilPreferences": ["black_cotton_clay", "red_loam", "alluvial_loam", "red_sandy_loam"],
        "pHRange": {"min": 6.0, "optimalMin": 6.5, "optimalMax": 8.0, "max": 8.5, "verified": True},
        "rootingDepth": "deep_90_150cm",
        "nutrientRole": "moderate_feeder",
        "sowingWindows": {"kharif": "June–July / July–August (90-day crop enabling timely October Rabi sowing)", "rabi": "October–November", "summer": "January–February"},
        "rotationCompatibility": {
            "goodPredecessors": ["chickpea", "pigeonpea", "groundnut", "greengram", "blackgram", "ragi", "maize"],
            "goodSuccessors": ["chickpea", "groundnut", "greengram", "blackgram", "ragi", "sorghum"],
            "incompatiblePredecessors": ["sunflower"],
            "minGapSeasonsSameCrop": 3,
        },
        "managementBenefits": [
            "Photo-insensitive and short duration (85–100 days); Asteraceae family breaks cereal-legume pest cycles.",
        ],
        "constraints": [
            "Continuous sunflower increases Alternaria blight and necrosis virus; requires a 2–3 season gap.",
        ],
        "sources": [
            {"institution": "TNAU Agritech Portal", "title": "Sunflower (Helianthus annuus) Crop Production", "url": "https://agritech.tnau.ac.in/agriculture/CropProduction/Oilseeds/oilseeds_sunflower.html"},
        ],
    },
    {
        "id": "sesame",
        "name": "Sesame (Gingelly)",
        "kannadaName": "ಎಳ್ಳು (Ellu)",
        "scientificName": "Sesamum indicum",
        "family": "Pedaliaceae",
        "category": "oilseed",
        "seasons": ["kharif", "summer"],
        "duration": {"minDays": 75, "maxDays": 90, "typicalDays": 82},
        "waterRequirement": "very_low",
        "rainfallRequirements": {"minSeasonalMm": 220, "optimalMinMm": 250, "optimalMaxMm": 550, "maxTolerableMm": 700, "droughtTolerance": "very_high"},
        "temperatureRange": {"minC": 20, "optimalMinC": 25, "optimalMaxC": 35, "maxC": 40},
        "soilPreferences": ["red_sandy_loam", "red_loam", "alluvial_loam", "black_cotton_clay"],
        "pHRange": {"min": 5.5, "optimalMin": 6.0, "optimalMax": 7.5, "max": 8.0, "verified": True},
        "rootingDepth": "medium_45_90cm",
        "nutrientRole": "moderate_feeder",
        "sowingWindows": {"kharif": "May–June (Early Kharif)", "summer": "February–March (Protective irrigation / Rice fallow)"},
        "rotationCompatibility": {
            "goodPredecessors": ["chickpea", "paddy", "ragi", "groundnut", "greengram", "blackgram"],
            "goodSuccessors": ["chickpea", "ragi", "pigeonpea", "blackgram", "greengram"],
            "incompatiblePredecessors": ["sesame"],
            "minGapSeasonsSameCrop": 2,
        },
        "managementBenefits": [
            "Very low water demand (75–90 days; stop irrigation after 65 DAS per TNAU guidelines) and Pedaliaceae botanical family diversify rotation sequences.",
        ],
        "constraints": [
            "Extremely sensitive to waterlogging even for 2–3 days.",
        ],
        "sources": [
            {"institution": "TNAU Agritech Portal", "title": "Gingelly / Sesame (Sesamum indicum) Crop Production", "url": "https://agritech.tnau.ac.in/agriculture/CropProduction/Oilseeds/oilseeds_gingelly.html"},
        ],
    },
    {
        "id": "sunnhemp",
        "name": "Sunnhemp (Green Manure)",
        "kannadaName": "ಸೆಣಬು ಹಸಿರೆಲೆ ಗೊಬ್ಬರ (Senabu)",
        "scientificName": "Crotalaria juncea",
        "family": "Fabaceae",
        "category": "green_manure",
        "seasons": ["kharif", "summer"],
        "duration": {"minDays": 45, "maxDays": 60, "typicalDays": 50},
        "waterRequirement": "low",
        "rainfallRequirements": {"minSeasonalMm": 180, "optimalMinMm": 250, "optimalMaxMm": 600, "maxTolerableMm": 850, "droughtTolerance": "high"},
        "temperatureRange": {"minC": 18, "optimalMinC": 24, "optimalMaxC": 36, "maxC": 40},
        "soilPreferences": ["red_sandy_loam", "red_loam", "alluvial_loam", "lateritic"],
        "pHRange": {"min": 5.0, "optimalMin": 5.8, "optimalMax": 7.5, "max": 7.8, "verified": True},
        "rootingDepth": "medium_45_90cm",
        "nutrientRole": "green_manure_biomass_builder",
        "sowingWindows": {"kharif": "May–June (45–50 day pre-monsoon window; seed rate 25–35 kg/ha)", "summer": "March–May (Off-season restoration; irrigation once in 30 days)"},
        "rotationCompatibility": {
            "goodPredecessors": ["maize", "paddy", "ragi", "sorghum", "sunflower"],
            "goodSuccessors": ["maize", "paddy", "ragi", "sorghum", "sunflower"],
            "incompatiblePredecessors": ["sunnhemp", "dhaincha"],
            "minGapSeasonsSameCrop": 2,
        },
        "managementBenefits": [
            "Produces 13–15 t/ha of green biomass within 45–60 days (per TNAU Green Manure Agronomy guide); in-situ incorporation improves organic carbon and microbial activity.",
            "Low C:N ratio accelerates mineralization and suppresses root-knot nematodes.",
        ],
        "constraints": [
            "Does not withstand heavy irrigation or continuous waterlogging (unlike Dhaincha); best suited to well-drained loamy soils.",
            "Does not produce direct cash grain when incorporated at 45–60 DAS; requires 10–15 days of moist decomposition.",
        ],
        "sources": [
            {"institution": "TNAU Agritech Portal", "title": "Agronomy of Green Manure Crops: Sunnhemp (Crotalaria juncea — 13-15 t/ha at 45-60 DAS)", "url": "https://agritech.tnau.ac.in/agriculture/agri_greenmanuring_agronomygreenmanures.html"},
        ],
    },
    {
        "id": "dhaincha",
        "name": "Dhaincha (Green Manure)",
        "kannadaName": "ಡೈಂಚಾ ಹಸಿರೆಲೆ ಗೊಬ್ಬರ (Dhaincha)",
        "scientificName": "Sesbania aculeata",
        "family": "Fabaceae",
        "category": "green_manure",
        "seasons": ["kharif", "summer"],
        "duration": {"minDays": 45, "maxDays": 60, "typicalDays": 50},
        "waterRequirement": "moderate",
        "rainfallRequirements": {"minSeasonalMm": 220, "optimalMinMm": 300, "optimalMaxMm": 800, "maxTolerableMm": 1400, "droughtTolerance": "moderate"},
        "temperatureRange": {"minC": 18, "optimalMinC": 24, "optimalMaxC": 37, "maxC": 42},
        "soilPreferences": ["black_cotton_clay", "alluvial_loam", "red_loam", "red_sandy_loam", "lateritic"],
        "pHRange": {"min": 5.5, "optimalMin": 6.0, "optimalMax": 8.8, "max": 9.2, "verified": True},
        "rootingDepth": "medium_45_90cm",
        "nutrientRole": "green_manure_biomass_builder",
        "sowingWindows": {"kharif": "May–June (Pre-monsoon / pre-puddling window; seed rate 50 kg/ha)", "summer": "March–May (Irrigated once in 15–20 days; incorporate within 45–60 DAS)"},
        "rotationCompatibility": {
            "goodPredecessors": ["paddy", "maize", "sorghum", "ragi", "sunflower"],
            "goodSuccessors": ["paddy", "maize", "sorghum", "ragi", "sunflower"],
            "incompatiblePredecessors": ["dhaincha", "sunnhemp"],
            "minGapSeasonsSameCrop": 2,
        },
        "managementBenefits": [
            "Produces up to 25 t/ha of green biomass within 45–60 days when sufficient moisture is available (per TNAU Green Manure Agronomy guide).",
            "Tolerates all soil conditions including heavy black clay, waterlogged paddies, and alkaline soils (up to pH 9.0), aiding soil reclamation.",
        ],
        "constraints": [
            "Requires higher seed rate (50 kg/ha) and more frequent moisture (irrigation every 15–20 days in summer) than Sunnhemp.",
            "Requires 10–15 days after incorporation for decomposition prior to planting the succeeding crop.",
        ],
        "sources": [
            {"institution": "TNAU Agritech Portal", "title": "Agronomy of Green Manure Crops: Dhaincha (Sesbania aculeata — 25 t/ha at 45-60 DAS)", "url": "https://agritech.tnau.ac.in/agriculture/agri_greenmanuring_agronomygreenmanures.html"},
        ],
    },
]

CROP_MAP_BY_ID: Dict[str, Dict[str, Any]] = {c["id"]: c for c in KARNATAKA_CROPS}


def calculate_cv_percent(values: List[float]) -> float:
    if len(values) <= 1:
        return 0.0
    mean = sum(values) / len(values)
    if mean <= 0.001:
        return 0.0
    variance = sum((v - mean) ** 2 for v in values) / len(values)
    return round((math.sqrt(variance) / mean) * 100.0, 1)


def compute_longest_dry_spell(observations: List[Dict[str, Any]]) -> int:
    """Resets streak on None (-999 missing observation) so missing data is never bridged as dry days."""
    max_streak = 0
    current = 0
    for obs in observations:
        p = obs.get("precipMm")
        if p is None:
            current = 0
        elif p < DRY_DAY_THRESHOLD_MM:
            current += 1
            if current > max_streak:
                max_streak = current
        else:
            current = 0
    return max_streak


def find_nearest_pilot_preset(lat: float, lon: float) -> Dict[str, Any]:
    best = KARNATAKA_PILOT_REGIONS[0]
    best_dist = float("inf")
    for reg in KARNATAKA_PILOT_REGIONS:
        d = math.hypot(reg["latitude"] - lat, reg["longitude"] - lon)
        if d < best_dist:
            best_dist = d
            best = reg
    return best


def build_illustrative_fallback_observations(
    latitude: float, longitude: float, start_year: int = 2021, end_year: int = 2025
) -> List[Dict[str, Any]]:
    preset = find_nearest_pilot_preset(latitude, longitude)
    observations: List[Dict[str, Any]] = []
    days_in_months = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    year_factors = {
        2021: {"rainMult": 1.12, "tempOffset": -0.2},
        2022: {"rainMult": 1.18, "tempOffset": -0.1},
        2023: {"rainMult": 0.78, "tempOffset": 0.45},
        2024: {"rainMult": 1.06, "tempOffset": 0.35},
        2025: {"rainMult": 0.96, "tempOffset": 0.40},
    }

    for yr in range(start_year, end_year + 1):
        yf = year_factors.get(yr, {"rainMult": 1.0, "tempOffset": 0.1})
        is_leap = (yr % 4 == 0 and yr % 100 != 0) or (yr % 400 == 0)
        for m in range(1, 13):
            m_base = preset["illustrativeMonthlyBaseline"][m - 1]
            dim = 29 if (m == 2 and is_leap) else days_in_months[m - 1]
            target_rain = m_base["rainMm"] * yf["rainMult"]

            num_events = 1 if target_rain < 10 else (4 if target_rain < 45 else (8 if target_rain < 95 else 11))
            rainy_days = {((e * 3 + (yr + m) % 5) % dim) + 1 for e in range(num_events)}
            actual_events = max(1, len(rainy_days))

            for d in range(1, dim + 1):
                date_str = f"{yr}-{m:02d}-{d:02d}"
                wave = math.sin((d / dim) * math.pi * 2 + m)
                is_rain = (d in rainy_days) and (target_rain >= 2.0)
                weight = 0.7 + 0.6 * abs(math.cos(d + m))
                precip = round((target_rain / actual_events) * weight, 1) if is_rain else 0.0

                t2m = round(m_base["t2m"] + yf["tempOffset"] + wave * 1.1, 1)
                t2m_max = round(m_base["t2mMax"] + yf["tempOffset"] + wave * 1.4 + (-1.5 if is_rain else 0.8), 1)
                t2m_min = round(m_base["t2mMin"] + yf["tempOffset"] + wave * 0.8, 1)
                rh2m = round(min(98.0, max(22.0, m_base["rh2m"] + (12 if is_rain else -4) * yf["rainMult"])), 1)
                solar = round(max(8.0, m_base["solarRad"] + (-4.2 if is_rain else 1.1)), 1)
                gwettop = round(min(0.95, max(0.12, m_base["gwettop"] * yf["rainMult"] + (0.08 if is_rain else -0.02))), 2)
                gwetroot = round(min(0.92, max(0.18, m_base["gwetroot"] * (0.85 + 0.15 * yf["rainMult"]))), 2)

                observations.append({
                    "date": date_str,
                    "t2m": t2m,
                    "t2mMax": t2m_max,
                    "t2mMin": t2m_min,
                    "precipMm": precip,
                    "rh2m": rh2m,
                    "solarRadMjM2": solar,
                    "surfaceSoilWetness": gwettop,
                    "rootZoneSoilWetness": gwetroot,
                })
    return observations


def parse_nasa_power_json(raw_json: Dict[str, Any]) -> List[Dict[str, Any]]:
    param = raw_json.get("properties", {}).get("parameter")
    if not isinstance(param, dict):
        raise ValueError("Malformed NASA POWER response: missing properties.parameter")

    t2m_map = param.get("T2M", {})
    tmax_map = param.get("T2M_MAX", {})
    tmin_map = param.get("T2M_MIN", {})
    prec_map = param.get("PRECTOTCORR", {})
    rh_map = param.get("RH2M", {})
    sol_map = param.get("ALLSKY_SFC_SW_DWN", {})
    gtop_map = param.get("GWETTOP", {})
    groot_map = param.get("GWETROOT", {})

    all_dates = sorted(set(t2m_map.keys()) | set(prec_map.keys()) | set(tmax_map.keys()))

    def clean(v: Any) -> Optional[float]:
        if v is None or not isinstance(v, (int, float)) or math.isnan(v) or v <= -990:
            return None
        return round(float(v), 2)

    results: List[Dict[str, Any]] = []
    for ymd in all_dates:
        f_date = f"{ymd[:4]}-{ymd[4:6]}-{ymd[6:8]}" if len(ymd) == 8 else ymd
        results.append({
            "date": f_date,
            "t2m": clean(t2m_map.get(ymd)),
            "t2mMax": clean(tmax_map.get(ymd)),
            "t2mMin": clean(tmin_map.get(ymd)),
            "precipMm": clean(prec_map.get(ymd)),
            "rh2m": clean(rh_map.get(ymd)),
            "solarRadMjM2": clean(sol_map.get(ymd)),
            "surfaceSoilWetness": clean(gtop_map.get(ymd)),
            "rootZoneSoilWetness": clean(groot_map.get(ymd)),
        })
    return results


def build_environmental_data(
    latitude: float,
    longitude: float,
    start_date: str,
    end_date: str,
    observations: List[Dict[str, Any]],
    is_live: bool,
    fallback_msg: Optional[str],
) -> Dict[str, Any]:
    years = sorted({int(o["date"][:4]) for o in observations})
    num_years = max(1, len(years))
    std_days = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

    monthly_climatology: List[Dict[str, Any]] = []
    for m_idx in range(1, 13):
        m_obs = [o for o in observations if int(o["date"][5:7]) == m_idx]
        valid_rain_obs = [o["precipMm"] for o in m_obs if o["precipMm"] is not None and o["precipMm"] >= 0]
        rain_sum = sum(valid_rain_obs)
        rainy_days = sum(1 for v in valid_rain_obs if v >= DRY_DAY_THRESHOLD_MM)
        t_vals = [o["t2m"] for o in m_obs if o["t2m"] is not None]
        tmax_vals = [o["t2mMax"] for o in m_obs if o["t2mMax"] is not None]
        tmin_vals = [o["t2mMin"] for o in m_obs if o["t2mMin"] is not None]
        rh_vals = [o["rh2m"] for o in m_obs if o["rh2m"] is not None]
        rw_vals = [o["rootZoneSoilWetness"] for o in m_obs if o["rootZoneSoilWetness"] is not None]

        exp_days = num_years * std_days[m_idx - 1]
        eff_years = (
            max(0.1, len(valid_rain_obs) / std_days[m_idx - 1])
            if (0 < len(valid_rain_obs) < exp_days * 0.9)
            else num_years
        )

        monthly_climatology.append({
            "month": m_idx,
            "monthName": MONTH_NAMES[m_idx - 1],
            "avgRainMm": round(rain_sum / eff_years, 1) if valid_rain_obs else 0.0,
            "avgTempC": round(sum(t_vals) / len(t_vals), 1) if t_vals else 0.0,
            "avgMaxTempC": round(sum(tmax_vals) / len(tmax_vals), 1) if tmax_vals else 0.0,
            "avgMinTempC": round(sum(tmin_vals) / len(tmin_vals), 1) if tmin_vals else 0.0,
            "avgRhPercent": round(sum(rh_vals) / len(rh_vals), 1) if rh_vals else 0.0,
            "rainyDays": round(rainy_days / eff_years, 1) if valid_rain_obs else 0.0,
            "avgRootZoneWetness": round(sum(rw_vals) / len(rw_vals), 2) if rw_vals else None,
        })

    annual_records: List[Dict[str, Any]] = []
    kharif_totals: List[float] = []
    rabi_totals: List[float] = []
    summer_totals: List[float] = []
    annual_max_temps: List[float] = []

    for yr in years:
        y_obs = [o for o in observations if int(o["date"][:4]) == yr]
        k_obs = [o for o in y_obs if 6 <= int(o["date"][5:7]) <= 9]
        r_obs = [o for o in y_obs if int(o["date"][5:7]) >= 10 or int(o["date"][5:7]) == 1]
        s_obs = [o for o in y_obs if 2 <= int(o["date"][5:7]) <= 5]

        k_rain = round(sum(o["precipMm"] for o in k_obs if o["precipMm"] is not None and o["precipMm"] >= 0), 1)
        r_rain = round(sum(o["precipMm"] for o in r_obs if o["precipMm"] is not None and o["precipMm"] >= 0), 1)
        s_rain = round(sum(o["precipMm"] for o in s_obs if o["precipMm"] is not None and o["precipMm"] >= 0), 1)
        tot_rain = round(k_rain + r_rain + s_rain, 1)
        t_vals = [o["t2m"] for o in y_obs if o["t2m"] is not None]
        tmax_vals = [o["t2mMax"] for o in y_obs if o["t2mMax"] is not None]
        if tmax_vals:
            annual_max_temps.append(sum(tmax_vals) / len(tmax_vals))

        kharif_totals.append(k_rain)
        rabi_totals.append(r_rain)
        summer_totals.append(s_rain)

        annual_records.append({
            "year": yr,
            "totalRainMm": tot_rain,
            "kharifRainMm": k_rain,
            "rabiRainMm": r_rain,
            "summerRainMm": s_rain,
            "meanTempC": round(sum(t_vals) / len(t_vals), 2) if t_vals else 0.0,
            "maxDrySpellDays": compute_longest_dry_spell(k_obs if k_obs else y_obs),
        })

    def summarize_season(season_key: str, label: str, months_label: str, m_set: set, totals: List[float]) -> Dict[str, Any]:
        s_obs = [o for o in observations if int(o["date"][5:7]) in m_set]
        rain_sum = sum(o["precipMm"] for o in s_obs if o["precipMm"] is not None and o["precipMm"] >= 0)
        t_vals = [o["t2m"] for o in s_obs if o["t2m"] is not None]
        tmax_vals = [o["t2mMax"] for o in s_obs if o["t2mMax"] is not None]
        tmin_vals = [o["t2mMin"] for o in s_obs if o["t2mMin"] is not None]
        rw_vals = [o["rootZoneSoilWetness"] for o in s_obs if o["rootZoneSoilWetness"] is not None]

        dry_spells = []
        for yr in years:
            yr_s_obs = [o for o in s_obs if int(o["date"][:4]) == yr]
            dry_spells.append(compute_longest_dry_spell(yr_s_obs))

        heat_days = sum(1 for v in tmax_vals if v >= HEAT_STRESS_THRESHOLD_C)
        return {
            "season": season_key,
            "label": label,
            "monthsLabel": months_label,
            "avgTotalRainMm": round(rain_sum / num_years, 1),
            "rainVariabilityCvPercent": calculate_cv_percent(totals),
            "avgMeanTempC": round(sum(t_vals) / len(t_vals), 1) if t_vals else 0.0,
            "avgMaxTempC": round(sum(tmax_vals) / len(tmax_vals), 1) if tmax_vals else 0.0,
            "avgMinTempC": round(sum(tmin_vals) / len(tmin_vals), 1) if tmin_vals else 0.0,
            "maxConsecutiveDryDays": int(round(sum(dry_spells) / len(dry_spells))) if dry_spells else 0,
            "heatStressDaysAbove35C": round(heat_days / num_years, 1),
            "avgRootZoneWetness": round(sum(rw_vals) / len(rw_vals), 2) if rw_vals else None,
        }

    seasonal_summaries = {
        "kharif": summarize_season("kharif", "Kharif (Monsoon)", "June – September", {6, 7, 8, 9}, kharif_totals),
        "rabi": summarize_season("rabi", "Rabi (Post-Monsoon / Winter)", "October – January", {10, 11, 12, 1}, rabi_totals),
        "summer": summarize_season("summer", "Zaid / Summer", "February – May", {2, 3, 4, 5}, summer_totals),
    }

    ann_totals = [r["totalRainMm"] for r in annual_records]
    mean_annual_rain = round(sum(ann_totals) / len(ann_totals), 1) if ann_totals else 0.0
    annual_cv = calculate_cv_percent(ann_totals)
    all_t = [o["t2m"] for o in observations if o["t2m"] is not None]
    mean_annual_temp = round(sum(all_t) / len(all_t), 1) if all_t else 0.0

    # Linear regression slope (°C/year) over annual mean maximum temperatures (T2M_MAX)
    max_temp_trend = 0.0
    if len(annual_max_temps) >= 2:
        n = len(annual_max_temps)
        x_mean = (n - 1) / 2.0
        y_mean = sum(annual_max_temps) / n
        num = sum((idx - x_mean) * (y_val - y_mean) for idx, y_val in enumerate(annual_max_temps))
        den = sum((idx - x_mean) ** 2 for idx in range(n))
        if den > 0:
            max_temp_trend = round(num / den, 2)

    surf_vals = [o["surfaceSoilWetness"] for o in observations if o["surfaceSoilWetness"] is not None]
    root_vals = [o["rootZoneSoilWetness"] for o in observations if o["rootZoneSoilWetness"] is not None]

    longest_k_dry = seasonal_summaries["kharif"]["maxConsecutiveDryDays"]
    drought_risk = (
        "High"
        if (mean_annual_rain < 650 or longest_k_dry >= 16 or annual_cv >= 22)
        else ("Moderate" if (mean_annual_rain < 850 or longest_k_dry >= 11) else "Low")
    )

    valid_days = sum(1 for o in observations if o["t2m"] is not None and o["precipMm"] is not None)

    return {
        "source": "NASA POWER Agroclimatology Archive (MERRA-2 / GEOS / CERES)",
        "product": "NASA POWER Daily API v2 (Community: AG)",
        "isLiveRetrieval": is_live,
        "fallbackBannerMessage": fallback_msg,
        "latitude": round(latitude, 4),
        "longitude": round(longitude, 4),
        "startDate": start_date,
        "endDate": end_date,
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "spatialResolution": "0.5° x 0.625° latitude/longitude (~55 km x 69 km MERRA-2 meteorological assimilation grid) & 1.0° x 1.0° CERES solar grid",
        "units": {
            "T2M": "°C",
            "T2M_MAX": "°C",
            "T2M_MIN": "°C",
            "PRECTOTCORR": "mm/day",
            "RH2M": "%",
            "ALLSKY_SFC_SW_DWN": "MJ/m²/day",
            "GWETTOP": "dimensionless (0-1 saturation fraction)",
            "GWETROOT": "dimensionless (0-1 saturation fraction)",
        },
        "observations": observations,
        "monthlyClimatology": monthly_climatology,
        "seasonalSummaries": seasonal_summaries,
        "annualRecords": annual_records,
        "indicators": {
            "meanAnnualRainMm": mean_annual_rain,
            "annualRainCvPercent": annual_cv,
            "meanAnnualTempC": mean_annual_temp,
            "maxTempTrendCPerYear": max_temp_trend,
            "avgLongestKharifDrySpellDays": longest_k_dry,
            "avgHeatStressDaysPerYear": round(
                seasonal_summaries["kharif"]["heatStressDaysAbove35C"]
                + seasonal_summaries["rabi"]["heatStressDaysAbove35C"]
                + seasonal_summaries["summer"]["heatStressDaysAbove35C"],
                1,
            ),
            "meanSurfaceSoilWetness": round(sum(surf_vals) / len(surf_vals), 2) if surf_vals else None,
            "meanRootZoneSoilWetness": round(sum(root_vals) / len(root_vals), 2) if root_vals else None,
            "droughtRiskClass": drought_risk,
        },
        "qualityInformation": {
            "totalDaysRequested": len(observations),
            "validObservationDays": valid_days,
            "completenessPercent": round((valid_days / max(1, len(observations))) * 100.0, 1),
            "missingValueCode": MISSING_CODE,
            "spatialFootprintDisclaimer": "NASA POWER meteorological values (T2M, PRECTOTCORR, RH2M, GWETTOP, GWETROOT) are derived from the NASA GMAO MERRA-2 / GEOS assimilation model (0.5° x 0.625° grid, ~55 km x 69 km), and solar values (ALLSKY_SFC_SW_DWN) from CERES SYN1deg (1.0° x 1.0°). They represent regional reanalysis and satellite-assimilated averages rather than point measurements on an individual farm parcel. Always combine regional agroclimatology with local rain-gauge records and a laboratory Soil Health Card.",
            "sourceUrl": "https://power.larc.nasa.gov/docs/services/api/temporal/daily/",
        },
    }


def fetch_nasa_power_data(
    latitude: float, longitude: float, start_date: str = "20210101", end_date: str = "20251231"
) -> Dict[str, Any]:
    if math.isnan(latitude) or math.isnan(longitude) or not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
        raise ValueError("Invalid coordinates: latitude must be [-90, 90] and longitude [-180, 180].")

    cache_key = f"{latitude:.3f}_{longitude:.3f}_{start_date}_{end_date}"
    now = time.time()
    if cache_key in _NASA_CACHE:
        exp, cached_data = _NASA_CACHE[cache_key]
        if exp > now:
            return cached_data

    params_str = "T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,ALLSKY_SFC_SW_DWN,GWETTOP,GWETROOT"
    url = (
        f"{NASA_POWER_DAILY_ENDPOINT}?parameters={params_str}"
        f"&community=AG&longitude={longitude}&latitude={latitude}"
        f"&start={start_date.replace('-', '')}&end={end_date.replace('-', '')}&time-standard=LST&format=JSON"
    )

    try:
        resp = requests.get(url, timeout=6.0, headers={"Accept": "application/json"})
        resp.raise_for_status()
        raw_json = resp.json()
        obs = parse_nasa_power_json(raw_json)
        if not obs:
            raise ValueError("Empty observations array")
        env_data = build_environmental_data(latitude, longitude, start_date, end_date, obs, True, None)
        _NASA_CACHE[cache_key] = (now + CACHE_TTL_SECONDS, env_data)
        return env_data
    except Exception:
        s_yr = int(start_date[:4]) if len(start_date) >= 4 and start_date[:4].isdigit() else 2021
        e_yr = int(end_date[:4]) if len(end_date) >= 4 and end_date[:4].isdigit() else 2025
        fallback_obs = build_illustrative_fallback_observations(latitude, longitude, s_yr, e_yr)
        return build_environmental_data(
            latitude,
            longitude,
            start_date,
            end_date,
            fallback_obs,
            False,
            FALLBACK_BANNER_MESSAGE,
        )


def normalize_weights(weights: Optional[Dict[str, float]] = None) -> Dict[str, float]:
    default_w = {
        "climateSuitability": 0.30,
        "waterCompatibility": 0.25,
        "soilManagement": 0.20,
        "farmerPreference": 0.15,
        "cropDiversity": 0.10,
    }
    if not weights:
        return default_w
    merged = {k: float(weights.get(k, default_w[k])) for k in default_w}
    total = sum(merged.values())
    if total <= 0:
        return default_w
    return {k: round(v / total, 4) for k, v in merged.items()}


def evaluate_crop_for_season(
    crop: Dict[str, Any],
    season: str,
    farm: Dict[str, Any],
    nasa: Dict[str, Any],
    preceding_crop_id: str,
    weights: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    w = normalize_weights(weights)
    hard_violations: List[str] = []
    reasons: List[str] = []
    cautions: List[str] = []

    if season not in crop["seasons"]:
        hard_violations.append(f"{crop['name']} is not agronomically recommended for {season.upper()}.")

    seasonal_climate = nasa["seasonalSummaries"][season]
    season_rain = seasonal_climate["avgTotalRainMm"]
    season_temp = seasonal_climate["avgMeanTempC"]

    if crop["id"] == "paddy" and farm["irrigationType"] == "rainfed" and season_rain < 800:
        hard_violations.append(
            f"Paddy requires assured irrigation or >800 mm seasonal rainfall; historical {season} rainfall is {season_rain} mm under rainfed conditions."
        )

    irr_boost = {
        "canal_command_assured": 450,
        "borewell_drip_sprinkler": 250,
        "protective_lifesaving": 120,
        "rainfed": 0,
    }.get(farm["irrigationType"], 0)

    eff_moisture = season_rain + irr_boost
    r_req = crop["rainfallRequirements"]
    if r_req["optimalMinMm"] <= eff_moisture <= r_req["optimalMaxMm"]:
        rain_score = 94
        reasons.append(f"Effective moisture ({eff_moisture:.0f} mm) matches {crop['name']} optimal range ({r_req['optimalMinMm']}–{r_req['optimalMaxMm']} mm).")
    elif eff_moisture >= r_req["minSeasonalMm"]:
        rain_score = 76
    else:
        ratio = max(0.0, eff_moisture / max(1.0, r_req["minSeasonalMm"]))
        rain_score = int(round(30 + 35 * ratio))
        cautions.append(f"Historical {season} rainfall ({season_rain} mm) is below {crop['name']} minimum ({r_req['minSeasonalMm']} mm).")

    t_req = crop["temperatureRange"]
    if t_req["optimalMinC"] <= season_temp <= t_req["optimalMaxC"]:
        temp_score = 95
    elif t_req["minC"] <= season_temp <= t_req["maxC"]:
        temp_score = 74
    else:
        temp_score = 45

    dry_adj = 0
    if seasonal_climate["maxConsecutiveDryDays"] >= 14:
        if r_req["droughtTolerance"] in ("very_high", "high"):
            dry_adj = 6
        elif r_req["droughtTolerance"] == "low":
            dry_adj = -14

    climate_score = max(15, min(100, int(round(rain_score * 0.6 + temp_score * 0.4 + dry_adj))))

    w_req = crop["waterRequirement"]
    irr = farm["irrigationType"]
    if irr == "rainfed":
        water_score = {"very_low": 95, "low": 88, "moderate": 64, "high": 25}[w_req]
    elif irr == "protective_lifesaving":
        water_score = {"very_low": 94, "low": 94, "moderate": 80, "high": 45}[w_req]
    elif irr == "borewell_drip_sprinkler":
        water_score = 62 if w_req == "high" else 92
    else:
        water_score = 94 if w_req == "high" else 88

    if seasonal_climate["rainVariabilityCvPercent"] >= 22 and w_req == "high":
        water_score = max(20, water_score - 15)

    # Soil score: base 82 when soilType matches so missing pH/OC/NPK never inflates to 100/100
    soil_score = 82 if farm["soilType"] in crop["soilPreferences"] else 52
    soil_ph = farm.get("soilPH")
    ph_r = crop["pHRange"]
    if soil_ph is not None:
        if ph_r["optimalMin"] <= soil_ph <= ph_r["optimalMax"]:
            soil_score = min(100, soil_score + 8)
            reasons.append(f"Measured soil pH ({soil_ph}) is within {crop['name']} optimal range ({ph_r['optimalMin']}–{ph_r['optimalMax']}).")
        elif soil_ph < ph_r["min"] or soil_ph > ph_r["max"]:
            soil_score = max(25, soil_score - 22)
            cautions.append(f"Measured soil pH ({soil_ph}) is outside {crop['name']} tolerance ({ph_r['min']}–{ph_r['max']}).")
    else:
        cautions.append(f"Soil pH is unverified; confirm field pH is within {ph_r['optimalMin']}–{ph_r['optimalMax']} for {crop['name']}.")

    oc = farm.get("organicCarbonPercent")
    n_val = farm.get("nitrogenKgHa")
    if ((oc is not None and oc < 0.5) or (n_val is not None and n_val < 280)) and crop["nutrientRole"] in (
        "nitrogen_fixing_legume",
        "green_manure_biomass_builder",
    ):
        soil_score = min(98, soil_score + 8)

    if farm.get("drainage") == "poor" and crop["id"] in ("pigeonpea", "sesame", "groundnut", "maize", "greengram", "sunnhemp"):
        soil_score = max(30, soil_score - 16)

    prio = farm.get("farmerPriority", "balanced_adaptation")
    if prio == "water_conservation":
        pref_score = {"very_low": 96, "low": 90, "moderate": 65, "high": 35}[w_req]
    elif prio == "soil_health_restoration":
        pref_score = 98 if crop["nutrientRole"] == "green_manure_biomass_builder" else (92 if crop["nutrientRole"] == "nitrogen_fixing_legume" else 68)
    elif prio == "drought_risk_reduction":
        pref_score = 96 if r_req["droughtTolerance"] == "very_high" else (88 if r_req["droughtTolerance"] == "high" else 58)
    elif prio == "pulse_oilseed_diversification":
        pref_score = 95 if crop["category"] in ("pulse_legume", "oilseed") else 64
    else:
        pref_score = 84

    prev_crop = CROP_MAP_BY_ID.get(preceding_crop_id)
    rot_score = 75
    if prev_crop:
        if prev_crop["id"] == crop["id"]:
            rot_score = 25
        elif prev_crop["family"] == crop["family"]:
            rot_score = 48
        else:
            rot_score = 92
            if prev_crop["nutrientRole"] == "heavy_nitrogen_feeder" and crop["nutrientRole"] in (
                "nitrogen_fixing_legume",
                "green_manure_biomass_builder",
            ):
                rot_score = 98
            elif prev_crop["rootingDepth"] != crop["rootingDepth"]:
                rot_score = min(98, rot_score + 4)

    weighted_score = round(
        climate_score * w["climateSuitability"]
        + water_score * w["waterCompatibility"]
        + soil_score * w["soilManagement"]
        + pref_score * w["farmerPreference"]
        + rot_score * w["cropDiversity"],
        1,
    )

    return {
        "cropId": crop["id"],
        "cropName": crop["name"],
        "kannadaName": crop["kannadaName"],
        "family": crop["family"],
        "season": season,
        "eligible": len(hard_violations) == 0,
        "hardConstraintViolations": hard_violations,
        "climateScore": climate_score,
        "waterScore": water_score,
        "soilScore": soil_score,
        "preferenceScore": pref_score,
        "rotationFitScore": rot_score,
        "weightedScore": weighted_score if len(hard_violations) == 0 else min(35.0, weighted_score),
        "reasons": reasons,
        "cautions": cautions,
    }


def evaluate_sequence_penalties(crop_ids: List[str], seasons: List[str], farm: Dict[str, Any]) -> Dict[str, Any]:
    rep_fam = 0
    water_over = 0
    incomp = 0
    mono = 0
    notes: List[str] = []

    chain = [farm["previousCrop"]] + list(crop_ids)
    for i in range(1, len(chain)):
        prev = CROP_MAP_BY_ID.get(chain[i - 1])
        curr = CROP_MAP_BY_ID.get(chain[i])
        if not prev or not curr:
            continue
        if prev["id"] == curr["id"]:
            mono += 15
            notes.append(f"Back-to-back monoculture penalty (-15 pts): {curr['name']} follows {prev['name']}.")
        elif prev["family"] == curr["family"] and not (
            prev["category"] == "green_manure" or curr["category"] == "green_manure"
        ):
            rep_fam += 8
            notes.append(f"Repeated {curr['family']} family transition (-8 pts): {prev['name']} -> {curr['name']}.")

        if prev["id"] in curr["rotationCompatibility"]["incompatiblePredecessors"]:
            incomp += 10
            notes.append(f"Agronomically discouraged transition (-10 pts): {curr['name']} after {prev['name']}.")

    # Kharif-to-Rabi sowing window overlap check
    k_crop = CROP_MAP_BY_ID.get(crop_ids[0]) if len(crop_ids) > 0 else None
    r_crop = CROP_MAP_BY_ID.get(crop_ids[1]) if len(crop_ids) > 1 else None
    if k_crop and r_crop and k_crop["duration"]["typicalDays"] >= 140:
        incomp += 10
        notes.append(
            f"Seasonal calendar overlap penalty (-10 pts): {k_crop['name']} ({k_crop['duration']['typicalDays']} days, harvesting Nov–Dec) overlaps the October–November Rabi sowing window for {r_crop['name']}."
        )

    # Cumulative active crop duration check (max 315 days/yr to leave >= 50 days for 3 turnarounds)
    tot_dur = sum(CROP_MAP_BY_ID.get(cid, {}).get("duration", {}).get("typicalDays", 100) for cid in crop_ids)
    if tot_dur > MAX_FEASIBLE_ANNUAL_CROP_DAYS:
        incomp += 12
        notes.append(
            f"Annual turnaround duration penalty (-12 pts): Cumulative crop duration ({tot_dur} days) exceeds {MAX_FEASIBLE_ANNUAL_CROP_DAYS} days, leaving only {365 - tot_dur} days across the year for 3 harvest and land-preparation turnarounds."
        )

    high_mod = sum(
        1 for cid in crop_ids if CROP_MAP_BY_ID.get(cid, {}).get("waterRequirement") in ("high", "moderate")
    )
    if farm["irrigationType"] == "rainfed" and high_mod >= 2:
        water_over += 12
        notes.append(f"Cumulative water demand penalty (-12 pts): {high_mod} moderate/high-water crops on rainfed farm.")

    for idx, cid in enumerate(crop_ids):
        c = CROP_MAP_BY_ID.get(cid)
        s = seasons[idx] if idx < len(seasons) else "kharif"
        if c and s not in c["seasons"]:
            incomp += 14
            notes.append(f"Season mismatch penalty (-14 pts): {c['name']} is not suited for {s.upper()}.")

    tot = rep_fam + water_over + incomp + mono
    return {
        "repeatedFamilyPenalty": rep_fam,
        "waterOverloadPenalty": water_over,
        "incompatibleTransitionPenalty": incomp,
        "monoculturePenalty": mono,
        "totalPenalty": tot,
        "notes": notes,
    }


def compute_confidence_assessment(farm: Dict[str, Any], nasa: Dict[str, Any]) -> Dict[str, Any]:
    available: List[str] = [
        f"Farm coordinates ({farm['latitude']:.3f}°N, {farm['longitude']:.3f}°E), soil type ({farm['soilType']}), and irrigation ({farm['irrigationType']})."
    ]
    missing: List[str] = []
    reasons: List[str] = []
    recs: List[str] = []
    points = 36

    is_live = bool(nasa.get("isLiveRetrieval"))
    if is_live:
        points += 24
        available.append("Live NASA POWER Daily Agroclimatology observations.")
    else:
        missing.append("Live NASA POWER network connection (currently using illustrative regional demonstration dataset).")
        reasons.append("Live NASA POWER retrieval was unavailable; confidence is capped at Moderate because the climate indicators come from the illustrative demonstration baseline.")

    has_ph = farm.get("soilPH") is not None
    if has_ph:
        points += 12
        available.append(f"Measured soil pH ({farm['soilPH']}).")
    else:
        missing.append("Laboratory soil pH measurement.")
        recs.append("Test soil pH at your local KVK or Soil Health Card lab before sowing pulses/oilseeds.")

    has_oc = farm.get("organicCarbonPercent") is not None
    if has_oc:
        points += 10
        available.append(f"Soil Organic Carbon ({farm['organicCarbonPercent']}%).")
    else:
        missing.append("Soil Organic Carbon (OC %) value.")
        recs.append("Measure Soil Organic Carbon (OC %) to calibrate FYM or green-manure biomass incorporation.")

    has_npk = (
        farm.get("nitrogenKgHa") is not None
        and farm.get("phosphorusKgHa") is not None
        and farm.get("potassiumKgHa") is not None
    )
    if has_npk:
        points += 13
        available.append(f"Available NPK ({farm['nitrogenKgHa']}/{farm['phosphorusKgHa']}/{farm['potassiumKgHa']} kg/ha).")
    else:
        missing.append("Available Nitrogen (N), Phosphorus (P), and Potassium (K) in kg/ha.")
        recs.append("Obtain NPK values from a Government of India Soil Health Card (soilhealth.dac.gov.in).")

    reasons.append("NASA POWER meteorological grids cover 0.5° × 0.625° (~55 km × 69 km); confirm field drainage locally.")

    if is_live and has_ph and has_oc and has_npk and points >= 78:
        level = "High confidence"
    elif points >= 55:
        level = "Moderate confidence"
    else:
        level = "Limited confidence"

    return {
        "level": level,
        "scorePercent": min(95, points),
        "availableEvidenceItems": available,
        "missingEvidenceItems": missing,
        "reasons": reasons,
        "verificationRecommendations": recs,
    }


def build_rotation_recommendation(
    strategy: str,
    crop_ids: List[str],
    seasons: List[str],
    farm: Dict[str, Any],
    nasa: Dict[str, Any],
    custom_weights: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    meta_map = {
        "balanced": {
            "title": "Strategy A — Balanced Climate & Soil Rotation",
            "kannadaTitle": "ತಂತ್ರ A — ಸಮತೋಲಿತ ಹವಾಮಾನ ಮತ್ತು ಮಣ್ಣಿನ ಬೆಳೆ ಪರಿವರ್ತನೆ",
            "subtitle": "Balances NASA seasonal climate suitability, water constraints, legume nitrogen management, and farmer objectives.",
            "w": normalize_weights(custom_weights),
        },
        "water_conscious": {
            "title": "Strategy B — Water-Conscious Drought-Resilient Rotation",
            "kannadaTitle": "ತಂತ್ರ B — ನೀರು-ಉಳಿತಾಯ ಮತ್ತು ಬರ-ನಿರೋಧಕ ಬೆಳೆ ಪರಿವರ್ತನೆ",
            "subtitle": "Prioritizes low-water-demand millets, pulses, and oilseeds resilient to mid-season dry spells and rainfall variability.",
            "w": normalize_weights(custom_weights or {"climateSuitability": 0.28, "waterCompatibility": 0.40, "soilManagement": 0.14, "farmerPreference": 0.10, "cropDiversity": 0.08}),
        },
        "soil_improvement": {
            "title": "Strategy C — Soil-Health & Legume Restoration Rotation",
            "kannadaTitle": "ತಂತ್ರ C — ಮಣ್ಣಿನ ಆರೋಗ್ಯ ಮತ್ತು ದ್ವಿದಳ ಧಾನ್ಯ ಪುನಶ್ಚೇತನ ಪರಿವರ್ತನೆ",
            "subtitle": "Prioritizes symbiotic nitrogen-fixing pulses, species-matched green manuring, root-depth alternation, and botanical family diversity.",
            "w": normalize_weights(custom_weights or {"climateSuitability": 0.22, "waterCompatibility": 0.18, "soilManagement": 0.35, "farmerPreference": 0.10, "cropDiversity": 0.15}),
        },
    }
    meta = meta_map[strategy]
    active_w = meta["w"]

    season_labels = {
        "kharif": "Season 1: Kharif (Jun–Sep)",
        "rabi": "Season 2: Rabi (Oct–Jan)",
        "summer": "Season 3: Summer / Pre-Kharif (Feb–May)",
    }
    harvest_labels = {
        "kharif": "September – October (15–20 day turnaround before Rabi sowing)",
        "rabi": "January – February (15–20 day turnaround before Summer/Pre-Kharif)",
        "summer": "April – May (Incorporate at 45–60 DAS if green manure, allowing 15 days decomposition)",
    }

    evals = []
    steps = []
    evidence_map: Dict[str, Dict[str, str]] = {
        "https://power.larc.nasa.gov/docs/services/api/temporal/daily/": {
            "institution": "NASA Langley Research Center",
            "title": "NASA POWER Agroclimatology Daily API v2 (MERRA-2 / CERES)",
            "url": "https://power.larc.nasa.gov/docs/services/api/temporal/daily/",
        }
    }

    for i in range(3):
        crop = CROP_MAP_BY_ID.get(crop_ids[i], KARNATAKA_CROPS[0])
        season = seasons[i]
        prev_id = farm["previousCrop"] if i == 0 else crop_ids[i - 1]
        prev_crop = CROP_MAP_BY_ID.get(prev_id)

        ev = evaluate_crop_for_season(crop, season, farm, nasa, prev_id, active_w)
        evals.append(ev)
        for src in crop["sources"]:
            evidence_map[src["url"]] = src

        if prev_crop and prev_crop["family"] != crop["family"]:
            t_note = f"Switches botanical family from {prev_crop['family']} ({prev_crop['name']}) to {crop['family']} ({crop['name']}), breaking pest carryover and alternating rooting depths."
        elif prev_crop:
            t_note = f"Follows {prev_crop['name']} ({prev_crop['family']}); monitor shared pests and apply organic soil amendments."
        else:
            t_note = f"Initiates rotation sequence for {season.upper()}."

        steps.append({
            "stepNumber": i + 1,
            "yearOffset": 1,
            "season": season,
            "seasonLabel": season_labels[season],
            "sowingWindow": crop["sowingWindows"].get(season, f"{season.upper()} standard window"),
            "harvestWindow": harvest_labels[season],
            "cropId": crop["id"],
            "cropName": crop["name"],
            "kannadaName": crop["kannadaName"],
            "scientificName": crop["scientificName"],
            "family": crop["family"],
            "category": crop["category"],
            "durationDays": crop["duration"]["typicalDays"],
            "waterRequirement": crop["waterRequirement"].replace("_", " "),
            "rootingDepth": crop["rootingDepth"].replace("_", " "),
            "nutrientRole": crop["nutrientRole"].replace("_", " "),
            "stepSuitabilityScore": ev["weightedScore"],
            "transitionNote": t_note,
            "managementConsiderations": [crop["managementBenefits"][0], crop["constraints"][0]],
            "sourceUrl": crop["sources"][0]["url"],
        })

    unique_families = len({CROP_MAP_BY_ID[cid]["family"] for cid in crop_ids if cid in CROP_MAP_BY_ID})
    has_legume = any(CROP_MAP_BY_ID.get(cid, {}).get("family") == "Fabaceae" for cid in crop_ids)
    unique_roots = len({CROP_MAP_BY_ID[cid]["rootingDepth"] for cid in crop_ids if cid in CROP_MAP_BY_ID})
    diversity_score = min(100, int(round((unique_families / 3) * 45 + (35 if has_legume else 0) + (unique_roots / 3) * 20)))

    avg_clim = round(sum(e["climateScore"] for e in evals) / 3.0, 1)
    avg_wat = round(sum(e["waterScore"] for e in evals) / 3.0, 1)
    avg_soil = round(sum(e["soilScore"] for e in evals) / 3.0, 1)
    avg_pref = round(sum(e["preferenceScore"] for e in evals) / 3.0, 1)

    penalties = evaluate_sequence_penalties(crop_ids, seasons, farm)
    raw_weighted = (
        avg_clim * active_w["climateSuitability"]
        + avg_wat * active_w["waterCompatibility"]
        + avg_soil * active_w["soilManagement"]
        + avg_pref * active_w["farmerPreference"]
        + diversity_score * active_w["cropDiversity"]
    )
    total_score = max(10.0, min(100.0, round(raw_weighted - penalties["totalPenalty"], 1)))
    confidence = compute_confidence_assessment(farm, nasa)
    prev_name = CROP_MAP_BY_ID.get(farm["previousCrop"], {}).get("name", farm["previousCrop"])
    tot_dur = sum(s["durationDays"] for s in steps)

    if steps[2]["cropId"] == "sunnhemp":
        step3_desc = "produces 13–15 t/ha of green biomass (Crotalaria juncea) within 45–60 DAS for in-situ incorporation on well-drained loamy soils before the next monsoon."
    elif steps[2]["cropId"] == "dhaincha":
        step3_desc = "produces up to 25 t/ha of green biomass (Sesbania aculeata) within 45–60 DAS for clay/alkaline soil reclamation before the next monsoon."
    else:
        step3_desc = "provides a short-duration, low-water catch crop before the next Kharif cycle."

    why_seq = (
        f"Following {prev_name}, Step 1 ({steps[0]['cropName']} in Kharif, {steps[0]['durationDays']}d) aligns with the {nasa['seasonalSummaries']['kharif']['avgTotalRainMm']} mm monsoon window and harvests by September–October. "
        f"Step 2 ({steps[1]['cropName']} in Rabi, {steps[1]['durationDays']}d) uses receding post-monsoon moisture ({nasa['seasonalSummaries']['rabi']['avgTotalRainMm']} mm) while shifting botanical family. "
        f"Step 3 ({steps[2]['cropName']} in Summer/Pre-Kharif, {steps[2]['durationDays']}d) {step3_desc}"
    )

    explanation = (
        f"This {meta['title'].lower()} achieves a suitability score of {total_score}/100 under {farm['irrigationType'].replace('_', ' ')} conditions on {farm['soilType'].replace('_', ' ')} soil "
        f"({tot_dur} total crop days, leaving {365 - tot_dur} days for inter-seasonal turnarounds). "
        f"NASA POWER historical analysis indicates {nasa['indicators']['meanAnnualRainMm']} mm mean annual rainfall with {nasa['indicators']['annualRainCvPercent']}% CV and "
        f"{nasa['indicators']['avgLongestKharifDrySpellDays']}-day average Kharif dry spells."
    )

    kannada_summary = (
        f"{' → '.join(s['kannadaName'] for s in steps)} ಬೆಳೆ ಪರಿವರ್ತನೆಯು ಮಣ್ಣಿನ ಫಲವತ್ತತೆ ಕಾಪಾಡಲು, ಕೀಟ-ರೋಗಗಳ ಚಕ್ರವನ್ನು ಮುರಿಯಲು ಮತ್ತು "
        f"{nasa['indicators']['meanAnnualRainMm']} ಮಿ.ಮೀ ವಾರ್ಷಿಕ ಮಳೆಯ ಹಂಚಿಕೆಗೆ ಹೊಂದಿಕೊಳ್ಳಲು ಸಹಾಯ ಮಾಡುತ್ತದೆ."
    )

    return {
        "id": f"rot_{strategy}_{'_'.join(crop_ids)}",
        "strategy": strategy,
        "strategyTitle": meta["title"],
        "kannadaTitle": meta["kannadaTitle"],
        "strategySubtitle": meta["subtitle"],
        "crops": crop_ids,
        "seasons": seasons,
        "sequenceSteps": steps,
        "totalDurationDays": tot_dur,
        "climateScore": avg_clim,
        "waterScore": avg_wat,
        "soilScore": avg_soil,
        "preferenceScore": avg_pref,
        "diversityScore": diversity_score,
        "penalties": penalties,
        "totalScore": total_score,
        "weightsUsed": active_w,
        "confidence": confidence,
        "waterCompatibilitySummary": f"Water Score {avg_wat}/100 — matched to {farm['irrigationType'].replace('_', ' ')}.",
        "climateCompatibilitySummary": f"Climate Score {avg_clim}/100 — accounts for {nasa['indicators']['avgLongestKharifDrySpellDays']}-day Kharif dry spells.",
        "soilCompatibilitySummary": f"Soil Score {avg_soil}/100 — matched to {farm['soilType'].replace('_', ' ')}.",
        "advantages": [
            f"Breaks continuous {prev_name} cropping across {unique_families} botanical families ({tot_dur} active crop days, {365 - tot_dur} turnaround days/yr).",
            "Includes Fabaceae legume/green-manure nitrogen fixation and organic biomass return.",
            "Alternates rooting depths across seasons to protect topsoil moisture and structure.",
        ],
        "risks": [
            f"Historical Kharif dry spells average {nasa['indicators']['avgLongestKharifDrySpellDays']} consecutive days (<2.5 mm/day).",
            "Biological nitrogen fixation by legumes does NOT guarantee all fixed nitrogen remains available to the next crop; mineralization depends on soil moisture and residue management.",
        ] + penalties["notes"],
        "whyThisSequence": why_seq,
        "explanation": explanation,
        "kannadaSummary": kannada_summary,
        "missingSoilImprovements": confidence["verificationRecommendations"],
        "evidenceSources": list(evidence_map.values()),
    }


def generate_crop_rotation_recommendations(
    farm: Dict[str, Any], nasa: Dict[str, Any], custom_weights: Optional[Dict[str, float]] = None
) -> Dict[str, Any]:
    seasons = ["kharif", "rabi", "summer"]
    crop_evals = {
        s: sorted(
            [evaluate_crop_for_season(c, s, farm, nasa, farm["previousCrop"], custom_weights) for c in KARNATAKA_CROPS],
            key=lambda x: x["weightedScore"],
            reverse=True,
        )
        for s in seasons
    }

    prev_crop = CROP_MAP_BY_ID.get(farm["previousCrop"], CROP_MAP_BY_ID["maize"])
    is_prev_poaceae = prev_crop["family"] == "Poaceae"
    is_black = farm["soilType"] == "black_cotton_clay"
    soil_ph = farm.get("soilPH")
    is_wet_or_alkaline = is_black or farm["soilType"] == "alluvial_loam" or (soil_ph is not None and soil_ph >= 7.6)
    gm_id = "dhaincha" if is_wet_or_alkaline else "sunnhemp"
    is_assured = farm["irrigationType"] in ("canal_command_assured", "borewell_drip_sprinkler")

    if is_prev_poaceae:
        if is_black:
            bal_seq = ["greengram", "sorghum", "sunflower"]
        elif farm["previousCrop"] == "maize":
            bal_seq = ["groundnut", "ragi", "greengram"]
        elif farm["previousCrop"] == "paddy" and is_assured:
            bal_seq = ["blackgram", "ragi", "sesame"]
        else:
            bal_seq = ["groundnut", "sunflower", "greengram"]
    else:
        bal_seq = ["maize", "chickpea", "sunflower"] if is_black else ["ragi", "chickpea", "sesame"]

    if is_black:
        wat_seq = ["sunflower", "chickpea", "sesame"] if is_prev_poaceae else ["sorghum", "chickpea", "sesame"]
    else:
        wat_seq = ["sunflower", "chickpea", "sesame"] if is_prev_poaceae else ["ragi", "chickpea", "sesame"]

    if is_prev_poaceae:
        soil_seq = ["blackgram", "sorghum", gm_id] if is_black else ["groundnut", "ragi", gm_id]
    else:
        soil_seq = ["sorghum", "chickpea", gm_id] if is_black else ["ragi", "blackgram", gm_id]

    recs = [
        build_rotation_recommendation("balanced", bal_seq, seasons, farm, nasa, custom_weights),
        build_rotation_recommendation("water_conscious", wat_seq, seasons, farm, nasa, custom_weights),
        build_rotation_recommendation("soil_improvement", soil_seq, seasons, farm, nasa, custom_weights),
    ]

    return {"cropEvaluationsBySeason": crop_evals, "recommendations": recs}
