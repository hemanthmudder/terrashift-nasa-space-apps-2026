"use client";

/** Reusable page pieces: headers, dataset state messages and key/value rows. */

import type { ReactNode } from "react";
import { useData } from "@/context/DataContext";
import { useSettings } from "@/context/SettingsContext";
import type { LoadResult } from "@/lib/data/loaders";
import { Button } from "./ui/primitives";
import { ErrorState, LoadingState, UnavailableState } from "./ui/feedback";

export function PageHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-terra-900 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-600 sm:text-base">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Renders the non-available states of a dataset. Returns null when the data
 * is available so callers can render the real content.
 */
export function DatasetState<T>({
  result,
  label,
}: {
  result: LoadResult<T> | { status: "loading" };
  label: string;
}) {
  const { reload } = useData();
  const { t } = useSettings();
  switch (result.status) {
    case "available":
      return null;
    case "loading":
      return <LoadingState label={`Loading ${label}…`} />;
    case "missing":
      return (
        <UnavailableState title={`${label} has not been generated yet`}>
          <p>
            The frontend looked for <code className="rounded bg-earth-100 px-1">{result.url}</code> and it does not exist. No
            substitute data is shown.
          </p>
          <p className="mt-2">
            <span className="font-medium">How it is produced:</span> {result.producedBy}
          </p>
          <p className="mt-2 text-xs">
            Just published it? A production server (<code>npm start</code>) only sees files that existed when it started, so
            restart it after running the copy script.
          </p>
        </UnavailableState>
      );
    case "placeholder":
      return (
        <UnavailableState title={`${label} contains placeholder values only`}>
          <p>{result.reason}</p>
          <p className="mt-2">Placeholder values are not observations, so they are not displayed.</p>
        </UnavailableState>
      );
    case "invalid":
      return (
        <ErrorState title={`${label} does not match the data contract`} messages={[result.reason]} onRetry={reload} retryLabel={t("action.retry")} />
      );
    case "error":
      return <ErrorState title={`${label} could not be loaded`} messages={[result.reason]} onRetry={reload} retryLabel={t("action.retry")} />;
  }
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-earth-100 py-2 text-sm last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}

export function ReloadButton() {
  const { reload } = useData();
  return (
    <Button variant="secondary" onClick={reload} className="print:hidden">
      Reload datasets
    </Button>
  );
}
