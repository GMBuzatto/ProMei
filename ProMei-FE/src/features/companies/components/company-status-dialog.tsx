"use client";

import { AlertTriangle } from "lucide-react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useUpdateCompanyStatus } from "../hooks";
import { displayDocument } from "../document";
import type { Company, CompanyStatus } from "../types";
import { SegmentBadge } from "./segment-badge";

/**
 * Transições de estado permitidas pela API (RN-11). Espelhar aqui evita oferecer um botão
 * que a API vai recusar — `CANCELED` é terminal e não aparece em lugar nenhum.
 */
const ALLOWED_TRANSITIONS: Record<CompanyStatus, CompanyStatus[]> = {
  ACTIVE: ["SUSPENDED", "CANCELED"],
  SUSPENDED: ["ACTIVE"],
  CANCELED: [],
};

type TransitionCopy = {
  title: string;
  question: string;
  consequence: string;
  confirmLabel: string;
  pendingLabel: string;
  destructive: boolean;
};

const TRANSITION_COPY: Record<CompanyStatus, TransitionCopy> = {
  SUSPENDED: {
    title: "Suspender empresa",
    question: "Tem certeza que deseja suspender esta empresa?",
    consequence:
      "Os usuários desta empresa não conseguirão acessar o painel até que ela seja reativada.",
    confirmLabel: "Suspender empresa",
    pendingLabel: "Suspendendo...",
    destructive: true,
  },
  CANCELED: {
    title: "Cancelar empresa",
    question: "Tem certeza que deseja cancelar esta empresa?",
    consequence:
      "O cancelamento é definitivo: não há volta para ativa. Os dados ficam retidos por 90 dias e depois são anonimizados.",
    confirmLabel: "Cancelar empresa",
    pendingLabel: "Cancelando...",
    destructive: true,
  },
  ACTIVE: {
    title: "Reativar empresa",
    question: "Deseja reativar esta empresa?",
    consequence: "Os usuários voltam a acessar o painel imediatamente.",
    confirmLabel: "Reativar empresa",
    pendingLabel: "Reativando...",
    destructive: false,
  },
};

export function canTransitionTo(from: CompanyStatus, to: CompanyStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: CompanyStatus): CompanyStatus[] {
  return ALLOWED_TRANSITIONS[from];
}

/**
 * Confirmação de mudança de estado da empresa.
 *
 * O mockup previa um campo "motivo da suspensão", que não existe aqui: `UpdateCompanyStatusDto`
 * aceita apenas `status`, então o texto digitado seria descartado no envio. Um campo que
 * finge registrar algo é pior que campo nenhum — quando a API aceitar o motivo, ele entra.
 */
export function CompanyStatusDialog({
  company,
  target,
  open,
  onClose,
}: {
  company: Company;
  target: CompanyStatus;
  open: boolean;
  onClose: () => void;
}) {
  const copy = TRANSITION_COPY[target];
  const { mutate: changeStatus, isPending, error, reset } = useUpdateCompanyStatus(company.id);

  function handleClose() {
    if (isPending) return;
    reset();
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose} title={copy.title}>
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          {copy.destructive ? (
            <span className="border-status-danger-border bg-status-danger-bg flex h-14 w-14 items-center justify-center rounded-full border">
              <AlertTriangle className="text-status-danger-icon h-6 w-6" aria-hidden="true" />
            </span>
          ) : null}

          <p className="text-foreground text-base font-medium">{copy.question}</p>
          <p className="text-text-secondary text-sm leading-relaxed">{copy.consequence}</p>
        </div>

        <div className="border-border bg-surface-subtle flex items-center gap-3 rounded-lg border p-4">
          <SegmentBadge segment={company.segment} />
          <div className="min-w-0">
            <p className="text-foreground truncate text-sm font-semibold">{company.name}</p>
            <p className="text-text-secondary text-sm">CNPJ: {displayDocument(company.document)}</p>
          </div>
        </div>

        <ApiErrorAlert error={error} />
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button type="button" variant="secondary" onClick={handleClose} disabled={isPending}>
          Cancelar
        </Button>
        <Button
          type="button"
          loading={isPending}
          loadingText={copy.pendingLabel}
          className={
            copy.destructive
              ? "bg-status-danger-icon hover:bg-status-danger-text active:bg-status-danger-text text-text-inverse"
              : undefined
          }
          onClick={() => changeStatus(target, { onSuccess: onClose })}
        >
          {copy.confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
