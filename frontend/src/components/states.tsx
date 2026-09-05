import { Link } from "@tanstack/react-router";
import { ApiError } from "@openhivemind/shared";
import { Mark } from "./brand";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
export function PageHeader({
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-8 flex flex-wrap items-start justify-between gap-6", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-3 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-muted">
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-balance">
          {title}
        </h1>
        {description && <div className="mt-2.5 text-sm text-muted">{description}</div>}
      </div>
      {children}
    </header>
  );
}
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-16 text-sm text-muted">
      <Mark className="size-6 animate-pulse text-accent motion-reduce:animate-none" />
      {label}
    </div>
  );
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : "The request failed";
  return (
    <div
      role="alert"
      className="my-5 rounded-md border border-destructive/40 bg-destructive/5 p-5 text-sm"
    >
      <p className="text-destructive">{message}</p>
      {error instanceof ApiError && error.status === 401 ? (
        <Link className="mt-3 inline-block text-accent-ink hover:underline" to="/login">
          Sign in
        </Link>
      ) : retry ? (
        <Button className="mt-3" size="sm" onClick={retry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-20 text-center text-sm text-muted">
      {icon ?? <Mark className="size-10 text-accent/70" />}
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  );
}
export const page = "mx-auto w-full max-w-[78rem] px-5 py-9 md:px-12 md:py-12";
export function Checkbox({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      className={cn("size-3.5 accent-[var(--accent-solid)]", className)}
      {...props}
    />
  );
}
