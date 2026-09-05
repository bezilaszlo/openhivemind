import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, genericOAuth, createAccessControl } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import * as schema from "../db/schema";
const ac = createAccessControl({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
} as const);
export interface AuthConfig {
  url: string;
  secret: string;
  oidc?: { issuer: string; clientId: string; clientSecret: string };
}
export function createAuth(pool: pg.Pool, config: AuthConfig) {
  return betterAuth({
    baseURL: config.url,
    basePath: "/api/auth",
    secret: config.secret,
    trustedOrigins: [config.url],
    database: drizzleAdapter(drizzle(pool, { schema }), { provider: "pg", schema }),
    emailAndPassword: { enabled: true, minPasswordLength: 12 },
    account: { accountLinking: { enabled: false } },
    rateLimit: { enabled: true, storage: "database", modelName: "rateLimit" },
    plugins: [
      organization({
        creatorRole: "admin",
        ac,
        roles: {
          admin: ac.newRole({
            organization: ["update", "delete"],
            member: ["create", "update", "delete"],
            invitation: ["create", "cancel"],
          }),
          member: ac.newRole({}),
        },
        allowUserToCreateOrganization: false,
      }),
      ...(config.oidc
        ? [
            genericOAuth({
              config: [
                {
                  providerId: "oidc",
                  discoveryUrl:
                    config.oidc.issuer.replace(/\/$/, "") + "/.well-known/openid-configuration",
                  clientId: config.oidc.clientId,
                  clientSecret: config.oidc.clientSecret,
                  scopes: ["openid", "profile", "email"],
                  pkce: true,
                  requireIdTokenVerification: true,
                },
              ],
            }),
          ]
        : []),
    ],
  });
}
export type Auth = ReturnType<typeof createAuth>;
