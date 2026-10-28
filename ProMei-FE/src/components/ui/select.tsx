import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Select nativo com a mesma casca visual do `<Input>`.
 *
 * Nativo de propósito: o seletor de nicho precisa funcionar com teclado, leitor de tela e
 * no mobile sem reimplementar nada disso — e o Design System não pede combobox com busca
 * aqui. A seta é decorativa; o `appearance-none` só esconde a do sistema.
 */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          "bg-input text-foreground border-input-border",
          "h-10 w-full min-w-0 appearance-none rounded-md border pr-10 pl-3 text-sm",
          "transition-colors outline-none",
          "hover:border-input-border-hover",
          "focus-visible:border-input-border-focus focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "aria-invalid:border-input-error aria-invalid:focus-visible:ring-input-error/25",
          "disabled:bg-input-disabled-bg disabled:text-text-disabled disabled:cursor-not-allowed",
          "motion-reduce:transition-none",
          className,
        )}
        {...props}
      >
        {children}
      </select>

      <ChevronDown
        aria-hidden="true"
        className="text-text-tertiary pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2"
      />
    </div>
  );
}
