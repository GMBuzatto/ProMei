import { describe, expect, it } from "vitest";
import {
  displayDocument,
  formatDocument,
  isCnpjShaped,
  isValidCnpj,
  normalizeDocument,
  shouldCheckDocumentAvailability,
} from "@/features/companies/document";

describe("normalizeDocument", () => {
  it("mantém apenas dígitos", () => {
    expect(normalizeDocument("12.345.678/0001-90")).toBe("12345678000190");
    expect(normalizeDocument("12 345 678 0001 90")).toBe("12345678000190");
  });

  it("corta o excedente de 14 dígitos", () => {
    expect(normalizeDocument("123456780001909999")).toBe("12345678000190");
  });

  it("devolve string vazia quando não há dígito", () => {
    expect(normalizeDocument("abc")).toBe("");
    expect(normalizeDocument("")).toBe("");
  });
});

describe("formatDocument", () => {
  it("aplica a máscara completa", () => {
    expect(formatDocument("12345678000190")).toBe("12.345.678/0001-90");
  });

  it("mascara progressivamente durante a digitação", () => {
    expect(formatDocument("1")).toBe("1");
    expect(formatDocument("12")).toBe("12");
    expect(formatDocument("123")).toBe("12.3");
    expect(formatDocument("123456")).toBe("12.345.6");
    expect(formatDocument("123456789")).toBe("12.345.678/9");
    expect(formatDocument("1234567800019")).toBe("12.345.678/0001-9");
  });

  it("ignora pontuação já digitada em vez de duplicá-la", () => {
    expect(formatDocument("12.345.678/0001-90")).toBe("12.345.678/0001-90");
  });
});

describe("isValidCnpj", () => {
  it("aceita CNPJ com dígitos verificadores corretos", () => {
    // CNPJs reais de exemplo (Banco do Brasil e Petrobras).
    expect(isValidCnpj("00.000.000/0001-91")).toBe(true);
    expect(isValidCnpj("33000167000101")).toBe(true);
  });

  it("recusa dígito verificador errado", () => {
    expect(isValidCnpj("12.345.678/0001-90")).toBe(false);
    expect(isValidCnpj("33000167000102")).toBe(false);
  });

  it("recusa comprimento diferente de 14 dígitos", () => {
    expect(isValidCnpj("1234567800019")).toBe(false);
    expect(isValidCnpj("")).toBe(false);
  });

  it("recusa sequências repetidas, que passam na conta mas não existem", () => {
    expect(isValidCnpj("11111111111111")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
  });
});

describe("shouldCheckDocumentAvailability", () => {
  it("não consulta enquanto o CNPJ não está completo e válido", () => {
    expect(shouldCheckDocumentAvailability("11.222.333/0001")).toBe(false);
    expect(shouldCheckDocumentAvailability("11222333000100")).toBe(false);
  });

  it("consulta quando o CNPJ é válido", () => {
    expect(shouldCheckDocumentAvailability("11.222.333/0001-81")).toBe(true);
  });

  // Na edição, o documento atual pertence à própria empresa: perguntar por ele
  // devolveria "ocupado" e acusaria uma duplicidade que não existe.
  it("ignora o documento que a empresa já usa, com ou sem máscara", () => {
    expect(shouldCheckDocumentAvailability("11.222.333/0001-81", "11222333000181")).toBe(false);
    expect(shouldCheckDocumentAvailability("11222333000181", "11.222.333/0001-81")).toBe(false);
  });

  it("consulta quando o documento mudou para outro válido", () => {
    expect(shouldCheckDocumentAvailability("45.723.174/0001-10", "11222333000181")).toBe(true);
  });
});

describe("isCnpjShaped", () => {
  it("aceita dígitos, com ou sem os separadores da máscara", () => {
    expect(isCnpjShaped("11222333000181")).toBe(true);
    expect(isCnpjShaped("11.222.333/0001-81")).toBe(true);
    expect(isCnpjShaped("1000000000000")).toBe(true);
  });

  // Sobre estes, máscara e normalização apagariam caracteres do registro.
  it("recusa documento com letras", () => {
    expect(isCnpjShaped("doc_legado_42")).toBe(false);
    expect(isCnpjShaped("ABC123")).toBe(false);
  });
});

describe("displayDocument", () => {
  it("mascara o que é CNPJ", () => {
    expect(displayDocument("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("mostra documento fora do padrão como está, em vez de mutilá-lo", () => {
    expect(displayDocument("doc_legado_42")).toBe("doc_legado_42");
  });
});
