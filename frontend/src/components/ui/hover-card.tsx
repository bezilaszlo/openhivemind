import { HoverCard as HoverCardPrimitive } from "radix-ui";
import { cn } from "../../lib/utils";
export const HoverCard = HoverCardPrimitive.Root;
export const HoverCardTrigger = HoverCardPrimitive.Trigger;
export function HoverCardContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 max-h-[24rem] w-80 overflow-y-auto rounded-lg border border-border bg-surface p-4 text-foreground shadow-[var(--shadow)]",
          className,
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  );
}
