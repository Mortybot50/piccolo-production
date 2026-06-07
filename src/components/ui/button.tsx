import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-input)] text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 tap-target focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-600)]",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-brand-600)] text-white shadow-sm hover:bg-[var(--color-brand-700)] active:bg-[var(--color-brand-700)]",
        destructive:
          "bg-[var(--color-bad)] text-white hover:brightness-95",
        outline:
          "border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] text-[var(--color-fg)] hover:bg-[var(--color-bg-subtle)]",
        secondary:
          "bg-[var(--color-bg-subtle)] text-[var(--color-fg)] hover:bg-[var(--color-border)]",
        ghost:
          "text-[var(--color-fg)] hover:bg-[var(--color-bg-subtle)]",
        link:
          "text-[var(--color-brand-700)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 rounded-md px-3 text-xs",
        lg: "h-12 px-6 text-base",
        xl: "h-14 px-8 text-lg",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
