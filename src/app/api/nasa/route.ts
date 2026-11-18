/**
 * MEMBER 4 — Next.js Server Route Handler: /api/nasa
 * Retrieves and normalizes NASA POWER Daily agroclimatology observations + indicators.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchNASAPowerEnvironmentalData } from "@/lib/nasa/powerClient";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = Number(searchParams.get("latitude") ?? "14.4644");
    const lon = Number(searchParams.get("longitude") ?? "75.9218");
    const start = (searchParams.get("startDate") ?? "20210101").replace(/-/g, "");
    const end = (searchParams.get("endDate") ?? "20251231").replace(/-/g, "");

    if (Number.isNaN(lat) || lat < -90 || lat > 90 || Number.isNaN(lon) || lon < -180 || lon > 180) {
      return NextResponse.json(
        { error: "Invalid coordinates. Latitude must be [-90, 90] and longitude [-180, 180]." },
        { status: 400 }
      );
    }

    const data = await fetchNASAPowerEnvironmentalData(lat, lon, start, end);
    return NextResponse.json({ status: "ok", data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to retrieve NASA environmental data." },
      { status: 500 }
    );
  }
}
