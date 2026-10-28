import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Botão base do Design System (docs/styles/DESIGN-SYSTEM.md §15).
 *
 * Só tokens semânticos — nada de hex ou cor Tailwind crua
 * (docs/16-configuracao-sem-hardcode.md). Trocar a paleta de um nicho não exige tocar aqui.
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium",
    "transition-colors outline-none motion-reduce:transition-none",
    "focus-visible:border-input-border-focus focus-visible:ring-ring/50 focus-visible:ring-[3px]",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-70",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-pressed disabled:bg-primary-disabled",
        secondary:
          "bg-secondary text-secondary-foreground border-secondary-border border hover:bg-secondary-hover active:bg-secondary-pressed",
        ghost: "text-text-secondary hover:bg-surface-hover hover:text-foreground",
        link: "text-primary h-auto p-0 underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3",
        md: "h-10 px-4",
        lg: "h-11 px-5",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Desabilita o botão e troca o rótulo por spinner + `loadingText`, mantendo a altura. */
    loading?: boolean;
    loadingText?: string;
  };

export function Button({
  className,
  variant,
  size,
  loading = false,
  loadingText,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <LoaderCircle
            className="h-4 w-4 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          {loadingText ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export { buttonVariants };
