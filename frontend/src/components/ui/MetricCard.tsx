/**
 * A single headline metric. `value` must already be formatted; pass the
 * formatter's em dash for missing data so nothing ever shows as zero.
 */

import type { ReactNode } from "react";
import { MISSING } from "@/lib/units";
import { cx } from "./primitives";

export function MetricCard({
  label,
  value,
  detail,
  icon,
  missingLabel = "Not available",
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  icon?: ReactNode;
  /** Accessible text announced instead of the em dash when the value is missing. */
  missingLabel?: string;
}) {
  const missing = value === MISSING;
  return (
    <div className="rounded-xl border border-earth-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {icon && <span className="text-terra-600" aria-hidden>{icon}</span>}
      </div>
      <p className={cx("mt-2 text-2xl font-semibold tabular-nums", missing ? "text-slate-400" : "text-terra-900")}>
        {missing ? (
          <>
            <span aria-hidden>{MISSING}</span>
            <span className="sr-only">{missingLabel}</span>
          </>
        ) : (
          value
        )}
      </p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}
