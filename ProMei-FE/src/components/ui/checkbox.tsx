import { Check } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Checkbox nativo estilizado (sem Radix — nenhuma dependência nova só para este controle).
 * O `input` real continua no DOM, então label, foco por teclado e leitor de tela funcionam
 * sem ARIA extra.
 */
export function Checkbox({ className, ...props }: ComponentProps<"input">) {
  return (
    <span className="relative inline-flex shrink-0">
      <input
        type="checkbox"
        className={cn(
          "peer border-input-border bg-input h-5 w-5 cursor-pointer appearance-none rounded-md border",
          "checked:border-primary checked:bg-primary",
          "hover:border-input-border-hover",
          "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
          "disabled:cursor-not-allowed disabled:opacity-70",
          "transition-colors motion-reduce:transition-none",
          className,
        )}
        {...props}
      />
      <Check
        aria-hidden="true"
        className="text-primary-foreground pointer-events-none absolute inset-0 m-auto h-3.5 w-3.5 opacity-0 peer-checked:opacity-100"
      />
    </span>
  );
}
