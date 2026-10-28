"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { displayDocument } from "../document";
import type { DocumentAvailabilityStatus } from "../hooks";
import { SEGMENT_META } from "../segments";
import { COMPANY_SEGMENTS, type CompanySegment } from "../types";
import { NicheThemePreview } from "./niche-theme-preview";

export type CompanyDataValues = {
  name: string;
  document: string;
  segment: CompanySegment;
};

export type CompanyDataErrors = Partial<Record<keyof CompanyDataValues, string>>;

/** Copy do CNPJ repetido. A mesma frase que a API devolve no `POST`, dita antes dele. */
export const DOCUMENT_TAKEN_MESSAGE = "Já existe uma empresa cadastrada com este CNPJ.";

/**
 * Campos de identificação da empresa, compartilhados por criação e edição.
 *
 * O seletor de segmento vem colado ao preview do tema porque é isso que a escolha decide:
 * o nicho — e portanto a paleta — do painel daquela empresa.
 */
export function CompanyDataFields({
  values,
  errors,
  onChange,
  documentStatus,
}: {
  values: CompanyDataValues;
  errors: CompanyDataErrors;
  onChange: (patch: Partial<CompanyDataValues>) => void;
  /** Consulta de CNPJ repetido em andamento, quando a tela faz essa checagem. */
  documentStatus?: DocumentAvailabilityStatus;
}) {
  const nameId = useId();
  const documentId = useId();
  const segmentId = useId();
  const nameErrorId = useId();
  const documentErrorId = useId();
  const segmentErrorId = useId();

  // Formato inválido antes de duplicidade: sem CNPJ válido a consulta nem aconteceu.
  const documentMessage =
    errors.document ?? (documentStatus?.taken ? DOCUMENT_TAKEN_MESSAGE : undefined);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={nameId}>
            Razão social <RequiredMark />
          </Label>
          <Input
            id={nameId}
            name="name"
            placeholder="Ex: Alimentos &amp; Sabor Ltda"
            value={values.name}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? nameErrorId : undefined}
            onChange={(event) => onChange({ name: event.target.value })}
          />
          <FieldError id={nameErrorId} message={errors.name} />
        </div>

        <div className="space-y-2">
          <Label htmlFor={documentId}>
            CNPJ <RequiredMark />
          </Label>
          <Input
            id={documentId}
            name="document"
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            value={displayDocument(values.document)}
            aria-invalid={documentMessage ? true : undefined}
            aria-describedby={documentMessage ? documentErrorId : undefined}
            onChange={(event) => onChange({ document: event.target.value })}
          />
          <FieldError id={documentErrorId} message={documentMessage} />
          {!documentMessage && documentStatus?.isChecking ? (
            <p role="status" className="text-text-tertiary text-xs">
              Verificando se o CNPJ já está cadastrado...
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={segmentId}>
          Nicho / Segmento <RequiredMark />
        </Label>
        <p className="text-text-secondary text-sm">
          Define o segmento da empresa. Isso determina o tema e as cores do painel dela.
        </p>
        <Select
          id={segmentId}
          name="segment"
          value={values.segment}
          aria-invalid={errors.segment ? true : undefined}
          aria-describedby={errors.segment ? segmentErrorId : undefined}
          onChange={(event) => onChange({ segment: event.target.value as CompanySegment })}
        >
          {COMPANY_SEGMENTS.map((segment) => (
            <option key={segment} value={segment}>
              {SEGMENT_META[segment].label}
            </option>
          ))}
        </Select>
        <FieldError id={segmentErrorId} message={errors.segment} />
        <p className="text-text-tertiary text-xs">{SEGMENT_META[values.segment].hint}</p>
      </div>

      <NicheThemePreview segment={values.segment} />
    </div>
  );
}

function RequiredMark() {
  return (
    <span className="text-text-danger" title="Campo obrigatório">
      *
    </span>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-text-danger text-xs">
      {message}
    </p>
  );
}
