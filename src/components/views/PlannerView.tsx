"use client";

import { useMemo, useState } from "react";
import { useFarm } from "@/context/FarmContext";
import { useSettings } from "@/context/SettingsContext";
import { getTemperateSeason, type TemperateSeason } from "@/lib/geo/coverage";
import { monthSpan, monthsInWindow } from "@/lib/climate/observed";
import { Badge, Button, Card, CardHeader, cx } from "@/components/ui/primitives";
import { Banner, EmptyState } from "@/components/ui/feedback";
import { NeedsAnalysis, PageHeader } from "@/components/shared";
import { CustomSequenceEvaluator } from "@/components/rotation/CustomSequenceEvaluator";

const MONTH_KEYS = Array.from({ length: 12 }, (_, i) => i + 1);

function monthLabel(m: number, localeCode: string) {
  return new Date(2024, m - 1, 1).toLocaleString(localeCode, { month: "short" });
}

/** Months (1–12) touched by a date range; ranges longer than a year cover all months. */
function monthsBetween(start: string, end: string): number[] {
  const s = new Date(start);
  const e = new Date(end || start);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return [];
  const out = new Set<number>();
  const cur = new Date(s.getFullYear(), s.getMonth(), 1);
  for (let i = 0; i < 24 && cur <= e; i++) {
    out.add(cur.getMonth() + 1);
    cur.setMonth(cur.getMonth() + 1);
  }
  return [...out];
}

function Row({ label, sub, sowing, growing, harvest, localeCode }: {
  label: string; sub?: string; sowing: number[]; growing: number[]; harvest: number[]; localeCode: string;
}) {
  return (
    <tr className="border-t border-earth-100">
      <th scope="row" className="sticky left-0 z-10 min-w-[11rem] bg-white py-2 pr-3 text-left align-top text-sm font-medium text-slate-900">
        {label}
        {sub && <span className="block text-xs font-normal text-slate-500">{sub}</span>}
      </th>
      {MONTH_KEYS.map((m) => {
        const kind = sowing.includes(m) ? "sow" : harvest.includes(m) ? "harvest" : growing.includes(m) ? "grow" : null;
        return (
          <td key={m} className="px-0.5 py-2">
            <div
              className={cx(
                "h-6 rounded",
                kind === "sow" && "bg-terra-600",
                kind === "grow" && "bg-terra-200",
                kind === "harvest" && "bg-amber-500",
                !kind && "bg-earth-50"
              )}
              title={kind ? `${monthLabel(m, localeCode)}: ${kind}` : undefined}
            >
              <span className="sr-only">{kind ? `${monthLabel(m, localeCode)} ${kind}` : ""}</span>
            </div>
          </td>
        );
      })}
    </tr>
  );
}

export function PlannerView() {
  const { recommendations, analysedDraft, draft, coverage } = useFarm();
  const { t, localeCode } = useSettings();
  const [strategyIdx, setStrategyIdx] = useState(0);

  const lat = coverage ? Number(analysedDraft?.latitude) : NaN;
  const seasons = useMemo<(TemperateSeason | null)[]>(
    () => (Number.isFinite(lat) ? MONTH_KEYS.map((m) => getTemperateSeason(m, lat)) : []),
    [lat]
  );

  const recs = recommendations.data?.recommendations ?? [];
  const selected = recs[strategyIdx] ?? recs[0];
  const history = draft.cropHistory.filter((h) => h.cropName.trim() && h.plantingDate);

  if (!analysedDraft || !coverage) {
    return <><PageHeader title="Crop calendar" /><NeedsAnalysis what="your crop calendar" /></>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Crop calendar & rotation timeline"
        description="Sowing, growing and harvest months for the recommended rotation and for your own cropping history."
      />

      <Card>
        <CardHeader
          title="Local seasons"
          description={`${t(`geo.hemisphere.${coverage.hemisphere}`)} · ${t(`geo.band.${coverage.latitudeBand}`)}`}
        />
        {seasons.some(Boolean) ? (
          <div className="grid grid-cols-6 gap-1 sm:grid-cols-12">
            {MONTH_KEYS.map((m, i) => (
              <div key={m} className="rounded-lg bg-earth-50 p-2 text-center text-xs">
                <p className="font-medium text-slate-800">{monthLabel(m, localeCode)}</p>
                <p className="text-slate-500">{seasons[i] ? t(`season.${seasons[i]}`) : "—"}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            In tropical latitudes, growing seasons follow local rainy and dry periods rather than temperature seasons. Use your
            local rainfall calendar; the NASA climate page shows the monthly rainfall pattern for your farm.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Recommended rotation"
          description="Months parsed from the sowing and harvest windows returned by the recommendation engine."
          action={
            recs.length > 1 ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Choose strategy">
                {recs.map((r, i) => (
                  <Button key={r.id} variant={i === strategyIdx ? "primary" : "secondary"} className="px-3 py-1.5 text-xs" aria-pressed={i === strategyIdx} onClick={() => setStrategyIdx(i)}>
                    {r.strategyTitle}
                  </Button>
                ))}
              </div>
            ) : undefined
          }
        />
        {recommendations.phase === "success" && selected ? (
          <>
            <Banner tone="info" className="mb-4">
              The engine schedules crops in Indian seasons (Kharif, Rabi, Zaid) because it is calibrated for Karnataka.
            </Banner>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr>
                    <th scope="col" className="sticky left-0 bg-white text-left text-xs font-medium text-slate-500">Crop</th>
                    {MONTH_KEYS.map((m) => (
                      <th key={m} scope="col" className="text-center text-xs font-medium text-slate-500">{monthLabel(m, localeCode)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selected.sequenceSteps.map((s) => {
                    const sowing = monthsInWindow(s.sowingWindow);
                    const harvest = monthsInWindow(s.harvestWindow);
                    const growing = sowing.length && harvest.length
                      ? monthSpan(sowing[0], harvest[harvest.length - 1])
                      : [];
                    return (
                      <Row key={s.stepNumber} label={`${s.stepNumber}. ${s.cropName}`} sub={`${s.seasonLabel} · ${s.durationDays} days`} sowing={sowing} growing={growing} harvest={harvest} localeCode={localeCode} />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState title="No rotation to schedule">
            {recommendations.phase === "skipped"
              ? "Recommendations are not available for this farm, so there is no rotation timeline. Your own crop history is shown below."
              : "Run an analysis on the Farm page to generate a rotation."}
          </EmptyState>
        )}
      </Card>

      {recommendations.phase === "success" && <CustomSequenceEvaluator />}

      <Card>
        <CardHeader title="Your cropping history" description="From the planting and harvest dates you entered on the Farm page." />
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">No crop history with planting dates yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 bg-white text-left text-xs font-medium text-slate-500">Crop</th>
                  {MONTH_KEYS.map((m) => (
                    <th key={m} scope="col" className="text-center text-xs font-medium text-slate-500">{monthLabel(m, localeCode)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const plant = new Date(h.plantingDate).getMonth() + 1;
                  const harvest = h.harvestDate ? new Date(h.harvestDate).getMonth() + 1 : NaN;
                  return (
                    <Row
                      key={h.id}
                      label={h.cropName}
                      sub={`${h.plantingDate}${h.harvestDate ? ` → ${h.harvestDate}` : ""}${h.irrigated === null ? "" : h.irrigated ? " · irrigated" : " · rainfed"}`}
                      sowing={[plant]}
                      harvest={Number.isFinite(harvest) ? [harvest] : []}
                      growing={monthsBetween(h.plantingDate, h.harvestDate)}
                      localeCode={localeCode}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-terra-600" /> Sowing / planting</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-terra-200" /> Growing</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-500" /> Harvest</span>
        <Badge>Indicative months only</Badge>
      </div>
    </div>
  );
}
