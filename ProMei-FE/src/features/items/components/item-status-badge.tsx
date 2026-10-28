import { Badge, BadgeDot } from "@/components/ui/badge";
import type { ItemStatus } from "../types";

/** Estado do item (docs/04: ativo ⇄ inativo). Cores semânticas, fixas em todo nicho. */
const STATUS_META: Record<ItemStatus, { label: string; variant: "success" | "neutral" }> = {
  ACTIVE: { label: "Ativo", variant: "success" },
  INACTIVE: { label: "Inativo", variant: "neutral" },
};

export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  const meta = STATUS_META[status];
  if (!meta) return null;

  return (
    <Badge variant={meta.variant}>
      <BadgeDot />
      {meta.label}
    </Badge>
  );
}

export function itemStatusLabel(status: ItemStatus): string {
  return STATUS_META[status]?.label ?? status;
}
