"use client";

import { FlaskConical, Lock, SlidersHorizontal } from "lucide-react";
import { useData } from "@/context/DataContext";
import { useSettings } from "@/context/SettingsContext";
import { PILOT_REGION } from "@/lib/region";
import type { RotationComparison } from "@/lib/data/loaders";
import { comparisonsIncluding, formatRelativeValue, isPendingMetric, metricLabel, rotationName } from "@/lib/data/rotations";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { Banner } from "@/components/ui/feedback";
import { DatasetState, PageHeader } from "@/components/shared";
import { EvidenceSourcesList, InputReadinessPanel, ResearchComparisonsPanel } from "./RotationEvidence";

/** Rotation comparison from a genuine rotation_comparison.json (METHODOLOGY §4.4). */
export function RotationComparisonTable({ data }: { data: RotationComparison }) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {data.rotations.map((r) => {
        const metrics = data.metrics.filter((m) => m.rotation_id === r.id);
        const profile = data.rotation_profiles?.find((p) => p.rotation_id === r.id);
        const pooled = comparisonsIncluding(data, r.id);
        return (
          <Card key={r.id}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-semibold text-terra-900">{r.name}</h2>
              {r.baseline && <Badge>Baseline</Badge>}
            </div>
            <p className="mt-1 text-sm text-slate-600">{r.sequence.join(" → ")}</p>
            {profile && (
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge>{profile.duration_years}-year cycle</Badge>
                  {profile.includes_forage_legume_phase && <Badge tone="green">Forage legume phase</Badge>}
                  {profile.compared_with && <Badge>Compared with {rotationName(data, profile.compared_with)}</Badge>}
                </div>
                <ol className="space-y-1 text-slate-600">
                  {profile.phases.map((ph) => (
                    <li key={ph.year}>
                      <span className="font-medium text-slate-800">Year {ph.year}:</span> {ph.description}
                    </li>
                  ))}
                </ol>
                <p className="text-xs text-slate-500">{profile.evidence_summary}</p>
              </div>
            )}
            {pooled.length > 0 && (
              <p className="mt-3 rounded-lg bg-earth-50 p-3 text-xs text-slate-600">
                Included in {pooled.length} pooled research comparison{pooled.length === 1 ? "" : "s"} with other rotations (see
                “Pooled research comparisons”). Those results are not separate effects of this rotation.
              </p>
            )}
            {metrics.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No metrics for this rotation in the file.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {metrics.map((m) => (
                  <li key={m.metric} className="rounded-lg border border-earth-200 p-3 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-slate-800">{metricLabel(m.metric)}</span>
                      {isPendingMetric(m) ? (
                        <Badge tone="amber">Evidence pending</Badge>
                      ) : (
                        <span className="tabular-nums font-semibold text-terra-800">
                          {m.unit ? formatRelativeValue(m.value as number, m.unit) : m.value}
                        </span>
                      )}
                    </div>
                    {!isPendingMetric(m) && (
                      <p className="mt-1 text-xs text-slate-500">
                        {m.provenance}
                        {m.citation ? ` · ${m.citation}` : ""}
                        {m.applicability ? ` · ${m.applicability}` : ""}
                        {m.confidence ? ` · confidence: ${m.confidence}` : ""}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function WaitingFeature({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card className="border-dashed">
      <CardHeader
        title={<span className="inline-flex items-center gap-2">{icon} {title}</span>}
        action={<Badge tone="amber"><Lock className="h-3.5 w-3.5" aria-hidden /> Not offered</Badge>}
        as="h3"
      />
      <p className="text-sm text-slate-600">{children}</p>
    </Card>
  );
}

export function RecommendationsView() {
  const { rotations } = useData();
  const { t } = useSettings();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Crop rotation comparison"
        description={`Rotation strategies for ${PILOT_REGION.name}, shown only when the pipeline publishes a genuine rotation_comparison.json.`}
      />
      <Banner tone="info">{t("disclaimer.decisionSupport")}</Banner>

      {rotations.status === "available" ? (
        <>
          <RotationComparisonTable data={rotations.data} />
          {rotations.data.research_comparisons !== undefined && <ResearchComparisonsPanel data={rotations.data} />}
          {rotations.data.input_readiness && <InputReadinessPanel readiness={rotations.data.input_readiness} />}
          <EvidenceSourcesList data={rotations.data} />
          {rotations.data.disclaimer && rotations.data.disclaimer !== t("disclaimer.decisionSupport") && (
            <p className="text-xs text-slate-500">File disclaimer: {rotations.data.disclaimer}</p>
          )}
        </>
      ) : (
        <DatasetState result={rotations} label="rotation_comparison.json" />
      )}

      <section aria-label="Features not offered" className="grid gap-4 md:grid-cols-2">
        <WaitingFeature icon={<SlidersHorizontal className="h-5 w-5 text-terra-600" aria-hidden />} title="Scoring weights">
          The rotation engine deliberately publishes no scores, weights or rankings: the methodology does not allow invented
          scores, so there is nothing for weight sliders to re-rank.
        </WaitingFeature>
        <WaitingFeature icon={<FlaskConical className="h-5 w-5 text-terra-600" aria-hidden />} title="Evaluate your own sequence">
          The engine compares only the three approved rotations. Custom sequences are not evaluated. The earlier Karnataka
          engine is not used: its crops, soils and Kharif/Rabi/Zaid seasons do not apply to Story County.
        </WaitingFeature>
      </section>
    </div>
  );
}
