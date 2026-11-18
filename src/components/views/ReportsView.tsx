"use client";

import { useMemo } from "react";
import { Printer } from "lucide-react";
import { useFarm } from "@/context/FarmContext";
import { useSettings } from "@/context/SettingsContext";
import { meanAnnualPrecipitation, meanOf } from "@/lib/climate/observed";
import { toBackendProfile } from "@/lib/farm/draft";
import { formatArea, formatNumber, formatPercent, formatPrecipitation, formatSolar, formatTemperature, formatWetnessFraction } from "@/lib/units";
import { Badge, Button, Card, CardHeader } from "@/components/ui/primitives";
import { Banner } from "@/components/ui/feedback";
import { KeyValue, NeedsAnalysis, PageHeader } from "@/components/shared";

export function ReportsView() {
  const { analysedDraft: d, coverage, nasa, recommendations, save } = useFarm();
  const { t, units, localeCode, locale } = useSettings();

  const climate = useMemo(() => {
    const obs = nasa.data?.observations;
    if (!obs) return null;
    return {
      t: meanOf(obs, "t2m").mean,
      tmax: meanOf(obs, "t2mMax").mean,
      tmin: meanOf(obs, "t2mMin").mean,
      rain: meanAnnualPrecipitation(obs),
      rh: meanOf(obs, "rh2m").mean,
      solar: meanOf(obs, "solarRadMjM2").mean,
      wetRoot: meanOf(obs, "rootZoneSoilWetness").mean,
    };
  }, [nasa.data]);

  if (!d || !coverage) return <><PageHeader title="Farm report" /><NeedsAnalysis what="your farm report" /></>;

  const unknown = (v: string, unit = "") => (v.trim() === "" ? "Unknown" : `${v}${unit ? ` ${unit}` : ""}`);
  const mapping = toBackendProfile(d);
  const recs = recommendations.data?.recommendations ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Farm report"
        description={`Generated ${new Date().toLocaleString(localeCode)} from the latest analysis.`}
        action={
          <Button onClick={() => window.print()} className="print:hidden">
            <Printer className="h-4 w-4" aria-hidden /> {t("action.print")}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Farm information" />
          <dl>
            <KeyValue label="Farm" value={d.farmName || "Unnamed farm"} />
            <KeyValue label="Location" value={[d.locality, d.region, d.country].filter(Boolean).join(", ")} />
            <KeyValue label="Coordinates" value={`${formatNumber(Number(d.latitude), { digits: 4 })}, ${formatNumber(Number(d.longitude), { digits: 4 })}`} />
            <KeyValue label="Hemisphere" value={t(`geo.hemisphere.${coverage.hemisphere}`)} />
            <KeyValue label="Area" value={formatArea(Number(d.area), d.areaUnit, units)} />
            <KeyValue label="Elevation" value={d.elevationM ? `${d.elevationM} m (not used by engine)` : "Unknown"} />
            <KeyValue label="Farming method" value={`${d.farmingMethod} (not used by engine)`} />
            <KeyValue label="Saved to server" value={save.phase === "success" ? "Yes (in memory until server restart)" : save.phase === "skipped" ? "No — values not supported by backend" : save.phase} />
          </dl>
        </Card>

        <Card>
          <CardHeader title="Soil summary" />
          <dl>
            <KeyValue label="Soil type" value={d.soilType === "other" ? "Other / not listed" : d.soilType.replace(/_/g, " ")} />
            <KeyValue label="pH" value={unknown(d.soilPH)} />
            <KeyValue label="Organic carbon" value={unknown(d.organicCarbonPercent, "%")} />
            <KeyValue label="Nitrogen" value={unknown(d.nitrogenKgHa, "kg/ha")} />
            <KeyValue label="Phosphorus" value={unknown(d.phosphorusKgHa, "kg/ha")} />
            <KeyValue label="Potassium" value={unknown(d.potassiumKgHa, "kg/ha")} />
          </dl>
        </Card>
      </div>

      <Card>
        <CardHeader title="Climate summary" description={nasa.data ? `${nasa.data.product}` : undefined} />
        {nasa.data && climate ? (
          <>
            <div className="mb-3">
              {nasa.data.isLiveRetrieval ? <Badge tone="green">{t("data.live")}</Badge> : <Badge tone="amber">{t("data.illustrative")}</Badge>}
            </div>
            {!nasa.data.isLiveRetrieval && (
              <Banner tone="warning" className="mb-3">
                {t("data.fallbackOrigin", { region: coverage.nearestPilotRegion.district, distance: formatNumber(coverage.nearestPilotRegion.distanceKm, { digits: 0 }) })}
              </Banner>
            )}
            <dl className="grid gap-x-8 sm:grid-cols-2">
              <KeyValue label="Average temperature" value={formatTemperature(climate.t, units)} />
              <KeyValue label="Average max / min" value={`${formatTemperature(climate.tmax, units)} / ${formatTemperature(climate.tmin, units)}`} />
              <KeyValue label="Annual rainfall" value={formatPrecipitation(climate.rain, units, { digits: 0 })} />
              <KeyValue label="Relative humidity" value={formatPercent(climate.rh)} />
              <KeyValue label="Solar radiation" value={formatSolar(climate.solar)} />
              <KeyValue label="Root-zone soil wetness" value={formatWetnessFraction(climate.wetRoot)} />
              <KeyValue label="Data completeness" value={formatPercent(nasa.data.qualityInformation.completenessPercent)} />
              <KeyValue label="Period" value={`${nasa.data.startDate} → ${nasa.data.endDate}`} />
            </dl>
          </>
        ) : (
          <p className="text-sm text-slate-600">Climate data was not available: {nasa.errors.join("; ") || "not loaded"}.</p>
        )}
      </Card>

      <Card>
        <CardHeader title="Recommended crop rotations" />
        {recommendations.phase === "success" && recs.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-earth-200 text-left text-xs text-slate-500">
                  <th className="py-2 pr-3 font-medium">Strategy</th>
                  <th className="py-2 pr-3 font-medium">Sequence</th>
                  <th className="py-2 pr-3 font-medium">Engine score</th>
                  <th className="py-2 font-medium">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {recs.map((r) => (
                  <tr key={r.id} className="border-b border-earth-100 align-top">
                    <td className="py-2 pr-3 font-medium">{locale === "kn" ? r.kannadaTitle : r.strategyTitle}</td>
                    <td className="py-2 pr-3">{r.sequenceSteps.map((s) => `${s.cropName} (${s.seasonLabel})`).join(" → ")}</td>
                    <td className="py-2 pr-3 tabular-nums">{r.totalScore}/100</td>
                    <td className="py-2">{r.confidence.level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Banner tone="warning" title="No validated recommendations for this farm">
            <ul className="list-disc pl-5">
              {(recommendations.reasons.length ? recommendations.reasons : recommendations.errors).map((r) => <li key={r}>{r}</li>)}
            </ul>
          </Banner>
        )}
      </Card>

      <Card>
        <CardHeader title="Confidence and limitations" />
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
          <li>NASA POWER values are regional reanalysis averages (about 55 km grid), not measurements on this farm.</li>
          <li>Crop rotation recommendations are calibrated only for Karnataka, India (13 crops, 5 soil groups, Indian seasons).</li>
          {coverage.recommendationCoverage !== "calibrated_region" && <li>This farm is outside that region, so no recommendations are included.</li>}
          {mapping.blockers.map((b) => <li key={b}>{b}</li>)}
          {recs[0]?.confidence.missingEvidenceItems.map((m) => <li key={m}>Missing evidence: {m}</li>)}
          <li>Scores are decision support, not yield predictions. Confirm with local agronomists and a recent soil test.</li>
        </ul>
      </Card>
    </div>
  );
}
