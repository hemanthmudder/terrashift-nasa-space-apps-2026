"use client";

import type { ReactNode } from "react";
import { SettingsProvider } from "@/context/SettingsContext";
import { DataProvider } from "@/context/DataContext";
import { AppShell } from "./AppShell";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <DataProvider>
        <AppShell>{children}</AppShell>
      </DataProvider>
    </SettingsProvider>
  );
}
