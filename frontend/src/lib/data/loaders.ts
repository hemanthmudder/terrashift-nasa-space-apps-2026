/**
 * Data-access layer: loads the datasets published by
 * scripts/copy_data_to_frontend.sh into public/data/<region_id>/.
 *
 * Every loader returns a typed result instead of throwing, and never
 * substitutes sample data. Placeholder contract files (zeros and empty
 * strings, as in docs/METHODOLOGY.md examples) are reported as placeholders,
 * not shown as observations.
 */

import { DATA_BASE_PATH, DATASETS, PILOT_REGION, type DatasetKey } from "../region";
import { ClimateCsvError, parseClimateCsv, type ClimateRow } from "./climate";

export type LoadResult<T> =
  | { status: "available"; data: T; url: string }
  | { status: "missing"; url: string; producedBy: string }
  | { status: "invalid"; url: string; reason: string }
  | { status: "placeholder"; url: string; reason: string }
  | { status: "error"; url: string; reason: string };

type FetchLike = (url: string) => Promise<Response>;

function urlFor(key: DatasetKey): string {
  return `${DATA_BASE_PATH}/${DATASETS[key].file}`;
}

async function fetchText(key: DatasetKey, fetchImpl: FetchLike): Promise<LoadResult<string>> {
  const url = urlFor(key);
  let res: Response;
  try {
    res = await fetchImpl(url);
  } catch {
    return { status: "error", url, reason: "The frontend server could not be reached." };
  }
  if (res.status === 404) return { status: "missing", url, producedBy: DATASETS[key].producedBy };
  // `next start` indexes public/ at startup: a published file that was removed
  // afterwards returns 400 (observed with Next.js 15.5).
  if (res.status === 400) {
    return {
      status: "error",
      url,
      reason: `${DATASETS[key].file} changed after the frontend server started. Run scripts/copy_data_to_frontend.sh, then restart the frontend server.`,
    };
  }
  if (!res.ok) return { status: "error", url, reason: `HTTP ${res.status} while loading ${DATASETS[key].file}.` };
  const text = await res.text();
  // Next.js serves an HTML page for unknown routes in some setups; treat that as missing.
  if (/^\s*<(!doctype|html)/i.test(text)) return { status: "missing", url, producedBy: DATASETS[key].producedBy };
  return { status: "available", data: text, url };
}

const defaultFetch: FetchLike = (url) => fetch(url, { cache: "no-store" });

export async function loadClimate(fetchImpl: FetchLike = defaultFetch): Promise<LoadResult<ClimateRow[]>> {
  const r = await fetchText("climateDaily", fetchImpl);
  if (r.status !== "available") return r;
  try {
    return { status: "available", data: parseClimateCsv(r.data), url: r.url };
  } catch (err) {
    return { status: "invalid", url: r.url, reason: err instanceof ClimateCsvError ? err.message : "The CSV could not be parsed." };
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hasEmptyString(v: unknown): boolean {
  if (v === "") return true;
  if (Array.isArray(v)) return v.some(hasEmptyString);
  if (isRecord(v)) return Object.values(v).some(hasEmptyString);
  return false;
}

async function loadJson(key: DatasetKey, fetchImpl: FetchLike): Promise<LoadResult<Record<string, unknown>>> {
  const r = await fetchText(key, fetchImpl);
  if (r.status !== "available") return r;
  let parsed: unknown;
  try {
    parsed = JSON.parse(r.data);
  } catch {
    return { status: "invalid", url: r.url, reason: `${DATASETS[key].file} is not valid JSON.` };
  }
  if (!isRecord(parsed)) return { status: "invalid", url: r.url, reason: `${DATASETS[key].file} must be a JSON object.` };
  return { status: "available", data: parsed, url: r.url };
}

/** environment_summary.json (§4.3). Only typed loosely: the frontend shows validated fields only. */
export interface EnvironmentSummary {
  region: { id: string };
  climate_by_season: Array<Record<string, unknown>>;
  soils?: Record<string, unknown>;
  land_cover?: Record<string, unknown>;
  sources: Array<{ id: string; url: string; version: string; retrieved: string }>;
}

export function validateEnvironmentSummary(raw: Record<string, unknown>, url = ""): LoadResult<EnvironmentSummary> {
  const region = raw.region;
  if (!isRecord(region) || region.id !== PILOT_REGION.id) {
    return { status: "invalid", url, reason: `region.id must be "${PILOT_REGION.id}".` };
  }
  const seasons = raw.climate_by_season;
  if (!Array.isArray(seasons) || seasons.length === 0) {
    return { status: "invalid", url, reason: "climate_by_season must be a non-empty array." };
  }
  const numbers = seasons.flatMap((s) => (isRecord(s) ? Object.values(s).filter((v): v is number => typeof v === "number" && v !== s.year) : []));
  if (numbers.length === 0 || numbers.every((n) => n === 0) || hasEmptyString(raw.sources) || !Array.isArray(raw.sources) || raw.sources.length === 0) {
    return { status: "placeholder", url, reason: "The file still contains the contract's placeholder values (zeros / empty sources)." };
  }
  return { status: "available", data: raw as unknown as EnvironmentSummary, url };
}

export async function loadEnvironmentSummary(fetchImpl: FetchLike = defaultFetch): Promise<LoadResult<EnvironmentSummary>> {
  const r = await loadJson("environmentSummary", fetchImpl);
  return r.status === "available" ? validateEnvironmentSummary(r.data, r.url) : r;
}

/** rotation_comparison.json (§4.4). */
export type Provenance = "literature" | "computed" | "assumption" | "pending";
export type Confidence = "low" | "medium" | "high";

export interface RotationMetric {
  rotation_id: string;
  metric: string;
  value: number | null;
  /** Not emitted by the current engine; accepted if a future file adds it. */
  unit?: string | null;
  provenance: Provenance;
  citation: string | null;
  applicability: string | null;
  confidence: string | null;
  status?: "supported" | "pending";
}

export interface RotationPhase {
  year: number;
  crop: string;
  description: string;
}

/** Structural description of one rotation (src/engine/rotation_engine.py). Holds no performance values. */
export interface RotationProfile {
  rotation_id: string;
  name: string;
  baseline: boolean;
  compared_with: string | null;
  duration_years: number;
  phases: RotationPhase[];
  crops: string[];
  includes_forage_legume_phase: boolean;
  supported_metrics: string[];
  pending_metrics: string[];
  /** IDs of pooled research comparisons this rotation is part of (values live in research_comparisons). */
  pooled_research_comparisons: string[];
  comparator_in_research_comparisons: string[];
  evidence_summary: string;
}

export type ReadinessStatus = "available" | "pending";

export interface ClimateReadiness {
  status: ReadinessStatus;
  source: string;
  seasons: number;
  first_year: number;
  last_year: number;
  seasons_with_missing_days: number[];
  used_for: string | null;
}

export interface SourceReadiness {
  status: ReadinessStatus;
  source: string;
  reason: string;
  used_for: string | null;
  estimate_type?: string;
}

export interface InputReadiness {
  climate: ClimateReadiness;
  soils: SourceReadiness;
  land_cover: SourceReadiness;
}

/**
 * A published result for several rotations together versus a comparator
 * (e.g. Davis et al. 2012 pools the 3-yr and 4-yr rotations against the 2-yr).
 * It is not an effect of any single rotation, so it is never shown on one.
 */
export interface ResearchComparison {
  comparison_id: string;
  metric: string;
  value: number;
  unit: string;
  comparison_group: string[];
  comparator: string;
  pooled: true;
  provenance: Exclude<Provenance, "pending">;
  citation: string;
  applicability: string;
  confidence: Confidence;
  evidence_scope: string | null;
  location: string | null;
  study_period: string | null;
  comparison: string | null;
  management_differences: string | null;
  source_url: string | null;
  status: "supported";
}

export interface EvidenceSource {
  citation: string;
  provenance: Exclude<Provenance, "pending">;
  evidence_scope: string | null;
  location: string | null;
  study_period: string | null;
  management_differences: string | null;
  source_url: string | null;
  metrics: string[];
  research_comparisons?: string[];
}

export interface RotationComparison {
  schema_version: string;
  region_id: string;
  disclaimer: string;
  rotations: Array<{ id: string; name: string; sequence: string[]; baseline?: boolean }>;
  metrics: RotationMetric[];
  // Added by the rotation engine; optional so older files and fixtures still load.
  rotation_profiles?: RotationProfile[];
  input_readiness?: InputReadiness;
  research_comparisons?: ResearchComparison[];
  evidence_sources?: EvidenceSource[];
}

const SUPPORTED_PROVENANCE = ["literature", "computed", "assumption"];
const CONFIDENCE_LEVELS = ["low", "medium", "high"];
/** Context every literature research comparison must carry (src/engine/evidence.py). */
const LITERATURE_FIELDS = ["evidence_scope", "location", "study_period", "comparison", "management_differences", "source_url"] as const;

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Returns a reason string if the optional engine sections are malformed, otherwise null. */
function rotationExtensionsProblem(raw: Record<string, unknown>, ids: Set<string>, baselineId: string, metrics: unknown[]): string | null {
  if (raw.rotation_profiles !== undefined) {
    const profiles = raw.rotation_profiles;
    if (!Array.isArray(profiles)) return "rotation_profiles must be an array.";
    for (const p of profiles) {
      if (
        !isRecord(p) || typeof p.rotation_id !== "string" || !ids.has(p.rotation_id) ||
        typeof p.name !== "string" || typeof p.baseline !== "boolean" ||
        !(p.compared_with === null || (typeof p.compared_with === "string" && ids.has(p.compared_with))) ||
        !Number.isInteger(p.duration_years) || (p.duration_years as number) < 1 ||
        !Array.isArray(p.phases) ||
        !p.phases.every((ph) => isRecord(ph) && Number.isInteger(ph.year) && typeof ph.crop === "string" && typeof ph.description === "string") ||
        !isStringArray(p.crops) || typeof p.includes_forage_legume_phase !== "boolean" ||
        !isStringArray(p.supported_metrics) || !isStringArray(p.pending_metrics) ||
        !isStringArray(p.pooled_research_comparisons) || !isStringArray(p.comparator_in_research_comparisons) ||
        typeof p.evidence_summary !== "string"
      ) {
        return "Each rotation profile needs a known rotation_id and the documented fields (phases, crops, metric lists, evidence summary).";
      }
    }
  }

  if (raw.input_readiness !== undefined) {
    const ir = raw.input_readiness;
    if (!isRecord(ir)) return "input_readiness must be an object.";
    for (const key of ["climate", "soils", "land_cover"]) {
      const entry = ir[key];
      if (!isRecord(entry) || (entry.status !== "available" && entry.status !== "pending") || typeof entry.source !== "string") {
        return `input_readiness.${key} needs status "available" or "pending" and a source.`;
      }
    }
    const climate = ir.climate as Record<string, unknown>;
    if (!Number.isInteger(climate.seasons) || !Number.isInteger(climate.first_year) || !Number.isInteger(climate.last_year)) {
      return "input_readiness.climate needs whole-number seasons, first_year and last_year.";
    }
  }

  const pooledKeys = new Set<string>();
  if (raw.research_comparisons !== undefined) {
    const comparisons = raw.research_comparisons;
    if (!Array.isArray(comparisons)) return "research_comparisons must be an array.";
    const seen = new Set<string>();
    for (const c of comparisons) {
      if (!isRecord(c) || !isNonEmptyString(c.comparison_id) || typeof c.metric !== "string") {
        return "Each research comparison needs a comparison_id and a metric.";
      }
      const label = `Research comparison "${c.comparison_id}"`;
      if (seen.has(c.comparison_id)) return `${label} appears more than once.`;
      seen.add(c.comparison_id);
      // Only approved evidence may be published; anything else is a contract violation.
      if (c.status !== "supported" || c.pooled !== true) return `${label} must be pooled and supported (approved).`;
      const group = c.comparison_group;
      if (!isStringArray(group) || group.length < 2 || new Set(group).size !== group.length) {
        return `${label} needs at least two distinct rotation IDs in comparison_group.`;
      }
      const badMembers = group.filter((g) => !ids.has(g) || g === baselineId);
      if (badMembers.length > 0) {
        return `${label}: comparison_group members must be known non-baseline rotations (invalid: ${badMembers.join(", ")}).`;
      }
      if (c.comparator !== baselineId) {
        return `${label}: comparator must be the baseline rotation "${baselineId}".`;
      }
      if (!isFiniteNumber(c.value)) return `${label} needs a finite numeric value.`;
      if (!SUPPORTED_PROVENANCE.includes(String(c.provenance))) return `${label} has no valid provenance.`;
      if (!isNonEmptyString(c.citation) || !isNonEmptyString(c.applicability) || !isNonEmptyString(c.unit)) {
        return `${label} needs a citation, applicability and unit.`;
      }
      if (!CONFIDENCE_LEVELS.includes(String(c.confidence))) return `${label} has an invalid confidence level.`;
      if (c.provenance === "literature") {
        const missing = LITERATURE_FIELDS.filter((f) => !isNonEmptyString(c[f]));
        if (missing.length > 0) return `${label}: literature evidence requires ${missing.join(", ")}.`;
      }
      for (const g of group) pooledKeys.add(`${g}|${c.metric}|${c.citation.trim()}`);
    }
  }

  // A pooled result must never be restated as a single rotation's measured effect.
  for (const m of metrics) {
    if (!isRecord(m) || m.value === null || typeof m.citation !== "string") continue;
    if (pooledKeys.has(`${m.rotation_id}|${m.metric}|${m.citation.trim()}`)) {
      return `Metric "${m.metric}" for ${String(m.rotation_id)} restates a pooled research comparison.`;
    }
  }

  if (raw.evidence_sources !== undefined) {
    const sources = raw.evidence_sources;
    if (!Array.isArray(sources) || !sources.every((s) => isRecord(s) && isNonEmptyString(s.citation) && isStringArray(s.metrics))) {
      return "evidence_sources must be an array of entries with a citation and a metrics list.";
    }
  }
  return null;
}

export const REQUIRED_DISCLAIMER = "Decision support only; not a yield forecast.";

export function validateRotationComparison(raw: Record<string, unknown>, url = ""): LoadResult<RotationComparison> {
  if (raw.region_id !== PILOT_REGION.id) return { status: "invalid", url, reason: `region_id must be "${PILOT_REGION.id}".` };
  // The contract example in METHODOLOGY.md §4.4 marks unfilled fields with "".
  if (hasEmptyString(raw)) {
    return { status: "placeholder", url, reason: "The file contains empty placeholder fields from the contract example." };
  }
  const rotations = raw.rotations;
  if (
    !Array.isArray(rotations) || rotations.length === 0 ||
    !rotations.every((r) => isRecord(r) && typeof r.id === "string" && r.id && typeof r.name === "string" && r.name && Array.isArray(r.sequence) && r.sequence.length > 0)
  ) {
    return { status: "invalid", url, reason: "rotations must be a non-empty list with id, name and sequence." };
  }
  // Every comparison is relative to exactly one baseline rotation (§4.4).
  const baselineIds = (rotations as Array<Record<string, unknown>>).filter((r) => r.baseline === true).map((r) => r.id as string);
  if (baselineIds.length !== 1) {
    return { status: "invalid", url, reason: `Exactly one rotation must have baseline: true (found ${baselineIds.length}).` };
  }
  const baselineId = baselineIds[0];
  const metrics = raw.metrics;
  if (!Array.isArray(metrics)) return { status: "invalid", url, reason: "metrics must be an array." };
  const ids = new Set((rotations as Array<{ id: string }>).map((r) => r.id));
  for (const m of metrics) {
    if (!isRecord(m) || typeof m.rotation_id !== "string" || !ids.has(m.rotation_id) || typeof m.metric !== "string") {
      return { status: "invalid", url, reason: "Each metric needs a rotation_id that matches a rotation, and a metric name." };
    }
    if (m.rotation_id === baselineId) {
      return { status: "invalid", url, reason: `Metric "${m.metric}" is on the baseline rotation "${baselineId}"; metrics are expressed relative to the baseline.` };
    }
    const pending = m.status === "pending" || m.provenance === "pending";
    if (pending) {
      if (m.value !== null) return { status: "invalid", url, reason: `Pending metric "${m.metric}" must have value null.` };
      continue;
    }
    if (!["literature", "computed", "assumption"].includes(String(m.provenance))) {
      return { status: "invalid", url, reason: `Metric "${m.metric}" has no valid provenance.` };
    }
    if (typeof m.value !== "number" || !Number.isFinite(m.value)) {
      return { status: "invalid", url, reason: `Metric "${m.metric}" needs a numeric value.` };
    }
    if (typeof m.citation !== "string" || m.citation.trim() === "") {
      return { status: "placeholder", url, reason: `Metric "${m.metric}" has no citation or computation reference.` };
    }
    if (m.confidence !== null && m.confidence !== undefined && !CONFIDENCE_LEVELS.includes(String(m.confidence))) {
      return { status: "invalid", url, reason: `Metric "${m.metric}" has an invalid confidence level.` };
    }
  }
  const problem = rotationExtensionsProblem(raw, ids, baselineId, metrics);
  if (problem) return { status: "invalid", url, reason: problem };
  return { status: "available", data: raw as unknown as RotationComparison, url };
}

export async function loadRotationComparison(fetchImpl: FetchLike = defaultFetch): Promise<LoadResult<RotationComparison>> {
  const r = await loadJson("rotationComparison", fetchImpl);
  return r.status === "available" ? validateRotationComparison(r.data, r.url) : r;
}
