"use client";

/**
 * App-wide display settings: language and unit system.
 * Stored in localStorage as a per-browser convenience; the app works the same
 * if storage is unavailable (private browsing, blocked site data).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  DEFAULT_LOCALE,
  LOCALES,
  isLocaleId,
  translate,
  type LocaleId,
  type MessageKey,
  type TranslateParams,
} from "@/lib/i18n";
import type { UnitSystem } from "@/lib/units";

const STORAGE_KEY = "terrashift.settings.v1";

interface StoredSettings {
  locale: LocaleId;
  units: UnitSystem;
}

export interface SettingsContextValue extends StoredSettings {
  /** BCP 47 tag for Intl formatting. */
  localeCode: string;
  setLocale: (locale: LocaleId) => void;
  setUnits: (units: UnitSystem) => void;
  t: (key: MessageKey, params?: TranslateParams) => string;
}

const DEFAULTS: StoredSettings = { locale: DEFAULT_LOCALE, units: "metric" };

const SettingsContext = createContext<SettingsContextValue | null>(null);

function readStored(): StoredSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULTS;
    const p = parsed as Record<string, unknown>;
    return {
      locale: isLocaleId(p.locale) ? p.locale : DEFAULTS.locale,
      units: p.units === "imperial" ? "imperial" : "metric",
    };
  } catch {
    return DEFAULTS;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  // Start from defaults so server and first client render match, then hydrate.
  const [settings, setSettings] = useState<StoredSettings>(DEFAULTS);

  useEffect(() => {
    setSettings(readStored());
  }, []);

  useEffect(() => {
    document.documentElement.lang = LOCALES[settings.locale].code;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable: settings still work for this session */
    }
  }, [settings]);

  const setLocale = useCallback((locale: LocaleId) => setSettings((s) => ({ ...s, locale })), []);
  const setUnits = useCallback((units: UnitSystem) => setSettings((s) => ({ ...s, units })), []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      ...settings,
      localeCode: LOCALES[settings.locale].code,
      setLocale,
      setUnits,
      t: (key, params) => translate(settings.locale, key, params),
    }),
    [settings, setLocale, setUnits]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>.");
  return ctx;
}
