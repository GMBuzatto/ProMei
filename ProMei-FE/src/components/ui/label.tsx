import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cn("text-foreground text-sm leading-5 font-medium select-none", className)}
      {...props}
    />
  );
}
