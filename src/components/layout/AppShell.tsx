"use client";

/**
 * Global page frame: skip link, responsive navigation, language and unit
 * switches, and footer. Not wired into layout.tsx yet — Stage 2 moves the
 * pages onto it so the existing single-page app keeps working until then.
 */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Sprout, X } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import { LOCALES, isLocaleId, type MessageKey } from "@/lib/i18n";
import { cx } from "@/components/ui/primitives";

export const NAV_ITEMS: ReadonlyArray<{ href: string; labelKey: MessageKey }> = [
  { href: "/", labelKey: "nav.home" },
  { href: "/farm", labelKey: "nav.farm" },
  { href: "/nasa-insights", labelKey: "nav.climate" },
  { href: "/recommendations", labelKey: "nav.recommendations" },
  { href: "/planner", labelKey: "nav.planner" },
  { href: "/reports", labelKey: "nav.reports" },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function SettingsControls({ idPrefix }: { idPrefix: string }) {
  const { locale, setLocale, units, setUnits, t } = useSettings();
  const selectClass =
    "rounded-md border border-white/20 bg-terra-900 px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-terra-200";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-terra-100" htmlFor={`${idPrefix}-lang`}>
        {t("settings.language")}
        <select
          id={`${idPrefix}-lang`}
          className={selectClass}
          value={locale}
          onChange={(e) => isLocaleId(e.target.value) && setLocale(e.target.value)}
        >
          {Object.entries(LOCALES).map(([id, def]) => (
            <option key={id} value={id} lang={def.code}>
              {def.nativeName}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-terra-100" htmlFor={`${idPrefix}-units`}>
        {t("settings.units")}
        <select
          id={`${idPrefix}-units`}
          className={selectClass}
          value={units}
          onChange={(e) => setUnits(e.target.value === "imperial" ? "imperial" : "metric")}
        >
          <option value="metric">{t("settings.metric")}</option>
          <option value="imperial">{t("settings.imperial")}</option>
        </select>
      </label>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const { t } = useSettings();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu after navigating.
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-earth-50 text-slate-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-terra-800"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-40 bg-terra-800 text-white shadow-sm print:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-terra-200">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-terra-500">
              <Sprout className="h-5 w-5" aria-hidden />
            </span>
            <span className="leading-tight">
              <span className="block text-base font-semibold">{t("app.name")}</span>
              <span className="hidden text-xs text-terra-200 sm:block">{t("app.subtitle")}</span>
            </span>
          </Link>

          <div className="hidden lg:block">
            <SettingsControls idPrefix="desktop" />
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-terra-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-terra-200 lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
            {t("nav.menu")}
          </button>
        </div>

        <nav aria-label={t("nav.main")} className="hidden border-t border-white/10 lg:block">
          <ul className="mx-auto flex max-w-7xl gap-1 px-4 sm:px-6">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "inline-block border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "border-terra-200 text-white"
                        : "border-transparent text-terra-100 hover:border-white/30 hover:text-white"
                    )}
                  >
                    {t(item.labelKey)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {menuOpen && (
          <nav id="mobile-nav" aria-label={t("nav.main")} className="border-t border-white/10 px-4 pb-4 lg:hidden">
            <ul className="space-y-1 py-2">
              {NAV_ITEMS.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "block rounded-md px-3 py-2 text-sm font-medium",
                        active ? "bg-terra-700 text-white" : "text-terra-100 hover:bg-terra-700"
                      )}
                    >
                      {t(item.labelKey)}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <SettingsControls idPrefix="mobile" />
          </nav>
        )}
      </header>

      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>

      <footer className="border-t border-earth-200 bg-white print:hidden">
        <div className="mx-auto max-w-7xl px-4 py-5 text-xs text-slate-500 sm:px-6">
          <p>{t("coverage.climate.global")}</p>
          <p className="mt-1">
            {t("app.name")} · NASA Space Apps Challenge 2026 · Climate data:{" "}
            <a
              className="underline hover:text-terra-700"
              href="https://power.larc.nasa.gov/"
              target="_blank"
              rel="noopener noreferrer"
            >
              NASA POWER
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
