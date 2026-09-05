import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { routes } from "@openhivemind/shared";
import { api } from "./api";
import "./styles.css";
function App() {
  const config = useQuery({ queryKey: ["config"], queryFn: () => api(routes.config) });
  return (
    <main>
      <header>
        <h1>Open Hivemind</h1>
        <p>Shared coding-agent history</p>
      </header>
      <h2>Implementation in progress</h2>
      <p>
        The contract server is available. Capture and the session viewer are still being
        implemented.
      </p>
      {config.isPending ? (
        <p role="status">Connecting…</p>
      ) : config.isError ? (
        <p role="alert">
          Unable to connect. <button onClick={() => void config.refetch()}>Retry</button>
        </p>
      ) : (
        <p>Protocol {config.data.protocol.current}</p>
      )}
      <a href="/docs">API reference</a>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
