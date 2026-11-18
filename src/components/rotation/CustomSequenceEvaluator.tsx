"use client";

/**
 * Custom crop-sequence evaluation (restored from the original app). The three
 * chosen crop ids are sent as the existing `customSequence` field; the
 * backend scores them for its fixed Kharif → Rabi → Zaid seasons and returns
 * `customSequenceEvaluation`.
 */

import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { useFarm } from "@/context/FarmContext";
import { KARNATAKA_CROPS } from "@/data/crops/karnatakaCrops";
import { isValidCustomSequence, type CustomSequence } from "@/lib/rotation/tuning";
import { Badge, Button, Card, CardHeader } from "@/components/ui/primitives";
import { Banner } from "@/components/ui/feedback";
import { Field, inputClassName } from "@/components/ui/Field";

/** Season order the backend route uses for custom sequences. */
const SEASON_SLOTS = ["Season 1 · Kharif (monsoon)", "Season 2 · Rabi (post-monsoon)", "Season 3 · Zaid (summer)"];

export function CustomSequenceEvaluator() {
  const { customSequence, updateTuning, tuningUpdating, tuningErrors, recommendations } = useFarm();
  const fallback = (recommendations.data?.recommendations[0]?.crops.slice(0, 3) ?? []) as string[];
  const [local, setLocal] = useState<string[]>(customSequence ?? fallback);

  useEffect(() => {
    if (customSequence) setLocal(customSequence);
  }, [customSequence]);

  const evaluation = recommendations.data?.customSequenceEvaluation ?? null;
  const evaluatedSeq = evaluation?.crops.slice(0, 3).join("|");
  const valid = isValidCustomSequence(local);
  const upToDate = valid && evaluatedSeq === local.join("|");

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-terra-600" aria-hidden /> Evaluate your own sequence
          </span>
        }
        description="Pick a crop for each season to see how the engine scores it, including family-repetition, water-overload and transition penalties."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {SEASON_SLOTS.map((label, idx) => (
          <Field key={label} label={label}>
            <select
              className={inputClassName}
              value={local[idx] ?? ""}
              disabled={tuningUpdating}
              onChange={(e) => {
                const next = [...local];
                next[idx] = e.target.value;
                setLocal(next);
              }}
            >
              <option value="" disabled>Choose a crop</option>
              {KARNATAKA_CROPS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.family}, {c.duration.typicalDays} d)
                </option>
              ))}
            </select>
          </Field>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button disabled={!valid || tuningUpdating || upToDate} onClick={() => void updateTuning({ customSequence: local as CustomSequence })}>
          {tuningUpdating ? "Evaluating…" : upToDate ? "Evaluated" : "Evaluate sequence"}
        </Button>
        {!valid && <span className="text-xs text-slate-500">Choose a crop for all three seasons.</span>}
      </div>

      {tuningErrors.length > 0 && (
        <Banner tone="error" title="The sequence could not be evaluated" className="mt-4">
          {tuningErrors.join(" ")}
        </Banner>
      )}

      {evaluation && (
        <div className="mt-5 space-y-3 rounded-xl border border-terra-200 bg-terra-50 p-4 text-sm" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-terra-900">
              Score {evaluation.totalScore}/100
            </p>
            <Badge tone={evaluation.penalties.totalPenalty > 0 ? "red" : "green"}>
              Penalties: −{evaluation.penalties.totalPenalty} pts
            </Badge>
            <Badge>{evaluation.confidence.level}</Badge>
            {!upToDate && valid && <Badge tone="amber">Showing the last evaluated sequence</Badge>}
          </div>
          <p className="text-slate-800">
            {evaluation.sequenceSteps.map((s) => `${s.cropName} (${s.seasonLabel})`).join(" → ")}
          </p>
          <p className="text-slate-700">{evaluation.whyThisSequence}</p>
          {evaluation.penalties.notes.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 font-medium text-red-800">
              {evaluation.penalties.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          )}
          {evaluation.risks.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-slate-700">
              {evaluation.risks.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
