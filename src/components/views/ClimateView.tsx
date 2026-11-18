"use client";

import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CloudRain, Droplets, Sun, Thermometer, ThermometerSnowflake, ThermometerSun, Waves } from "lucide-react";
import { useFarm } from "@/context/FarmContext";
import { useSettings } from "@/context/SettingsContext";
import { meanAnnualPrecipitation, meanOf, monthlyChartData } from "@/lib/climate/observed";
import {
  celsiusToFahrenheit,
  formatPercent,
  formatPrecipitation,
  formatSolar,
  formatTemperature,
  formatWetnessFraction,
  mmToInches,
} from "@/lib/units";
import { Card, CardHeader } from "@/components/ui/primitives";
import { ErrorState, LoadingState } from "@/components/ui/feedback";
import { MetricCard } from "@/components/ui/MetricCard";
import { NasaProvenance, NeedsAnalysis, PageHeader } from "@/components/shared";

export function ClimateView() {
  const { nasa, coverage, analysedDraft, runAnalysis } = useFarm();
  const { t, units } = useSettings();
  const data = nasa.data;

  const metrics = useMemo(() => {
    if (!data) return null;
    const obs = data.observations;
    return {
      t: meanOf(obs, "t2m"),
      tmax: meanOf(obs, "t2mMax"),
      tmin: meanOf(obs, "t2mMin"),
      rainDay: meanOf(obs, "precipMm"),
      rainYear: meanAnnualPrecipitation(obs),
      rh: meanOf(obs, "rh2m"),
      solar: meanOf(obs, "solarRadMjM2"),
      wetTop: meanOf(obs, "surfaceSoilWetness"),
      wetRoot: meanOf(obs, "rootZoneSoilWetness"),
    };
  }, [data]);

  const chart = useMemo(() => {
    if (!data) return [];
    const imperial = units === "imperial";
    return monthlyChartData(data.monthlyClimatology, data.observations).map((m) => ({
      label: m.label,
      rain: m.rainMm === null ? null : imperial ? mmToInches(m.rainMm) : m.rainMm,
      tmax: m.maxTempC === null ? null : imperial ? celsiusToFahrenheit(m.maxTempC) : m.maxTempC,
      tmin: m.minTempC === null ? null : imperial ? celsiusToFahrenheit(m.minTempC) : m.minTempC,
    }));
  }, [data, units]);

  const annual = useMemo(
    () =>
      data?.annualRecords.map((r) => ({
        year: String(r.year),
        rain: units === "imperial" ? mmToInches(r.totalRainMm) : r.totalRainMm,
        temp: units === "imperial" ? celsiusToFahrenheit(r.meanTempC) : r.meanTempC,
      })) ?? [],
    [data, units]
  );

  const header = (
    <PageHeader
      title="NASA climate insights"
      description="Daily NASA POWER agroclimatology for your farm's coordinates, summarised. Values are regional (about 55 km grid), not field measurements."
    />
  );

  if (!analysedDraft) return <>{header}<NeedsAnalysis what="NASA climate insights" /></>;
  if (nasa.phase === "loading") return <>{header}<LoadingState label="Loading NASA POWER data…" /></>;
  if (nasa.phase === "error" || !data || !metrics) {
    return (
      <>
        {header}
        <ErrorState
          title="NASA climate data could not be loaded"
          messages={nasa.errors.length ? nasa.errors : ["No climate data is available for this farm."]}
          onRetry={() => runAnalysis(analysedDraft)}
          retryLabel={t("action.retry")}
        />
      </>
    );
  }

  const tUnit = units === "imperial" ? "°F" : "°C";
  const pUnit = units === "imperial" ? "in" : "mm";
  const dayNote = (n: number) => `Mean of ${n.toLocaleString()} valid days`;

  return (
    <div className="space-y-6">
      {header}
      <Card>
        <NasaProvenance data={data} coverage={coverage} />
      </Card>

      <section aria-label="Climate metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Average temperature" icon={<Thermometer className="h-4 w-4" />} value={formatTemperature(metrics.t.mean, units)} detail={dayNote(metrics.t.validDays)} missingLabel={t("value.missing")} />
        <MetricCard label="Average daily maximum" icon={<ThermometerSun className="h-4 w-4" />} value={formatTemperature(metrics.tmax.mean, units)} detail={dayNote(metrics.tmax.validDays)} missingLabel={t("value.missing")} />
        <MetricCard label="Average daily minimum" icon={<ThermometerSnowflake className="h-4 w-4" />} value={formatTemperature(metrics.tmin.mean, units)} detail={dayNote(metrics.tmin.validDays)} missingLabel={t("value.missing")} />
        <MetricCard label="Annual rainfall" icon={<CloudRain className="h-4 w-4" />} value={formatPrecipitation(metrics.rainYear, units, { digits: 0 })} detail={`Daily mean ${formatPrecipitation(metrics.rainDay.mean, units, { suffix: "/day" })}`} missingLabel={t("value.missing")} />
        <MetricCard label="Relative humidity" icon={<Droplets className="h-4 w-4" />} value={formatPercent(metrics.rh.mean)} detail={dayNote(metrics.rh.validDays)} missingLabel={t("value.missing")} />
        <MetricCard label="Solar radiation" icon={<Sun className="h-4 w-4" />} value={formatSolar(metrics.solar.mean)} detail={dayNote(metrics.solar.validDays)} missingLabel={t("value.missing")} />
        <MetricCard label="Surface soil wetness" icon={<Waves className="h-4 w-4" />} value={formatWetnessFraction(metrics.wetTop.mean)} detail="Top ~5 cm, saturation fraction" missingLabel={t("value.missing")} />
        <MetricCard label="Root-zone soil wetness" icon={<Waves className="h-4 w-4" />} value={formatWetnessFraction(metrics.wetRoot.mean)} detail="0–100 cm, saturation fraction" missingLabel={t("value.missing")} />
      </section>

      <Card>
        <CardHeader title="Monthly climate pattern" description={`Average monthly rainfall (${pUnit}) with average daily maximum and minimum temperature (${tUnit}). Months without valid data are left blank.`} />
        <div className="h-80 w-full">
          <ResponsiveContainer>
            <ComposedChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6decb" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="rain" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="temp" orientation="right" tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => (typeof v === "number" ? v.toFixed(1) : "—")} />
              <Legend />
              <Bar yAxisId="rain" dataKey="rain" name={`Rainfall (${pUnit})`} fill="#1d70b8" radius={[4, 4, 0, 0]} />
              <Line yAxisId="temp" dataKey="tmax" name={`Max temp (${tUnit})`} stroke="#c2410c" strokeWidth={2} dot={false} connectNulls={false} />
              <Line yAxisId="temp" dataKey="tmin" name={`Min temp (${tUnit})`} stroke="#2e6f40" strokeWidth={2} dot={false} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {annual.length > 1 && (
        <Card>
          <CardHeader title="Year-by-year trend" description={`Total rainfall (${pUnit}) and mean temperature (${tUnit}) per year in the selected period.`} />
          <div className="h-72 w-full">
            <ResponsiveContainer>
              <ComposedChart data={annual} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6decb" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="rain" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="temp" orientation="right" tick={{ fontSize: 12 }} domain={["auto", "auto"]} />
                <Tooltip formatter={(v: number) => (typeof v === "number" ? v.toFixed(1) : "—")} />
                <Legend />
                <Bar yAxisId="rain" dataKey="rain" name={`Rainfall (${pUnit})`} fill="#7fb38f" radius={[4, 4, 0, 0]} />
                <Line yAxisId="temp" dataKey="temp" name={`Mean temp (${tUnit})`} stroke="#8c6d46" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Data quality" as="h3" />
        <p className="text-sm text-slate-700">
          {data.qualityInformation.validObservationDays.toLocaleString()} of {data.qualityInformation.totalDaysRequested.toLocaleString()} requested days
          had valid observations ({formatPercent(data.qualityInformation.completenessPercent)} complete). Resolution: {data.spatialResolution}.
        </p>
        <p className="mt-2 text-sm text-slate-600">{data.qualityInformation.spatialFootprintDisclaimer}</p>
      </Card>
    </div>
  );
}
