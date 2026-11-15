"use client";

import { useMemo } from "react";
import { Printer } from "lucide-react";
import { useData } from "@/context/DataContext";
import { useSettings } from "@/context/SettingsContext";
import { PILOT_REGION } from "@/lib/region";
import { growingSeasonSummaries, mean, qcCounts } from "@/lib/data/summary";
import { formatNumber, formatPercent, formatPrecipitation, formatSolar, formatTemperature, formatWetnessFraction } from "@/lib/units";
import { Button, Card, CardHeader } from "@/components/ui/primitives";
import { Banner } from "@/components/ui/feedback";
import { DatasetState, KeyValue, PageHeader } from "@/components/shared";
import { RotationComparisonTable } from "./RecommendationsView";
import { formatGdd } from "./ClimateView";

export function ReportsView() {
  const { climate, environment, rotations } = useData();
  const { t, units, localeCode } = useSettings();
  const r = PILOT_REGION;

  const summary = useMemo(() => {
    if (climate.status !== "available") return null;
    const rows = climate.data;
    const seasons = growingSeasonSummaries(rows, r.growingSeason.startMmdd, r.growingSeason.endMmdd);
    return {
      first: rows[0].date,
      last: rows[rows.length - 1].date,
      days: rows.length,
      qc: qcCounts(rows),
      t: mean(rows, "tmean_c").value,
      tmax: mean(rows, "tmax_c").value,
      tmin: mean(rows, "tmin_c").value,
      precip: mean(rows, "precip_mm").value,
      rh: mean(rows, "rh_pct").value,
      srad: mean(rows, "srad_mj_m2").value,
      wetRoot: mean(rows, "soil_wet_root").value,
      latest: seasons[seasons.length - 1] ?? null,
    };
  }, [climate, r.growingSeason.startMmdd, r.growingSeason.endMmdd]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pilot report"
        description={`Generated ${new Date().toLocaleString(localeCode)} from the datasets currently published to the frontend.`}
        action={<Button onClick={() => window.print()} className="print:hidden"><Printer className="h-4 w-4" aria-hidden /> {t("action.print")}</Button>}
      />

      <Card>
        <CardHeader title="Region" />
        <dl className="grid gap-x-8 sm:grid-cols-2">
          <KeyValue label="Pilot" value={`${r.name} (${r.id})`} />
          <KeyValue label="Internal point" value={`${r.internalPoint.latitude}, ${r.internalPoint.longitude}`} />
          <KeyValue label="Growing season" value={`${r.growingSeason.startMmdd} → ${r.growingSeason.endMmdd}`} />
          <KeyValue label="SSURGO survey area" value={r.ssurgoAreaSymbol} />
        </dl>
      </Card>

      <Card>
        <CardHeader title="Climate summary" description="From climate_daily.csv (NASA POWER via the TerraShift pipeline)." />
        {summary ? (
          <dl className="grid gap-x-8 sm:grid-cols-2">
            <KeyValue label="Period" value={`${summary.first} → ${summary.last} (${summary.days.toLocaleString()} days)`} />
            <KeyValue label="Quality flags" value={`${summary.qc.ok} ok · ${summary.qc.missing} missing · ${summary.qc.out_of_range} out of range`} />
            <KeyValue label="Average temperature" value={formatTemperature(summary.t, units)} />
            <KeyValue label="Average max / min" value={`${formatTemperature(summary.tmax, units)} / ${formatTemperature(summary.tmin, units)}`} />
            <KeyValue label="Average precipitation" value={formatPrecipitation(summary.precip, units, { suffix: "/day", digits: 2 })} />
            <KeyValue label="Relative humidity" value={formatPercent(summary.rh)} />
            <KeyValue label="Solar radiation" value={formatSolar(summary.srad)} />
            <KeyValue label="Root-zone soil wetness (model)" value={formatWetnessFraction(summary.wetRoot)} />
            <KeyValue label={`Season ${summary.latest?.year ?? "—"} precipitation`} value={formatPrecipitation(summary.latest?.precipMm ?? null, units, { digits: 0 })} />
            <KeyValue label={`Season ${summary.latest?.year ?? "—"} GDD`} value={formatGdd(summary.latest?.gddC ?? null, units)} />
          </dl>
        ) : (
          <DatasetState result={climate} label="climate_daily.csv" />
        )}
      </Card>

      <Card>
        <CardHeader title="Environmental summary" />
        {environment.status === "available" ? (
          <p className="text-sm text-slate-700">Published for {environment.data.region.id} ({environment.data.climate_by_season.length} seasons).</p>
        ) : (
          <DatasetState result={environment} label="environment_summary.json" />
        )}
      </Card>

      <Card>
        <CardHeader title="Crop rotation comparison" />
        <Banner tone="info" className="mb-4">{t("disclaimer.decisionSupport")}</Banner>
        {rotations.status === "available" ? <RotationComparisonTable data={rotations.data} /> : <DatasetState result={rotations} label="rotation_comparison.json" />}
      </Card>

      <Card>
        <CardHeader title="Limitations" />
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
          <li>NASA POWER values are for one grid cell (about {formatNumber(55)} km) at the county internal point; they are treated as representative of the county, which is an assumption.</li>
          <li>Soil wetness values are MERRA-2 model estimates (0–1 saturation fraction), not soil measurements.</li>
          <li>Solar radiation comes from GEWEX SRB before 2001 and CERES SYN1deg from 2001; trends across 2001 mix two products.</li>
          <li>No crop rotation recommendations are shown until a genuine rotation comparison is published.</li>
        </ul>
      </Card>
    </div>
  );
}
