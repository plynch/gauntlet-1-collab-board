import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/features/ui/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 disabled:pointer-events-none disabled:opacity-55",
  {
    variants: {
      variant: {
        primary: "bg-slate-900 text-white hover:bg-slate-800",
        secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200",
        success: "bg-emerald-600 text-white hover:bg-emerald-700",
        outline:
          "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50",
        ghost: "text-slate-700 hover:bg-slate-100",
        danger: "bg-rose-600 text-white hover:bg-rose-700",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-9 px-4",
        lg: "h-11 px-5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);

Button.displayName = "Button";

export { Button, buttonVariants };
