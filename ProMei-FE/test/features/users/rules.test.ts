import { describe, expect, it } from "vitest";
import {
  countActiveAdmins,
  countActiveUsers,
  filterUsers,
  isLastActiveAdmin,
  type UserFilters,
} from "@/features/users/rules";
import type { CompanyUser, UserStatus } from "@/features/users/types";

function user(
  id: string,
  email: string,
  roles: string[] = [],
  status: UserStatus = "ACTIVE",
): CompanyUser {
  return { id, email, status, mustChangePassword: false, roles, createdAt: "2026-08-01T12:00:00Z" };
}

const admin = user("1", "ana@empresa.com.br", ["Admin"]);
const secondAdmin = user("2", "tiago@empresa.com.br", ["Admin"]);
const seller = user("3", "carla@empresa.com.br", ["Vendedor"]);
const inactiveAdmin = user("4", "rafael@empresa.com.br", ["Admin"], "INACTIVE");

describe("contagens", () => {
  it("conta só quem está ativo", () => {
    expect(countActiveUsers([admin, seller, inactiveAdmin])).toBe(2);
    expect(countActiveAdmins([admin, seller, inactiveAdmin])).toBe(1);
  });
});

describe("isLastActiveAdmin (RN-04)", () => {
  it("acusa o único Admin ativo", () => {
    expect(isLastActiveAdmin([admin, seller, inactiveAdmin], admin)).toBe(true);
  });

  it("libera quando há outro Admin ativo", () => {
    expect(isLastActiveAdmin([admin, secondAdmin], admin)).toBe(false);
  });

  // Admin inativo não segura a regra: a empresa já não conta com ele.
  it("não trava um Admin já inativo", () => {
    expect(isLastActiveAdmin([inactiveAdmin, seller], inactiveAdmin)).toBe(false);
  });

  it("não trava quem não é Admin, mesmo sendo o único ativo", () => {
    expect(isLastActiveAdmin([seller], seller)).toBe(false);
  });
});

describe("filterUsers", () => {
  const users = [admin, seller, inactiveAdmin];
  const none: UserFilters = { search: "", role: "ALL", status: "ALL" };

  it("sem filtro, devolve todo mundo", () => {
    expect(filterUsers(users, none)).toHaveLength(3);
  });

  it("busca por trecho do e-mail, ignorando caixa", () => {
    expect(filterUsers(users, { ...none, search: "CARLA" }).map((u) => u.id)).toEqual(["3"]);
  });

  it("filtra por papel e por status", () => {
    expect(filterUsers(users, { ...none, role: "Admin" }).map((u) => u.id)).toEqual(["1", "4"]);
    expect(filterUsers(users, { ...none, status: "INACTIVE" }).map((u) => u.id)).toEqual(["4"]);
  });

  it("combina os filtros", () => {
    expect(filterUsers(users, { search: "", role: "Admin", status: "ACTIVE" })).toEqual([admin]);
  });
});
