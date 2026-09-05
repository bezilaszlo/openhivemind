import { createApi } from "@openhivemind/shared";
import { demoTransport } from "./demo";
export const isDemo = import.meta.env.VITE_DEMO === "1";
export const api = createApi(window.location.origin, undefined, isDemo ? demoTransport : fetch);
