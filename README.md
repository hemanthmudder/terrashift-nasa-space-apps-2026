cd ~/Downloads/terrashift-integration

cat > README.md <<'EOF'
# TerraShift — NASA Space Apps Challenge 2026

**Smarter Crop Rotations. Healthier Soil. Climate-Ready Farms.**

TerraShift is a climate-informed crop rotation decision-support MVP using NASA POWER climate data for Story County, Iowa.

It provides climate insights, seasonal indicators, crop rotation information, a crop calendar and printable reports.

## Pilot Region

- Location: Story County, Iowa, USA
- Region ID: `ia-story-19169`
- County FIPS: `19169`
- SSURGO survey area: `IA169`
- Internal point: `42.0375, -93.4661`
- Climate period: 1991–2025
- Growing season: April 1 – October 31

Climate data represents approximately one 55 km NASA POWER grid cell at the county's internal point, not individual farms.

## Features

- NASA POWER daily climate data collection.
- Climate data cleaning and quality checks.
- Seasonal precipitation and growing degree day calculations.
- Dry-spell and climate summaries.
- Three crop rotation cycles for comparison.
- Monthly climate insights.
- Growing-season crop calendar.
- Printable pilot report.

## Technology

- Python
- NASA POWER API
- Next.js
- React
- TypeScript
- Tailwind CSS

## Architecture

NASA POWER API
    ↓
Python data pipeline
    ↓
Climate data cleaning
    ↓
Environmental summary and rotation engine
    ↓
Processed CSV and JSON datasets
    ↓
Frontend publishing script
    ↓
Next.js application

The frontend reads locally published datasets. It does not call NASA APIs directly.

## Setup and Run

Run these commands from the repository root.

### 1. Install Python dependencies

```bash
python3 -m pip install -r requirements.txt
