import { Badge, BadgeDot } from "@/components/ui/badge";
import type { CompanyStatus } from "../types";

/**
 * Status da empresa (RN-11). Cores semânticas fixas — não mudam com o nicho, porque o
 * significado de "suspensa" não pode depender do segmento (docs/styles/temas/README.md).
 */
const STATUS_META: Record<
  CompanyStatus,
  { label: string; variant: "success" | "danger" | "neutral" }
> = {
  ACTIVE: { label: "Ativa", variant: "success" },
  SUSPENDED: { label: "Suspensa", variant: "danger" },
  CANCELED: { label: "Cancelada", variant: "neutral" },
};

export function CompanyStatusBadge({ status }: { status: CompanyStatus }) {
  const meta = STATUS_META[status];

  return (
    <Badge variant={meta.variant}>
      <BadgeDot />
      {meta.label}
    </Badge>
  );
}

export function companyStatusLabel(status: CompanyStatus): string {
  return STATUS_META[status].label;
}
