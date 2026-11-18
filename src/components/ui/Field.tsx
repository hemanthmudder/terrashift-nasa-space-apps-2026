/**
 * Accessible form field wrapper: label, optional hint and error message,
 * wired to the input through aria-describedby / aria-invalid.
 */

import { cloneElement, isValidElement, useId } from "react";
import type { ReactElement, ReactNode } from "react";
import { cx } from "./primitives";

export const inputClassName =
  "block w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm text-slate-900 " +
  "placeholder:text-slate-400 focus:border-terra-500 focus:outline-none focus:ring-2 focus:ring-terra-500/30 " +
  "disabled:bg-earth-50 disabled:text-slate-500 aria-[invalid=true]:border-red-500";

interface ControlProps {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  required?: boolean;
}

export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  /** A single input, select or textarea element. */
  children: ReactElement<ControlProps>;
}) {
  const autoId = useId();
  const id = (isValidElement(children) && children.props.id) || autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = cloneElement(children, {
    id,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    required,
  });

  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
        {required && (
          <span className="ml-0.5 text-red-600" aria-hidden>
            *
          </span>
        )}
      </label>
      {control}
      {hint && (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
