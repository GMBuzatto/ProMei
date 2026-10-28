"use client";

import { ArrowDownToLine, ArrowUpFromLine, Boxes, Layers, Package, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PermissionGate } from "@/features/auth/components/permission-gate";
import { useIsPlatformUser } from "@/features/auth/use-permissions";
import { cn } from "@/lib/utils";

/**
 * Atalhos do dashboard, separados pela mesma fronteira que a API aplica (`@PlatformRoute`).
 *
 * Super Admin/Staff não têm empresa (RN-05), então itens e estoque devolveriam 404 para eles —
 * e o Super Admin passa em qualquer `hasPermission`, então filtrar só por permissão continuaria
 * desenhando esses cartões. Por isso o escopo vem primeiro: plataforma vê empresas e planos,
 * usuário de empresa vê o dia a dia do estoque.
 */
export function DashboardQuickActions() {
  const isPlatformUser = useIsPlatformUser();

  return (
    <section aria-label="Atalhos" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {isPlatformUser ? <PlatformActions /> : <TenantActions />}
    </section>
  );
}

function PlatformActions() {
  return (
    <>
      <PermissionGate permissions="companies:create">
        <QuickAction
          href="/companies/new"
          icon={Boxes}
          label="Nova empresa"
          description="Cadastre uma empresa contratante e sua assinatura."
          primary
        />
      </PermissionGate>

      <PermissionGate permissions="plans:create">
        <QuickAction
          href="/plans/new"
          icon={Layers}
          label="Novo plano"
          description="Defina preço e limites de um plano de assinatura."
        />
      </PermissionGate>
    </>
  );
}

/**
 * "Registrar saída" é o primeiro e vem destacado por causa da RNF-11: o fluxo de saída precisa
 * caber em **três cliques a partir daqui**. Este é o clique 1, e ele já leva o tipo escolhido
 * (`?type=OUT`) — sem isso, escolher "saída" na tela seguinte gastaria um dos três.
 *
 * Os atalhos são filtrados por permissão: um cartão que leva a uma tela onde a API responderia
 * 403 é pior que atalho nenhum.
 */
function TenantActions() {
  return (
    <>
      <PermissionGate permissions="stock-movements:create">
        <QuickAction
          href="/inventory?type=OUT"
          icon={ArrowUpFromLine}
          label="Registrar saída"
          description="Venda, consumo ou perda. Gera comprovante."
          primary
        />
      </PermissionGate>

      <PermissionGate permissions="stock-movements:create">
        <QuickAction
          href="/inventory?type=IN"
          icon={ArrowDownToLine}
          label="Registrar entrada"
          description="Reposição de estoque por compra ou devolução."
        />
      </PermissionGate>

      <PermissionGate permissions="items:read">
        <QuickAction
          href="/items"
          icon={Package}
          label="Ver itens"
          description="Catálogo, saldos e alertas de estoque mínimo."
        />
      </PermissionGate>

      <PermissionGate permissions="items:create">
        <QuickAction
          href="/items/new"
          icon={Plus}
          label="Novo item"
          description="Cadastre um produto no catálogo."
        />
      </PermissionGate>
    </>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  description,
  primary = false,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  description: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "block rounded-lg transition-colors motion-reduce:transition-none",
        "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
      )}
    >
      <Card
        className={cn(
          "hover:bg-surface-hover h-full p-4 transition-colors motion-reduce:transition-none",
          primary && "border-border-brand",
        )}
      >
        <span
          className={cn(
            "mb-3 flex h-10 w-10 items-center justify-center rounded-lg",
            primary
              ? "bg-primary text-primary-foreground"
              : "bg-background-subtle text-text-secondary",
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>

        <p className="text-foreground text-sm font-semibold">{label}</p>
        <p className="text-text-secondary text-sm leading-snug">{description}</p>
      </Card>
    </Link>
  );
}
