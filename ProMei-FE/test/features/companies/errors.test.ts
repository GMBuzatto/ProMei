import { describe, expect, it } from "vitest";
import { ApiError, BusinessErrorCode, ClientErrorCode } from "@/lib/api";
import { isDuplicateDocumentError } from "@/features/companies/errors";

function apiError(statusCode: number, code: string): ApiError {
  return new ApiError({ statusCode, code, message: "erro" });
}

describe("isDuplicateDocumentError", () => {
  it("reconhece o 409 de CNPJ repetido que a API devolve hoje", () => {
    expect(isDuplicateDocumentError(apiError(409, BusinessErrorCode.VALIDACAO_FALHOU))).toBe(true);
  });

  // Mesmo código, outro status: validação comum (422), que não é duplicidade.
  it("não confunde com uma validação qualquer", () => {
    expect(isDuplicateDocumentError(apiError(422, BusinessErrorCode.VALIDACAO_FALHOU))).toBe(false);
  });

  it("não confunde com o outro conflito da mesma rota", () => {
    expect(isDuplicateDocumentError(apiError(409, BusinessErrorCode.EMAIL_JA_CADASTRADO))).toBe(
      false,
    );
  });

  it("ignora o que não é erro da API", () => {
    expect(isDuplicateDocumentError(new Error("boom"))).toBe(false);
    expect(isDuplicateDocumentError(apiError(0, ClientErrorCode.FALHA_DE_REDE))).toBe(false);
    expect(isDuplicateDocumentError(null)).toBe(false);
  });
});
