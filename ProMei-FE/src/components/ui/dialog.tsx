"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Diálogo modal sobre `<dialog>` nativo.
 *
 * Nativo porque ele já entrega, sem biblioteca e sem código nosso para manter: foco preso
 * dentro do modal, `Esc` para fechar, `inert` no resto da página e a camada de topo
 * (`::backdrop`) que ignora `z-index` e `overflow` dos pais.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // `close` cobre tanto o Esc quanto o fechamento programático — sem isso o estado
      // do React e o do elemento saem de sincronia depois de um Esc.
      onClose={onClose}
      // Clique no backdrop: o alvo é o próprio <dialog>, nunca um filho.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "bg-surface text-foreground border-border m-auto w-[min(40rem,calc(100vw-2rem))]",
        "rounded-lg border p-0 shadow-lg",
        "backdrop:bg-background-inverse/60",
        className,
      )}
    >
      <div className="border-border flex items-start justify-between gap-4 border-b p-5">
        <div className="min-w-0 space-y-1">
          <h2 className="text-foreground text-lg font-semibold">{title}</h2>
          {description ? <div className="text-text-secondary text-sm">{description}</div> : null}
        </div>

        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {children ? <div className="p-5">{children}</div> : null}

      {footer ? (
        <div className="border-border flex flex-wrap justify-end gap-3 border-t p-5">{footer}</div>
      ) : null}
    </dialog>
  );
}
