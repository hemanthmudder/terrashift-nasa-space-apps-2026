/**
 * Typed browser client for the existing TerraShift route handlers.
 *
 * UI components call these functions instead of using fetch directly, so all
 * error handling lives in one place. No API keys are used or exposed: the
 * routes call NASA POWER server-side.
 */

import { FarmProfile } from "../../types/farm";
import { NASAEnvironmentalData } from "../../types/nasa";
import {
  FarmListRouteSuccess,
  FarmSaveRouteSuccess,
  NasaRequestParams,
  NasaRouteSuccess,
  RecommendationsRequestBody,
  RecommendationsRouteSuccess,
} from "../../types/api";

export type ApiErrorKind = "validation" | "server" | "network" | "invalid_response";

/** Error thrown by every client function. `messages` are safe to show to users. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly messages: string[];

  constructor(kind: ApiErrorKind, messages: string[], status: number | null = null) {
    super(messages.join("; ") || "Request failed.");
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.messages = messages.length ? messages : ["Request failed."];
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Pulls user-facing messages out of either error shape the routes return. */
export function extractErrorMessages(body: unknown): string[] {
  if (!isRecord(body)) return [];
  if (Array.isArray(body.errors)) {
    return body.errors.filter((e): e is string => typeof e === "string" && e.trim() !== "");
  }
  if (typeof body.error === "string" && body.error.trim() !== "") return [body.error];
  return [];
}

async function requestJson(
  url: string,
  init: RequestInit,
  options: ClientOptions
): Promise<unknown> {
  const doFetch: FetchLike = options.fetchImpl ?? ((input, i) => fetch(input, i));
  let response: Response;
  try {
    response = await doFetch(url, { ...init, signal: options.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("network", [
      "Could not reach the TerraShift server. Check your connection and try again.",
    ]);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    throw new ApiError(
      "invalid_response",
      [`The server returned an unreadable response (HTTP ${response.status}).`],
      response.status
    );
  }

  if (!response.ok) {
    const kind: ApiErrorKind = response.status >= 400 && response.status < 500 ? "validation" : "server";
    const messages = extractErrorMessages(body);
    throw new ApiError(
      kind,
      messages.length ? messages : [`Request failed with HTTP ${response.status}.`],
      response.status
    );
  }
  return body;
}

function compactDate(date: string): string {
  return date.replace(/-/g, "");
}

/** GET /api/nasa — NASA POWER daily data and derived indicators for a point. */
export async function getNasaData(
  params: NasaRequestParams,
  options: ClientOptions = {}
): Promise<NASAEnvironmentalData> {
  const query = new URLSearchParams({
    latitude: String(params.latitude),
    longitude: String(params.longitude),
  });
  if (params.startDate) query.set("startDate", compactDate(params.startDate));
  if (params.endDate) query.set("endDate", compactDate(params.endDate));

  const body = await requestJson(`/api/nasa?${query.toString()}`, { method: "GET" }, options);
  if (!isRecord(body) || body.status !== "ok" || !isRecord(body.data)) {
    throw new ApiError("invalid_response", ["NASA data response was missing the expected fields."]);
  }
  return (body as unknown as NasaRouteSuccess).data;
}

/** POST /api/farm — validates and stores a profile (server memory only). */
export async function saveFarmProfile(
  profile: FarmProfile,
  options: ClientOptions = {}
): Promise<FarmProfile> {
  const body = await requestJson(
    "/api/farm",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    },
    options
  );
  if (!isRecord(body) || body.status !== "ok" || !isRecord(body.profile)) {
    throw new ApiError("invalid_response", ["Farm save response was missing the saved profile."]);
  }
  return (body as unknown as FarmSaveRouteSuccess).profile;
}

/** GET /api/farm — profiles saved since the server last started. */
export async function listFarmProfiles(options: ClientOptions = {}): Promise<FarmProfile[]> {
  const body = await requestJson("/api/farm", { method: "GET" }, options);
  if (!isRecord(body) || body.status !== "ok" || !Array.isArray(body.profiles)) {
    throw new ApiError("invalid_response", ["Farm list response was missing the profiles array."]);
  }
  return (body as unknown as FarmListRouteSuccess).profiles;
}

/** POST /api/recommendations — three rotation strategies plus supporting data. */
export async function getRecommendations(
  request: RecommendationsRequestBody,
  options: ClientOptions = {}
): Promise<RecommendationsRouteSuccess> {
  const body = await requestJson(
    "/api/recommendations",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    options
  );
  if (!isRecord(body) || body.status !== "ok" || !Array.isArray(body.recommendations)) {
    throw new ApiError("invalid_response", ["Recommendation response was missing the recommendations."]);
  }
  return body as unknown as RecommendationsRouteSuccess;
}
