/**
 * English (default) UI strings. Every key must exist here; other languages
 * may translate a subset and fall back to English.
 */
export const en = {
  "app.name": "TerraShift",
  "app.tagline": "Smarter Crop Rotations. Healthier Soil. Climate-Ready Farms.",
  "app.subtitle": "NASA Space Apps 2026 · Story County, Iowa pilot",

  "nav.home": "Home",
  "nav.farm": "Pilot Region",
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

  "action.getStarted": "Explore the pilot",
  "action.retry": "Try again",
  "action.print": "Print or save as PDF",

  "state.loading": "Loading…",
  "state.error.title": "Something went wrong",
  "value.missing": "Not available",

  "data.source": "Source",
  "data.dateRange": "Date range",
  "data.modelWetness": "Model estimate from NASA POWER (MERRA-2), not a soil measurement",

  "season.spring": "Spring",
  "season.summer": "Summer",
  "season.autumn": "Autumn",
  "season.winter": "Winter",

  "disclaimer.decisionSupport": "Decision support only; not a yield forecast.",
  "footer.coverage":
    "Climate data: NASA POWER daily point data for the Story County internal point (about 55 km grid cell), processed by the TerraShift pipeline.",
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
