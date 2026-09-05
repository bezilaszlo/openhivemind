/** Pure normalization; git lookup belongs to the client. */
export function normalizeRemote(remote: string): string {
  let value = remote.trim().replace(/^[a-z][a-z\d+.-]*:\/\//i, "");
  value = value.replace(/^[^/]*@/, "");
  value = value.replace(/^([^/:]+):\d+\//, "$1/").replace(/^([^/:]+):/, "$1/");
  return value
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .toLowerCase();
}
