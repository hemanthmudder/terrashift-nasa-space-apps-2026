/**
 * English (default) UI strings. English is the source of truth: every key
 * must exist here. Other languages may translate a subset; missing keys fall
 * back to English.
 *
 * Placeholders use {name} syntax and are filled by `translate`.
 */
export const en = {
  "app.name": "TerraShift",
  "app.tagline": "Smarter Crop Rotations. Healthier Soil. Climate-Ready Farms.",
  "app.subtitle": "NASA Space Apps 2026 · Agricultural decision support",

  "nav.home": "Home",
  "nav.farm": "Farm & Soil",
  "nav.climate": "Climate Insights",
  "nav.recommendations": "Crop Rotations",
  "nav.planner": "Crop Calendar",
  "nav.reports": "Reports",
  "nav.menu": "Menu",
  "nav.main": "Main navigation",

  "settings.language": "Language",
  "settings.units": "Units",
  "settings.metric": "Metric",
  "settings.imperial": "Imperial",

  "action.getStarted": "Get started",
  "action.retry": "Try again",
  "action.dismiss": "Dismiss",
  "action.print": "Print or save as PDF",

  "state.loading": "Loading…",
  "state.error.title": "Something went wrong",
  "state.empty.title": "Nothing to show yet",
  "state.unavailable.title": "Not available yet",
  "value.missing": "Not available",

  "data.live": "Live NASA POWER data",
  "data.illustrative": "Illustrative data — not a live NASA observation",
  "data.source": "Source",
  "data.dateRange": "Date range",
  "data.retrieved": "Retrieved",
  "data.fallbackOrigin":
    "These fallback values are built from the nearest Karnataka pilot region ({region}, {distance} km away), not from your farm's location.",

  "geo.hemisphere.northern": "Northern Hemisphere",
  "geo.hemisphere.southern": "Southern Hemisphere",
  "geo.band.tropical": "Tropical latitudes — seasons follow local rainfall patterns",
  "geo.band.subtropical_temperate": "Subtropical / temperate latitudes",
  "geo.band.polar": "Polar latitudes",
  "season.spring": "Spring",
  "season.summer": "Summer",
  "season.autumn": "Autumn",
  "season.winter": "Winter",

  "coverage.climate.global":
    "Climate insights use NASA POWER, which covers any location on Earth at about 55 km resolution.",
  "coverage.rec.calibrated":
    "This farm is inside the region the recommendation engine is calibrated for (Karnataka, India).",
  "coverage.rec.outside.title": "Crop rotation recommendations are not yet validated for this location",
  "coverage.rec.outside.body":
    "The recommendation engine currently uses a Karnataka crop database, Karnataka soil classes and Indian seasons (Kharif, Rabi, Zaid). Results for farms elsewhere would not reflect local crops or seasons, so they are not shown as recommendations.",
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
