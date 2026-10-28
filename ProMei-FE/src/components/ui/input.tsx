import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Input base do Design System (docs/styles/DESIGN-SYSTEM.md §13): estados default, hover,
 * focus, filled, disabled e error (`aria-invalid`). O foco usa o token de marca, que muda
 * junto com o nicho da empresa.
 */
export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "bg-input text-foreground border-input-border placeholder:text-input-placeholder",
        "h-10 w-full min-w-0 rounded-md border px-3 text-sm transition-colors outline-none",
        "hover:border-input-border-hover",
        "focus-visible:border-input-border-focus focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:border-input-error aria-invalid:focus-visible:border-input-error aria-invalid:focus-visible:ring-input-error/25",
        "disabled:bg-input-disabled-bg disabled:text-text-disabled disabled:cursor-not-allowed",
        "motion-reduce:transition-none",
        className,
      )}
      {...props}
    />
  );
}
