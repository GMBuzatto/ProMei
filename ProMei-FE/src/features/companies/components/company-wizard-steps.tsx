"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type WizardStep = { id: number; label: string };

/**
 * Trilha lateral do assistente de criação. É navegação de leitura: o avanço acontece pelos
 * botões do rodapé, que validam o passo antes de deixar seguir.
 */
export function CompanyWizardSteps({
  steps,
  current,
  className,
}: {
  steps: WizardStep[];
  current: number;
  className?: string;
}) {
  return (
    <ol className={cn("space-y-1", className)}>
      {steps.map((step, index) => {
        const isDone = step.id < current;
        const isCurrent = step.id === current;
        const isLast = index === steps.length - 1;

        return (
          <li key={step.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  isCurrent || isDone
                    ? "bg-primary text-primary-foreground"
                    : "bg-background-subtle text-text-tertiary",
                )}
              >
                {isDone ? <Check className="h-4 w-4" /> : step.id}
              </span>
              {!isLast ? <span aria-hidden="true" className="bg-border w-px flex-1" /> : null}
            </div>

            <span
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "pt-1.5 pb-6 text-sm",
                isCurrent ? "text-foreground font-medium" : "text-text-secondary",
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
