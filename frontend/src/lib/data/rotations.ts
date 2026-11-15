/**
 * Display helpers for rotation_comparison.json. Pure functions: they format
 * what the file contains and never add values, scores or rankings.
 */

import type { ResearchComparison, RotationComparison, RotationMetric } from "./loaders";

const METRIC_LABELS: Record<string, string> = {
  corn_yield_vs_baseline_pct: "Corn yield vs baseline",
  soybean_yield_vs_baseline_pct: "Soybean yield vs baseline",
  herbicide_use_vs_baseline_pct: "Herbicide use vs baseline",
  profitability: "Profitability",
  water_demand: "Water demand",
  nitrogen_requirement_or_losses: "Nitrogen requirement or losses",
  erosion: "Erosion",
};

/** Human-readable metric name; unknown names fall back to the raw name with spaces. */
export function metricLabel(metric: string): string {
  return METRIC_LABELS[metric] ?? metric.replace(/_/g, " ");
}

/** A metric is a measured/published result only when it has a value and is not pending. */
export function isPendingMetric(m: RotationMetric): boolean {
  return m.value === null || m.status === "pending" || m.provenance === "pending";
}

/** Rotation display name for an ID, falling back to the ID itself. */
export function rotationName(data: RotationComparison, id: string): string {
  return data.rotations.find((r) => r.id === id)?.name ?? id;
}

/** "A + B vs C" label for a pooled comparison, using rotation names from the file. */
export function pooledGroupLabel(data: RotationComparison, c: Pick<ResearchComparison, "comparison_group" | "comparator">): string {
  return `${c.comparison_group.map((id) => rotationName(data, id)).join(" + ")} (pooled) vs ${rotationName(data, c.comparator)}`;
}

/**
 * Formats a signed relative value. Percent-style units ("percent_vs_comparator",
 * "percent_vs_cs2") are shown as "+4%"; any other unit is appended verbatim.
 */
export function formatRelativeValue(value: number, unit: string | null | undefined): string {
  const signed = value > 0 ? `+${value}` : `${value}`;
  if (!unit) return signed;
  if (unit.startsWith("percent")) return `${signed}%`;
  return `${signed} ${unit.replace(/_/g, " ")}`;
}

/** Research comparisons a rotation belongs to (by ID only; values stay in research_comparisons). */
export function comparisonsIncluding(data: RotationComparison, rotationId: string): ResearchComparison[] {
  return (data.research_comparisons ?? []).filter((c) => c.comparison_group.includes(rotationId));
}
