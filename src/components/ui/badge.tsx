import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--color-brand-600)] text-white",
        secondary:
          "border-transparent bg-[var(--color-bg-subtle)] text-[var(--color-fg)]",
        outline:
          "border-[var(--color-border-strong)] bg-transparent text-[var(--color-fg-muted)]",
        ok: "border-transparent bg-[var(--color-ok-bg)] text-[var(--color-ok)]",
        warn: "border-transparent bg-[var(--color-warn-bg)] text-[var(--color-warn)]",
        bad: "border-transparent bg-[var(--color-bad-bg)] text-[var(--color-bad)]",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
