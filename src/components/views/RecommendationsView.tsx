"use client";

import { Droplets, Leaf, ShieldCheck, Sprout } from "lucide-react";
import { useFarm } from "@/context/FarmContext";
import { useSettings } from "@/context/SettingsContext";
import type { RotationRecommendation } from "@/types/recommendation";
import { Badge, Card } from "@/components/ui/primitives";
import { Banner, ErrorState, LoadingState, UnavailableState } from "@/components/ui/feedback";
import { CoverageNotice, NeedsAnalysis, PageHeader } from "@/components/shared";
import { WeightControls } from "@/components/rotation/WeightControls";

const STRATEGY_ICON = { balanced: Sprout, water_conscious: Droplets, soil_improvement: Leaf } as const;

function confidenceTone(level: string) {
  return level.startsWith("High") ? "green" : level.startsWith("Moderate") ? "amber" : "red";
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
        {items.map((i) => <li key={i}>{i}</li>)}
      </ul>
    </div>
  );
}

export function StrategyCard({ rec }: { rec: RotationRecommendation }) {
  const { locale } = useSettings();
  const Icon = STRATEGY_ICON[rec.strategy];
  const kn = locale === "kn";
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-terra-50 p-2 text-terra-600"><Icon className="h-6 w-6" aria-hidden /></span>
          <div>
            <h2 className="text-lg font-semibold text-terra-900">{kn ? rec.kannadaTitle : rec.strategyTitle}</h2>
            <p className="text-sm text-slate-600">{rec.strategySubtitle}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums text-terra-800">{rec.totalScore}</p>
          <p className="text-xs text-slate-500">engine score / 100</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge tone={confidenceTone(rec.confidence.level)}>
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> {rec.confidence.level} ({rec.confidence.scorePercent}%)
        </Badge>
        <Badge>Rotation length: {rec.totalDurationDays} crop days</Badge>
      </div>

      <ol className="space-y-3">
        {rec.sequenceSteps.map((s) => (
          <li key={s.stepNumber} className="rounded-xl border border-earth-200 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold text-slate-900">
                {s.stepNumber}. {s.cropName}
                {kn && <span className="ml-1 font-normal text-slate-600">({s.kannadaName})</span>}
                <span className="ml-2 text-xs font-normal italic text-slate-500">{s.scientificName}</span>
              </p>
              <Badge tone="blue">{s.seasonLabel}</Badge>
            </div>
            <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-2">
              <div><dt className="inline font-medium">Sowing: </dt><dd className="inline">{s.sowingWindow}</dd></div>
              <div><dt className="inline font-medium">Harvest: </dt><dd className="inline">{s.harvestWindow}</dd></div>
              <div><dt className="inline font-medium">Duration: </dt><dd className="inline">{s.durationDays} days</dd></div>
              <div><dt className="inline font-medium">Water need: </dt><dd className="inline">{s.waterRequirement.replace(/_/g, " ")}</dd></div>
              <div className="sm:col-span-2"><dt className="inline font-medium">Soil role: </dt><dd className="inline">{s.nutrientRole.replace(/_/g, " ")}</dd></div>
            </dl>
            {s.transitionNote && <p className="mt-2 text-xs text-slate-600">{s.transitionNote}</p>}
          </li>
        ))}
      </ol>

      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-lg bg-orbital-50 p-3"><p className="font-semibold text-orbital-700">Water</p><p className="mt-1 text-slate-700">{rec.waterCompatibilitySummary}</p></div>
        <div className="rounded-lg bg-terra-50 p-3"><p className="font-semibold text-terra-800">Soil</p><p className="mt-1 text-slate-700">{rec.soilCompatibilitySummary}</p></div>
        <div className="rounded-lg bg-earth-100 p-3"><p className="font-semibold text-earth-800">Climate</p><p className="mt-1 text-slate-700">{rec.climateCompatibilitySummary}</p></div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-800">Why this rotation</h3>
        <p className="mt-1 text-sm text-slate-700">{kn ? rec.kannadaSummary : rec.whyThisSequence}</p>
        {!kn && rec.explanation && <p className="mt-2 text-sm text-slate-600">{rec.explanation}</p>}
      </div>

      <List title="Advantages" items={rec.advantages} />
      <List title="Risks and warnings" items={rec.risks} />
      <List title="Missing soil information" items={rec.missingSoilImprovements} />
      <List title="Missing evidence (lowers confidence)" items={rec.confidence.missingEvidenceItems} />
      <List title="Verify before acting" items={rec.confidence.verificationRecommendations} />

      {rec.evidenceSources.length > 0 && (
        <div className="text-xs text-slate-500">
          Sources:{" "}
          {rec.evidenceSources.map((src, i) => (
            <span key={src.url + i}>
              {i > 0 && " · "}
              <a className="underline" href={src.url} target="_blank" rel="noopener noreferrer">{src.institution}</a>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

export function RecommendationsView() {
  const { recommendations, coverage, analysedDraft, nasa, runAnalysis } = useFarm();
  const { t } = useSettings();

  const header = (
    <PageHeader
      title="Crop rotation recommendations"
      description="Three strategies from the TerraShift engine: balanced, water-conscious and soil-improvement. Scores and explanations come directly from the backend."
    />
  );

  if (!analysedDraft || !coverage) return <>{header}<NeedsAnalysis what="crop rotation recommendations" /></>;
  if (recommendations.phase === "loading") return <>{header}<LoadingState label="Generating recommendations…" /></>;
  if (recommendations.phase === "skipped") {
    return (
      <div className="space-y-4">
        {header}
        <CoverageNotice coverage={coverage} />
        <UnavailableState title="Recommendations are not available for this farm">
          <ul className="space-y-1 text-left">
            {recommendations.reasons.map((r) => <li key={r}>• {r}</li>)}
          </ul>
          <p className="mt-3">NASA climate insights and the crop calendar for your own crop history are still available.</p>
        </UnavailableState>
      </div>
    );
  }
  if (recommendations.phase === "error" || !recommendations.data) {
    return (
      <>
        {header}
        <ErrorState
          title="Recommendations could not be generated"
          messages={recommendations.errors.length ? recommendations.errors : ["No recommendations were returned."]}
          onRetry={() => runAnalysis(analysedDraft)}
          retryLabel={t("action.retry")}
        />
      </>
    );
  }

  const recs = recommendations.data.recommendations;
  return (
    <div className="space-y-6">
      {header}
      <CoverageNotice coverage={coverage} />
      {nasa.data && !nasa.data.isLiveRetrieval && (
        <Banner tone="warning" title="Based on illustrative climate data">
          NASA POWER was unavailable, so these recommendations use the backend&apos;s illustrative Karnataka baseline, not live
          observations. Treat them as a demonstration.
        </Banner>
      )}
      <WeightControls />
      {recs.length === 0 ? (
        <UnavailableState title="The engine returned no feasible rotations for this farm" />
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          {recs.map((r) => <StrategyCard key={r.id} rec={r} />)}
        </div>
      )}
      <p className="text-xs text-slate-500">
        Recommendations are decision support, not yield forecasts. Confirm with a local extension officer and a recent soil test.
      </p>
    </div>
  );
}
