import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { AppShell } from "./components/app-shell";
import { applyTheme, storedTheme } from "./lib/theme";
import { Login } from "./screens/login";
import { Organisation } from "./screens/organisation";
import { Reader } from "./screens/reader";
import { SearchPage } from "./screens/search";
import { Sessions } from "./screens/sessions";
import { Tokens } from "./screens/tokens";
import { UsagePage } from "./screens/usage";
import "./styles.css";
const rootRoute = createRootRoute({ component: AppShell });
const searchParams = (input: Record<string, unknown>) => input;
const sessionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Sessions,
  validateSearch: searchParams,
});
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: Login,
});
const detailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sessions/$id",
  component: function SessionDetail() {
    return <Reader id={detailRoute.useParams().id} />;
  },
  validateSearch: searchParams,
});
const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  component: SearchPage,
  validateSearch: searchParams,
});
const usageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/usage",
  component: UsagePage,
});
const tokensRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tokens",
  component: Tokens,
});
const orgRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/organisation",
  component: Organisation,
});
const router = createRouter({
  routeTree: rootRoute.addChildren([
    sessionsRoute,
    loginRoute,
    detailRoute,
    searchRoute,
    usageRoute,
    tokensRoute,
    orgRoute,
  ]),
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
applyTheme(storedTheme());
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { staleTime: 10000, retry: 1 } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
