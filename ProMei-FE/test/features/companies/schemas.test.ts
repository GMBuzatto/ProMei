import { describe, expect, it } from "vitest";
import { createCompanySchema, updateCompanySchema } from "@/features/companies/schemas";

const VALID_CNPJ = "11.222.333/0001-81";

function updateValues(document: string) {
  return { name: "Empresa Teste", document, segment: "RETAIL" as const };
}

describe("updateCompanySchema", () => {
  // Documento do seed: 13 dígitos, dígito verificador inválido. Exigir CNPJ válido aqui
  // travava a edição inteira dessas empresas, inclusive para trocar só o nome.
  it("aceita documento que não é um CNPJ válido", () => {
    const result = updateCompanySchema.safeParse(updateValues("1000000000000"));

    expect(result.success).toBe(true);
    expect(result.data?.document).toBe("1000000000000");
  });

  it("continua normalizando o que tem cara de CNPJ", () => {
    const result = updateCompanySchema.safeParse(updateValues(VALID_CNPJ));

    expect(result.data?.document).toBe("11222333000181");
  });

  // Normalizar apagaria as letras e o "salvar" reescreveria o registro com outro documento.
  it("preserva documento com letras em vez de reescrevê-lo", () => {
    const result = updateCompanySchema.safeParse(updateValues("doc_legado_42"));

    expect(result.data?.document).toBe("doc_legado_42");
  });

  it("ainda exige documento e respeita o limite da API", () => {
    expect(updateCompanySchema.safeParse(updateValues("  ")).success).toBe(false);
    expect(updateCompanySchema.safeParse(updateValues("x".repeat(33))).success).toBe(false);
  });
});

describe("createCompanySchema", () => {
  const base = {
    name: "Empresa Nova",
    segment: "RETAIL" as const,
    adminEmail: "admin@empresa.com.br",
    adminPassword: "SenhaValida123!",
  };

  // Na criação o documento está nascendo: validar evita cadastrar um CNPJ impossível.
  it("continua recusando CNPJ inválido", () => {
    const result = createCompanySchema.safeParse({ ...base, document: "1000000000000" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("CNPJ inválido.");
  });

  it("aceita e normaliza um CNPJ válido", () => {
    const result = createCompanySchema.safeParse({ ...base, document: VALID_CNPJ });

    expect(result.data?.document).toBe("11222333000181");
  });
});
