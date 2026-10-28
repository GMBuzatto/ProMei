import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Badge de status. As variantes usam as cores **semânticas**, que por decisão do Design
 * System não mudam com o nicho — o significado de "suspensa" não pode depender do
 * segmento da empresa (docs/styles/temas/README.md).
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
  {
    variants: {
      variant: {
        success: "bg-status-success-bg text-status-success-text",
        warning: "bg-status-warning-bg text-status-warning-text",
        danger: "bg-status-danger-bg text-status-danger-text",
        info: "bg-status-info-bg text-status-info-text",
        neutral: "bg-background-subtle text-text-secondary",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

type BadgeProps = ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {children}
    </span>
  );
}

/** Ponto colorido que acompanha o rótulo do status, como nos mockups. */
export function BadgeDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("h-1.5 w-1.5 shrink-0 rounded-full bg-current", className)}
    />
  );
}

export { badgeVariants };
