"use client";

import type { InputReadiness, RotationComparison, SourceReadiness } from "@/lib/data/loaders";
import { formatRelativeValue, metricLabel, pooledGroupLabel } from "@/lib/data/rotations";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { KeyValue } from "@/components/shared";

function StatusBadge({ status }: { status: "available" | "pending" }) {
  return status === "available" ? <Badge tone="green">Available</Badge> : <Badge tone="amber">Pending</Badge>;
}

function SourceCard({ title, entry }: { title: string; entry: SourceReadiness }) {
  return (
    <Card>
      <CardHeader title={title} action={<StatusBadge status={entry.status} />} as="h3" />
      <dl>
        <KeyValue label="Source" value={entry.source.toUpperCase()} />
        {entry.estimate_type && <KeyValue label="Estimate type" value={entry.estimate_type.replace(/_/g, " ")} />}
        <KeyValue label="Used by the engine" value={entry.used_for ?? "Not used"} />
      </dl>
      <p className="mt-3 text-sm text-slate-600">{entry.reason}</p>
    </Card>
  );
}

/** Which engine inputs exist; pending inputs are stated as pending, never filled in. */
export function InputReadinessPanel({ readiness }: { readiness: InputReadiness }) {
  const { climate } = readiness;
  return (
    <section aria-label="Engine input readiness" className="space-y-3">
      <h2 className="text-lg font-semibold text-terra-900">Engine inputs</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader title="Climate" action={<StatusBadge status={climate.status} />} as="h3" />
          <dl>
            <KeyValue label="Source" value={climate.source.replace(/_/g, " ").toUpperCase()} />
            <KeyValue label="Growing seasons" value={`${climate.seasons} (${climate.first_year}–${climate.last_year})`} />
            <KeyValue
              label="Seasons with missing days"
              value={climate.seasons_with_missing_days.length === 0 ? "None" : climate.seasons_with_missing_days.join(", ")}
            />
          </dl>
          {climate.used_for && <p className="mt-3 text-sm text-slate-600">{climate.used_for}</p>}
        </Card>
        <SourceCard title="Soils" entry={readiness.soils} />
        <SourceCard title="Land cover" entry={readiness.land_cover} />
      </div>
    </section>
  );
}

/**
 * Approved research results that pool several rotations against a comparator.
 * Shown once, as a group comparison, and never under an individual rotation.
 */
export function ResearchComparisonsPanel({ data }: { data: RotationComparison }) {
  const comparisons = data.research_comparisons ?? [];
  return (
    <section aria-label="Pooled research comparisons" className="space-y-3">
      <h2 className="text-lg font-semibold text-terra-900">Pooled research comparisons</h2>
      {comparisons.length === 0 ? (
        <Card className="border-dashed">
          <p className="text-sm text-slate-600">
            The file publishes no approved research comparisons. Published results appear here only after the team approves
            them; nothing is shown in the meantime.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {comparisons.map((c) => (
            <Card key={c.comparison_id}>
              <CardHeader
                title={metricLabel(c.metric)}
                description={pooledGroupLabel(data, c)}
                action={<span className="tabular-nums text-lg font-semibold text-terra-800">{formatRelativeValue(c.value, c.unit)}</span>}
                as="h3"
              />
              <div className="flex flex-wrap gap-2">
                <Badge tone="blue">Pooled result</Badge>
                <Badge>{c.provenance}</Badge>
                <Badge>confidence: {c.confidence}</Badge>
                {c.evidence_scope && <Badge tone="amber">{c.evidence_scope.replace(/_/g, " ")}</Badge>}
              </div>
              <p className="mt-3 text-sm text-slate-700">
                This value describes the listed rotations together; it is not a separate result for either one.
              </p>
              <dl className="mt-3">
                {c.location && <KeyValue label="Location" value={c.location} />}
                {c.study_period && <KeyValue label="Study period" value={c.study_period} />}
              </dl>
              {c.management_differences && <p className="mt-3 text-xs text-slate-600">{c.management_differences}</p>}
              <p className="mt-2 text-xs text-slate-500">{c.applicability}</p>
              <p className="mt-2 text-xs text-slate-500">
                {c.citation}
                {c.source_url && (
                  <>
                    {" "}
                    <a href={c.source_url} className="underline" target="_blank" rel="noopener noreferrer">
                      Source
                    </a>
                  </>
                )}
              </p>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

/** Sources behind supported metrics and research comparisons (empty list renders nothing). */
export function EvidenceSourcesList({ data }: { data: RotationComparison }) {
  const sources = data.evidence_sources ?? [];
  if (sources.length === 0) return null;
  return (
    <section aria-label="Evidence sources" className="space-y-2">
      <h2 className="text-lg font-semibold text-terra-900">Evidence sources</h2>
      <ul className="space-y-2 text-sm text-slate-600">
        {sources.map((s) => (
          <li key={s.citation} className="rounded-lg border border-earth-200 p-3">
            {s.citation}
            {s.study_period ? ` · ${s.study_period}` : ""}
            {s.location ? ` · ${s.location}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}
