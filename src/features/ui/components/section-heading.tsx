import type { HTMLAttributes } from "react";

import { cn } from "@/features/ui/lib/cn";

/**
 * Handles section heading.
 */
export function SectionHeading({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("m-0 text-xl font-semibold text-slate-900", className)}
      {...props}
    />
  );
}
