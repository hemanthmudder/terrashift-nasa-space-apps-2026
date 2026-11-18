/**
 * MEMBER 4 — Climate Indicator & Agroclimatology Analysis Module
 * Computes monthly/seasonal/annual rainfall, CV%, dry spells (<2.5 mm/day),
 * heat-stress days (>=35°C), and MERRA-2 surface vs. root-zone soil wetness.
 * Never converts null (-999) observations into 0.0 mm rainfall or dry days.
 * TerraShift | NASA Space Apps Challenge 2026
 */

import {
  NASADailyObservation,
  MonthlyClimateAggregate,
  SeasonalClimateSummary,
  AnnualRainfallRecord,
} from "../../types/nasa";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * UAS Bangalore / Journal of Agrometeorology (Huggi et al., 2020) dry-day threshold:
 * A day with < 2.5 mm precipitation is classified as a dry day for Southern/Central Karnataka agro-climatic analysis.
 */
export const DRY_DAY_THRESHOLD_MM = 2.5;
export const HEAT_STRESS_THRESHOLD_C = 35.0;

export function roundTo(value: number, decimals = 1): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function calculateCoefficientOfVariation(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean <= 0.001) return 0;
  const variance =
    values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
  return roundTo((Math.sqrt(variance) / mean) * 100, 1);
}

/**
 * Computes longest consecutive dry spell (<2.5 mm/day).
 * If a day's precipitation is null (-999 missing observation), the streak is reset
 * so missing data gaps are never bridged or counted as confirmed dry days.
 */
export function computeLongestDrySpell(observations: NASADailyObservation[]): number {
  let maxStreak = 0;
  let currentStreak = 0;
  for (const obs of observations) {
    if (obs.precipMm === null || obs.precipMm === undefined) {
      currentStreak = 0;
    } else if (obs.precipMm < DRY_DAY_THRESHOLD_MM) {
      currentStreak += 1;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
  }
  return maxStreak;
}

export function computeMonthlyClimatology(
  observations: NASADailyObservation[]
): MonthlyClimateAggregate[] {
  const yearsSet = new Set<string>();
  for (const obs of observations) {
    yearsSet.add(obs.date.slice(0, 4));
  }
  const numYears = Math.max(1, yearsSet.size);
  const stdDaysInMonth = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  const buckets = Array.from({ length: 12 }, (_, idx) => ({
    month: idx + 1,
    rainSum: 0,
    validRainDays: 0,
    tempSum: 0,
    tempCount: 0,
    maxTempSum: 0,
    maxTempCount: 0,
    minTempSum: 0,
    minTempCount: 0,
    rhSum: 0,
    rhCount: 0,
    rainyDays: 0,
    rootWetSum: 0,
    rootWetCount: 0,
  }));

  for (const obs of observations) {
    const monthIdx = parseInt(obs.date.slice(5, 7), 10) - 1;
    if (monthIdx < 0 || monthIdx > 11) continue;
    const b = buckets[monthIdx];
    if (obs.precipMm !== null && obs.precipMm >= 0) {
      b.rainSum += obs.precipMm;
      b.validRainDays += 1;
      if (obs.precipMm >= DRY_DAY_THRESHOLD_MM) {
        b.rainyDays += 1;
      }
    }
    if (obs.t2m !== null) {
      b.tempSum += obs.t2m;
      b.tempCount += 1;
    }
    if (obs.t2mMax !== null) {
      b.maxTempSum += obs.t2mMax;
      b.maxTempCount += 1;
    }
    if (obs.t2mMin !== null) {
      b.minTempSum += obs.t2mMin;
      b.minTempCount += 1;
    }
    if (obs.rh2m !== null) {
      b.rhSum += obs.rh2m;
      b.rhCount += 1;
    }
    if (obs.rootZoneSoilWetness !== null) {
      b.rootWetSum += obs.rootZoneSoilWetness;
      b.rootWetCount += 1;
    }
  }

  return buckets.map((b, i) => {
    const expectedDays = numYears * stdDaysInMonth[i];
    const effectiveYears =
      b.validRainDays > 0 && b.validRainDays < expectedDays * 0.9
        ? Math.max(0.1, b.validRainDays / stdDaysInMonth[i])
        : numYears;
    return {
      month: b.month,
      monthName: MONTH_NAMES[i],
      avgRainMm: b.validRainDays ? roundTo(b.rainSum / effectiveYears, 1) : 0,
      avgTempC: b.tempCount ? roundTo(b.tempSum / b.tempCount, 1) : 0,
      avgMaxTempC: b.maxTempCount ? roundTo(b.maxTempSum / b.maxTempCount, 1) : 0,
      avgMinTempC: b.minTempCount ? roundTo(b.minTempSum / b.minTempCount, 1) : 0,
      avgRhPercent: b.rhCount ? roundTo(b.rhSum / b.rhCount, 1) : 0,
      rainyDays: b.validRainDays ? roundTo(b.rainyDays / effectiveYears, 1) : 0,
      avgRootZoneWetness: b.rootWetCount
        ? roundTo(b.rootWetSum / b.rootWetCount, 2)
        : null,
    };
  });
}

export function computeAnnualAndSeasonalSummaries(
  observations: NASADailyObservation[]
): {
  annualRecords: AnnualRainfallRecord[];
  seasonalSummaries: Record<"kharif" | "rabi" | "summer", SeasonalClimateSummary>;
} {
  const byYear = new Map<number, NASADailyObservation[]>();
  for (const obs of observations) {
    const yr = parseInt(obs.date.slice(0, 4), 10);
    if (!byYear.has(yr)) byYear.set(yr, []);
    byYear.get(yr)!.push(obs);
  }

  const annualRecords: AnnualRainfallRecord[] = [];
  const kharifTotals: number[] = [];
  const rabiTotals: number[] = [];
  const summerTotals: number[] = [];

  for (const [yr, list] of Array.from(byYear.entries()).sort((a, b) => a[0] - b[0])) {
    let totalRain = 0;
    let kharifRain = 0;
    let rabiRain = 0;
    let summerRain = 0;
    let tempSum = 0;
    let tempCount = 0;
    const kharifObs: NASADailyObservation[] = [];

    for (const o of list) {
      const m = parseInt(o.date.slice(5, 7), 10);
      if (o.precipMm !== null && o.precipMm >= 0) {
        totalRain += o.precipMm;
        if (m >= 6 && m <= 9) {
          kharifRain += o.precipMm;
        } else if (m >= 10 || m <= 1) {
          rabiRain += o.precipMm;
        } else {
          summerRain += o.precipMm;
        }
      }
      if (m >= 6 && m <= 9) {
        kharifObs.push(o);
      }
      if (o.t2m !== null) {
        tempSum += o.t2m;
        tempCount += 1;
      }
    }

    kharifTotals.push(kharifRain);
    rabiTotals.push(rabiRain);
    summerTotals.push(summerRain);

    annualRecords.push({
      year: yr,
      totalRainMm: roundTo(totalRain, 1),
      kharifRainMm: roundTo(kharifRain, 1),
      rabiRainMm: roundTo(rabiRain, 1),
      summerRainMm: roundTo(summerRain, 1),
      meanTempC: tempCount ? roundTo(tempSum / tempCount, 2) : 0,
      maxDrySpellDays: computeLongestDrySpell(kharifObs.length ? kharifObs : list),
    });
  }

  const numYears = Math.max(1, byYear.size);

  function buildSeasonSummary(
    season: "kharif" | "rabi" | "summer",
    label: string,
    monthsLabel: string,
    monthFilter: (m: number) => boolean,
    yearlyTotals: number[]
  ): SeasonalClimateSummary {
    const filtered = observations.filter((o) =>
      monthFilter(parseInt(o.date.slice(5, 7), 10))
    );
    const validPrecip = filtered
      .map((o) => o.precipMm)
      .filter((v): v is number => v !== null && v >= 0);
    const rainSum = validPrecip.reduce((acc, v) => acc + v, 0);
    const t2mVals = filtered.map((o) => o.t2m).filter((v): v is number => v !== null);
    const tMaxVals = filtered.map((o) => o.t2mMax).filter((v): v is number => v !== null);
    const tMinVals = filtered.map((o) => o.t2mMin).filter((v): v is number => v !== null);
    const rootVals = filtered
      .map((o) => o.rootZoneSoilWetness)
      .filter((v): v is number => v !== null);

    let drySpellSum = 0;
    for (const [, yrObs] of byYear.entries()) {
      const sObs = yrObs.filter((o) => monthFilter(parseInt(o.date.slice(5, 7), 10)));
      drySpellSum += computeLongestDrySpell(sObs);
    }

    const heatDaysTotal = tMaxVals.filter((t) => t >= HEAT_STRESS_THRESHOLD_C).length;

    return {
      season,
      label,
      monthsLabel,
      avgTotalRainMm: roundTo(rainSum / numYears, 1),
      rainVariabilityCvPercent: calculateCoefficientOfVariation(yearlyTotals),
      avgMeanTempC: t2mVals.length
        ? roundTo(t2mVals.reduce((a, b) => a + b, 0) / t2mVals.length, 1)
        : 0,
      avgMaxTempC: tMaxVals.length
        ? roundTo(tMaxVals.reduce((a, b) => a + b, 0) / tMaxVals.length, 1)
        : 0,
      avgMinTempC: tMinVals.length
        ? roundTo(tMinVals.reduce((a, b) => a + b, 0) / tMinVals.length, 1)
        : 0,
      maxConsecutiveDryDays: Math.round(drySpellSum / numYears),
      heatStressDaysAbove35C: roundTo(heatDaysTotal / numYears, 1),
      avgRootZoneWetness: rootVals.length
        ? roundTo(rootVals.reduce((a, b) => a + b, 0) / rootVals.length, 2)
        : null,
    };
  }

  const seasonalSummaries = {
    kharif: buildSeasonSummary(
      "kharif",
      "Kharif (Monsoon)",
      "June – September",
      (m) => m >= 6 && m <= 9,
      kharifTotals
    ),
    rabi: buildSeasonSummary(
      "rabi",
      "Rabi (Post-Monsoon / Winter)",
      "October – January",
      (m) => m >= 10 || m === 1,
      rabiTotals
    ),
    summer: buildSeasonSummary(
      "summer",
      "Zaid / Summer",
      "February – May",
      (m) => m >= 2 && m <= 5,
      summerTotals
    ),
  };

  return { annualRecords, seasonalSummaries };
}
