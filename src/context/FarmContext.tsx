"use client";

/**
 * Holds the farm draft and the results of the last analysis, shared by all
 * pages. The draft is remembered in this browser; API results are kept in
 * memory only, so every session shows fresh backend data.
 *
 * Analysis flow (all calls go to the existing routes, unchanged):
 *  1. POST /api/farm            — when the farm maps to the backend contract
 *  2. GET  /api/nasa            — always (NASA POWER is global)
 *  3. POST /api/recommendations — only inside the calibrated region (Karnataka)
 *
 * Scoring weights and a custom crop sequence are sent with the existing
 * `weights` and `customSequence` request fields. Changing them re-requests
 * recommendations with the NASA data already loaded (no re-save, no re-fetch).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ApiError, getNasaData, getRecommendations, saveFarmProfile } from "@/lib/api/client";
import { EMPTY_DRAFT, toBackendProfile, type FarmDraft } from "@/lib/farm/draft";
import { assessCoverage, type CoverageAssessment } from "@/lib/geo/coverage";
import type { NASAEnvironmentalData } from "@/types/nasa";
import type { RecommendationsRouteSuccess } from "@/types/api";
import type { FarmProfile } from "@/types/farm";
import type { ScoringWeights } from "@/types/recommendation";
import {
  DEFAULT_WEIGHTS,
  buildRecommendationsRequest,
  isValidCustomSequence,
  type CustomSequence,
} from "@/lib/rotation/tuning";

const STORAGE_KEY = "terrashift.farm.v1";
/** The draft used for the last analysis; re-analysed after a page reload. */
const ANALYSED_KEY = "terrashift.analysed.v1";
/** Scoring weights and custom sequence chosen by the user. */
const TUNING_KEY = "terrashift.tuning.v1";

export const ANALYSIS_START = "2021-01-01";
export const ANALYSIS_END = "2025-12-31";

type Phase = "idle" | "loading" | "success" | "error" | "skipped";

export interface Slot<T> {
  phase: Phase;
  data: T | null;
  errors: string[];
  /** Why a step was skipped (phase === "skipped"). */
  reasons: string[];
}

const idle = <T,>(): Slot<T> => ({ phase: "idle", data: null, errors: [], reasons: [] });

export interface FarmContextValue {
  draft: FarmDraft;
  setDraft: (d: FarmDraft) => void;
  /** The draft as it was when the last analysis ran. */
  analysedDraft: FarmDraft | null;
  coverage: CoverageAssessment | null;
  save: Slot<{ id: string }>;
  nasa: Slot<NASAEnvironmentalData>;
  recommendations: Slot<RecommendationsRouteSuccess>;
  analysing: boolean;
  runAnalysis: (draft: FarmDraft) => Promise<void>;
  hydrated: boolean;
  /** Scoring weights sent with every recommendations request. */
  weights: ScoringWeights;
  /** Crop ids evaluated as a custom sequence, or null if none chosen yet. */
  customSequence: CustomSequence | null;
  /** Re-requests recommendations with new weights and/or custom sequence. */
  updateTuning: (changes: { weights?: ScoringWeights; customSequence?: CustomSequence | null }) => Promise<void>;
  /** True while a weights / custom-sequence update is in flight. */
  tuningUpdating: boolean;
  tuningErrors: string[];
}

const FarmContext = createContext<FarmContextValue | null>(null);

function messagesOf(err: unknown, fallback: string): string[] {
  if (err instanceof ApiError) return err.messages;
  if (err instanceof Error && err.message) return [err.message];
  return [fallback];
}

export function FarmProvider({ children }: { children: ReactNode }) {
  const [draft, setDraftState] = useState<FarmDraft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const [analysedDraft, setAnalysedDraft] = useState<FarmDraft | null>(null);
  const [coverage, setCoverage] = useState<CoverageAssessment | null>(null);
  const [save, setSave] = useState<Slot<{ id: string }>>(idle);
  const [nasa, setNasa] = useState<Slot<NASAEnvironmentalData>>(idle);
  const [recommendations, setRecs] = useState<Slot<RecommendationsRouteSuccess>>(idle);
  const [analysing, setAnalysing] = useState(false);
  const runId = useRef(0);
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS);
  const [customSequence, setCustomSequence] = useState<CustomSequence | null>(null);
  const [tuningUpdating, setTuningUpdating] = useState(false);
  const [tuningErrors, setTuningErrors] = useState<string[]>([]);
  // Latest values for async callbacks, plus the inputs of the last successful request.
  const tuningRef = useRef<{ weights: ScoringWeights; customSequence: CustomSequence | null }>({
    weights: DEFAULT_WEIGHTS,
    customSequence: null,
  });
  const lastInputs = useRef<{ profile: FarmProfile; nasaData: NASAEnvironmentalData } | null>(null);
  const tuneId = useRef(0);

  const runAnalysisRef = useRef<((d: FarmDraft) => Promise<void>) | null>(null);

  useEffect(() => {
    const readDraft = (key: string): FarmDraft | null => {
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<FarmDraft>;
        return { ...EMPTY_DRAFT, ...parsed, cropHistory: Array.isArray(parsed.cropHistory) ? parsed.cropHistory : [] };
      } catch {
        return null;
      }
    };
    const saved = readDraft(STORAGE_KEY);
    if (saved) setDraftState(saved);
    try {
      const raw = window.localStorage.getItem(TUNING_KEY);
      if (raw) {
        const t = JSON.parse(raw) as { weights?: Partial<ScoringWeights>; customSequence?: unknown };
        const w = { ...DEFAULT_WEIGHTS };
        for (const k of Object.keys(w) as Array<keyof ScoringWeights>) {
          const v = t.weights?.[k];
          if (typeof v === "number" && Number.isFinite(v) && v > 0) w[k] = v;
        }
        const seq = isValidCustomSequence(t.customSequence) ? t.customSequence : null;
        tuningRef.current = { weights: w, customSequence: seq };
        setWeights(w);
        setCustomSequence(seq);
      }
    } catch {
      /* ignore unreadable storage */
    }
    setHydrated(true);
    // Results are not stored; re-request them from the backend after a reload.
    const analysed = readDraft(ANALYSED_KEY);
    if (analysed && runAnalysisRef.current) void runAnalysisRef.current(analysed);
  }, []);

  const setDraft = useCallback((d: FarmDraft) => {
    setDraftState(d);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const runAnalysis = useCallback(async (d: FarmDraft) => {
    const myRun = ++runId.current;
    const stale = () => myRun !== runId.current;
    setAnalysing(true);
    setAnalysedDraft(d);
    try {
      window.localStorage.setItem(ANALYSED_KEY, JSON.stringify(d));
    } catch {
      /* storage unavailable: results just won't survive a reload */
    }
    const lat = Number(d.latitude);
    const lon = Number(d.longitude);
    const cov = assessCoverage(lat, lon);
    setCoverage(cov);
    setSave({ ...idle(), phase: "loading" });
    setNasa({ ...idle(), phase: "loading" });
    setRecs({ ...idle(), phase: "loading" });
    lastInputs.current = null;
    tuneId.current += 1; // drop any in-flight tuning update for the previous farm
    setTuningUpdating(false);
    setTuningErrors([]);

    const mapping = toBackendProfile(d);

    // 1. Save profile (only possible when it maps to the backend contract).
    if (mapping.profile) {
      try {
        const saved = await saveFarmProfile(mapping.profile);
        if (!stale()) setSave({ ...idle(), phase: "success", data: { id: saved.id ?? "" } });
      } catch (err) {
        if (!stale()) setSave({ ...idle(), phase: "error", errors: messagesOf(err, "Could not save the farm.") });
      }
    } else if (!stale()) {
      setSave({ ...idle(), phase: "skipped", reasons: mapping.blockers });
    }

    // 2. Climate data (global).
    let nasaData: NASAEnvironmentalData | null = null;
    try {
      nasaData = await getNasaData({ latitude: lat, longitude: lon, startDate: ANALYSIS_START, endDate: ANALYSIS_END });
      if (!stale()) setNasa({ ...idle(), phase: "success", data: nasaData });
    } catch (err) {
      if (!stale()) setNasa({ ...idle(), phase: "error", errors: messagesOf(err, "Could not load NASA climate data.") });
    }

    // 3. Recommendations (calibrated region only).
    const recBlockers: string[] = [];
    if (cov.recommendationCoverage !== "calibrated_region") {
      recBlockers.push("The farm is outside the region the recommendation engine is calibrated for (Karnataka, India).");
    }
    recBlockers.push(...mapping.blockers);
    if (!nasaData) recBlockers.push("Climate data could not be loaded, so recommendations were not requested.");

    if (recBlockers.length || !mapping.profile || !nasaData) {
      if (!stale()) setRecs({ ...idle(), phase: "skipped", reasons: recBlockers });
    } else {
      try {
        const { weights: w, customSequence: seq } = tuningRef.current;
        const result = await getRecommendations(buildRecommendationsRequest(mapping.profile, nasaData, w, seq));
        if (!stale()) {
          lastInputs.current = { profile: mapping.profile, nasaData };
          setRecs({ ...idle(), phase: "success", data: result });
          // Like the original app, start the custom sequence from the top strategy.
          if (!seq && isValidCustomSequence(result.recommendations[0]?.crops.slice(0, 3))) {
            const initial = result.recommendations[0].crops.slice(0, 3) as CustomSequence;
            tuningRef.current = { ...tuningRef.current, customSequence: initial };
            setCustomSequence(initial);
          }
        }
      } catch (err) {
        if (!stale()) setRecs({ ...idle(), phase: "error", errors: messagesOf(err, "Could not generate recommendations.") });
      }
    }
    if (!stale()) setAnalysing(false);
  }, []);
  runAnalysisRef.current = runAnalysis;

  const updateTuning = useCallback(
    async (changes: { weights?: ScoringWeights; customSequence?: CustomSequence | null }) => {
      const next = {
        weights: changes.weights ?? tuningRef.current.weights,
        customSequence: changes.customSequence !== undefined ? changes.customSequence : tuningRef.current.customSequence,
      };
      tuningRef.current = next;
      setWeights(next.weights);
      setCustomSequence(next.customSequence);
      try {
        window.localStorage.setItem(TUNING_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      const inputs = lastInputs.current;
      if (!inputs) return; // nothing analysed yet: the values apply to the next analysis
      const myTune = ++tuneId.current;
      setTuningUpdating(true);
      setTuningErrors([]);
      try {
        const result = await getRecommendations(
          buildRecommendationsRequest(inputs.profile, inputs.nasaData, next.weights, next.customSequence)
        );
        if (myTune === tuneId.current) setRecs({ ...idle(), phase: "success", data: result });
      } catch (err) {
        if (myTune === tuneId.current) setTuningErrors(messagesOf(err, "Could not update recommendations."));
      } finally {
        if (myTune === tuneId.current) setTuningUpdating(false);
      }
    },
    []
  );

  const value = useMemo<FarmContextValue>(
    () => ({
      draft, setDraft, analysedDraft, coverage, save, nasa, recommendations, analysing, runAnalysis, hydrated,
      weights, customSequence, updateTuning, tuningUpdating, tuningErrors,
    }),
    [
      draft, setDraft, analysedDraft, coverage, save, nasa, recommendations, analysing, runAnalysis, hydrated,
      weights, customSequence, updateTuning, tuningUpdating, tuningErrors,
    ]
  );

  return <FarmContext.Provider value={value}>{children}</FarmContext.Provider>;
}

export function useFarm(): FarmContextValue {
  const ctx = useContext(FarmContext);
  if (!ctx) throw new Error("useFarm must be used inside <FarmProvider>.");
  return ctx;
}
