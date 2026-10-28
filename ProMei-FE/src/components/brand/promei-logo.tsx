import Image from "next/image";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Ícone / Monograma oficial do ProMei usando o asset em alta resolução.
 */
export function ProMeiLogo({
  className,
  size = 48,
  ...props
}: {
  className?: string;
  size?: number;
} & Omit<ComponentProps<"div">, "children">) {
  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl",
        className,
      )}
      style={{ width: size, height: size }}
      {...props}
    >
      <Image
        src="/icon.png"
        alt="ProMei Logo"
        width={size * 2}
        height={size * 2}
        className="h-full w-full object-contain"
        priority
      />
    </div>
  );
}

/**
 * Logo + nome + subtítulo oficial do ProMei.
 * `lg` é o topo do painel institucional; `sm` é a versão do mobile/sidebar.
 */
export function ProMeiWordmark({
  size = "lg",
  className,
}: {
  size?: "sm" | "lg";
  className?: string;
}) {
  const large = size === "lg";

  return (
    <div className={cn("flex items-center", large ? "gap-3.5" : "gap-2.5", className)}>
      <ProMeiLogo size={large ? 50 : 36} className="shadow-sm" />
      <div className="min-w-0">
        <p
          className={cn(
            "text-foreground font-bold tracking-tight",
            large ? "text-[26px] leading-tight" : "text-lg leading-tight",
          )}
        >
          Pro<span className="text-primary font-bold">Mei</span>
        </p>
        <p
          className={cn(
            "text-text-tertiary font-medium tracking-[0.14em] uppercase",
            large ? "mt-0.5 text-[11px]" : "text-[9px]",
          )}
        >
          Gestão Empresarial
        </p>
      </div>
    </div>
  );
}

