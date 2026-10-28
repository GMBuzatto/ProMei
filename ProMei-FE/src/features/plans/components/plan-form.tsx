"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatMoney, parseMoneyInput, toMoneyInput } from "@/lib/money";
import { periodLabel } from "../format";
import { useCreatePlan, useUpdatePlan } from "../hooks";
import { planSchema, type PlanFormErrors, type PlanFormValues } from "../schemas";
import { PLAN_PERIODS, type Plan } from "../types";

const EMPTY: PlanFormValues = {
  name: "",
  price: "",
  period: "monthly",
  maxUsers: "",
  maxItems: "",
};

function toFormValues(plan: Plan): PlanFormValues {
  return {
    name: plan.name,
    price: toMoneyInput(plan.price),
    period: plan.period,
    maxUsers: String(plan.limits.maxUsers),
    maxItems: String(plan.limits.maxItems),
  };
}

/**
 * Formulário de plano — criação e edição na mesma tela.
 *
 * As duas usam `planSchema` inteiro: o `UpdatePlanDto` da API aceita campos parciais, mas
 * enviar o formulário completo evita o estado em que um plano editado fica com limite antigo
 * e preço novo por causa de um campo que não foi mandado.
 */
export function PlanForm({ plan }: { plan?: Plan }) {
  const router = useRouter();
  const isEditing = plan !== undefined;

  const [values, setValues] = useState<PlanFormValues>(plan ? toFormValues(plan) : EMPTY);
  const [errors, setErrors] = useState<PlanFormErrors>({});

  const create = useCreatePlan();
  const update = useUpdatePlan(plan?.id ?? "");
  const mutation = isEditing ? update : create;

  const nameId = useId();
  const priceId = useId();
  const periodId = useId();
  const maxUsersId = useId();
  const maxItemsId = useId();
  const nameErrorId = useId();
  const priceErrorId = useId();
  const periodErrorId = useId();
  const maxUsersErrorId = useId();
  const maxItemsErrorId = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;

    const result = planSchema.safeParse({
      name: values.name,
      price: values.price,
      period: values.period,
      limits: { maxUsers: values.maxUsers, maxItems: values.maxItems },
    });

    if (!result.success) {
      const collected: PlanFormErrors = {};
      for (const issue of result.error.issues) {
        const [first, second] = issue.path;
        if (first === "name") collected.name ??= issue.message;
        if (first === "price") collected.price ??= issue.message;
        if (first === "period") collected.period ??= issue.message;
        if (first === "limits" && second === "maxUsers") collected.maxUsers ??= issue.message;
        if (first === "limits" && second === "maxItems") collected.maxItems ??= issue.message;
      }
      setErrors(collected);
      return;
    }

    setErrors({});
    mutation.mutate(result.data, { onSuccess: () => router.replace("/plans") });
  }

  // Prévia do preço: confirma como "149,90" será cobrado antes de salvar.
  const parsedPrice = parseMoneyInput(values.price);

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

      <form noValidate onSubmit={handleSubmit}>
        <Card>
          <CardContent className="space-y-6">
            <fieldset disabled={mutation.isPending} className="min-w-0 space-y-6">
              <header className="space-y-1">
                <h2 className="text-foreground text-lg font-semibold">
                  {isEditing ? "Dados do plano" : "Novo plano"}
                </h2>
                <p className="text-text-secondary text-sm">
                  O preço e a periodicidade valem para novas cobranças. Os limites são aplicados
                  pela API a cada cadastro de usuário ou item (RN-14).
                </p>
              </header>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={nameId}>
                    Nome do plano <RequiredMark />
                  </Label>
                  <Input
                    id={nameId}
                    name="name"
                    placeholder="Ex: Profissional"
                    value={values.name}
                    aria-invalid={errors.name ? true : undefined}
                    aria-describedby={errors.name ? nameErrorId : undefined}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                  <FieldError id={nameErrorId} message={errors.name} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={periodId}>
                    Cobrança <RequiredMark />
                  </Label>
                  <Select
                    id={periodId}
                    name="period"
                    value={values.period}
                    aria-invalid={errors.period ? true : undefined}
                    aria-describedby={errors.period ? periodErrorId : undefined}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, period: event.target.value }))
                    }
                  >
                    {PLAN_PERIODS.map((period) => (
                      <option key={period} value={period}>
                        {periodLabel(period)}
                      </option>
                    ))}
                  </Select>
                  <FieldError id={periodErrorId} message={errors.period} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={priceId}>
                    Preço <RequiredMark />
                  </Label>
                  <Input
                    id={priceId}
                    name="price"
                    inputMode="decimal"
                    placeholder="149,90"
                    value={values.price}
                    aria-invalid={errors.price ? true : undefined}
                    aria-describedby={errors.price ? priceErrorId : undefined}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, price: event.target.value }))
                    }
                  />
                  <FieldError id={priceErrorId} message={errors.price} />
                  {!errors.price && parsedPrice !== null ? (
                    <p className="text-text-tertiary text-xs">
                      Será cobrado {formatMoney(parsedPrice)} por{" "}
                      {periodLabel(values.period)
                        .toLowerCase()
                        .replace("mensal", "mês")
                        .replace("anual", "ano")}
                      .
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="border-border space-y-6 border-t pt-6">
                <header className="space-y-1">
                  <h3 className="text-foreground text-base font-semibold">Limites do plano</h3>
                  <p className="text-text-secondary text-sm">
                    Exceder o limite bloqueia novos cadastros, mas não apaga o que já existe
                    (RN-14). A API exige no mínimo 1 em cada.
                  </p>
                </header>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={maxUsersId}>
                      Máximo de usuários <RequiredMark />
                    </Label>
                    <Input
                      id={maxUsersId}
                      name="maxUsers"
                      inputMode="numeric"
                      placeholder="10"
                      value={values.maxUsers}
                      aria-invalid={errors.maxUsers ? true : undefined}
                      aria-describedby={errors.maxUsers ? maxUsersErrorId : undefined}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, maxUsers: event.target.value }))
                      }
                    />
                    <FieldError id={maxUsersErrorId} message={errors.maxUsers} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={maxItemsId}>
                      Máximo de itens <RequiredMark />
                    </Label>
                    <Input
                      id={maxItemsId}
                      name="maxItems"
                      inputMode="numeric"
                      placeholder="1000"
                      value={values.maxItems}
                      aria-invalid={errors.maxItems ? true : undefined}
                      aria-describedby={errors.maxItems ? maxItemsErrorId : undefined}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, maxItems: event.target.value }))
                      }
                    />
                    <FieldError id={maxItemsErrorId} message={errors.maxItems} />
                  </div>
                </div>
              </div>

              <ApiErrorAlert error={mutation.error} />
            </fieldset>
          </CardContent>

          <div className="border-border flex flex-wrap items-center justify-end gap-3 border-t p-5">
            <Button
              type="button"
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() => router.push("/plans")}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={mutation.isPending}
              loadingText={isEditing ? "Salvando..." : "Criando plano..."}
            >
              {isEditing ? "Salvar alterações" : "Criar plano"}
            </Button>
          </div>
        </Card>
      </form>
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

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-text-danger text-xs">
      {message}
    </p>
  );
}
