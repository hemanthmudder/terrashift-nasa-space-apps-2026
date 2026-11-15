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
export interface RotationMetric {
  rotation_id: string;
  metric: string;
  value: number | null;
  provenance: "literature" | "computed" | "assumption" | "pending";
  citation: string | null;
  applicability: string | null;
  confidence: string | null;
  status?: "supported" | "pending";
}

export interface RotationComparison {
  schema_version: string;
  region_id: string;
  disclaimer: string;
  rotations: Array<{ id: string; name: string; sequence: string[]; baseline?: boolean }>;
  metrics: RotationMetric[];
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
  const metrics = raw.metrics;
  if (!Array.isArray(metrics)) return { status: "invalid", url, reason: "metrics must be an array." };
  const ids = new Set((rotations as Array<{ id: string }>).map((r) => r.id));
  for (const m of metrics) {
    if (!isRecord(m) || typeof m.rotation_id !== "string" || !ids.has(m.rotation_id) || typeof m.metric !== "string") {
      return { status: "invalid", url, reason: "Each metric needs a rotation_id that matches a rotation, and a metric name." };
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
  }
  return { status: "available", data: raw as unknown as RotationComparison, url };
}

export async function loadRotationComparison(fetchImpl: FetchLike = defaultFetch): Promise<LoadResult<RotationComparison>> {
  const r = await loadJson("rotationComparison", fetchImpl);
  return r.status === "available" ? validateRotationComparison(r.data, r.url) : r;
}
