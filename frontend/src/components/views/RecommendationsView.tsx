"use client";

import { FlaskConical, Lock, SlidersHorizontal } from "lucide-react";
import { useData } from "@/context/DataContext";
import { useSettings } from "@/context/SettingsContext";
import { PILOT_REGION } from "@/lib/region";
import type { RotationComparison } from "@/lib/data/loaders";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { Banner } from "@/components/ui/feedback";
import { DatasetState, PageHeader } from "@/components/shared";

/** Rotation comparison from a genuine rotation_comparison.json (METHODOLOGY §4.4). */
export function RotationComparisonTable({ data }: { data: RotationComparison }) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {data.rotations.map((r) => {
        const metrics = data.metrics.filter((m) => m.rotation_id === r.id);
        return (
          <Card key={r.id}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-semibold text-terra-900">{r.name}</h2>
              {r.baseline && <Badge>Baseline</Badge>}
            </div>
            <p className="mt-1 text-sm text-slate-600">{r.sequence.join(" → ")}</p>
            {metrics.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No metrics for this rotation in the file.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {metrics.map((m) => (
                  <li key={m.metric} className="rounded-lg border border-earth-200 p-3 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-slate-800">{m.metric.replace(/_/g, " ")}</span>
                      {m.value === null ? (
                        <Badge tone="amber">Evidence pending</Badge>
                      ) : (
                        <span className="tabular-nums font-semibold text-terra-800">{m.value}</span>
                      )}
                    </div>
                    {m.value !== null && (
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
        action={<Badge tone="amber"><Lock className="h-3.5 w-3.5" aria-hidden /> Waiting for the rotation engine</Badge>}
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
          {rotations.data.disclaimer && rotations.data.disclaimer !== t("disclaimer.decisionSupport") && (
            <p className="text-xs text-slate-500">File disclaimer: {rotations.data.disclaimer}</p>
          )}
        </>
      ) : (
        <DatasetState result={rotations} label="rotation_comparison.json" />
      )}

      <section aria-label="Planned features" className="grid gap-4 md:grid-cols-2">
        <WaitingFeature icon={<SlidersHorizontal className="h-5 w-5 text-terra-600" aria-hidden />} title="Scoring weights">
          The weight sliders from the standalone TerraShift frontend will return once an Iowa rotation engine can re-rank
          strategies. They are not shown as working controls because nothing in this repository can score rotations yet.
        </WaitingFeature>
        <WaitingFeature icon={<FlaskConical className="h-5 w-5 text-terra-600" aria-hidden />} title="Evaluate your own sequence">
          Custom sequence evaluation needs the same engine (src/engine/rotation_engine.py is empty). The earlier Karnataka
          engine is not used: its crops, soils and Kharif/Rabi/Zaid seasons do not apply to Story County.
        </WaitingFeature>
      </section>
    </div>
  );
}
