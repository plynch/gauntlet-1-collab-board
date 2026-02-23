import type { HTMLAttributes } from "react";

import { cn } from "@/features/ui/lib/cn";

export function SectionHeading({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("m-0 text-xl font-semibold text-[var(--text)]", className)}
      {...props}
    />
  );
}
