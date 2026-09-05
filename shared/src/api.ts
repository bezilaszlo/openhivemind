import { TypeCompiler } from "@sinclair/typebox/compiler";
import { FormatRegistry } from "@sinclair/typebox";
import { type Route, type TSchema, type Static, PROTOCOL_VERSION } from "./schemas/index";
FormatRegistry.Set(
  "date-time",
  (value) => /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)),
);
const validators = new WeakMap<TSchema, ReturnType<typeof TypeCompiler.Compile>>();
export function validate<T extends TSchema>(schema: T, value: unknown): Static<T> {
  let validator = validators.get(schema);
  if (!validator) {
    validator = TypeCompiler.Compile(schema);
    validators.set(schema, validator);
  }
  if (!validator.Check(value)) throw new Error("Response does not match the protocol contract");
  return value as Static<T>;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    detail: string,
  ) {
    super(detail);
  }
}
export function createApi(base: string, token?: string, transport: typeof fetch = fetch) {
  return async <P extends TSchema, B extends TSchema, R extends TSchema, Q extends TSchema>(
    definition: Route<P, B, R, Q>,
    options: { params?: Static<P>; body?: Static<B>; query?: Static<Q>; signal?: AbortSignal } = {},
  ): Promise<Static<R>> => {
    const path = definition.path.replace(/:([a-zA-Z]+)/g, (_, name: string) =>
      encodeURIComponent(
        String((options.params as Record<string, unknown> | undefined)?.[name] ?? ""),
      ),
    );
    const url = new URL(base.replace(/\/$/, "") + path);
    for (const [key, value] of Object.entries(options.query ?? {}))
      if (value !== undefined) url.searchParams.set(key, String(value));
    const response = await transport(url, {
      method: definition.method,
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        "x-openhivemind-protocol": String(PROTOCOL_VERSION),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(definition.method === "POST" || definition.method === "PATCH"
        ? { body: JSON.stringify(options.body ?? {}) }
        : {}),
      signal: options.signal ?? AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      let detail = `Request failed (${response.status})`;
      try {
        const value: unknown = await response.json();
        if (
          value &&
          typeof value === "object" &&
          "detail" in value &&
          typeof value.detail === "string"
        )
          detail = value.detail;
      } catch {}
      throw new ApiError(response.status, detail);
    }
    return validate(definition.response, await response.json());
  };
}
