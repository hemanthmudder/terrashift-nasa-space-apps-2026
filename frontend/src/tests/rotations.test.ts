/**
 * rotation_comparison.json engine sections: profiles, input readiness,
 * pooled research comparisons and evidence sources. Synthetic fixtures are
 * labelled as such; they are test inputs only and never published.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { validateRotationComparison, type RotationComparison } from "../lib/data/loaders";
import { comparisonsIncluding, formatRelativeValue, isPendingMetric, metricLabel, pooledGroupLabel } from "../lib/data/rotations";
import { PILOT_REGION } from "../lib/region";

const PUBLISHED = resolve(__dirname, "../../public/data", PILOT_REGION.id, "rotation_comparison.json");

const ROTATIONS = [
  { id: "cs2", name: "Corn-Soybean (2-yr)", sequence: ["corn", "soybean"], baseline: true },
  { id: "cso3", name: "Corn-Soybean-Small grain + Red clover (3-yr)", sequence: ["corn", "soybean", "oat_redclover"], baseline: false },
  { id: "csoa4", name: "Corn-Soybean-Small grain + Alfalfa-Alfalfa (4-yr)", sequence: ["corn", "soybean", "oat_alfalfa", "alfalfa"], baseline: false },
];

const pending = (rotation_id: string, metric: string) => ({
  rotation_id, metric, value: null, provenance: "pending", citation: null, applicability: null, confidence: null, status: "pending",
});

const SYNTHETIC_CITATION = "SYNTHETIC TEST FIXTURE - not real evidence";

const syntheticComparison = (overrides: Record<string, unknown> = {}) => ({
  comparison_id: "synthetic_pooled_1",
  metric: "corn_yield_vs_baseline_pct",
  value: 1.5,
  unit: "percent_vs_comparator",
  comparison_group: ["cso3", "csoa4"],
  comparator: "cs2",
  pooled: true,
  provenance: "literature",
  citation: SYNTHETIC_CITATION,
  applicability: "Test fixture only.",
  confidence: "low",
  evidence_scope: "other_region_research",
  location: "Test location",
  study_period: "2000-2001",
  comparison: "Test comparison",
  management_differences: "Test management differences",
  source_url: "https://example.invalid/test",
  status: "supported",
  ...overrides,
});

function baseFile(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: "1.0",
    region_id: PILOT_REGION.id,
    disclaimer: "Decision support only; not a yield forecast.",
    rotations: ROTATIONS,
    metrics: ["cso3", "csoa4"].flatMap((r) => ["corn_yield_vs_baseline_pct", "water_demand"].map((m) => pending(r, m))),
    research_comparisons: [],
    evidence_sources: [],
    ...extra,
  };
}

describe("published rotation_comparison.json (read-only)", () => {
  it.skipIf(!existsSync(PUBLISHED))("validates and keeps every metric pending", () => {
    const raw = JSON.parse(readFileSync(PUBLISHED, "utf8"));
    const result = validateRotationComparison(raw);
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    const data = result.data;
    expect(data.rotations.map((r) => r.id)).toEqual(["cs2", "cso3", "csoa4"]);
    expect(data.metrics).toHaveLength(14);
    expect(data.metrics.every(isPendingMetric)).toBe(true);
    expect(data.rotation_profiles?.map((p) => p.duration_years)).toEqual([2, 3, 4]);
    expect(data.rotation_profiles?.[2].phases.map((p) => p.crop)).toEqual(["corn", "soybean", "oat_alfalfa", "alfalfa"]);
    expect(data.input_readiness?.climate.status).toBe("available");
    expect(data.input_readiness?.soils.status).toBe("pending");
    expect(data.input_readiness?.land_cover.status).toBe("pending");
    expect(data.research_comparisons).toEqual([]);
  });
});

describe("backward compatibility", () => {
  it("accepts a file without any engine sections", () => {
    const { research_comparisons, evidence_sources, ...old } = baseFile();
    void research_comparisons;
    void evidence_sources;
    expect(validateRotationComparison(old).status).toBe("available");
  });

  it("accepts metrics without a unit field (the engine does not emit one)", () => {
    const file = baseFile();
    expect((file.metrics as Array<Record<string, unknown>>).every((m) => !("unit" in m))).toBe(true);
    expect(validateRotationComparison(file).status).toBe("available");
  });
});

describe("pending metrics are never measured results", () => {
  it("treats null values or pending status as pending", () => {
    expect(isPendingMetric(pending("cso3", "erosion") as never)).toBe(true);
    expect(isPendingMetric({ ...pending("cso3", "erosion"), value: 2, status: "pending" } as never)).toBe(true);
  });

  it("rejects a pending metric that carries a value", () => {
    const file = baseFile();
    (file.metrics as Array<Record<string, unknown>>)[0].value = 4;
    expect(validateRotationComparison(file).status).toBe("invalid");
  });

  it("rejects an invalid confidence on a supported metric", () => {
    const file = baseFile();
    (file.metrics as Array<Record<string, unknown>>)[0] = {
      rotation_id: "cso3", metric: "erosion", value: 1, provenance: "computed",
      citation: SYNTHETIC_CITATION, applicability: "test", confidence: "very high", status: "supported",
    };
    expect(validateRotationComparison(file).status).toBe("invalid");
  });
});

describe("pooled research comparisons", () => {
  it("accepts an approved pooled comparison and links it to group members by ID only", () => {
    const result = validateRotationComparison(baseFile({ research_comparisons: [syntheticComparison()] }));
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(comparisonsIncluding(result.data, "cso3").map((c) => c.comparison_id)).toEqual(["synthetic_pooled_1"]);
    expect(comparisonsIncluding(result.data, "csoa4")).toHaveLength(1);
    expect(comparisonsIncluding(result.data, "cs2")).toHaveLength(0);
    expect(result.data.metrics.every(isPendingMetric)).toBe(true);
    expect(pooledGroupLabel(result.data, result.data.research_comparisons![0])).toBe(
      "Corn-Soybean-Small grain + Red clover (3-yr) + Corn-Soybean-Small grain + Alfalfa-Alfalfa (4-yr) (pooled) vs Corn-Soybean (2-yr)",
    );
  });

  const invalid: Array<[string, Record<string, unknown>, RegExp]> = [
    ["unapproved (pending) comparison", { status: "pending" }, /pooled and supported/],
    ["not pooled", { pooled: false }, /pooled and supported/],
    ["single-rotation group", { comparison_group: ["cso3"] }, /at least two distinct/],
    ["duplicate group members", { comparison_group: ["cso3", "cso3"] }, /at least two distinct/],
    ["unknown group member", { comparison_group: ["cso3", "cso9"] }, /non-baseline rotations \(invalid: cso9\)/],
    ["baseline included in comparison_group", { comparison_group: ["cs2", "cso3"], comparator: "csoa4" }, /non-baseline rotations \(invalid: cs2\)/],
    ["comparator inside group", { comparator: "cso3" }, /comparator must be the baseline/],
    ["unknown comparator", { comparator: "x" }, /comparator must be the baseline/],
    ["NaN value", { value: Number.NaN }, /finite/],
    ["Infinity value", { value: Number.POSITIVE_INFINITY }, /finite/],
    ["missing citation", { citation: null }, /citation, applicability and unit/],
    ["missing applicability", { applicability: "  " }, /citation, applicability and unit/],
    ["missing unit", { unit: null }, /citation, applicability and unit/],
    ["invalid provenance", { provenance: "pending" }, /provenance/],
    ["invalid confidence", { confidence: "certain" }, /confidence/],
  ];
  for (const [name, overrides, reason] of invalid) {
    it(`rejects ${name}`, () => {
      const result = validateRotationComparison(baseFile({ research_comparisons: [syntheticComparison(overrides)] }));
      expect(result.status).toBe("invalid");
      if (result.status === "invalid") expect(result.reason).toMatch(reason);
    });
  }

  it("rejects a comparator that is a known non-baseline rotation outside the group", () => {
    const rotations = [...ROTATIONS, { id: "cx5", name: "Extra test rotation", sequence: ["corn", "soybean"], baseline: false }];
    const result = validateRotationComparison(baseFile({ rotations, research_comparisons: [syntheticComparison({ comparator: "cx5" })] }));
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") expect(result.reason).toMatch(/comparator must be the baseline rotation "cs2"/);
  });

  for (const field of ["evidence_scope", "location", "study_period", "comparison", "management_differences", "source_url"]) {
    it(`requires ${field} for literature comparisons`, () => {
      const result = validateRotationComparison(baseFile({ research_comparisons: [syntheticComparison({ [field]: null })] }));
      expect(result.status).toBe("invalid");
      if (result.status === "invalid") expect(result.reason).toMatch(new RegExp(`literature evidence requires ${field}`));
    });
  }

  it("does not require literature context for computed comparisons", () => {
    const computed = syntheticComparison({
      provenance: "computed", evidence_scope: null, location: null, study_period: null,
      comparison: null, management_differences: null, source_url: null,
    });
    expect(validateRotationComparison(baseFile({ research_comparisons: [computed] })).status).toBe("available");
  });

  it("still accepts a valid pooled comparison against the baseline", () => {
    const result = validateRotationComparison(baseFile({ research_comparisons: [syntheticComparison()] }));
    expect(result.status).toBe("available");
  });

  it("rejects duplicate comparison IDs", () => {
    const file = baseFile({ research_comparisons: [syntheticComparison(), syntheticComparison()] });
    expect(validateRotationComparison(file).status).toBe("invalid");
  });

  it("rejects a pooled result restated on an individual rotation", () => {
    const file = baseFile({ research_comparisons: [syntheticComparison()] });
    (file.metrics as Array<Record<string, unknown>>)[0] = {
      rotation_id: "cso3", metric: "corn_yield_vs_baseline_pct", value: 1.5, provenance: "literature",
      citation: SYNTHETIC_CITATION, applicability: "x", confidence: "low", status: "supported",
    };
    const result = validateRotationComparison(file);
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") expect(result.reason).toMatch(/pooled/);
  });
});

describe("profiles, readiness and sources validation", () => {
  it("rejects a profile for an unknown rotation or with malformed phases", () => {
    const profile = {
      rotation_id: "cso3", name: "x", baseline: false, compared_with: "cs2", duration_years: 3,
      phases: [{ year: 1, crop: "corn", description: "Corn" }], crops: ["corn"], includes_forage_legume_phase: true,
      supported_metrics: [], pending_metrics: [], pooled_research_comparisons: [], comparator_in_research_comparisons: [],
      evidence_summary: "x",
    };
    expect(validateRotationComparison(baseFile({ rotation_profiles: [profile] })).status).toBe("available");
    expect(validateRotationComparison(baseFile({ rotation_profiles: [{ ...profile, rotation_id: "zzz" }] })).status).toBe("invalid");
    expect(validateRotationComparison(baseFile({ rotation_profiles: [{ ...profile, phases: [{ year: "1" }] }] })).status).toBe("invalid");
  });

  it("rejects malformed input_readiness and evidence_sources", () => {
    const ok = {
      climate: { status: "available", source: "nasa_power", seasons: 35, first_year: 1991, last_year: 2025, seasons_with_missing_days: [], used_for: "x" },
      soils: { status: "pending", source: "ssurgo", reason: "x", used_for: null },
      land_cover: { status: "pending", source: "cdl", reason: "x", used_for: null },
    };
    expect(validateRotationComparison(baseFile({ input_readiness: ok })).status).toBe("available");
    expect(validateRotationComparison(baseFile({ input_readiness: { ...ok, soils: { ...ok.soils, status: "estimated" } } })).status).toBe("invalid");
    expect(validateRotationComparison(baseFile({ evidence_sources: [{ metrics: [] }] })).status).toBe("invalid");
  });
});

describe("display helpers", () => {
  it("formats metric labels and signed relative values without adding data", () => {
    expect(metricLabel("herbicide_use_vs_baseline_pct")).toBe("Herbicide use vs baseline");
    expect(metricLabel("new_metric_name")).toBe("new metric name");
    expect(formatRelativeValue(4, "percent_vs_comparator")).toBe("+4%");
    expect(formatRelativeValue(-88, "percent_vs_comparator")).toBe("-88%");
    expect(formatRelativeValue(2, "kg_per_ha")).toBe("+2 kg per ha");
    expect(formatRelativeValue(0, null)).toBe("0");
  });

  it("returns no comparisons for files without the section", () => {
    const data = { ...baseFile(), research_comparisons: undefined } as unknown as RotationComparison;
    expect(comparisonsIncluding(data, "cso3")).toEqual([]);
  });
});
