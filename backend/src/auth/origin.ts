const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "::1"];
// The dev stack's configured URL and the browser's actual origin can each pick a different
// loopback spelling (127.0.0.1 vs. localhost vs. [::1]); a strict single-origin comparison would
// reject a legitimate same-machine request over that mismatch alone. Any non-loopback URL keeps
// the exact single-origin check, since that strictness is the point in production.
export function trustedOrigins(url: string): string[] {
  const parsed = new URL(url);
  if (!LOOPBACK_HOSTS.includes(parsed.hostname)) return [url];
  const port = parsed.port ? `:${parsed.port}` : "";
  return LOOPBACK_HOSTS.map(
    (host) => `${parsed.protocol}//${host === "::1" ? "[::1]" : host}${port}`,
  );
}
export function isTrustedOrigin(origin: string | string[] | undefined, url: string): boolean {
  return typeof origin === "string" && trustedOrigins(url).includes(origin);
}
