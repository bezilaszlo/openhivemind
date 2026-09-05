import { useState } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChartNoAxesColumn,
  KeyRound,
  LogOut,
  Menu,
  MessagesSquare,
  Search,
  Users,
} from "lucide-react";
import { authRoutes, routes } from "@openhivemind/shared";
import { api, isDemo } from "../api";
import { Logo } from "./brand";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "./ui/sheet";
export function useOrg() {
  return useQuery({ queryKey: ["org"], queryFn: () => api(routes.org), retry: false });
}
const primary = [
  { to: "/", label: "Sessions", Icon: MessagesSquare },
  { to: "/search", label: "Search", Icon: Search },
  { to: "/usage", label: "Usage", Icon: ChartNoAxesColumn },
] as const;
const settings = [
  { to: "/tokens", label: "Tokens", Icon: KeyRound },
  { to: "/organisation", label: "Organisation", Icon: Users },
] as const;
const linkClass =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-hover hover:text-foreground";
function Navigation({ onNavigate, signedIn }: { onNavigate?: () => void; signedIn: boolean }) {
  return (
    <nav aria-label="Main" className="grid gap-1">
      {primary.map(({ to, label, Icon }) => (
        <Link
          key={to}
          to={to}
          onClick={onNavigate}
          activeProps={{ className: "bg-hover !text-accent-ink" }}
          activeOptions={{ exact: true }}
          className={linkClass}
        >
          <Icon className="size-[1.125rem]" />
          {label}
        </Link>
      ))}
      {signedIn && (
        <>
          <p className="mt-5 px-3 pb-1 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-muted">
            Settings
          </p>
          {settings.map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={onNavigate}
              activeProps={{ className: "bg-hover !text-accent-ink" }}
              activeOptions={{ exact: true }}
              className={linkClass}
            >
              <Icon className="size-[1.125rem]" />
              {label}
            </Link>
          ))}
        </>
      )}
    </nav>
  );
}
export function AppShell() {
  const [menu, setMenu] = useState(false);
  const path = useRouterState({ select: (state) => state.location.pathname });
  const org = useOrg();
  const client = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: () => api(authRoutes.logout),
    onSuccess: () => {
      client.clear();
      void navigate({ to: "/login" });
    },
  });
  const footer = (
    <div className="mt-auto grid gap-3 pt-6">
      <p className="text-xs text-muted">{org.data?.name ?? "Self-hosted workspace"}</p>
      <ThemeToggle />
      {org.data && (
        <Button
          variant="ghost"
          size="sm"
          className="justify-start px-2 text-muted"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          <LogOut /> Sign out
        </Button>
      )}
    </div>
  );
  if (path === "/login") return <Outlet />;
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-sidebar p-5 md:flex">
        <Link to="/" className="mb-9 px-1" aria-label="Open Hivemind, sessions">
          <Logo className="h-[1.375rem] text-foreground" />
        </Link>
        <Navigation signedIn={Boolean(org.data)} />
        {footer}
      </aside>
      <div className="min-w-0">
        {isDemo && (
          <p className="border-b border-border bg-sidebar px-6 py-2 text-center text-xs text-muted">
            Interactive preview · Illustrative sessions · Changes stay in this demo
          </p>
        )}
        <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:hidden">
          <Sheet open={menu} onOpenChange={setMenu}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent aria-describedby={undefined}>
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SheetClose asChild>
                <Link to="/" className="mb-6 block" aria-label="Open Hivemind, sessions">
                  <Logo className="h-[1.375rem] text-foreground" />
                </Link>
              </SheetClose>
              <Navigation signedIn={Boolean(org.data)} onNavigate={() => setMenu(false)} />
              {footer}
            </SheetContent>
          </Sheet>
          <Logo className="h-5 text-foreground" />
        </header>
        <Outlet />
      </div>
    </div>
  );
}
