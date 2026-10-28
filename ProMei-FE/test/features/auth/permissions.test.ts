import { describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "@/types/user";
import {
  hasAnyPermission,
  hasPermission,
  isPlatformUser,
  isSuperAdmin,
  SUPER_ADMIN_ROLE,
} from "@/features/auth/permissions";

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    sub: "user-1",
    company_id: "company-1",
    roles: ["Colaborador"],
    permissions: ["items:read"],
    must_change_password: false,
    ...overrides,
  };
}

describe("isPlatformUser", () => {
  it("reconhece usuário sem empresa como plataforma (RN-05)", () => {
    expect(isPlatformUser(user({ company_id: null }))).toBe(true);
  });

  it("usuário de empresa não é de plataforma", () => {
    expect(isPlatformUser(user({ company_id: "company-1" }))).toBe(false);
  });

  it("sem sessão não é ninguém", () => {
    expect(isPlatformUser(null)).toBe(false);
  });
});

describe("isSuperAdmin", () => {
  it("depende do nome do papel, igual ao guard da API", () => {
    expect(isSuperAdmin(user({ roles: [SUPER_ADMIN_ROLE] }))).toBe(true);
    expect(isSuperAdmin(user({ roles: ["Admin"] }))).toBe(false);
    expect(isSuperAdmin(null)).toBe(false);
  });
});

describe("hasPermission", () => {
  it("aceita quando a permissão está na lista", () => {
    expect(hasPermission(user({ permissions: ["companies:create"] }), "companies:create")).toBe(
      true,
    );
  });

  it("recusa quando a permissão não está na lista", () => {
    expect(hasPermission(user({ permissions: ["items:read"] }), "companies:create")).toBe(false);
  });

  it("recusa sem sessão", () => {
    expect(hasPermission(null, "items:read")).toBe(false);
  });

  it("libera o Super Admin mesmo com a lista de permissões vazia", () => {
    // O `PermissionsGuard` da API devolve true só por o papel estar presente, sem consultar
    // a lista. Checar apenas `permissions` esconderia a interface inteira de quem pode tudo.
    const superAdmin = user({
      company_id: null,
      roles: [SUPER_ADMIN_ROLE],
      permissions: [],
    });

    expect(hasPermission(superAdmin, "companies:create")).toBe(true);
    expect(hasPermission(superAdmin, "qualquer:coisa")).toBe(true);
  });

  it("não confunde permissão parecida", () => {
    const staff = user({ permissions: ["companies:read"] });
    expect(hasPermission(staff, "companies:create")).toBe(false);
    expect(hasPermission(staff, "companies:read")).toBe(true);
  });
});

describe("hasAnyPermission", () => {
  it("basta uma das permissões", () => {
    const staff = user({ permissions: ["items:update"] });
    expect(hasAnyPermission(staff, ["items:delete", "items:update"])).toBe(true);
  });

  it("recusa quando nenhuma bate", () => {
    const staff = user({ permissions: ["items:read"] });
    expect(hasAnyPermission(staff, ["items:delete", "items:update"])).toBe(false);
  });

  it("lista vazia significa sem exigência", () => {
    expect(hasAnyPermission(user(), [])).toBe(true);
    // ...mas continua exigindo sessão para itens que pedem permissão.
    expect(hasAnyPermission(null, [])).toBe(true);
    expect(hasAnyPermission(null, ["items:read"])).toBe(false);
  });
});
