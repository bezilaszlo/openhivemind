export const number = (value: number | undefined | null) =>
  value == null ? "Unknown" : new Intl.NumberFormat().format(value);
export const time = (value: string) =>
  new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
export const totalTokens = (
  tokens: { input: number; output: number; cache_read: number; cache_creation: number } | null,
) => (tokens ? tokens.input + tokens.output + tokens.cache_read + tokens.cache_creation : null);
