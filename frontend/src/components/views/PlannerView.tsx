"use client";

import { useMemo } from "react";
import { useData } from "@/context/DataContext";
import { useSettings } from "@/context/SettingsContext";
import { PILOT_REGION } from "@/lib/region";
import { monthsInGrowingSeason, temperateSeason } from "@/lib/seasons";
import { monthlyClimatology } from "@/lib/data/summary";
import { formatPrecipitation, formatTemperature } from "@/lib/units";
import { Badge, Card, CardHeader, cx } from "@/components/ui/primitives";
import { DatasetState, PageHeader } from "@/components/shared";
import { RotationComparisonTable } from "./RecommendationsView";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function PlannerView() {
  const { climate, rotations } = useData();
  const { t, units } = useSettings();
  const lat = PILOT_REGION.internalPoint.latitude;
  const gs = PILOT_REGION.growingSeason;
  const seasonMonths = monthsInGrowingSeason(gs.startMmdd, gs.endMmdd);
  const monthly = useMemo(() => (climate.status === "available" ? monthlyClimatology(climate.data) : null), [climate]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Crop calendar"
        description={`Growing season ${gs.startMmdd} → ${gs.endMmdd} from config/pilot_region.json, with local Northern Hemisphere seasons and the monthly climate pattern from climate_daily.csv.`}
      />

      <Card>
        <CardHeader title="Season calendar" description="Highlighted months are inside the official growing season." />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-12">
          {MONTHS.map((label, i) => {
            const m = i + 1;
            const inSeason = seasonMonths.includes(m);
            const point = monthly?.[i];
            return (
              <div
                key={label}
                className={cx("rounded-xl border p-2 text-center text-xs", inSeason ? "border-terra-200 bg-terra-50" : "border-earth-200 bg-white")}
              >
                <p className="font-semibold text-slate-900">{label}</p>
                <p className="text-slate-500">{t(`season.${temperateSeason(m, lat)}`)}</p>
                {inSeason && <p className="mt-1 font-medium text-terra-700">Growing</p>}
                {point && (
                  <p className="mt-1 text-[11px] leading-tight text-slate-600">
                    {formatPrecipitation(point.precipMm, units, { digits: units === "imperial" ? 1 : 0 })}
                    <br />
                    {formatTemperature(point.tmaxC, units, { digits: 0 })}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {!monthly && (
          <div className="mt-4">
            <DatasetState result={climate} label="climate_daily.csv" />
          </div>
        )}
        {monthly && (
          <p className="mt-3 text-xs text-slate-500">
            Per month: mean monthly precipitation total and mean daily maximum temperature from climate_daily.csv.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader title="Rotation timeline" description="Sowing and harvest scheduling for recommended rotations." />
        {rotations.status === "available" ? (
          <>
            <Badge tone="blue">From rotation_comparison.json</Badge>
            <div className="mt-4">
              <RotationComparisonTable data={rotations.data} />
            </div>
          </>
        ) : (
          <DatasetState result={rotations} label="rotation_comparison.json" />
        )}
        <p className="mt-3 text-xs text-slate-500">{t("disclaimer.decisionSupport")}</p>
      </Card>
    </div>
  );
}
