import { Badge, BadgeDot } from "@/components/ui/badge";
import { SUBSCRIPTION_STATUS_META } from "../state";
import type { SubscriptionStatus } from "../types";

/** Estado da assinatura (RN-12). Cores semânticas, fixas em todo nicho. */
export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  const meta = SUBSCRIPTION_STATUS_META[status];
  if (!meta) return null;

  return (
    <Badge variant={meta.variant}>
      <BadgeDot />
      {meta.label}
    </Badge>
  );
}
