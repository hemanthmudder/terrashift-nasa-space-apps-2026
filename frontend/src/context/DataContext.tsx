"use client";

/** Loads the published datasets once and shares the results with every page. */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  loadClimate,
  loadEnvironmentSummary,
  loadRotationComparison,
  type EnvironmentSummary,
  type LoadResult,
  type RotationComparison,
} from "@/lib/data/loaders";
import type { ClimateRow } from "@/lib/data/climate";

type Loading = { status: "loading" };

export interface DataContextValue {
  climate: LoadResult<ClimateRow[]> | Loading;
  environment: LoadResult<EnvironmentSummary> | Loading;
  rotations: LoadResult<RotationComparison> | Loading;
  reload: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);
const LOADING: Loading = { status: "loading" };

export function DataProvider({ children }: { children: ReactNode }) {
  const [climate, setClimate] = useState<DataContextValue["climate"]>(LOADING);
  const [environment, setEnvironment] = useState<DataContextValue["environment"]>(LOADING);
  const [rotations, setRotations] = useState<DataContextValue["rotations"]>(LOADING);

  const reload = useCallback(() => {
    setClimate(LOADING);
    setEnvironment(LOADING);
    setRotations(LOADING);
    void loadClimate().then(setClimate);
    void loadEnvironmentSummary().then(setEnvironment);
    void loadRotationComparison().then(setRotations);
  }, []);

  useEffect(() => reload(), [reload]);

  const value = useMemo(() => ({ climate, environment, rotations, reload }), [climate, environment, rotations, reload]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside <DataProvider>.");
  return ctx;
}
