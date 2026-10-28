import { describe, expect, it } from "vitest";
import {
  allPermissions,
  buildPermissionMatrix,
  columnPermissions,
  groupState,
  resourceLabel,
  rowPermissions,
  toggleGroup,
  togglePermission,
  unknownPermissions,
} from "@/features/roles/matrix";

const CATALOG = [
  "items:create",
  "items:read",
  "items:update",
  "items:delete",
  "companies:read",
  "stock-movements:read",
  "stock-movements:create",
];

describe("buildPermissionMatrix", () => {
  const matrix = buildPermissionMatrix(CATALOG);

  it("usa o catálogo como fonte das colunas, na ordem do CRUD", () => {
    expect(matrix.actions).toEqual(["read", "create", "update", "delete"]);
  });

  it("dá a cada recurso só as ações que ele tem", () => {
    const movements = matrix.rows.find((row) => row.resource === "stock-movements");

    expect(movements?.actions).toEqual(["read", "create"]);
  });

  // Papel de empresa não administra a plataforma (RN-01/RN-05): marcar `companies:read` nele
  // não daria acesso a nada, então a caixa nem existe.
  it("deixa os recursos de plataforma fora da matriz", () => {
    const resources = matrix.rows.map((row) => row.resource);

    expect(resources).not.toContain("companies");
    // Sobram só os de tenant, em ordem de rótulo: "Itens", "Movimentações de estoque".
    expect(resources).toEqual(["items", "stock-movements"]);
  });

  it("ignora entrada malformada em vez de quebrar a tela", () => {
    expect(buildPermissionMatrix(["", "items", ":read", "items:read"]).rows).toHaveLength(1);
  });

  it("cai para a chave crua quando o recurso não tem rótulo", () => {
    expect(resourceLabel("gizmos")).toBe("gizmos");
    expect(resourceLabel("items")).toBe("Itens");
  });
});

describe("seleção", () => {
  it("marca e desmarca sem alterar o conjunto original", () => {
    const selected = new Set(["items:read"]);
    const next = togglePermission(selected, "items:create");

    expect([...next].sort()).toEqual(["items:create", "items:read"]);
    expect([...selected]).toEqual(["items:read"]);
    expect([...togglePermission(next, "items:read")]).toEqual(["items:create"]);
  });

  it("resume o estado de um grupo", () => {
    const permissions = ["items:read", "items:create"];

    expect(groupState(new Set(), permissions)).toBe("none");
    expect(groupState(new Set(["items:read"]), permissions)).toBe("some");
    expect(groupState(new Set(permissions), permissions)).toBe("all");
  });

  // Grupo pela metade quase sempre quer completar, não zerar.
  it("completa o grupo parcial e só limpa o que está cheio", () => {
    const permissions = ["items:read", "items:create"];

    expect(toggleGroup(new Set(["items:read"]), permissions).size).toBe(2);
    expect(toggleGroup(new Set(permissions), permissions).size).toBe(0);
  });
});

describe("recortes da matriz", () => {
  const matrix = buildPermissionMatrix(CATALOG);

  it("monta a coluna só com quem tem a ação", () => {
    expect(columnPermissions(matrix, "delete")).toEqual(["items:delete"]);
    expect(columnPermissions(matrix, "read").sort()).toEqual([
      "items:read",
      "stock-movements:read",
    ]);
  });

  it("monta a linha do recurso", () => {
    const items = matrix.rows.find((row) => row.resource === "items");

    expect(rowPermissions(items!)).toEqual([
      "items:read",
      "items:create",
      "items:update",
      "items:delete",
    ]);
  });

  it("conta a matriz inteira, já sem o que é de plataforma", () => {
    const platform = CATALOG.filter((permission) => permission.startsWith("companies:"));

    expect(allPermissions(matrix)).toHaveLength(CATALOG.length - platform.length);
  });
});

describe("unknownPermissions", () => {
  // Permissão que a API deixou de oferecer faria o PATCH inteiro falhar.
  it("aponta o que o papel guarda e o catálogo não tem mais", () => {
    expect(unknownPermissions(["items:read", "legacy:read"], CATALOG)).toEqual(["legacy:read"]);
  });

  it("devolve vazio quando está tudo no catálogo", () => {
    expect(unknownPermissions(["items:read"], CATALOG)).toEqual([]);
  });
});
