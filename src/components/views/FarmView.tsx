"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import Link from "next/link";
import { LocateFixed, MapPin, Plus, Trash2 } from "lucide-react";
import { useFarm } from "@/context/FarmContext";
import { useSettings } from "@/context/SettingsContext";
import { KARNATAKA_PILOT_REGIONS } from "@/data/regions/karnatakaRegions";
import { KARNATAKA_CROPS } from "@/data/crops/karnatakaCrops";
import {
  BACKEND_SOIL_TYPES,
  IRRIGATION_TYPES,
  OTHER,
  newHistoryEntry,
  toBackendProfile,
  validateDraft,
  type CropHistoryEntry,
  type DraftErrors,
  type FarmDraft,
} from "@/lib/farm/draft";
import { assessCoverage, isValidLatitude, isValidLongitude } from "@/lib/geo/coverage";
import { Badge, Button, Card, CardHeader } from "@/components/ui/primitives";
import { Field, inputClassName } from "@/components/ui/Field";
import { Banner } from "@/components/ui/feedback";
import { CoverageNotice, PageHeader } from "@/components/shared";
import type { IrrigationType, SoilType } from "@/types/farm";

const SOIL_LABELS: Record<SoilType, string> = {
  red_sandy_loam: "Red sandy loam (Alfisol)",
  red_loam: "Red loam",
  black_cotton_clay: "Black cotton clay (Vertisol)",
  lateritic: "Lateritic",
  alluvial_loam: "Alluvial loam",
};

const IRRIGATION_LABELS: Record<IrrigationType, string> = {
  rainfed: "Rainfed only",
  protective_lifesaving: "Occasional / protective irrigation",
  borewell_drip_sprinkler: "Groundwater with drip or sprinkler",
  canal_command_assured: "Assured canal irrigation",
};

const SOIL_FIELDS = [
  { key: "soilPH", label: "Soil pH", unit: "" },
  { key: "organicCarbonPercent", label: "Soil organic carbon", unit: "%" },
  { key: "nitrogenKgHa", label: "Available nitrogen (N)", unit: "kg/ha" },
  { key: "phosphorusKgHa", label: "Available phosphorus (P)", unit: "kg/ha" },
  { key: "potassiumKgHa", label: "Available potassium (K)", unit: "kg/ha" },
] as const;

export function FarmView() {
  const { draft, setDraft, runAnalysis, analysing, save, nasa, recommendations, hydrated } = useFarm();
  const { t } = useSettings();
  const [errors, setErrors] = useState<DraftErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);

  const lat = Number(draft.latitude);
  const lon = Number(draft.longitude);
  const coordsValid = draft.latitude !== "" && draft.longitude !== "" && isValidLatitude(lat) && isValidLongitude(lon);
  const coverage = useMemo(() => (coordsValid ? assessCoverage(lat, lon) : null), [coordsValid, lat, lon]);
  const mapping = useMemo(() => toBackendProfile(draft), [draft]);

  const update = <K extends keyof FarmDraft>(key: K, value: FarmDraft[K]) => setDraft({ ...draft, [key]: value });
  const onText = (key: keyof FarmDraft) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    update(key, e.target.value as never);

  const updateHistory = (id: string, patch: Partial<CropHistoryEntry>) =>
    update("cropHistory", draft.cropHistory.map((h) => (h.id === id ? { ...h, ...patch } : h)));

  const applyPreset = (id: string) => {
    const p = KARNATAKA_PILOT_REGIONS.find((r) => r.id === id);
    if (!p) return;
    setDraft({
      ...draft,
      farmName: draft.farmName || `${p.district} farm`,
      country: "India",
      region: "Karnataka",
      locality: p.district,
      latitude: String(p.latitude),
      longitude: String(p.longitude),
      soilType: p.defaultSoilType,
      irrigationType: p.typicalIrrigation,
      previousCrop: p.commonPreviousCrop,
    });
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setGeoMessage("Your browser does not support location lookup. Enter coordinates instead.");
      return;
    }
    setGeoMessage("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDraft({ ...draft, latitude: pos.coords.latitude.toFixed(4), longitude: pos.coords.longitude.toFixed(4) });
        setGeoMessage("Coordinates filled from your device. Check they match the farm, not your current position.");
      },
      () => setGeoMessage("Location permission was denied or unavailable. Enter coordinates instead.")
    );
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validateDraft(draft);
    setErrors(errs);
    if (Object.keys(errs).length) {
      setSubmitted(false);
      return;
    }
    setSubmitted(true);
    await runAnalysis(draft);
  };

  if (!hydrated) return null;

  const errorCount = Object.keys(errors).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Farm location & soil profile"
        description="Enter your farm's location and what you know about its soil. Leave any soil test value blank if it is unknown."
      />

      <form onSubmit={onSubmit} noValidate className="space-y-6">
        {errorCount > 0 && (
          <Banner tone="error" title={`Please fix ${errorCount} field${errorCount > 1 ? "s" : ""} before continuing.`} />
        )}

        <Card>
          <CardHeader
            title="Location"
            description="Use coordinates for any farm in the world, or start from a Karnataka pilot location."
          />
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600">Karnataka pilot locations:</span>
            {KARNATAKA_PILOT_REGIONS.map((r) => (
              <Button key={r.id} variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => applyPreset(r.id)}>
                <MapPin className="h-3.5 w-3.5" aria-hidden /> {r.district}
              </Button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Farm name">
              <input className={inputClassName} value={draft.farmName} onChange={onText("farmName")} placeholder="e.g. North field" />
            </Field>
            <Field label="Country" required error={errors.country}>
              <input className={inputClassName} value={draft.country} onChange={onText("country")} autoComplete="country-name" />
            </Field>
            <Field label="State / province / region">
              <input className={inputClassName} value={draft.region} onChange={onText("region")} autoComplete="address-level1" />
            </Field>
            <Field label="District or locality">
              <input className={inputClassName} value={draft.locality} onChange={onText("locality")} autoComplete="address-level2" />
            </Field>
            <Field label="Latitude" required error={errors.latitude} hint="Decimal degrees; south is negative.">
              <input className={inputClassName} inputMode="decimal" value={draft.latitude} onChange={onText("latitude")} placeholder="e.g. -1.2921" />
            </Field>
            <Field label="Longitude" required error={errors.longitude} hint="Decimal degrees; west is negative.">
              <input className={inputClassName} inputMode="decimal" value={draft.longitude} onChange={onText("longitude")} placeholder="e.g. 36.8219" />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="ghost" onClick={useMyLocation}>
              <LocateFixed className="h-4 w-4" aria-hidden /> Use my device location
            </Button>
            {geoMessage && <span className="text-sm text-slate-600" role="status">{geoMessage}</span>}
          </div>
          {coverage && (
            <div className="mt-5 space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge tone="blue">{t(`geo.hemisphere.${coverage.hemisphere}`)}</Badge>
                <Badge>{t(`geo.band.${coverage.latitudeBand}`)}</Badge>
              </div>
              <CoverageNotice coverage={coverage} />
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Farm details" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Farm area" required error={errors.area}>
              <input className={inputClassName} inputMode="decimal" value={draft.area} onChange={onText("area")} />
            </Field>
            <Field label="Area unit">
              <select className={inputClassName} value={draft.areaUnit} onChange={onText("areaUnit")}>
                <option value="hectares">Hectares</option>
                <option value="acres">Acres</option>
              </select>
            </Field>
            <Field label="Elevation (m)" error={errors.elevationM} hint="Optional. Not used by the recommendation engine.">
              <input className={inputClassName} inputMode="decimal" value={draft.elevationM} onChange={onText("elevationM")} />
            </Field>
            <Field label="Farming method" hint="Not used by the recommendation engine.">
              <select className={inputClassName} value={draft.farmingMethod} onChange={onText("farmingMethod")}>
                <option value="unspecified">Prefer not to say</option>
                <option value="conventional">Conventional</option>
                <option value="conservation">Conservation / reduced tillage</option>
                <option value="organic">Organic</option>
                <option value="mixed">Mixed</option>
              </select>
            </Field>
            <Field label="Irrigation availability" className="sm:col-span-2">
              <select className={inputClassName} value={draft.irrigationType} onChange={onText("irrigationType")}>
                {IRRIGATION_TYPES.map((i) => (
                  <option key={i} value={i}>{IRRIGATION_LABELS[i]}</option>
                ))}
              </select>
            </Field>
            <Field label="Most recent crop" className="sm:col-span-2" hint="Choose 'Other' if your crop is not listed.">
              <select className={inputClassName} value={draft.previousCrop} onChange={onText("previousCrop")}>
                <option value={OTHER}>Other / not listed</option>
                {KARNATAKA_CROPS.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Soil profile" description="From a soil test report if you have one. Blank means unknown — it is never treated as zero." />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Soil type" hint="The recommendation engine supports these Karnataka soil groups. Choose 'Other' otherwise.">
              <select className={inputClassName} value={draft.soilType} onChange={onText("soilType")}>
                <option value={OTHER}>Other / not listed</option>
                {BACKEND_SOIL_TYPES.map((s) => (
                  <option key={s} value={s}>{SOIL_LABELS[s]}</option>
                ))}
              </select>
            </Field>
            {SOIL_FIELDS.map((f) => (
              <Field key={f.key} label={`${f.label}${f.unit ? ` (${f.unit})` : ""}`} error={errors[f.key]}>
                <input className={inputClassName} inputMode="decimal" value={draft[f.key]} onChange={onText(f.key)} placeholder="Unknown" />
              </Field>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Cropping history"
            description="Record previous crops in any language or naming. Used for your calendar and report; not sent to the recommendation engine."
            action={
              <Button variant="secondary" onClick={() => update("cropHistory", [...draft.cropHistory, newHistoryEntry()])}>
                <Plus className="h-4 w-4" aria-hidden /> Add crop
              </Button>
            }
          />
          {errors.cropHistory && <Banner tone="error" className="mb-4">{errors.cropHistory}</Banner>}
          {draft.cropHistory.length === 0 ? (
            <p className="text-sm text-slate-500">No previous crops added.</p>
          ) : (
            <ul className="space-y-3">
              {draft.cropHistory.map((h, idx) => (
                <li key={h.id} className="grid items-end gap-3 rounded-xl border border-earth-200 p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                  <Field label={`Crop ${idx + 1}`}>
                    <input className={inputClassName} value={h.cropName} onChange={(e) => updateHistory(h.id, { cropName: e.target.value })} />
                  </Field>
                  <Field label="Planting date">
                    <input type="date" className={inputClassName} value={h.plantingDate} onChange={(e) => updateHistory(h.id, { plantingDate: e.target.value })} />
                  </Field>
                  <Field label="Harvest date">
                    <input type="date" className={inputClassName} value={h.harvestDate} onChange={(e) => updateHistory(h.id, { harvestDate: e.target.value })} />
                  </Field>
                  <Field label="Irrigated?">
                    <select
                      className={inputClassName}
                      value={h.irrigated === null ? "" : h.irrigated ? "yes" : "no"}
                      onChange={(e) => updateHistory(h.id, { irrigated: e.target.value === "" ? null : e.target.value === "yes" })}
                    >
                      <option value="">Unknown</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </Field>
                  <Button variant="ghost" aria-label={`Remove crop ${idx + 1}`} onClick={() => update("cropHistory", draft.cropHistory.filter((x) => x.id !== h.id))}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {mapping.blockers.length > 0 && (
          <Banner tone="info" title="Climate insights will work; recommendations need supported values">
            <ul className="list-disc pl-5">
              {mapping.blockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
          </Banner>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={analysing}>
            {analysing ? t("state.loading") : "Save & analyse farm"}
          </Button>
          <span className="text-xs text-slate-500">Your farm details are saved in this browser.</span>
        </div>
      </form>

      {submitted && !analysing && (
        <Card aria-live="polite">
          <CardHeader title="Analysis status" />
          <ul className="space-y-2 text-sm">
            <StatusLine label="Farm profile saved to server" phase={save.phase} detail={save.errors[0] ?? save.reasons[0]} />
            <StatusLine label="NASA climate data" phase={nasa.phase} detail={nasa.errors[0]} />
            <StatusLine label="Crop rotation recommendations" phase={recommendations.phase} detail={recommendations.errors[0] ?? recommendations.reasons[0]} />
          </ul>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/nasa-insights" className="rounded-lg bg-terra-600 px-4 py-2 text-sm font-medium text-white hover:bg-terra-700">View climate insights</Link>
            <Link href="/recommendations" className="rounded-lg border border-earth-200 px-4 py-2 text-sm font-medium text-terra-800 hover:bg-terra-50">View recommendations</Link>
          </div>
        </Card>
      )}
    </div>
  );
}

function StatusLine({ label, phase, detail }: { label: string; phase: string; detail?: string }) {
  const tone = phase === "success" ? "green" : phase === "error" ? "red" : phase === "skipped" ? "amber" : "neutral";
  const text = { success: "Done", error: "Failed", skipped: "Not available", loading: "Loading", idle: "Not started" }[phase] ?? phase;
  return (
    <li className="flex flex-wrap items-start gap-2">
      <Badge tone={tone}>{text}</Badge>
      <span className="font-medium text-slate-800">{label}</span>
      {detail && <span className="w-full text-slate-500 sm:w-auto">— {detail}</span>}
    </li>
  );
}
