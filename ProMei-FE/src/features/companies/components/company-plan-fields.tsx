"use client";

import { useId, useState, type ReactNode } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { usePermissions } from "@/features/auth/use-permissions";
import { API_MAX_PAGE_SIZE } from "@/lib/pagination";
import { formatPriceWithPeriod } from "@/features/plans/format";
import { usePlans } from "@/features/plans/hooks";
import type { Plan } from "@/features/plans/types";
import { SubscriptionStatusBadge } from "@/features/subscriptions/components/subscription-status-badge";
import {
  useChangeSubscriptionPlan,
  useCompanySubscription,
  useCreateSubscription,
} from "@/features/subscriptions/hooks";
import {
  defaultRenewalDate,
  formatRenewalDate,
  renewalDateToInputValue,
} from "@/features/subscriptions/renewal";
import { changePlanSchema, createSubscriptionSchema } from "@/features/subscriptions/schemas";
import type { Subscription } from "@/features/subscriptions/types";
import type { Company } from "../types";
import { FieldError } from "./company-data-fields";

/**
 * Plano da empresa dentro do formulário de edição.
 *
 * Plano não é campo de `PATCH /companies/:id`: é a assinatura, em `/subscriptions`, com
 * permissão própria e efeito imediato (RN-15). Como a tela salva tudo num botão só, quem
 * orquestra as duas chamadas é o formulário pai — este módulo expõe o estado
 * (`useCompanyPlanEditor`) e os campos (`CompanyPlanFields`), sem submit próprio.
 */

export type PlanFieldErrors = { planId?: string; renewsAt?: string };

export type CompanyPlanEditor = {
  /**
   * `false` quando o usuário não pode ver nem gerir assinatura — a seção não é desenhada
   * e a busca da assinatura nem sai (evita um 403 previsível na tela de edição).
   */
  visible: boolean;
  isLoading: boolean;
  loadError: unknown;
  subscription: Subscription | null;
  plans: Plan[];
  plansPending: boolean;
  plansError: unknown;
  values: { planId: string; renewsAt: string };
  setValues: (patch: Partial<{ planId: string; renewsAt: string }>) => void;
  errors: PlanFieldErrors;
  /** `true` quando o usuário tem a permissão exigida pela ação pendente. */
  canSubmit: boolean;
  /** `true` quando há troca (ou vínculo) de plano para gravar. */
  hasChanges: boolean;
  isPending: boolean;
  error: unknown;
  /** Valida sem gravar. Devolve os erros, ou `null` quando não há nada a fazer. */
  validate: () => PlanFieldErrors | null;
  /** Grava. Resolve com `null` quando não havia mudança; rejeita com o `ApiError`. */
  save: () => Promise<Subscription | null>;
};

/**
 * Estado do plano na edição da empresa.
 *
 * Fica num hook, e não no componente de campos, porque quem dispara o salvamento é o
 * `<form>` de cima: ele precisa validar plano e dados cadastrais antes de gravar qualquer
 * um dos dois, e decidir a navegação só depois das duas chamadas.
 */
export function useCompanyPlanEditor(company: Company): CompanyPlanEditor {
  // Ler a assinatura exige `subscriptions:read`; gerir, `subscriptions:update` (troca) ou
  // `subscriptions:create` (primeiro vínculo) — a API separa as três.
  const canRead = usePermissions(["subscriptions:read", "subscriptions:update"]);
  const canChange = usePermissions("subscriptions:update");
  const canCreate = usePermissions("subscriptions:create");

  const subscriptionQuery = useCompanySubscription(company.id, { enabled: canRead });
  const plansQuery = usePlans({ limit: API_MAX_PAGE_SIZE }, { enabled: canRead });

  const changePlan = useChangeSubscriptionPlan(company.id);
  const createSubscription = useCreateSubscription(company.id);

  const subscription = subscriptionQuery.data ?? null;
  const plans = plansQuery.data?.data ?? [];

  // Sugestão de renovação fixada na montagem: recalcular a cada render trocaria a data
  // debaixo do usuário se a edição atravessasse a meia-noite.
  const [suggestedRenewal] = useState(() => defaultRenewalDate());

  /**
   * Só o que o usuário mexeu. O valor exibido cai para o da assinatura enquanto o campo
   * não for tocado — assim o select já nasce certo quando a assinatura chega depois do
   * primeiro render, sem `useEffect` de sincronização.
   */
  const [draft, setDraft] = useState<Partial<{ planId: string; renewsAt: string }>>({});
  const [errors, setErrors] = useState<PlanFieldErrors>({});

  const values = {
    planId: draft.planId ?? subscription?.planId ?? "",
    renewsAt:
      draft.renewsAt ??
      (subscription ? renewalDateToInputValue(subscription.renewsAt) : suggestedRenewal),
  };

  const hasChanges = values.planId !== (subscription?.planId ?? "");
  const canSubmit = subscription ? canChange : canCreate;

  function validate(): PlanFieldErrors | null {
    // Plano é opcional: empresa sem assinatura e sem plano escolhido não tem o que validar.
    if (!hasChanges) return null;

    const result = subscription
      ? changePlanSchema.safeParse({ planId: values.planId })
      : createSubscriptionSchema.safeParse({
          companyId: company.id,
          planId: values.planId,
          renewsAt: values.renewsAt,
        });

    if (result.success) {
      setErrors({});
      return null;
    }

    const collected: PlanFieldErrors = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (field === "planId") collected.planId ??= issue.message;
      if (field === "renewsAt") collected.renewsAt ??= issue.message;
    }

    setErrors(collected);
    return collected;
  }

  async function save(): Promise<Subscription | null> {
    if (!hasChanges) return null;

    if (subscription) {
      return changePlan.mutateAsync({ planId: values.planId });
    }

    return createSubscription.mutateAsync({
      companyId: company.id,
      planId: values.planId,
      renewsAt: values.renewsAt,
    });
  }

  return {
    visible: canRead,
    isLoading: canRead && subscriptionQuery.isPending,
    loadError: subscriptionQuery.error,
    subscription,
    plans,
    plansPending: plansQuery.isPending,
    plansError: plansQuery.error,
    values,
    setValues: (patch) => setDraft((current) => ({ ...current, ...patch })),
    errors,
    canSubmit,
    hasChanges,
    isPending: changePlan.isPending || createSubscription.isPending,
    error: subscription ? changePlan.error : createSubscription.error,
    validate,
    save,
  };
}

export function CompanyPlanFields({
  editor,
  disabled = false,
}: {
  editor: CompanyPlanEditor;
  /** O formulário inteiro está gravando — trava os campos junto com os do cadastro. */
  disabled?: boolean;
}) {
  const planFieldId = useId();
  const planErrorId = useId();
  const renewsAtId = useId();
  const renewsAtErrorId = useId();

  const { subscription, plans, plansPending, plansError, values, setValues, errors, canSubmit } =
    editor;

  if (!editor.visible) return null;

  if (editor.isLoading) {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">Carregando assinatura...</span>
        <div className="bg-background-subtle h-40 animate-pulse rounded-md" />
      </div>
    );
  }

  if (editor.loadError) {
    return (
      <div className="space-y-4">
        <SectionHeader subscription={null} />
        <ApiErrorAlert error={editor.loadError} />
      </div>
    );
  }

  const currentPlan = subscription
    ? (subscription.plan ?? plans.find((plan) => plan.id === subscription.planId))
    : undefined;
  const hasPlansToChoose = plans.length > 0;

  return (
    <fieldset disabled={disabled || !canSubmit} className="min-w-0 space-y-6">
      <SectionHeader subscription={subscription} />

      {subscription ? (
        <dl className="divide-border divide-y">
          <SummaryRow label="Plano atual" value={currentPlan?.name} />
          <SummaryRow
            label="Valor"
            value={currentPlan ? formatPriceWithPeriod(currentPlan) : undefined}
          />
          <SummaryRow label="Situação">
            <SubscriptionStatusBadge status={subscription.status} />
          </SummaryRow>
          <SummaryRow label="Próxima renovação" value={formatRenewalDate(subscription.renewsAt)} />
        </dl>
      ) : null}

      {plansPending ? <p className="text-text-secondary text-sm">Carregando planos...</p> : null}

      <ApiErrorAlert error={plansError} />

      {!plansPending && !hasPlansToChoose ? (
        <p className="text-text-secondary text-sm">
          Nenhum plano cadastrado ainda. Cadastre um plano para poder vinculá-lo a esta empresa.
        </p>
      ) : null}

      {hasPlansToChoose ? (
        <div className="space-y-2">
          <Label htmlFor={planFieldId}>{subscription ? "Trocar plano" : "Plano"}</Label>
          <Select
            id={planFieldId}
            name="planId"
            value={values.planId}
            aria-invalid={errors.planId ? true : undefined}
            aria-describedby={errors.planId ? planErrorId : undefined}
            onChange={(event) => setValues({ planId: event.target.value })}
          >
            <option value="">Selecione um plano</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} ({formatPriceWithPeriod(plan)})
              </option>
            ))}
            {/* A listagem traz até 100 planos: se o plano vigente não veio nela, ele ainda
                precisa aparecer selecionado em vez de sumir do select. */}
            {currentPlan && !plans.some((plan) => plan.id === currentPlan.id) ? (
              <option value={currentPlan.id}>
                {currentPlan.name} ({formatPriceWithPeriod(currentPlan)})
              </option>
            ) : null}
          </Select>
          <FieldError id={planErrorId} message={errors.planId} />
          <p className="text-text-tertiary text-xs">
            {subscription
              ? "A troca vale imediatamente; a cobrança proporcional é tratada manualmente pelo comercial (RN-15)."
              : "A assinatura nasce em teste (trial) e é ativada no fluxo de cobrança (RN-12)."}
          </p>
        </div>
      ) : null}

      {!subscription && hasPlansToChoose ? (
        <div className="space-y-2 sm:max-w-xs">
          <Label htmlFor={renewsAtId}>Próxima renovação</Label>
          <Input
            id={renewsAtId}
            name="renewsAt"
            type="date"
            value={values.renewsAt}
            aria-invalid={errors.renewsAt ? true : undefined}
            aria-describedby={errors.renewsAt ? renewsAtErrorId : undefined}
            onChange={(event) => setValues({ renewsAt: event.target.value })}
          />
          <FieldError id={renewsAtErrorId} message={errors.renewsAt} />
        </div>
      ) : null}

      {subscription?.status === "CANCELED" ? (
        <p className="text-text-secondary text-sm">
          Assinatura cancelada: trocar o plano não a reativa. O cancelamento é terminal (RN-12) e
          retomar exige uma nova assinatura.
        </p>
      ) : null}

      {!canSubmit ? (
        <p className="text-text-secondary text-sm">
          Você não tem permissão para {subscription ? "trocar o plano" : "vincular um plano"} desta
          empresa.
        </p>
      ) : null}

      <ApiErrorAlert error={editor.error} />
    </fieldset>
  );
}

function SectionHeader({ subscription }: { subscription: Subscription | null }) {
  return (
    <header className="space-y-1">
      <h2 className="text-foreground text-lg font-semibold">Plano e assinatura</h2>
      <p className="text-text-secondary text-sm">
        {subscription
          ? "Plano contratado por esta empresa. A troca é registrada em auditoria."
          : "Esta empresa ainda não tem assinatura. Vincule um plano para iniciar a cobrança."}
      </p>
    </header>
  );
}

function SummaryRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3">
      <dt className="text-text-secondary text-sm">{label}</dt>
      <dd className="text-foreground text-sm font-medium">{children ?? value ?? "-"}</dd>
    </div>
  );
}
