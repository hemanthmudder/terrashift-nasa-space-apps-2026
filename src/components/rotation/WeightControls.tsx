"use client";

/**
 * Scoring-weight sliders (restored from the original app). Values are sent
 * as the existing `weights` field; the backend normalises them to 100%.
 */

import { useEffect, useState } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { useFarm } from "@/context/FarmContext";
import type { ScoringWeights } from "@/types/recommendation";
import {
  DEFAULT_WEIGHTS,
  WEIGHT_FIELDS,
  WEIGHT_MAX_PERCENT,
  WEIGHT_MIN_PERCENT,
  effectiveShares,
  setSliderPercent,
  sliderPercent,
  weightsEqual,
} from "@/lib/rotation/tuning";
import { Button, Card, CardHeader } from "@/components/ui/primitives";
import { Banner } from "@/components/ui/feedback";

export function WeightControls() {
  const { weights, updateTuning, tuningUpdating, tuningErrors } = useFarm();
  const [local, setLocal] = useState<ScoringWeights>(weights);

  // Keep sliders in sync when weights change elsewhere (reset, reload).
  useEffect(() => setLocal(weights), [weights]);

  const shares = effectiveShares(local);
  const dirty = !weightsEqual(local, weights);
  const isDefault = weightsEqual(weights, DEFAULT_WEIGHTS);

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-terra-600" aria-hidden /> Scoring weights
          </span>
        }
        description="Choose what matters most. The engine normalises the weights to 100% and re-ranks the rotations."
        action={
          <Button
            variant="ghost"
            className="text-xs"
            disabled={tuningUpdating || (isDefault && !dirty)}
            onClick={() => {
              setLocal(DEFAULT_WEIGHTS);
              void updateTuning({ weights: DEFAULT_WEIGHTS });
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset defaults (30/25/20/15/10)
          </Button>
        }
      />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
        {WEIGHT_FIELDS.map(({ key, label }) => {
          const id = `weight-${key}`;
          return (
            <div key={key}>
              <label htmlFor={id} className="flex items-baseline justify-between text-sm font-medium text-slate-800">
                {label}
                <span className="tabular-nums text-terra-800">{shares[key]}%</span>
              </label>
              <input
                id={id}
                type="range"
                min={WEIGHT_MIN_PERCENT}
                max={WEIGHT_MAX_PERCENT}
                step={1}
                value={sliderPercent(local, key)}
                onChange={(e) => setLocal(setSliderPercent(local, key, Number(e.target.value)))}
                aria-valuetext={`${label}: ${shares[key]}% of total`}
                className="mt-2 w-full accent-terra-600"
                disabled={tuningUpdating}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button disabled={!dirty || tuningUpdating} onClick={() => void updateTuning({ weights: local })}>
          {tuningUpdating ? "Updating…" : "Apply weights"}
        </Button>
        {dirty && !tuningUpdating && <span className="text-xs text-slate-500">Changes not applied yet.</span>}
        <span role="status" aria-live="polite" className="sr-only">
          {tuningUpdating ? "Updating recommendations" : ""}
        </span>
      </div>
      {tuningErrors.length > 0 && (
        <Banner tone="error" title="Weights could not be applied" className="mt-4">
          {tuningErrors.join(" ")}
        </Banner>
      )}
    </Card>
  );
}
