import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "../../lib/utils";
import { Input } from "./input";
export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input type={shown ? "text" : "password"} className={cn("pr-10", className)} {...props} />
      <button
        type="button"
        onClick={() => setShown((value) => !value)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted hover:text-foreground"
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
