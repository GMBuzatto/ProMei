import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  Layers,
  LayoutDashboard,
  Package,
  Settings,
  ShieldCheck,
  Users,
  Warehouse,
} from "lucide-react";
import type { AuthenticatedUser } from "@/types/user";
import { hasAnyPermission, isPlatformUser } from "@/features/auth/permissions";

/**
 * Fronteira plataforma/tenant da API (`@PlatformRoute` no `PermissionsGuard`).
 *
 * Não é um detalhe cosmético: a API responde **404** para quem está do lado errado. Um item
 * de menu que ignore isso leva o usuário direto para uma tela quebrada — Super Admin não tem
 * empresa, então não tem itens nem estoque; usuário de empresa não enxerga outras empresas.
 */
export type NavScope = "platform" | "tenant" | "any";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Onde a rota vive. `any` aparece para todo mundo. */
  scope: NavScope;
  /** Basta **uma** das permissões. Lista vazia = sem exigência de permissão. */
  requiredPermissions: string[];
};

/**
 * Itens do menu lateral.
 *
 * As permissões são exatamente as strings que os controllers da API exigem via
 * `@RequirePermission` — se divergirem, o menu mente sobre o que o usuário consegue fazer.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    scope: "any",
    requiredPermissions: [],
  },
  {
    label: "Itens",
    href: "/items",
    icon: Package,
    scope: "tenant",
    requiredPermissions: ["items:read"],
  },
  {
    label: "Estoque",
    href: "/inventory",
    icon: Warehouse,
    scope: "tenant",
    requiredPermissions: ["stock-movements:read"],
  },
  {
    label: "Empresas",
    href: "/companies",
    icon: Boxes,
    scope: "platform",
    requiredPermissions: ["companies:read"],
  },
  {
    label: "Planos",
    href: "/plans",
    icon: Layers,
    scope: "platform",
    requiredPermissions: ["plans:read"],
  },
  {
    label: "Usuários",
    href: "/users",
    icon: Users,
    scope: "tenant",
    requiredPermissions: ["users:read"],
  },
  {
    label: "Papéis e permissões",
    href: "/roles",
    icon: ShieldCheck,
    scope: "tenant",
    requiredPermissions: ["roles:read"],
  },
  {
    label: "Configurações",
    href: "/settings",
    icon: Settings,
    scope: "any",
    requiredPermissions: [],
  },
];

/**
 * Menu que o usuário realmente pode navegar: primeiro a fronteira plataforma/tenant, depois
 * a permissão.
 *
 * Enquanto a sessão não foi lida (`user === null` durante o carregamento), sobram apenas os
 * itens sem exigência — melhor um menu que cresce do que um que oferece rota proibida.
 */
export function filterNavItems(items: NavItem[], user: AuthenticatedUser | null): NavItem[] {
  const platform = isPlatformUser(user);

  return items.filter((item) => {
    if (item.scope === "platform" && !platform) return false;
    if (item.scope === "tenant" && platform) return false;

    return hasAnyPermission(user, item.requiredPermissions);
  });
}
