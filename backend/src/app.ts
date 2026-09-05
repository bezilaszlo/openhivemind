import Fastify, { type FastifyRequest } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { routes, Problem, type Route } from "@openhivemind/shared";
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export type Handler = (request: FastifyRequest) => Promise<unknown>;
export async function buildApp(
  options: { url?: string; handlers?: Partial<Record<keyof typeof routes, Handler>> } = {},
) {
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024, requestTimeout: 30000 });
  await app.register(swagger, { openapi: { info: { title: "Open Hivemind", version: "1.0.0" } } });
  await app.register(swaggerUi, { routePrefix: "/docs" });
  app.setErrorHandler((error, request, reply) => {
    const status =
      error instanceof Error && "statusCode" in error && typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    reply
      .code(status)
      .type("application/problem+json")
      .send({
        type: "about:blank",
        title: status >= 500 ? "Server error" : "Request rejected",
        status,
        detail:
          status >= 500
            ? "The request could not be completed"
            : error instanceof Error
              ? error.message
              : "Invalid request",
      });
  });
  app.addHook("onRequest", async (request) => {
    if (request.url.startsWith("/api/v1/") && !request.url.startsWith("/api/v1/config")) {
      const version = request.headers["x-openhivemind-protocol"];
      if (version !== undefined && version !== "1")
        throw new HttpError(426, "Unsupported protocol; use version 1");
    }
  });
  for (const [key, definition] of Object.entries(routes) as [keyof typeof routes, Route][]) {
    app.route({
      method: definition.method,
      url: definition.path,
      schema: {
        params: definition.params,
        querystring: definition.query,
        ...(["POST", "PATCH"].includes(definition.method) ? { body: definition.body } : {}),
        response: { [definition.status]: definition.response, "4xx": Problem, "5xx": Problem },
      },
      handler: async (request, reply) => {
        reply.code(definition.status);
        if (key === "config")
          return {
            appUrl: options.url ?? "http://localhost:3000",
            providers: ["local"],
            features: { capture: true },
            protocol: { current: 1, minimum: 1 },
          };
        const handler = options.handlers?.[key];
        if (!handler) throw new HttpError(503, "Service is not configured");
        return handler(request);
      },
    });
  }
  return app;
}
