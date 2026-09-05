import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "../../lib/utils";
export const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium [&>svg]:pointer-events-none [&>svg]:size-3.5",
  {
    variants: {
      variant: {
        outline: "border-border text-muted",
        harness: "border-harness/35 bg-harness/8 text-harness",
        accent: "border-accent/35 bg-accent/10 text-accent-ink",
      },
    },
    defaultVariants: { variant: "outline" },
  },
);
export function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot.Root : "span";
  return (
    <Component data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
