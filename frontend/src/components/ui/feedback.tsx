/**
 * Banners and loading / error / empty / unavailable states.
 * Every state uses an accessible role so screen readers announce it.
 */

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Inbox, Loader2, Lock, XCircle } from "lucide-react";
import { Button, cx } from "./primitives";

type BannerTone = "info" | "success" | "warning" | "error";

const BANNER_STYLES: Record<BannerTone, { box: string; icon: ReactNode }> = {
  info: {
    box: "border-orbital-100 bg-orbital-50 text-orbital-700",
    icon: <Info className="h-5 w-5 shrink-0" aria-hidden />,
  },
  success: {
    box: "border-terra-200 bg-terra-50 text-terra-800",
    icon: <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />,
  },
  warning: {
    box: "border-amber-200 bg-amber-50 text-amber-900",
    icon: <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />,
  },
  error: {
    box: "border-red-200 bg-red-50 text-red-800",
    icon: <XCircle className="h-5 w-5 shrink-0" aria-hidden />,
  },
};

export function Banner({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: BannerTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const style = BANNER_STYLES[tone];
  return (
    <div
      role={tone === "error" || tone === "warning" ? "alert" : "status"}
      className={cx("flex gap-3 rounded-xl border p-4 text-sm", style.box, className)}
    >
      {style.icon}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(title ? "mt-1" : undefined, "leading-relaxed")}>{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

function StateFrame({ icon, title, children }: { icon: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-earth-200 bg-white px-6 py-12 text-center">
      <div className="mb-3 text-terra-600">{icon}</div>
      <p className="text-base font-semibold text-terra-900">{title}</p>
      {children && <div className="mt-2 max-w-md text-sm text-slate-600">{children}</div>}
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite">
      <StateFrame icon={<Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none" aria-hidden />} title={label} />
    </div>
  );
}

export function ErrorState({
  title,
  messages,
  onRetry,
  retryLabel,
}: {
  title: string;
  messages: string[];
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div role="alert">
      <StateFrame icon={<XCircle className="h-8 w-8 text-red-600" aria-hidden />} title={title}>
        <ul className="space-y-1">
          {messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        {onRetry && (
          <Button variant="secondary" className="mt-4" onClick={onRetry}>
            {retryLabel ?? "Try again"}
          </Button>
        )}
      </StateFrame>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <StateFrame icon={<Inbox className="h-8 w-8" aria-hidden />} title={title}>
      {children}
      {action && <div className="mt-4">{action}</div>}
    </StateFrame>
  );
}

/** For features the backend does not support yet. Never pretends the feature works. */
export function UnavailableState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="status">
      <StateFrame icon={<Lock className="h-8 w-8 text-earth-600" aria-hidden />} title={title}>
        {children}
      </StateFrame>
    </div>
  );
}
