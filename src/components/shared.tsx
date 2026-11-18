"use client";

/** Small pieces reused across pages: headers, provenance and coverage notices. */

import Link from "next/link";
import type { ReactNode } from "react";
import { Satellite } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import type { CoverageAssessment } from "@/lib/geo/coverage";
import type { NASAEnvironmentalData } from "@/types/nasa";
import { Badge } from "./ui/primitives";
import { Banner, EmptyState } from "./ui/feedback";
import { formatNumber } from "@/lib/units";

export function PageHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-terra-900 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-600 sm:text-base">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Shown on result pages before any analysis has run. */
export function NeedsAnalysis({ what }: { what: string }) {
  return (
    <EmptyState
      title="No farm analysed yet"
      action={
        <Link href="/farm" className="inline-flex rounded-lg bg-terra-600 px-4 py-2 text-sm font-medium text-white hover:bg-terra-700">
          Set up your farm
        </Link>
      }
    >
      Enter your farm&apos;s location and details to see {what}.
    </EmptyState>
  );
}

function formatDateCompact(d: string): string {
  // Backend dates are YYYYMMDD.
  return /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
}

/** Live vs illustrative badge, source and date range for NASA data. */
export function NasaProvenance({ data, coverage }: { data: NASAEnvironmentalData; coverage: CoverageAssessment | null }) {
  const { t, localeCode } = useSettings();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {data.isLiveRetrieval ? (
          <Badge tone="green">
            <Satellite className="h-3.5 w-3.5" aria-hidden /> {t("data.live")}
          </Badge>
        ) : (
          <Badge tone="amber">{t("data.illustrative")}</Badge>
        )}
        <span className="text-slate-600">
          {t("data.dateRange")}: {formatDateCompact(data.startDate)} → {formatDateCompact(data.endDate)}
        </span>
        <span className="text-slate-400" aria-hidden>·</span>
        <span className="text-slate-600">
          {t("data.retrieved")}: {new Date(data.retrievedAt).toLocaleString(localeCode)}
        </span>
      </div>
      {!data.isLiveRetrieval && (
        <Banner tone="warning" title={data.fallbackBannerMessage ?? t("data.illustrative")}>
          {coverage
            ? t("data.fallbackOrigin", {
                region: coverage.nearestPilotRegion.district,
                distance: formatNumber(coverage.nearestPilotRegion.distanceKm, { digits: 0, locale: localeCode }),
              })
            : null}
        </Banner>
      )}
      <p className="text-xs text-slate-500">
        {t("data.source")}: {data.source} · {data.product} ·{" "}
        <a className="underline" href={data.qualityInformation.sourceUrl} target="_blank" rel="noopener noreferrer">
          documentation
        </a>
      </p>
    </div>
  );
}

/** Coverage summary: climate is global, recommendations are Karnataka-only. */
export function CoverageNotice({ coverage }: { coverage: CoverageAssessment }) {
  const { t } = useSettings();
  return coverage.recommendationCoverage === "calibrated_region" ? (
    <Banner tone="success">{t("coverage.rec.calibrated")}</Banner>
  ) : (
    <Banner tone="warning" title={t("coverage.rec.outside.title")}>
      {t("coverage.rec.outside.body")}
    </Banner>
  );
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-earth-100 py-2 text-sm last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}
