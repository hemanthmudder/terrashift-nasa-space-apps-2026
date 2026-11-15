"use client";

import Link from "next/link";
import { CalendarRange, CloudSun, FileText, Layers, MapPin, Sprout } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import { useData } from "@/context/DataContext";
import { PILOT_REGION } from "@/lib/region";
import { Badge, Card } from "@/components/ui/primitives";

const FEATURES = [
  { icon: MapPin, title: "Pilot region", body: "Story County, Iowa — the official TerraShift MVP region and its configuration.", href: "/farm" },
  { icon: CloudSun, title: "NASA climate insights", body: "Daily NASA POWER climate from the TerraShift pipeline: temperature, precipitation, humidity, wind, solar radiation and model soil wetness.", href: "/nasa-insights" },
  { icon: Layers, title: "Crop rotation comparison", body: "Shown only when the pipeline publishes genuine rotation comparison data.", href: "/recommendations" },
  { icon: CalendarRange, title: "Crop calendar", body: "The April–October growing season with the monthly climate pattern.", href: "/planner" },
  { icon: FileText, title: "Printable report", body: "Region, climate and data-availability summary you can print or save as PDF.", href: "/reports" },
];

function StatusBadge({ status }: { status: string }) {
  if (status === "available") return <Badge tone="green">Available</Badge>;
  if (status === "loading") return <Badge>Checking…</Badge>;
  if (status === "missing") return <Badge tone="amber">Not generated yet</Badge>;
  if (status === "placeholder") return <Badge tone="amber">Placeholder only</Badge>;
  return <Badge tone="red">Problem</Badge>;
}

export function HomeView() {
  const { t } = useSettings();
  const { climate, environment, rotations } = useData();

  return (
    <div className="space-y-10">
      <section className="overflow-hidden rounded-3xl bg-terra-800 px-6 py-12 text-white sm:px-10 sm:py-16">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-terra-100">
            <Sprout className="h-3.5 w-3.5" aria-hidden /> NASA Space Apps Challenge 2026 · {PILOT_REGION.name}
          </p>
          <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">{t("app.tagline")}</h1>
          <p className="mt-4 max-w-2xl text-base text-terra-100 sm:text-lg">
            TerraShift turns NASA Earth observation data into climate context for crop rotation decisions. The pilot covers Story
            County, Iowa, using NASA POWER data processed by the team&apos;s pipeline.
          </p>
          <div className="mt-8">
            <Link href="/nasa-insights" className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-terra-800 hover:bg-terra-50">
              {t("action.getStarted")}
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="data-heading">
        <h2 id="data-heading" className="mb-4 text-xl font-semibold text-terra-900">Data available right now</h2>
        <Card>
          <ul className="divide-y divide-earth-100 text-sm">
            <li className="flex flex-wrap items-center justify-between gap-2 py-2"><span>Daily climate (climate_daily.csv)</span><StatusBadge status={climate.status} /></li>
            <li className="flex flex-wrap items-center justify-between gap-2 py-2"><span>Environmental summary (environment_summary.json)</span><StatusBadge status={environment.status} /></li>
            <li className="flex flex-wrap items-center justify-between gap-2 py-2"><span>Rotation comparison (rotation_comparison.json)</span><StatusBadge status={rotations.status} /></li>
          </ul>
        </Card>
      </section>

      <section aria-labelledby="features-heading">
        <h2 id="features-heading" className="mb-4 text-xl font-semibold text-terra-900">What TerraShift does</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body, href }) => (
            <Link key={href} href={href} className="group rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-terra-600">
              <Card className="h-full transition-shadow group-hover:shadow-md">
                <Icon className="h-6 w-6 text-terra-600" aria-hidden />
                <h3 className="mt-3 font-semibold text-terra-900">{title}</h3>
                <p className="mt-1 text-sm text-slate-600">{body}</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
