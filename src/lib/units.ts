/**
 * Display-only unit conversion and formatting.
 *
 * The backend always works in metric (°C, mm, MJ/m², kg/ha). These helpers
 * convert for display and never change what is sent to the API. Missing
 * values (null, undefined, NaN, ±Infinity) always render as an em dash,
 * never as zero.
 */

export type UnitSystem = "metric" | "imperial";

export const MISSING = "—";

const ACRES_PER_HECTARE = 2.4710538147;
const MM_PER_INCH = 25.4;
/** 1 kg/ha = 0.892179 lb/acre. */
const LB_PER_ACRE_PER_KG_PER_HA = 0.8921791216;

export function isPresent(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export const celsiusToFahrenheit = (c: number) => (c * 9) / 5 + 32;
export const mmToInches = (mm: number) => mm / MM_PER_INCH;
export const hectaresToAcres = (ha: number) => ha * ACRES_PER_HECTARE;
export const acresToHectares = (ac: number) => ac / ACRES_PER_HECTARE;
export const kgPerHaToLbPerAcre = (v: number) => v * LB_PER_ACRE_PER_KG_PER_HA;

export interface FormatOptions {
  locale?: string;
  /** Maximum fraction digits (default 1). */
  digits?: number;
}

export function formatNumber(value: number | null | undefined, opts: FormatOptions = {}): string {
  if (!isPresent(value)) return MISSING;
  return new Intl.NumberFormat(opts.locale ?? "en", {
    maximumFractionDigits: opts.digits ?? 1,
    minimumFractionDigits: 0,
  }).format(value);
}

/** Celsius input. */
export function formatTemperature(c: number | null | undefined, system: UnitSystem, opts: FormatOptions = {}): string {
  if (!isPresent(c)) return MISSING;
  return system === "imperial"
    ? `${formatNumber(celsiusToFahrenheit(c), opts)} °F`
    : `${formatNumber(c, opts)} °C`;
}

/** Millimetre input (a total or a per-day value; pass `suffix` such as "/day"). */
export function formatPrecipitation(
  mm: number | null | undefined,
  system: UnitSystem,
  opts: FormatOptions & { suffix?: string } = {}
): string {
  if (!isPresent(mm)) return MISSING;
  const suffix = opts.suffix ?? "";
  return system === "imperial"
    ? `${formatNumber(mmToInches(mm), { ...opts, digits: opts.digits ?? 2 })} in${suffix}`
    : `${formatNumber(mm, opts)} mm${suffix}`;
}

export type AreaUnit = "hectares" | "acres";

/** Converts an area between hectares and acres. */
export function convertArea(value: number, from: AreaUnit, to: AreaUnit): number {
  if (from === to) return value;
  return from === "hectares" ? hectaresToAcres(value) : acresToHectares(value);
}

export function formatArea(
  value: number | null | undefined,
  unit: AreaUnit,
  system: UnitSystem,
  opts: FormatOptions = {}
): string {
  if (!isPresent(value)) return MISSING;
  const target: AreaUnit = system === "imperial" ? "acres" : "hectares";
  const converted = convertArea(value, unit, target);
  return `${formatNumber(converted, { ...opts, digits: opts.digits ?? 2 })} ${target === "acres" ? "ac" : "ha"}`;
}

/** kg/ha input (soil nutrient levels). */
export function formatNutrient(kgHa: number | null | undefined, system: UnitSystem, opts: FormatOptions = {}): string {
  if (!isPresent(kgHa)) return MISSING;
  return system === "imperial"
    ? `${formatNumber(kgPerHaToLbPerAcre(kgHa), { ...opts, digits: opts.digits ?? 0 })} lb/ac`
    : `${formatNumber(kgHa, { ...opts, digits: opts.digits ?? 0 })} kg/ha`;
}

/** Percentages are unit-system independent. */
export function formatPercent(value: number | null | undefined, opts: FormatOptions = {}): string {
  if (!isPresent(value)) return MISSING;
  return `${formatNumber(value, opts)}%`;
}

/** NASA POWER soil wetness is a 0–1 saturation fraction; shown as a percentage. */
export function formatWetnessFraction(fraction: number | null | undefined, opts: FormatOptions = {}): string {
  if (!isPresent(fraction)) return MISSING;
  return formatPercent(fraction * 100, { ...opts, digits: opts.digits ?? 0 });
}

/** Solar radiation (MJ/m²/day) has no common imperial display unit, so it is never converted. */
export function formatSolar(mj: number | null | undefined, opts: FormatOptions = {}): string {
  if (!isPresent(mj)) return MISSING;
  return `${formatNumber(mj, opts)} MJ/m²/day`;
}
