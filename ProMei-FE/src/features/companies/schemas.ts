import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "@/features/auth/schemas";
import { isCnpjShaped, isValidCnpj, normalizeDocument } from "./document";
import { COMPANY_SEGMENTS } from "./types";

/**
 * Schemas do formulário de empresa. Espelham `CreateCompanyDto`/`UpdateCompanyDto` da API
 * — quando o back-end publicar seus schemas compartilhados, este arquivo passa a
 * reaproveitá-los em vez de redeclarar as regras.
 *
 * Validar aqui é só UX: a API revalida tudo e é ela quem decide (docs/09-seguranca.md).
 */

/** Reexportado para os componentes deste domínio não precisarem conhecer o módulo de auth. */
export { MIN_PASSWORD_LENGTH };

const nameSchema = z
  .string()
  .trim()
  .min(1, "Informe a razão social.")
  .max(255, "Máximo de 255 caracteres.");

const documentSchema = z
  .string()
  .trim()
  .min(1, "Informe o CNPJ.")
  .refine(isValidCnpj, "CNPJ inválido.")
  .transform(normalizeDocument);

/**
 * Documento na **edição**: sem checagem de dígito verificador.
 *
 * A base tem empresas cujo `document` não é um CNPJ válido — os do seed são `1000000000000`
 * e afins, e a API nunca impôs formato (só `@unique`, até 32 caracteres). Exigir CNPJ válido
 * aqui travava a tela inteira dessas empresas: sem tocar no campo, trocar o nicho ou o nome
 * já era recusado por um dado que a própria plataforma criou. Validar na criação continua
 * fazendo sentido — ali o documento está nascendo.
 *
 * A normalização também passa a ser condicional: documento fora do formato de CNPJ é
 * enviado como está, porque `normalizeDocument` apagaria o que não for dígito e o "salvar"
 * reescreveria o registro.
 */
const editableDocumentSchema = z
  .string()
  .trim()
  .min(1, "Informe o CNPJ.")
  .max(32, "Máximo de 32 caracteres.")
  .transform((value) => (isCnpjShaped(value) ? normalizeDocument(value) : value));

const segmentSchema = z.enum(COMPANY_SEGMENTS, {
  message: "Selecione o nicho/segmento da empresa.",
});

/**
 * Criação = provisionamento. O admin inicial é obrigatório na API: sem ele a empresa
 * nasceria sem ninguém capaz de entrar nela (ver comentário do `CreateCompanyDto`).
 */
export const createCompanySchema = z.object({
  name: nameSchema,
  document: documentSchema,
  segment: segmentSchema,
  adminEmail: z
    .string()
    .trim()
    .min(1, "Informe o e-mail do administrador.")
    .pipe(z.email("Informe um e-mail válido.")),
  adminPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `A senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`),
  /** Opcional: a empresa pode ser criada antes de o comercial fechar o plano. */
  planId: z.uuid("Plano inválido.").optional(),
});

export type CreateCompanyValues = z.infer<typeof createCompanySchema>;

/**
 * Edição dos dados cadastrais. Não toca em admin nem em plano: o `UpdateCompanyDto` da API
 * aceita só estes três campos, e o plano vive na assinatura (`changePlanSchema` abaixo).
 *
 * O documento usa o schema sem validação de CNPJ (ver `editableDocumentSchema`).
 */
export const updateCompanySchema = z.object({
  name: nameSchema,
  document: editableDocumentSchema,
  segment: segmentSchema,
});

export type UpdateCompanyValues = z.infer<typeof updateCompanySchema>;
