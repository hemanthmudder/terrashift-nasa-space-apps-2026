"use client";

import Link from "next/link";
import { CalendarRange, CloudSun, FileText, Globe2, Layers, Sprout } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import { useFarm } from "@/context/FarmContext";
import { Card } from "@/components/ui/primitives";
import { Banner } from "@/components/ui/feedback";

const FEATURES = [
  { icon: Globe2, title: "Farms anywhere", body: "Enter any location by coordinates. Hemisphere and local seasons come from your latitude.", href: "/farm" },
  { icon: CloudSun, title: "NASA climate insights", body: "Temperature, rainfall, humidity, solar radiation and soil wetness from NASA POWER, with source and date range.", href: "/nasa-insights" },
  { icon: Layers, title: "Three rotation strategies", body: "Balanced, water-conscious and soil-improvement rotations from the TerraShift engine, with confidence and caveats.", href: "/recommendations" },
  { icon: CalendarRange, title: "Crop calendar", body: "Sowing and harvest windows plus your own cropping history on a month-by-month timeline.", href: "/planner" },
  { icon: FileText, title: "Printable report", body: "Farm, soil, climate and recommendation summary you can print or save as PDF.", href: "/reports" },
];

export function HomeView() {
  const { t } = useSettings();
  const { analysedDraft } = useFarm();

  return (
    <div className="space-y-10">
      <section className="overflow-hidden rounded-3xl bg-terra-800 px-6 py-12 text-white sm:px-10 sm:py-16">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-terra-100">
            <Sprout className="h-3.5 w-3.5" aria-hidden /> NASA Space Apps Challenge 2026
          </p>
          <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">{t("app.tagline")}</h1>
          <p className="mt-4 max-w-2xl text-base text-terra-100 sm:text-lg">
            TerraShift combines NASA Earth observation data with agronomy rules to help farmers understand their climate and
            soil, compare crop rotations and plan more sustainable seasons.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/farm" className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-terra-800 hover:bg-terra-50">
              {t("action.getStarted")}
            </Link>
            {analysedDraft && (
              <Link href="/nasa-insights" className="rounded-lg border border-white/30 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10">
                View your latest analysis
              </Link>
            )}
          </div>
        </div>
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

      <section aria-labelledby="coverage-heading" className="space-y-3">
        <h2 id="coverage-heading" className="text-xl font-semibold text-terra-900">Data coverage today</h2>
        <Banner tone="info" title="Climate insights: global">
          {t("coverage.climate.global")}
        </Banner>
        <Banner tone="warning" title="Crop rotation recommendations: Karnataka, India only">
          The recommendation engine is currently calibrated for five Karnataka pilot regions, with a 13-crop database and
          Indian growing seasons. Farms elsewhere receive climate insights, but rotation recommendations are clearly marked
          as not yet available for their region.
        </Banner>
      </section>
    </div>
  );
}
