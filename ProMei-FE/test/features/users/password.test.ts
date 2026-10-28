import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH } from "@/features/auth/schemas";
import { generateTemporaryPassword, TEMPORARY_PASSWORD_ALPHABET } from "@/features/users/password";

describe("generateTemporaryPassword", () => {
  it("respeita o mínimo da API, mesmo se pedirem menos", () => {
    expect(generateTemporaryPassword(4)).toHaveLength(MIN_PASSWORD_LENGTH);
    expect(generateTemporaryPassword()).toHaveLength(16);
  });

  it("usa só caracteres não ambíguos", () => {
    const password = generateTemporaryPassword(64);

    for (const char of password) {
      expect(TEMPORARY_PASSWORD_ALPHABET).toContain(char);
    }
    expect(password).not.toMatch(/[0O1lI]/);
  });

  it("não repete a senha entre chamadas", () => {
    expect(generateTemporaryPassword()).not.toBe(generateTemporaryPassword());
  });
});
