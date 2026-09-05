import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "../lib/theme";
import { Button } from "./ui/button";
const options: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "System theme", Icon: Monitor },
  { value: "light", label: "Light theme", Icon: Sun },
  { value: "dark", label: "Dark theme", Icon: Moon },
];
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div
      role="group"
      aria-label="Appearance"
      className="inline-flex rounded-md border border-border bg-surface p-0.5"
    >
      {options.map(({ value, label, Icon }) => (
        <Button
          key={value}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={theme === value}
          className={theme === value ? "bg-hover text-accent-ink" : "text-muted"}
          onClick={() => setTheme(value)}
        >
          <Icon />
        </Button>
      ))}
    </div>
  );
}
