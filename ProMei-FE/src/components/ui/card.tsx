import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Superfície elevada padrão do painel (docs/styles/DESIGN-SYSTEM.md). */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("bg-surface border-border rounded-lg border", className)} {...props} />;
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("border-border border-b p-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("text-foreground text-base font-semibold", className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}
