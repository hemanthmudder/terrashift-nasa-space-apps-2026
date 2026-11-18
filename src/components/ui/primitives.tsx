/**
 * Shared presentational building blocks. No data fetching here.
 */

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

/** Joins class names, skipping falsy values. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function Card({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section
      className={cx("rounded-2xl border border-earth-200 bg-white p-5 shadow-sm sm:p-6", className)}
      {...rest}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
  as: Heading = "h2",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  as?: "h2" | "h3";
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <Heading className="text-lg font-semibold text-terra-900">{title}</Heading>
        {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-terra-600 text-white hover:bg-terra-700 disabled:bg-terra-600/50",
  secondary:
    "border border-earth-200 bg-white text-terra-800 hover:bg-terra-50 disabled:text-slate-400",
  ghost: "text-terra-800 hover:bg-terra-50 disabled:text-slate-400",
};

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra-600",
        "disabled:cursor-not-allowed",
        BUTTON_STYLES[variant],
        className
      )}
      {...rest}
    />
  );
}

type BadgeTone = "neutral" | "green" | "amber" | "red" | "blue";

const BADGE_STYLES: Record<BadgeTone, string> = {
  neutral: "bg-earth-100 text-earth-800",
  green: "bg-terra-100 text-terra-800",
  amber: "bg-amber-100 text-amber-900",
  red: "bg-red-100 text-red-800",
  blue: "bg-orbital-100 text-orbital-700",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        BADGE_STYLES[tone]
      )}
    >
      {children}
    </span>
  );
}
