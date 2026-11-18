/**
 * Stage 1 frontend foundation tests: coverage/hemisphere logic, unit
 * formatting, translations and the typed API client (fetch is faked).
 */

import { describe, it, expect } from "vitest";
import {
  assessCoverage,
  distanceKm,
  findNearestPilotRegion,
  getHemisphere,
  getLatitudeBand,
  getTemperateSeason,
  isInsideKarnataka,
} from "../lib/geo/coverage";
import {
  MISSING,
  acresToHectares,
  celsiusToFahrenheit,
  formatArea,
  formatNutrient,
  formatPrecipitation,
  formatTemperature,
  formatWetnessFraction,
  hectaresToAcres,
} from "../lib/units";
import { LOCALES, translate } from "../lib/i18n";
import { en } from "../lib/i18n/en";
import {
  ApiError,
  extractErrorMessages,
  getNasaData,
  getRecommendations,
  saveFarmProfile,
} from "../lib/api/client";
import type { FarmProfile } from "../types/farm";

// ---------------------------------------------------------------- coverage

describe("hemisphere and latitude band", () => {
  it("derives hemisphere from latitude, not an assumption", () => {
    expect(getHemisphere(14.46)).toBe("northern"); // Davanagere
    expect(getHemisphere(-34.6)).toBe("southern"); // Buenos Aires
    expect(getHemisphere(-1.29)).toBe("southern"); // Nairobi
    expect(getHemisphere(0)).toBe("northern");
  });

  it("classifies latitude bands", () => {
    expect(getLatitudeBand(14.46)).toBe("tropical");
    expect(getLatitudeBand(-23.44)).toBe("tropical");
    expect(getLatitudeBand(42.04)).toBe("subtropical_temperate"); // Iowa
    expect(getLatitudeBand(-45)).toBe("subtropical_temperate");
    expect(getLatitudeBand(70)).toBe("polar");
  });
});

describe("temperate seasons", () => {
  it("flips seasons between hemispheres", () => {
    expect(getTemperateSeason(7, 42)).toBe("summer");
    expect(getTemperateSeason(7, -35)).toBe("winter");
    expect(getTemperateSeason(1, 42)).toBe("winter");
    expect(getTemperateSeason(1, -35)).toBe("summer");
    expect(getTemperateSeason(4, 50)).toBe("spring");
    expect(getTemperateSeason(4, -40)).toBe("autumn");
    expect(getTemperateSeason(10, -40)).toBe("spring");
  });

  it("returns null in the tropics instead of inventing seasons", () => {
    expect(getTemperateSeason(7, 14.46)).toBeNull();
    expect(getTemperateSeason(7, -1.29)).toBeNull();
  });

  it("rejects invalid months", () => {
    expect(() => getTemperateSeason(0, 40)).toThrow(RangeError);
    expect(() => getTemperateSeason(13, 40)).toThrow(RangeError);
    expect(() => getTemperateSeason(2.5, 40)).toThrow(RangeError);
  });
});

describe("recommendation coverage", () => {
  it("treats Karnataka pilot coordinates as the calibrated region", () => {
    const c = assessCoverage(14.4644, 75.9218);
    expect(c.recommendationCoverage).toBe("calibrated_region");
    expect(c.climateDataAvailable).toBe(true);
    expect(c.nearestPilotRegion.id).toBe("davanagere");
    expect(c.nearestPilotRegion.distanceKm).toBeLessThan(0.01);
  });

  it("marks locations elsewhere as outside the calibrated region", () => {
    for (const [lat, lon] of [
      [42.0375, -93.4661], // Story County, Iowa
      [-1.29, 36.82], // Nairobi
      [-34.6, -58.38], // Buenos Aires
      [52.52, 13.4], // Berlin
      [-33.87, 151.21], // Sydney
      [28.61, 77.21], // Delhi (India, but not Karnataka)
    ]) {
      expect(isInsideKarnataka(lat, lon)).toBe(false);
      expect(assessCoverage(lat, lon).recommendationCoverage).toBe("outside_calibrated_region");
    }
  });

  it("reports the nearest pilot region used by the backend fallback", () => {
    const nearest = findNearestPilotRegion(42.0375, -93.4661);
    expect(nearest.id).toBeTruthy();
    expect(nearest.distanceKm).toBeGreaterThan(10000);
  });

  it("rejects invalid coordinates", () => {
    expect(() => assessCoverage(91, 0)).toThrow(RangeError);
    expect(() => assessCoverage(0, -181)).toThrow(RangeError);
    expect(() => assessCoverage(Number.NaN, 0)).toThrow(RangeError);
  });

  it("computes great-circle distance", () => {
    expect(distanceKm(0, 0, 0, 0)).toBe(0);
    expect(distanceKm(0, 0, 0, 1)).toBeCloseTo(111.19, 1); // 1° of longitude at the equator
  });
});

// ---------------------------------------------------------------- units

describe("units and formatting", () => {
  it("converts values", () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(celsiusToFahrenheit(100)).toBe(212);
    expect(hectaresToAcres(1)).toBeCloseTo(2.4711, 4);
    expect(acresToHectares(hectaresToAcres(3.2))).toBeCloseTo(3.2, 10);
  });

  it("never renders missing values as zero", () => {
    for (const missing of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(formatTemperature(missing, "metric")).toBe(MISSING);
      expect(formatPrecipitation(missing, "imperial")).toBe(MISSING);
      expect(formatArea(missing, "hectares", "metric")).toBe(MISSING);
      expect(formatNutrient(missing, "metric")).toBe(MISSING);
      expect(formatWetnessFraction(missing)).toBe(MISSING);
    }
  });

  it("keeps real zeros as zero", () => {
    expect(formatPrecipitation(0, "metric")).toBe("0 mm");
    expect(formatTemperature(0, "metric")).toBe("0 °C");
  });

  it("formats in both unit systems", () => {
    expect(formatTemperature(25.36, "metric")).toBe("25.4 °C");
    expect(formatTemperature(25, "imperial")).toBe("77 °F");
    expect(formatPrecipitation(25.4, "imperial")).toBe("1 in");
    expect(formatPrecipitation(2.4, "metric", { suffix: "/day" })).toBe("2.4 mm/day");
    expect(formatArea(1, "hectares", "imperial")).toBe("2.47 ac");
    expect(formatArea(4.5, "acres", "metric")).toBe("1.82 ha");
    expect(formatWetnessFraction(0.53)).toBe("53%");
  });
});

// ---------------------------------------------------------------- i18n

describe("translations", () => {
  it("defaults to English and falls back to English for missing keys", () => {
    expect(translate("en", "nav.home")).toBe("Home");
    expect(translate("kn", "nav.home")).toBe("ಮುಖಪುಟ");
    expect(translate("kn", "coverage.rec.outside.title")).toBe(en["coverage.rec.outside.title"]);
  });

  it("fills placeholders and leaves unknown ones visible", () => {
    const s = translate("en", "data.fallbackOrigin", { region: "Davanagere", distance: 120 });
    expect(s).toContain("Davanagere");
    expect(s).toContain("120 km");
    expect(translate("en", "data.fallbackOrigin")).toContain("{region}");
  });

  it("only contains keys that exist in English", () => {
    for (const def of Object.values(LOCALES)) {
      for (const key of Object.keys(def.messages)) {
        expect(Object.prototype.hasOwnProperty.call(en, key)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------- API client

function fakeFetch(status: number, body: unknown, calls: Array<{ url: string; init?: RequestInit }> = []) {
  return async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

const minimalFarm = { latitude: 14.46, longitude: 75.92 } as unknown as FarmProfile;

describe("API client", () => {
  it("builds the /api/nasa query with compact dates", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const data = { isLiveRetrieval: true };
    const result = await getNasaData(
      { latitude: -1.29, longitude: 36.82, startDate: "2021-01-01", endDate: "2025-12-31" },
      { fetchImpl: fakeFetch(200, { status: "ok", data }, calls) }
    );
    expect(result).toEqual(data);
    expect(calls[0].url).toBe("/api/nasa?latitude=-1.29&longitude=36.82&startDate=20210101&endDate=20251231");
  });

  it("surfaces the route's { error } message for NASA failures", async () => {
    const err = await getNasaData(
      { latitude: 0, longitude: 0 },
      { fetchImpl: fakeFetch(400, { error: "Invalid coordinates." }) }
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).kind).toBe("validation");
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).messages).toEqual(["Invalid coordinates."]);
  });

  it("surfaces validation errors from /api/farm", async () => {
    const err = await saveFarmProfile(minimalFarm, {
      fetchImpl: fakeFetch(400, { status: "error", errors: ["Invalid soilType.", "Bad area."] }),
    }).catch((e: unknown) => e);
    expect((err as ApiError).messages).toEqual(["Invalid soilType.", "Bad area."]);
  });

  it("posts the recommendations body as JSON", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const body = { status: "ok", recommendations: [], customSequenceEvaluation: null };
    await getRecommendations({ farmProfile: minimalFarm }, { fetchImpl: fakeFetch(200, body, calls) });
    expect(calls[0].url).toBe("/api/recommendations");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ farmProfile: minimalFarm });
  });

  it("classifies server, network and malformed responses", async () => {
    const server = await getRecommendations({ farmProfile: minimalFarm }, {
      fetchImpl: fakeFetch(500, { status: "error", errors: ["Engine failed."] }),
    }).catch((e: unknown) => e);
    expect((server as ApiError).kind).toBe("server");

    const network = await getNasaData({ latitude: 0, longitude: 0 }, {
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch");
      },
    }).catch((e: unknown) => e);
    expect((network as ApiError).kind).toBe("network");

    const html = await getNasaData({ latitude: 0, longitude: 0 }, {
      fetchImpl: fakeFetch(502, "<html>Bad gateway</html>"),
    }).catch((e: unknown) => e);
    expect((html as ApiError).kind).toBe("invalid_response");

    const wrongShape = await getNasaData({ latitude: 0, longitude: 0 }, {
      fetchImpl: fakeFetch(200, { status: "ok" }),
    }).catch((e: unknown) => e);
    expect((wrongShape as ApiError).kind).toBe("invalid_response");
  });

  it("extracts messages from both error shapes", () => {
    expect(extractErrorMessages({ error: "x" })).toEqual(["x"]);
    expect(extractErrorMessages({ errors: ["a", "", 3, "b"] })).toEqual(["a", "b"]);
    expect(extractErrorMessages(null)).toEqual([]);
  });
});
