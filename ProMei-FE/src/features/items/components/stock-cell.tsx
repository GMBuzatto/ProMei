import { AlertTriangle, PackageX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { stockAlertLabel, stockLevel } from "../stock";
import type { Item } from "../types";

/**
 * Saldo com o alerta de estoque mínimo (RF-35).
 *
 * O alerta não é só cor: cor sozinha não chega a quem não a distingue nem a leitor de tela.
 * Por isso vem ícone + texto dizendo o porquê ("Abaixo do mínimo (10)"), e o número em si
 * muda de peso — três sinais para a mesma informação.
 */
export function StockCell({ item }: { item: Item }) {
  const level = stockLevel(item);
  const alert = stockAlertLabel(item);

  return (
    <div className="space-y-1">
      <p
        className={
          level === "ok"
            ? "text-text-secondary tabular-nums"
            : "text-status-warning-text font-semibold tabular-nums"
        }
      >
        {item.stock.toLocaleString("pt-BR")} {item.unit}
      </p>

      {alert ? (
        <Badge variant={level === "empty" ? "danger" : "warning"}>
          {level === "empty" ? (
            <PackageX className="h-3 w-3 shrink-0" aria-hidden="true" />
          ) : (
            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
          )}
          {alert}
        </Badge>
      ) : item.minStock > 0 ? (
        <p className="text-text-tertiary text-xs">Mínimo: {item.minStock}</p>
      ) : null}
    </div>
  );
}
