/**
 * Data-access layer tests: CSV contract, missing values, QC flags, summaries,
 * dataset states and placeholder detection. Fixtures below are test inputs
 * only; they are never published to the frontend.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { CLIMATE_COLUMNS, ClimateCsvError, parseClimateCsv } from "../lib/data/climate";
import { baselineMean, growingSeasonSummaries, isInSeason, mean, monthlyClimatology, qcCounts } from "../lib/data/summary";
import {
  loadClimate,
  loadEnvironmentSummary,
  loadRotationComparison,
  validateEnvironmentSummary,
  validateRotationComparison,
} from "../lib/data/loaders";
import { DATASETS, PILOT_REGION } from "../lib/region";
import { MISSING, formatPrecipitation, formatTemperature, formatWetnessFraction } from "../lib/units";

const REPO_ROOT = resolve(__dirname, "../../..");
const HEADER = CLIMATE_COLUMNS.join(",");

function csv(...lines: string[]): string {
  return [HEADER, ...lines].join("\n") + "\n";
}

const OK_ROW = "2024-06-01,20.46,25.36,15,0.75,76.95,1.7,21.51,0.57,0.53,10.18,ok,";

describe("climate_daily.csv parser", () => {
  it("parses the contract columns with exact units", () => {
    const [r] = parseClimateCsv(csv(OK_ROW));
    expect(r).toMatchObject({ date: "2024-06-01", tmean_c: 20.46, tmax_c: 25.36, tmin_c: 15, precip_mm: 0.75, rh_pct: 76.95, wind_ms: 1.7, srad_mj_m2: 21.51, soil_wet_top: 0.57, soil_wet_root: 0.53, gdd_c: 10.18, qcFlag: "ok", qcFields: [] });
  });

  it("turns empty cells into null, never zero", () => {
    const [r] = parseClimateCsv(csv("2024-06-02,,25,15,,70,2,20,,0.5,,missing,tmean_c;precip_mm;soil_wet_top"));
    expect(r.tmean_c).toBeNull();
    expect(r.precip_mm).toBeNull();
    expect(r.soil_wet_top).toBeNull();
    expect(r.gdd_c).toBeNull();
    expect(r.tmax_c).toBe(25);
    expect(r.qcFlag).toBe("missing");
    expect(r.qcFields).toEqual(["tmean_c", "precip_mm", "soil_wet_top"]);
  });

  it("keeps real zeros as zero", () => {
    const [r] = parseClimateCsv(csv("2024-01-01,-5,0,-10,0,80,3,5,0.6,0.6,0,ok,"));
    expect(r.precip_mm).toBe(0);
    expect(r.gdd_c).toBe(0);
  });

  it("accepts CRLF line endings", () => {
    expect(parseClimateCsv(`${HEADER}\r\n${OK_ROW}\r\n`)).toHaveLength(1);
  });

  it("rejects anything outside the contract", () => {
    const cases: Array<[string, RegExp]> = [
      ["", /empty/],
      [`${HEADER.replace("precip_mm", "rain")}\n${OK_ROW}`, /Unexpected header/],
      [`${HEADER}\n`, /no data rows/],
      [csv(OK_ROW.replace("20.46", "abc")), /not a number/],
      [csv(OK_ROW.replace("20.46", "NaN")), /not a number/],
      [csv(OK_ROW + ",extra"), /expected 13 fields/],
      [csv(OK_ROW.replace(",ok,", ",bad,")), /unknown qc_flag/],
      [csv(OK_ROW.replace("2024-06-01", "2024-13-40")), /invalid date/],
      [csv(OK_ROW, OK_ROW), /unique and increasing/],
      [csv(OK_ROW.replace("20.46", '"20.46"')), /quoted/],
    ];
    for (const [input, msg] of cases) {
      expect(() => parseClimateCsv(input), String(msg)).toThrow(ClimateCsvError);
      expect(() => parseClimateCsv(input)).toThrow(msg);
    }
  });
});

describe("display of missing values", () => {
  it("renders null as unavailable in every formatter", () => {
    const [r] = parseClimateCsv(csv("2024-06-02,,,,,,,,,,,missing,tmean_c;tmax_c;tmin_c;precip_mm;rh_pct;wind_ms;srad_mj_m2;soil_wet_top;soil_wet_root"));
    expect(formatTemperature(r.tmean_c, "metric")).toBe(MISSING);
    expect(formatPrecipitation(r.precip_mm, "imperial")).toBe(MISSING);
    expect(formatWetnessFraction(r.soil_wet_root)).toBe(MISSING);
    expect(mean([r], "tmean_c")).toEqual({ value: null, validDays: 0, totalDays: 1 });
  });
});

function day(date: string, overrides: Partial<Record<string, string>> = {}): string {
  const v = { tmean: "20", tmax: "30", tmin: "10", precip: "2", gdd: "10", qc: "ok", fields: "", ...overrides };
  return `${date},${v.tmean},${v.tmax},${v.tmin},${v.precip},70,2,20,0.5,0.5,${v.gdd},${v.qc},${v.fields}`;
}

describe("summaries", () => {
  it("averages only available values", () => {
    const rows = parseClimateCsv(csv(day("2024-06-01", { tmean: "10" }), day("2024-06-02", { tmean: "", qc: "missing", fields: "tmean_c" }), day("2024-06-03", { tmean: "20" })));
    expect(mean(rows, "tmean_c")).toEqual({ value: 15, validDays: 2, totalDays: 3 });
    expect(qcCounts(rows)).toEqual({ ok: 2, missing: 1, out_of_range: 0 });
  });

  it("uses the official 04-01 to 10-31 growing season", () => {
    expect(PILOT_REGION.growingSeason).toEqual({ startMmdd: "04-01", endMmdd: "10-31" });
    expect(isInSeason("2024-03-31", "04-01", "10-31")).toBe(false);
    expect(isInSeason("2024-04-01", "04-01", "10-31")).toBe(true);
    expect(isInSeason("2024-10-31", "04-01", "10-31")).toBe(true);
    expect(isInSeason("2024-11-01", "04-01", "10-31")).toBe(false);
  });

  it("does not report partial season totals as complete", () => {
    const rows = parseClimateCsv(
      csv(day("2023-03-31"), day("2023-04-01", { precip: "5", gdd: "8" }), day("2023-04-02", { precip: "0.5", tmax: "33", gdd: "12" }), day("2024-04-01", { precip: "", qc: "missing", fields: "precip_mm" }))
    );
    const [s2023, s2024] = growingSeasonSummaries(rows, "04-01", "10-31");
    expect(s2023).toMatchObject({ year: 2023, days: 2, missingDays: 0, precipMm: 5.5, gddC: 20, daysTmaxGe32: 1, longestDrySpellDays: 1 });
    expect(s2024.precipMm).toBeNull();
    expect(s2024.longestDrySpellDays).toBeNull();
    expect(s2024.missingDays).toBe(1);
  });

  it("computes the baseline from available seasons only", () => {
    const seasons = [
      { year: 1991, precipMm: 500, gddC: 1500 },
      { year: 1992, precipMm: null, gddC: 1600 },
      { year: 2021, precipMm: 900, gddC: 1700 },
    ] as Parameters<typeof baselineMean>[0];
    expect(baselineMean(seasons, "precipMm", 1991, 2020)).toEqual({ value: 500, years: 1 });
  });

  it("excludes incomplete months from monthly totals instead of zero-filling", () => {
    const rows = parseClimateCsv(csv(day("2024-01-01", { precip: "3" }), day("2024-01-02", { precip: "4" }), day("2024-02-01", { precip: "", qc: "missing", fields: "precip_mm" })));
    const m = monthlyClimatology(rows);
    expect(m[0].precipMm).toBe(7);
    expect(m[1].precipMm).toBeNull();
    expect(m[2].precipMm).toBeNull();
  });
});

function fakeFetch(map: Record<string, { status: number; body: string }>) {
  return async (url: string) => {
    const hit = map[url];
    return hit ? new Response(hit.body, { status: hit.status }) : new Response("Not found", { status: 404 });
  };
}

const base = `/data/${PILOT_REGION.id}`;

describe("loaders", () => {
  it("reports a missing climate file with the producing pipeline step", async () => {
    const r = await loadClimate(fakeFetch({}));
    expect(r.status).toBe("missing");
    if (r.status === "missing") {
      expect(r.url).toBe(`${base}/climate_daily.csv`);
      expect(r.producedBy).toBe(DATASETS.climateDaily.producedBy);
    }
  });

  it("treats an HTML fallback page as missing, not as data", async () => {
    const r = await loadClimate(fakeFetch({ [`${base}/climate_daily.csv`]: { status: 200, body: "<!DOCTYPE html><html></html>" } }));
    expect(r.status).toBe("missing");
  });

  it("explains a file that changed after the production server started (HTTP 400)", async () => {
    const r = await loadClimate(fakeFetch({ [`${base}/climate_daily.csv`]: { status: 400, body: "Bad Request" } }));
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.reason).toMatch(/restart the frontend server/);
  });

  it("reports a CSV that breaks the contract as invalid", async () => {
    const r = await loadClimate(fakeFetch({ [`${base}/climate_daily.csv`]: { status: 200, body: "a,b\n1,2\n" } }));
    expect(r.status).toBe("invalid");
  });

  it("loads a valid CSV", async () => {
    const r = await loadClimate(fakeFetch({ [`${base}/climate_daily.csv`]: { status: 200, body: csv(OK_ROW) } }));
    expect(r.status).toBe("available");
  });

  it("reports missing JSON datasets honestly", async () => {
    expect((await loadEnvironmentSummary(fakeFetch({}))).status).toBe("missing");
    expect((await loadRotationComparison(fakeFetch({}))).status).toBe("missing");
  });
});

/** Extracts the JSON examples from the repository's methodology document. */
function methodologyExamples(): Array<Record<string, unknown>> {
  const md = readFileSync(resolve(REPO_ROOT, "docs/METHODOLOGY.md"), "utf8");
  return [...md.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]) as Record<string, unknown>);
}

describe("placeholder contract examples are never shown as data", () => {
  const examples = methodologyExamples();

  it("rejects the environment_summary.json example (zeros)", () => {
    const env = examples.find((e) => "climate_by_season" in e);
    expect(env).toBeDefined();
    expect(validateEnvironmentSummary(env!).status).toBe("placeholder");
  });

  it("rejects the rotation_comparison.json example (empty fields)", () => {
    const rot = examples.find((e) => "rotations" in e);
    expect(rot).toBeDefined();
    expect(validateRotationComparison(rot!).status).toBe("placeholder");
  });

  it("rejects comparison data for another region (e.g. the Karnataka engine)", () => {
    expect(validateRotationComparison({ region_id: "karnataka", rotations: [], metrics: [] }).status).toBe("invalid");
  });

  it("accepts a fully specified comparison and keeps pending metrics as null", () => {
    const good = {
      schema_version: "1.0",
      region_id: PILOT_REGION.id,
      disclaimer: "Decision support only; not a yield forecast.",
      rotations: [
        { id: "cs2", name: "Corn-Soybean (2-yr)", sequence: ["corn", "soybean"], baseline: true },
        { id: "cso3", name: "Corn-Soybean-Small grain + Red clover (3-yr)", sequence: ["corn", "soybean", "oat_redclover"], baseline: false },
      ],
      metrics: [
        { rotation_id: "cso3", metric: "corn_yield_vs_baseline_pct", value: 0, provenance: "computed", citation: "test fixture", applicability: "test", confidence: "low", status: "supported" },
        { rotation_id: "cso3", metric: "water_demand", value: null, provenance: "pending", citation: null, applicability: null, confidence: null, status: "pending" },
      ],
    };
    expect(validateRotationComparison(good).status).toBe("available");
    expect(validateRotationComparison({ ...good, metrics: [{ ...good.metrics[1], value: 3 }] }).status).toBe("invalid");
  });

  it("rejects any metric on the baseline rotation (cs2)", () => {
    const base = {
      schema_version: "1.0",
      region_id: PILOT_REGION.id,
      disclaimer: "Decision support only; not a yield forecast.",
      rotations: [
        { id: "cs2", name: "Corn-Soybean (2-yr)", sequence: ["corn", "soybean"], baseline: true },
        { id: "cso3", name: "Corn-Soybean-Small grain + Red clover (3-yr)", sequence: ["corn", "soybean", "oat_redclover"], baseline: false },
      ],
    };
    const supported = { rotation_id: "cs2", metric: "corn_yield_vs_baseline_pct", value: 0, provenance: "computed", citation: "test fixture", applicability: "test", confidence: "low", status: "supported" };
    const pendingOnBaseline = { rotation_id: "cs2", metric: "water_demand", value: null, provenance: "pending", citation: null, applicability: null, confidence: null, status: "pending" };
    for (const metric of [supported, pendingOnBaseline]) {
      const result = validateRotationComparison({ ...base, metrics: [metric] });
      expect(result.status).toBe("invalid");
      if (result.status === "invalid") expect(result.reason).toMatch(/baseline rotation "cs2"/);
    }
  });

  it("requires exactly one baseline rotation", () => {
    const rot = (id: string, baseline: boolean) => ({ id, name: id, sequence: ["corn", "soybean"], baseline });
    const file = (rotations: unknown[]) => ({ schema_version: "1.0", region_id: PILOT_REGION.id, disclaimer: "Decision support only; not a yield forecast.", rotations, metrics: [] });
    expect(validateRotationComparison(file([rot("cs2", true), rot("cso3", false)])).status).toBe("available");
    expect(validateRotationComparison(file([rot("cs2", false), rot("cso3", false)])).status).toBe("invalid");
    expect(validateRotationComparison(file([rot("cs2", true), rot("cso3", true)])).status).toBe("invalid");
  });
});

describe("official configuration", () => {
  it("matches config/pilot_region.json", () => {
    const cfg = JSON.parse(readFileSync(resolve(REPO_ROOT, "config/pilot_region.json"), "utf8"));
    expect(PILOT_REGION.id).toBe(cfg.region.id);
    expect(PILOT_REGION.fips).toBe(cfg.region.fips);
    expect(PILOT_REGION.ssurgoAreaSymbol).toBe(cfg.region.ssurgo_area_symbol);
    expect(PILOT_REGION.internalPoint.latitude).toBe(cfg.region.internal_point.latitude);
    expect(PILOT_REGION.internalPoint.longitude).toBe(cfg.region.internal_point.longitude);
    expect(PILOT_REGION.landAreaKm2).toBe(cfg.region.land_area_km2);
    expect(PILOT_REGION.climateStart).toBe(cfg.analysis_period.climate_start);
    expect(PILOT_REGION.climateEnd).toBe(cfg.analysis_period.climate_end);
    expect(PILOT_REGION.climateBaseline).toBe(cfg.analysis_period.climate_baseline);
    expect(PILOT_REGION.growingSeason.startMmdd).toBe(cfg.analysis_period.growing_season.start_mmdd);
    expect(PILOT_REGION.growingSeason.endMmdd).toBe(cfg.analysis_period.growing_season.end_mmdd);
  });
});

const REAL_CSV = resolve(REPO_ROOT, "data/processed", PILOT_REGION.id, "climate_daily.csv");

describe.skipIf(!existsSync(REAL_CSV))("real pipeline output (local only)", () => {
  it("parses the generated climate_daily.csv completely", () => {
    const rows = parseClimateCsv(readFileSync(REAL_CSV, "utf8"));
    expect(rows[0].date).toBe(PILOT_REGION.climateStart);
    expect(rows[rows.length - 1].date).toBe(PILOT_REGION.climateEnd);
    expect(rows).toHaveLength(12784);
    const seasons = growingSeasonSummaries(rows, "04-01", "10-31");
    expect(seasons).toHaveLength(35);
    expect(seasons.every((s) => s.days === 214)).toBe(true);
  });
});
