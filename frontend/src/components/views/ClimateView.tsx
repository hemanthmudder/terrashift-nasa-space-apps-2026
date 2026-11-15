"use client";

import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CloudRain, Droplets, Sun, Thermometer, ThermometerSnowflake, ThermometerSun, Waves, Wind } from "lucide-react";
import { useData } from "@/context/DataContext";
import { useSettings } from "@/context/SettingsContext";
import { PILOT_REGION } from "@/lib/region";
import { baselineMean, growingSeasonSummaries, mean, monthlyClimatology, qcCounts } from "@/lib/data/summary";
import {
  MISSING,
  celsiusToFahrenheit,
  formatNumber,
  formatPercent,
  formatPrecipitation,
  formatSolar,
  formatTemperature,
  formatWetnessFraction,
  isPresent,
  mmToInches,
  type UnitSystem,
} from "@/lib/units";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { Banner } from "@/components/ui/feedback";
import { MetricCard } from "@/components/ui/MetricCard";
import { DatasetState, PageHeader } from "@/components/shared";

/** Growing degree days: °C·day, or °F·day (×1.8) in imperial. */
export function formatGdd(v: number | null, units: UnitSystem): string {
  if (!isPresent(v)) return MISSING;
  return units === "imperial" ? `${formatNumber(v * 1.8, { digits: 0 })} °F·day` : `${formatNumber(v, { digits: 0 })} °C·day`;
}

function formatWind(v: number | null, units: UnitSystem): string {
  if (!isPresent(v)) return MISSING;
  return units === "imperial" ? `${formatNumber(v * 2.236936, { digits: 1 })} mph` : `${formatNumber(v, { digits: 1 })} m/s`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function ClimateView() {
  const { climate } = useData();
  const { units, t } = useSettings();
  const rows = climate.status === "available" ? climate.data : null;
  const gs = PILOT_REGION.growingSeason;

  const stats = useMemo(() => {
    if (!rows) return null;
    const seasons = growingSeasonSummaries(rows, gs.startMmdd, gs.endMmdd);
    return {
      t: mean(rows, "tmean_c"),
      tmax: mean(rows, "tmax_c"),
      tmin: mean(rows, "tmin_c"),
      precip: mean(rows, "precip_mm"),
      rh: mean(rows, "rh_pct"),
      wind: mean(rows, "wind_ms"),
      srad: mean(rows, "srad_mj_m2"),
      wetTop: mean(rows, "soil_wet_top"),
      wetRoot: mean(rows, "soil_wet_root"),
      qc: qcCounts(rows),
      seasons,
      basePrecip: baselineMean(seasons, "precipMm", 1991, 2020),
      baseGdd: baselineMean(seasons, "gddC", 1991, 2020),
      monthly: monthlyClimatology(rows),
    };
  }, [rows, gs.startMmdd, gs.endMmdd]);

  const header = (
    <PageHeader
      title="NASA climate insights"
      description={`Daily NASA POWER climate for ${PILOT_REGION.name}, read from the pipeline's climate_daily.csv. Values represent one ~55 km grid cell at the county's internal point, not field measurements.`}
    />
  );

  if (!rows || !stats) return <>{header}<DatasetState result={climate} label="climate_daily.csv" /></>;

  const imperial = units === "imperial";
  const pUnit = imperial ? "in" : "mm";
  const tUnit = imperial ? "°F" : "°C";
  const days = (s: { validDays: number; totalDays: number }) =>
    s.validDays === s.totalDays ? `${s.validDays.toLocaleString()} days, none missing` : `${s.validDays.toLocaleString()} of ${s.totalDays.toLocaleString()} days have data`;

  const monthlyChart = stats.monthly.map((m) => ({
    label: MONTHS[m.month - 1],
    rain: m.precipMm === null ? null : imperial ? mmToInches(m.precipMm) : m.precipMm,
    tmax: m.tmaxC === null ? null : imperial ? celsiusToFahrenheit(m.tmaxC) : m.tmaxC,
    tmin: m.tminC === null ? null : imperial ? celsiusToFahrenheit(m.tminC) : m.tminC,
  }));
  const seasonChart = stats.seasons.map((s) => ({
    year: String(s.year),
    rain: s.precipMm === null ? null : imperial ? mmToInches(s.precipMm) : s.precipMm,
    gdd: s.gddC === null ? null : imperial ? s.gddC * 1.8 : s.gddC,
  }));
  const latest = stats.seasons[stats.seasons.length - 1];
  const anomaly =
    latest && latest.precipMm !== null && stats.basePrecip.value
      ? ((latest.precipMm - stats.basePrecip.value) / stats.basePrecip.value) * 100
      : null;

  return (
    <div className="space-y-6">
      {header}
      <Card>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="green">Pipeline output · climate_daily.csv</Badge>
          <span className="text-slate-600">
            {t("data.dateRange")}: {rows[0].date} → {rows[rows.length - 1].date} ({rows.length.toLocaleString()} days)
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {t("data.source")}: NASA POWER Daily API (community AG), fetched and cleaned by src/pipeline (contract v1.0). Quality flags:{" "}
          {stats.qc.ok.toLocaleString()} ok · {stats.qc.missing.toLocaleString()} missing · {stats.qc.out_of_range.toLocaleString()} out of range.
        </p>
        {stats.qc.ok !== rows.length && (
          <Banner tone="warning" className="mt-3">
            Some days have missing or out-of-range values. Those cells are shown as unavailable and are excluded from averages; seasonal
            totals for affected seasons are not shown.
          </Banner>
        )}
      </Card>

      <section aria-label="Climate averages" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard label="Average temperature" icon={<Thermometer className="h-4 w-4" />} value={formatTemperature(stats.t.value, units)} detail={days(stats.t)} missingLabel={t("value.missing")} />
        <MetricCard label="Average daily maximum" icon={<ThermometerSun className="h-4 w-4" />} value={formatTemperature(stats.tmax.value, units)} detail={days(stats.tmax)} missingLabel={t("value.missing")} />
        <MetricCard label="Average daily minimum" icon={<ThermometerSnowflake className="h-4 w-4" />} value={formatTemperature(stats.tmin.value, units)} detail={days(stats.tmin)} missingLabel={t("value.missing")} />
        <MetricCard label="Average precipitation" icon={<CloudRain className="h-4 w-4" />} value={formatPrecipitation(stats.precip.value, units, { suffix: "/day", digits: imperial ? 3 : 2 })} detail={days(stats.precip)} missingLabel={t("value.missing")} />
        <MetricCard label="Relative humidity" icon={<Droplets className="h-4 w-4" />} value={formatPercent(stats.rh.value)} detail={days(stats.rh)} missingLabel={t("value.missing")} />
        <MetricCard label="Wind speed (2 m)" icon={<Wind className="h-4 w-4" />} value={formatWind(stats.wind.value, units)} detail={days(stats.wind)} missingLabel={t("value.missing")} />
        <MetricCard label="Solar radiation" icon={<Sun className="h-4 w-4" />} value={formatSolar(stats.srad.value)} detail={days(stats.srad)} missingLabel={t("value.missing")} />
        <MetricCard label="Surface soil wetness (model)" icon={<Waves className="h-4 w-4" />} value={formatWetnessFraction(stats.wetTop.value)} detail={t("data.modelWetness")} missingLabel={t("value.missing")} />
        <MetricCard label="Root-zone soil wetness (model)" icon={<Waves className="h-4 w-4" />} value={formatWetnessFraction(stats.wetRoot.value)} detail={t("data.modelWetness")} missingLabel={t("value.missing")} />
        <MetricCard
          label={`Latest growing season (${latest?.year ?? "—"})`}
          icon={<CloudRain className="h-4 w-4" />}
          value={formatPrecipitation(latest?.precipMm ?? null, units, { digits: 0 })}
          detail={anomaly === null ? "Anomaly unavailable" : `${anomaly >= 0 ? "+" : ""}${formatNumber(anomaly, { digits: 0 })}% vs 1991–2020 mean`}
          missingLabel={t("value.missing")}
        />
      </section>

      <Card>
        <CardHeader
          title="Monthly climate pattern"
          description={`Mean monthly precipitation total (${pUnit}) with mean daily maximum and minimum temperature (${tUnit}), ${rows[0].date.slice(0, 4)}–${rows[rows.length - 1].date.slice(0, 4)}. Months with missing days are excluded, never zero-filled.`}
        />
        <div className="h-80 w-full">
          <ResponsiveContainer>
            <ComposedChart data={monthlyChart} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6decb" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="rain" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="temp" orientation="right" tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => (typeof v === "number" ? v.toFixed(1) : "—")} />
              <Legend />
              <Bar yAxisId="rain" dataKey="rain" name={`Precipitation (${pUnit})`} fill="#1d70b8" radius={[4, 4, 0, 0]} />
              <Line yAxisId="temp" dataKey="tmax" name={`Max temp (${tUnit})`} stroke="#c2410c" strokeWidth={2} dot={false} connectNulls={false} />
              <Line yAxisId="temp" dataKey="tmin" name={`Min temp (${tUnit})`} stroke="#2e6f40" strokeWidth={2} dot={false} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <CardHeader
          title={`Growing season ${gs.startMmdd} → ${gs.endMmdd}, by year`}
          description={`Season precipitation (${pUnit}) and corn growing degree days (${imperial ? "°F·day" : "°C·day"}, METHODOLOGY §3). Seasons with any missing day are left blank.`}
        />
        <div className="h-80 w-full">
          <ResponsiveContainer>
            <ComposedChart data={seasonChart} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6decb" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis yAxisId="rain" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="gdd" orientation="right" tick={{ fontSize: 12 }} domain={["auto", "auto"]} />
              <Tooltip formatter={(v: number) => (typeof v === "number" ? v.toFixed(0) : "—")} />
              <Legend />
              <Bar yAxisId="rain" dataKey="rain" name={`Season precipitation (${pUnit})`} fill="#7fb38f" radius={[3, 3, 0, 0]} />
              <Line yAxisId="gdd" dataKey="gdd" name="Growing degree days" stroke="#8c6d46" strokeWidth={2} dot={false} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <CardHeader title="Recent growing seasons" description="Computed in the browser from climate_daily.csv using the indicator definitions in METHODOLOGY §3." as="h3" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-earth-200 text-left text-xs text-slate-500">
                <th className="py-2 pr-3 font-medium">Season</th>
                <th className="py-2 pr-3 font-medium">Precipitation</th>
                <th className="py-2 pr-3 font-medium">GDD</th>
                <th className="py-2 pr-3 font-medium">Days ≥ 32 °C</th>
                <th className="py-2 pr-3 font-medium">Longest dry spell</th>
                <th className="py-2 pr-3 font-medium">Root-zone wetness (model)</th>
                <th className="py-2 font-medium">Missing days</th>
              </tr>
            </thead>
            <tbody>
              {stats.seasons.slice(-10).reverse().map((s) => (
                <tr key={s.year} className="border-b border-earth-100">
                  <td className="py-2 pr-3 font-medium">{s.year}</td>
                  <td className="py-2 pr-3 tabular-nums">{formatPrecipitation(s.precipMm, units, { digits: 0 })}</td>
                  <td className="py-2 pr-3 tabular-nums">{formatGdd(s.gddC, units)}</td>
                  <td className="py-2 pr-3 tabular-nums">{s.daysTmaxGe32 ?? MISSING}</td>
                  <td className="py-2 pr-3 tabular-nums">{s.longestDrySpellDays === null ? MISSING : `${s.longestDrySpellDays} days`}</td>
                  <td className="py-2 pr-3 tabular-nums">{formatWetnessFraction(s.soilWetRootMean)}</td>
                  <td className="py-2 tabular-nums">{s.missingDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          1991–2020 baseline: precipitation {formatPrecipitation(stats.basePrecip.value, units, { digits: 0 })} ({stats.basePrecip.years} seasons), GDD{" "}
          {formatGdd(stats.baseGdd.value, units)} ({stats.baseGdd.years} seasons). Dry spell = consecutive days with precipitation &lt; 1 mm.
        </p>
      </Card>
    </div>
  );
}
