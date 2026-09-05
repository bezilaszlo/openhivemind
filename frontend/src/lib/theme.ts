import { useCallback, useEffect, useState } from "react";
export type Theme = "system" | "light" | "dark";
export const themes: Theme[] = ["system", "light", "dark"];
const STORAGE_KEY = "openhivemind-theme";
const query = () => window.matchMedia("(prefers-color-scheme: dark)");
export function storedTheme(): Theme {
  const value = localStorage.getItem(STORAGE_KEY);
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}
export function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && query().matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(storedTheme);
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const media = query();
    const listener = () => applyTheme("system");
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [theme]);
  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }, []);
  return { theme, setTheme };
}
