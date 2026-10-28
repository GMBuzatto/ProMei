import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/api-error";
import { BusinessErrorCode } from "@/lib/api/business-error-code";
import { getErrorMessage } from "@/lib/api/error-message";

/**
 * Os payloads abaixo foram capturados do `ProMei-BE` rodando em localhost:3001, não
 * inferidos do código — inclusive o do 429, cujo formato é a razão de existir o desvio por
 * status em `error-message.ts`.
 */
function apiError(statusCode: number, code: string, message: string): ApiError {
  return new ApiError({ statusCode, code, message, correlationId: "cid" });
}

describe("getErrorMessage — respostas reais do /auth/login", () => {
  it("não revela se o e-mail existe em credencial inválida", () => {
    const error = apiError(
      401,
      BusinessErrorCode.CREDENCIAIS_INVALIDAS,
      "Invalid email or password",
    );

    expect(getErrorMessage(error)).toBe("E-mail ou senha inválidos.");
  });

  it("explica o bloqueio da conta após tentativas falhas", () => {
    const error = apiError(
      401,
      BusinessErrorCode.CONTA_BLOQUEADA,
      "Account temporarily locked due to too many failed login attempts",
    );

    expect(getErrorMessage(error)).toMatch(/muitas tentativas/i);
  });

  it("traduz empresa suspensa/cancelada sem expor o motivo interno", () => {
    const error = apiError(
      403,
      BusinessErrorCode.EMPRESA_SEM_ACESSO,
      "Acesso bloqueado: company suspensa ou cancelada",
    );

    expect(getErrorMessage(error)).toMatch(/acesso indisponível/i);
    expect(getErrorMessage(error)).not.toMatch(/suspensa/i);
  });

  /**
   * O rate limit tem código próprio (`LIMITE_DE_REQUISICOES`) desde a mudança no
   * `AppThrottlerGuard`. A mensagem da API passa direto porque traz a contagem regressiva
   * real — sobrescrever aqui perderia o número de segundos.
   */
  it("repassa a contagem regressiva do rate limit", () => {
    const error = apiError(
      429,
      BusinessErrorCode.LIMITE_DE_REQUISICOES,
      "Muitas requisições em pouco tempo. Aguarde 42s e tente de novo.",
    );

    expect(getErrorMessage(error)).toMatch(/42s/);
    expect(getErrorMessage(error)).not.toMatch(/do nosso lado/i);
  });

  it("mantém ERRO_INTERNO genérico quando o status não é 429", () => {
    const error = apiError(500, BusinessErrorCode.ERRO_INTERNO, "Erro interno do servidor");

    expect(getErrorMessage(error)).toMatch(/do nosso lado/i);
  });

  it("avisa sobre troca de senha obrigatória", () => {
    const error = apiError(
      403,
      BusinessErrorCode.TROCA_DE_SENHA_OBRIGATORIA,
      "Password change required",
    );

    expect(getErrorMessage(error)).toMatch(/nova senha/i);
  });

  it("nunca vaza detalhe técnico de erro que não é da API", () => {
    expect(getErrorMessage(new Error("connect ECONNREFUSED 127.0.0.1:3001"))).toBe(
      "Não foi possível concluir a ação. Tente de novo.",
    );
  });
});

describe("mensagens em pt-BR sobre a API em inglês", () => {
  it("traduz a senha atual incorreta", () => {
    const error = apiError(
      401,
      BusinessErrorCode.SENHA_ATUAL_INCORRETA,
      "Current password is incorrect",
    );
    expect(getErrorMessage(error)).toBe("Senha atual incorreta.");
  });

  it("traduz o e-mail já cadastrado", () => {
    const error = apiError(
      409,
      BusinessErrorCode.EMAIL_JA_CADASTRADO,
      "This email is already registered",
    );
    expect(getErrorMessage(error)).toBe("Este e-mail já está cadastrado.");
  });

  // `RECURSO_NAO_ENCONTRADO` alterna entre inglês e português na API: sobrescrever aqui
  // trocaria "Empresa não encontrada" por algo genérico. Fica com a mensagem da API.
  it("mantém a mensagem específica da API onde ela já vem em pt-BR", () => {
    const error = apiError(404, BusinessErrorCode.RECURSO_NAO_ENCONTRADO, "Empresa não encontrada");
    expect(getErrorMessage(error)).toBe("Empresa não encontrada");
  });
});
