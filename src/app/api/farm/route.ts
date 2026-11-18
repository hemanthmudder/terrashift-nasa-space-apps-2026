/**
 * MEMBER 3 — Next.js Server Route Handler: /api/farm
 * Validates and persists farm profiles and saved rotation plans.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateFarmProfile } from "@/lib/validation/farmValidator";
import { FarmProfile } from "@/types/farm";

const savedFarmsMemoryStore: Map<string, FarmProfile> = new Map();

export async function GET() {
  return NextResponse.json({
    status: "ok",
    profiles: Array.from(savedFarmsMemoryStore.values()),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = validateFarmProfile(body);
    if (!validation.valid || !validation.sanitized) {
      return NextResponse.json(
        { status: "error", errors: validation.errors },
        { status: 400 }
      );
    }
    savedFarmsMemoryStore.set(validation.sanitized.id!, validation.sanitized);
    return NextResponse.json({
      status: "ok",
      profile: validation.sanitized,
    });
  } catch (err: any) {
    return NextResponse.json(
      { status: "error", errors: [err?.message || "Invalid JSON payload"] },
      { status: 400 }
    );
  }
}
