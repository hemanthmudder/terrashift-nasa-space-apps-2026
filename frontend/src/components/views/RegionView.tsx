"use client";

import { useData } from "@/context/DataContext";
import { useSettings } from "@/context/SettingsContext";
import { PILOT_REGION } from "@/lib/region";
import { hemisphereOf } from "@/lib/seasons";
import { formatArea, formatNumber } from "@/lib/units";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { DatasetState, KeyValue, PageHeader } from "@/components/shared";

export function RegionView() {
  const { environment } = useData();
  const { units } = useSettings();
  const r = PILOT_REGION;
  const env = environment.status === "available" ? environment.data : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pilot region"
        description="The official TerraShift MVP region, from config/pilot_region.json. Farm-level entry is not part of this pilot; all data describes the county's NASA POWER grid cell."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={r.name} action={<Badge tone="green">Approved pilot</Badge>} />
          <dl>
            <KeyValue label="Region ID" value={<code>{r.id}</code>} />
            <KeyValue label="Country / state" value={`${r.country} · ${r.state}`} />
            <KeyValue label="County FIPS" value={r.fips} />
            <KeyValue label="SSURGO survey area" value={r.ssurgoAreaSymbol} />
            <KeyValue label="Internal point" value={`${formatNumber(r.internalPoint.latitude, { digits: 4 })}, ${formatNumber(r.internalPoint.longitude, { digits: 4 })}`} />
            <KeyValue label="Hemisphere" value={hemisphereOf(r.internalPoint.latitude) === "northern" ? "Northern" : "Southern"} />
            <KeyValue label="Land area" value={units === "imperial" ? `${formatArea(r.landAreaKm2 * 100, "hectares", "imperial")}` : `${formatNumber(r.landAreaKm2, { digits: 0 })} km²`} />
            <KeyValue label="Growing season" value={`${r.growingSeason.startMmdd} → ${r.growingSeason.endMmdd}`} />
            <KeyValue label="Climate period" value={`${r.climateStart} → ${r.climateEnd} (baseline ${r.climateBaseline})`} />
          </dl>
          <p className="mt-3 text-xs text-slate-500">Point source: {r.internalPoint.source}.</p>
        </Card>

        <Card>
          <CardHeader title="Soils and land cover" description="From environment_summary.json (METHODOLOGY §4.3), when the pipeline publishes it." />
          {env ? (
            <dl>
              <KeyValue label="Region in file" value={env.region.id} />
              <KeyValue label="Seasons summarised" value={env.climate_by_season.length} />
              {env.sources.map((s) => (
                <KeyValue key={s.id} label={`Source: ${s.id}`} value={`${s.version} · ${s.retrieved}`} />
              ))}
            </dl>
          ) : (
            <DatasetState result={environment} label="environment_summary.json" />
          )}
        </Card>
      </div>
    </div>
  );
}
