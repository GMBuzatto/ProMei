"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPriceWithPeriod } from "@/features/plans/format";
import { usePlans } from "@/features/plans/hooks";
import { API_MAX_PAGE_SIZE } from "@/lib/pagination";
import type { Plan } from "@/features/plans/types";
import { useCreateCompany, useDocumentAvailability } from "../hooks";
import { createCompanySchema, MIN_PASSWORD_LENGTH } from "../schemas";
import { isDuplicateDocumentError } from "../errors";
import { formatDocument } from "../document";
import { SEGMENT_META } from "../segments";
import type { CompanySegment } from "../types";
import {
  CompanyDataFields,
  DOCUMENT_TAKEN_MESSAGE,
  FieldError,
  type CompanyDataErrors,
} from "./company-data-fields";
import { CompanyWizardSteps, type WizardStep } from "./company-wizard-steps";

const STEPS: WizardStep[] = [
  { id: 1, label: "Dados da empresa" },
  { id: 2, label: "Plano e assinatura" },
  { id: 3, label: "Revisão" },
];

type FormValues = {
  name: string;
  document: string;
  segment: CompanySegment;
  adminEmail: string;
  adminPassword: string;
  planId?: string;
};

const INITIAL_VALUES: FormValues = {
  name: "",
  document: "",
  segment: "OTHER",
  adminEmail: "",
  adminPassword: "",
  planId: undefined,
};

type FieldErrors = CompanyDataErrors & { adminEmail?: string; adminPassword?: string };

/** Campos que o passo 1 é responsável por validar antes de liberar o avanço. */
const STEP_ONE_FIELDS = ["name", "document", "segment", "adminEmail", "adminPassword"] as const;

/**
 * Assistente de criação de empresa.
 *
 * Criar empresa aqui é **provisionar**: a API exige o admin inicial no mesmo payload, senão
 * a empresa nasceria sem ninguém capaz de entrar nela. Por isso os campos de administrador
 * dividem o passo 1 com os dados cadastrais, mesmo não aparecendo no mockup.
 */
export function CreateCompanyForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<FieldErrors>({});

  const adminEmailId = useId();
  const adminPasswordId = useId();
  const adminEmailErrorId = useId();
  const adminPasswordErrorId = useId();

  // CNPJ repetido aparece durante a digitação, e não depois do assistente inteiro.
  const documentStatus = useDocumentAvailability(values.document);
  const plansQuery = usePlans({ limit: API_MAX_PAGE_SIZE });
  const { mutate: create, isPending, error } = useCreateCompany();

  function collectErrors(): FieldErrors {
    const result = createCompanySchema.safeParse(values);
    if (result.success) return {};

    const collected: FieldErrors = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !(field in collected)) {
        Object.assign(collected, { [field]: issue.message });
      }
    }
    return collected;
  }

  function goToNextStep() {
    const collected = collectErrors();
    if (documentStatus.taken) {
      collected.document ??= DOCUMENT_TAKEN_MESSAGE;
    }
    const blocking = STEP_ONE_FIELDS.filter((field) => collected[field]);

    if (step === 1 && blocking.length > 0) {
      setErrors(collected);
      return;
    }

    setErrors({});
    setStep((current) => Math.min(current + 1, STEPS.length));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    // Provisionar empresa é irreversível o bastante para nunca acontecer por acidente, e
    // um formulário tem mais de um jeito de ser enviado sem ninguém pedir: Enter num campo
    // de texto, ou o clique em "Próximo" quando ele vira "Criar empresa" (abaixo). Só o
    // último passo cria — nos demais, enviar não faz nada, e quem avança é o "Próximo".
    if (step < STEPS.length) return;

    const result = createCompanySchema.safeParse(values);
    // O CNPJ repetido volta o assistente para o passo 1: é lá que está o campo com o aviso.
    if (!result.success || documentStatus.taken) {
      const collected = collectErrors();
      if (documentStatus.taken) {
        collected.document ??= DOCUMENT_TAKEN_MESSAGE;
      }
      setErrors(collected);
      setStep(1);
      return;
    }

    create(result.data, {
      onSuccess: (provisioned) => router.replace(`/companies/${provisioned.company.id}`),
      // A recusa por CNPJ repetido pertence ao campo, no passo 1 — e não a um alerta no
      // rodapé do passo 3, longe do que precisa ser corrigido.
      onError: (apiError) => {
        if (!isDuplicateDocumentError(apiError)) return;
        setErrors((current) => ({ ...current, document: DOCUMENT_TAKEN_MESSAGE }));
        setStep(1);
      },
    });
  }

  const plans = plansQuery.data?.data ?? [];
  const selectedPlan = plans.find((plan: Plan) => plan.id === values.planId);

  return (
    <form noValidate onSubmit={handleSubmit}>
      <Card>
        <div className="grid gap-0 md:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="border-border border-b p-5 md:border-r md:border-b-0">
            <CompanyWizardSteps steps={STEPS} current={step} />
          </div>

          <CardContent className="min-w-0 space-y-6">
            <fieldset disabled={isPending} className="min-w-0 space-y-6">
              {step === 1 ? (
                <>
                  <header className="space-y-1">
                    <h2 className="text-foreground text-lg font-semibold">Dados da empresa</h2>
                    <p className="text-text-secondary text-sm">
                      Preencha as informações básicas da empresa contratante.
                    </p>
                  </header>

                  <CompanyDataFields
                    values={values}
                    errors={errors}
                    documentStatus={documentStatus}
                    onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
                  />

                  <div className="border-border space-y-6 border-t pt-6">
                    <header className="space-y-1">
                      <h3 className="text-foreground text-base font-semibold">
                        Administrador inicial
                      </h3>
                      <p className="text-text-secondary text-sm">
                        É por este acesso que o cliente entra pela primeira vez. A senha é definida
                        aqui e trocada por ele no primeiro login.
                      </p>
                    </header>

                    <div className="grid gap-6 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={adminEmailId}>
                          E-mail do administrador <span className="text-text-danger">*</span>
                        </Label>
                        <Input
                          id={adminEmailId}
                          name="adminEmail"
                          type="email"
                          inputMode="email"
                          autoComplete="off"
                          placeholder="contato@empresa.com.br"
                          value={values.adminEmail}
                          aria-invalid={errors.adminEmail ? true : undefined}
                          aria-describedby={errors.adminEmail ? adminEmailErrorId : undefined}
                          onChange={(event) =>
                            setValues((current) => ({ ...current, adminEmail: event.target.value }))
                          }
                        />
                        <FieldError id={adminEmailErrorId} message={errors.adminEmail} />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={adminPasswordId}>
                          Senha inicial <span className="text-text-danger">*</span>
                        </Label>
                        <Input
                          id={adminPasswordId}
                          name="adminPassword"
                          type="password"
                          autoComplete="new-password"
                          value={values.adminPassword}
                          aria-invalid={errors.adminPassword ? true : undefined}
                          aria-describedby={errors.adminPassword ? adminPasswordErrorId : undefined}
                          onChange={(event) =>
                            setValues((current) => ({
                              ...current,
                              adminPassword: event.target.value,
                            }))
                          }
                        />
                        <FieldError id={adminPasswordErrorId} message={errors.adminPassword} />
                        <p className="text-text-tertiary text-xs">
                          Mínimo de {MIN_PASSWORD_LENGTH} caracteres.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <header className="space-y-1">
                    <h2 className="text-foreground text-lg font-semibold">Plano e assinatura</h2>
                    <p className="text-text-secondary text-sm">
                      Opcional. A empresa pode ser criada antes de o comercial fechar o plano. Sem
                      assinatura o acesso é normal.
                    </p>
                  </header>

                  {plansQuery.isPending ? (
                    <p className="text-text-secondary text-sm">Carregando planos...</p>
                  ) : null}

                  <ApiErrorAlert error={plansQuery.error} />

                  {!plansQuery.isPending && plans.length === 0 ? (
                    <p className="text-text-secondary text-sm">
                      Nenhum plano cadastrado ainda. Você pode criar a empresa agora e vincular o
                      plano depois.
                    </p>
                  ) : null}

                  <div className="space-y-3">
                    {plans.map((plan: Plan) => (
                      <label
                        key={plan.id}
                        className="border-border hover:bg-surface-hover has-checked:border-border-brand has-checked:bg-surface-selected flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors motion-reduce:transition-none"
                      >
                        <input
                          type="radio"
                          name="planId"
                          className="accent-primary h-4 w-4"
                          checked={values.planId === plan.id}
                          onChange={() => setValues((current) => ({ ...current, planId: plan.id }))}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="text-foreground block text-sm font-medium">
                            {plan.name}
                          </span>
                          <span className="text-text-secondary block text-sm">
                            {formatPriceWithPeriod(plan)}
                          </span>
                        </span>
                      </label>
                    ))}

                    {plans.length > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setValues((current) => ({ ...current, planId: undefined }))}
                      >
                        Criar sem plano
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <header className="space-y-1">
                    <h2 className="text-foreground text-lg font-semibold">Revisão</h2>
                    <p className="text-text-secondary text-sm">
                      Confira antes de provisionar a empresa.
                    </p>
                  </header>

                  <dl className="divide-border divide-y">
                    <ReviewRow label="Razão social" value={values.name} />
                    <ReviewRow label="CNPJ" value={formatDocument(values.document)} />
                    <ReviewRow
                      label="Nicho / Segmento"
                      value={SEGMENT_META[values.segment].label}
                    />
                    <ReviewRow label="Administrador" value={values.adminEmail} />
                    <ReviewRow label="Plano" value={selectedPlan?.name ?? "Sem plano"} />
                  </dl>
                </>
              ) : null}

              <ApiErrorAlert error={isDuplicateDocumentError(error) ? null : error} />
            </fieldset>
          </CardContent>
        </div>

        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t p-5">
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={() => (step === 1 ? router.push("/companies") : setStep(step - 1))}
          >
            {step === 1 ? (
              "Cancelar"
            ) : (
              <>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Voltar
              </>
            )}
          </Button>

          {/* `key` distinta de propósito: sem ela o React reaproveita o mesmo <button> e só
              troca o `type` de "button" para "submit". A troca acontece durante o despacho
              do clique, e o navegador decide a ação padrão depois disso — o clique em
              "Próximo" chegava ao passo 3 e enviava o formulário no mesmo gesto, criando a
              empresa sem ninguém confirmar. Chaves diferentes fazem um botão sair e o outro
              entrar, e o elemento clicado não é mais o que submete. */}
          {step < STEPS.length ? (
            <Button key="next" type="button" onClick={goToNextStep}>
              Próximo
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button key="submit" type="submit" loading={isPending} loadingText="Criando empresa...">
              Criar empresa
            </Button>
          )}
        </div>
      </Card>
    </form>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 py-3">
      <dt className="text-text-secondary text-sm">{label}</dt>
      <dd className="text-foreground text-sm font-medium">{value || "-"}</dd>
    </div>
  );
}
