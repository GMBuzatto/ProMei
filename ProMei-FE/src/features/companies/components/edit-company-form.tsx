"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDocumentAvailability, useUpdateCompany } from "../hooks";
import { updateCompanySchema } from "../schemas";
import { isDuplicateDocumentError } from "../errors";
import type { Company } from "../types";
import {
  CompanyDataFields,
  DOCUMENT_TAKEN_MESSAGE,
  type CompanyDataErrors,
} from "./company-data-fields";
import { CompanyPlanFields, useCompanyPlanEditor } from "./company-plan-fields";

/**
 * Edição da empresa: dados cadastrais e plano, num único "Salvar alterações".
 *
 * São duas rotas diferentes — `PATCH /companies/:id` não aceita plano, que vive na
 * assinatura (`/subscriptions`, RN-15). O botão esconde isso do usuário, mas as chamadas
 * continuam separadas e em ordem: cadastro primeiro, plano depois, e a navegação só
 * acontece se as duas passarem. Quando a segunda falha, a tela fica onde está e diz o que
 * já foi salvo — em vez de sair como se tudo tivesse dado certo.
 */
export function EditCompanyForm({ company }: { company: Company }) {
  const router = useRouter();
  const [values, setValues] = useState({
    name: company.name,
    document: company.document,
    segment: company.segment,
  });
  const [errors, setErrors] = useState<CompanyDataErrors>({});
  /** `true` depois que o cadastro foi gravado — evita reenviá-lo ao repetir o salvamento. */
  const [companySaved, setCompanySaved] = useState(false);

  const { mutateAsync: update, isPending: isSavingCompany, error } = useUpdateCompany(company.id);
  const plan = useCompanyPlanEditor(company);
  // `currentDocument`: o CNPJ atual pertence a esta empresa e não é duplicidade.
  const documentStatus = useDocumentAvailability(values.document, {
    currentDocument: company.document,
  });

  const isPending = isSavingCompany || plan.isPending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    const result = updateCompanySchema.safeParse(values);
    // Valida os dois blocos antes de gravar qualquer um: nada pior que salvar o cadastro e
    // só então descobrir que o plano estava inválido.
    const planErrors = plan.validate();

    if (!result.success || documentStatus.taken) {
      const collected: CompanyDataErrors = {};
      if (!result.success) {
        for (const issue of result.error.issues) {
          const field = issue.path[0];
          if (typeof field === "string" && !(field in collected)) {
            Object.assign(collected, { [field]: issue.message });
          }
        }
      }
      if (documentStatus.taken) {
        collected.document ??= DOCUMENT_TAKEN_MESSAGE;
      }
      setErrors(collected);
      return;
    }

    setErrors({});
    if (planErrors) return;

    try {
      if (!companySaved) {
        await update(result.data);
        setCompanySaved(true);
      }
      await plan.save();
    } catch (saveError) {
      // CNPJ repetido é do campo; o resto já está no estado da mutação e sai no
      // `<ApiErrorAlert />` do bloco correspondente.
      if (isDuplicateDocumentError(saveError)) {
        setErrors((current) => ({ ...current, document: DOCUMENT_TAKEN_MESSAGE }));
      }
      return;
    }

    router.replace(`/companies/${company.id}`);
  }

  return (
    <div className="space-y-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => router.back()}
        className="mb-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Voltar
      </Button>

      <form noValidate onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardContent className="space-y-6">
            <fieldset disabled={isPending} className="min-w-0 space-y-6">
              <header className="space-y-1">
                <h2 className="text-foreground text-lg font-semibold">Dados da empresa</h2>
                <p className="text-text-secondary text-sm">
                  Atualize as informações da empresa contratante. Alterar o nicho atualiza o tema do
                  painel dela.
                </p>
              </header>

              <CompanyDataFields
                values={values}
                errors={errors}
                documentStatus={documentStatus}
                onChange={(patch) => {
                  // Mexeu no cadastro depois de uma gravação parcial: ele volta a ter o que
                  // salvar, senão a próxima tentativa mandaria só o plano.
                  setCompanySaved(false);
                  setValues((current) => ({ ...current, ...patch }));
                }}
              />

              <ApiErrorAlert error={isDuplicateDocumentError(error) ? null : error} />
            </fieldset>
          </CardContent>
        </Card>

        {plan.visible ? (
          <Card>
            <CardContent className="space-y-6">
              <CompanyPlanFields editor={plan} disabled={isPending} />
            </CardContent>
          </Card>
        ) : null}

        {companySaved && plan.error ? (
          <p role="status" className="text-text-secondary text-sm">
            Os dados cadastrais foram salvos. A alteração de plano não foi aplicada. Corrija o erro
            acima e salve de novo.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={() => router.push(`/companies/${company.id}`)}
          >
            Cancelar
          </Button>
          <Button type="submit" loading={isPending} loadingText="Salvando...">
            Salvar alterações
          </Button>
        </div>
      </form>
    </div>
  );
}
