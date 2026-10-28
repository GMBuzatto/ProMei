import { describe, expect, it } from "vitest";
import { changePasswordSchema, loginSchema, MIN_PASSWORD_LENGTH } from "@/features/auth/schemas";

const SENHA_VALIDA = "senha-nova-forte-123";

function changePassword(overrides: Record<string, unknown> = {}) {
  return changePasswordSchema.safeParse({
    currentPassword: "senha-antiga-123",
    newPassword: SENHA_VALIDA,
    confirmPassword: SENHA_VALIDA,
    ...overrides,
  });
}

describe("loginSchema", () => {
  it("aceita credenciais válidas com rememberMe", () => {
    const result = loginSchema.safeParse({
      email: "  ADMIN@empresa.com.br  ",
      password: "x",
      rememberMe: true,
    });

    expect(result.success).toBe(true);
    expect(result.data?.email).toBe("ADMIN@empresa.com.br");
    expect(result.data?.rememberMe).toBe(true);
  });

  it("rememberMe é opcional e cai em false", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "x" });

    expect(result.success).toBe(true);
    expect(result.data?.rememberMe).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  it("aceita troca válida", () => {
    expect(changePassword().success).toBe(true);
  });

  it("exige o comprimento mínimo da API", () => {
    const curta = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    const result = changePassword({ newPassword: curta, confirmPassword: curta });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["newPassword"]);
  });

  it("recusa confirmação divergente e aponta o campo certo", () => {
    const result = changePassword({ confirmPassword: "outra-coisa-qualquer" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["confirmPassword"]);
  });

  it("recusa repetir a senha atual antes de gastar uma requisição", () => {
    // A API responderia `SENHA_INVALIDA`; barrar aqui evita a ida e volta.
    const result = changePassword({
      currentPassword: SENHA_VALIDA,
      newPassword: SENHA_VALIDA,
      confirmPassword: SENHA_VALIDA,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["newPassword"]);
  });

  it("exige a senha atual", () => {
    const result = changePassword({ currentPassword: "" });
    expect(result.success).toBe(false);
  });

  it("não deixa passar campo extra para a API, que roda forbidNonWhitelisted", () => {
    const result = changePassword();
    expect(Object.keys(result.data ?? {})).toEqual([
      "currentPassword",
      "newPassword",
      "confirmPassword",
    ]);
  });
});
