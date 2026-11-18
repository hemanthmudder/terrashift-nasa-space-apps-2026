"use client";

import type { ReactNode } from "react";
import { SettingsProvider } from "@/context/SettingsContext";
import { FarmProvider } from "@/context/FarmContext";
import { AppShell } from "./AppShell";

/** Client-side providers and the shared page frame for every route. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <FarmProvider>
        <AppShell>{children}</AppShell>
      </FarmProvider>
    </SettingsProvider>
  );
}
