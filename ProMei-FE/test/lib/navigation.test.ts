import { describe, expect, it } from "vitest";
import { SUPER_ADMIN_ROLE } from "@/features/auth/permissions";
import type { AuthenticatedUser } from "@/types/user";
import { filterNavItems, NAV_ITEMS } from "@/lib/navigation";

function labels(user: AuthenticatedUser | null): string[] {
  return filterNavItems(NAV_ITEMS, user).map((item) => item.label);
}

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    sub: "user-1",
    company_id: "company-1",
    roles: ["Colaborador"],
    permissions: [],
    must_change_password: false,
    ...overrides,
  };
}

describe("filterNavItems", () => {
  it("mostra a plataforma apenas para quem não tem empresa", () => {
    const superAdmin = user({ company_id: null, roles: [SUPER_ADMIN_ROLE], permissions: [] });
    expect(labels(superAdmin)).toContain("Empresas");

    const admin = user({ permissions: ["companies:read"] });
    // Mesmo com a permissão, usuário de empresa levaria 404 na rota de plataforma.
    expect(labels(admin)).not.toContain("Empresas");
  });

  it("esconde as rotas de tenant do usuário de plataforma", () => {
    const superAdmin = user({ company_id: null, roles: [SUPER_ADMIN_ROLE] });
    const visible = labels(superAdmin);

    expect(visible).not.toContain("Itens");
    expect(visible).not.toContain("Estoque");
    expect(visible).not.toContain("Usuários");
  });

  it("mostra ao colaborador só o que ele tem permissão de ver", () => {
    const collaborator = user({ permissions: ["items:read"] });
    const visible = labels(collaborator);

    expect(visible).toContain("Itens");
    expect(visible).not.toContain("Estoque");
    expect(visible).not.toContain("Usuários");
  });

  it("mantém os itens sem exigência de permissão", () => {
    const collaborator = user({ permissions: [] });
    const visible = labels(collaborator);

    expect(visible).toContain("Dashboard");
    expect(visible).toContain("Configurações");
  });

  it("sem sessão sobra apenas o que não exige permissão", () => {
    // Estado transitório enquanto a sessão é lida: melhor um menu que cresce do que um
    // que oferece rota proibida.
    expect(labels(null)).toEqual(["Dashboard", "Configurações"]);
  });

  it("todo item declara permissões alinhadas ao formato recurso:ação da API", () => {
    for (const item of NAV_ITEMS) {
      for (const permission of item.requiredPermissions) {
        expect(permission).toMatch(/^[a-z-]+:[a-z-]+$/);
      }
    }
  });
});
