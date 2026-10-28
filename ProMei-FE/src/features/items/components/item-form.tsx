"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/features/auth/use-permissions";
import { useCreateStockMovement } from "@/features/inventory/hooks";
import { formatMoney, parseMoneyInput, toMoneyInput } from "@/lib/money";
import { useCreateItem, useUpdateItem } from "../hooks";
import {
  initialStockSchema,
  itemSchema,
  type ItemFormErrors,
  type ItemFormValues,
} from "../schemas";
import type { Item } from "../types";

const EMPTY: ItemFormValues = {
  name: "",
  unit: "",
  price: "",
  sku: "",
  category: "",
  description: "",
  minStock: "",
};

function toFormValues(item: Item): ItemFormValues {
  return {
    name: item.name,
    unit: item.unit,
    price: toMoneyInput(item.price),
    sku: item.sku,
    category: item.category ?? "",
    description: item.description ?? "",
    minStock: String(item.minStock),
  };
}

/**
 * Formulário de item — criação e edição na mesma tela.
 *
 * O saldo **não** é um campo do item: a API recusa `stock` no cadastro, porque saldo sem
 * movimentação é saldo sem origem no histórico (RN-22). Mas quem cadastra um item quase sempre
 * já tem quantidade em mãos — então a criação aceita uma quantidade inicial e, logo depois de
 * criar o item, registra a **entrada** correspondente (RF-32). O saldo nasce com autor, data e
 * motivo, como qualquer outra movimentação.
 *
 * Na edição o campo não existe: mudar saldo depois é entrada, saída ou ajuste, cada um com o
 * próprio motivo — e isso é a tela de movimentações, não esta.
 */
export function ItemForm({ item }: { item?: Item }) {
  const router = useRouter();
  const isEditing = item !== undefined;

  const [values, setValues] = useState<ItemFormValues>(item ? toFormValues(item) : EMPTY);
  const [errors, setErrors] = useState<ItemFormErrors>({});
  const [initialStock, setInitialStock] = useState("");
  const [initialStockError, setInitialStockError] = useState<string | undefined>();
  /** Item criado, mas a entrada de estoque falhou — a tela precisa dizer isso. */
  const [createdWithoutStock, setCreatedWithoutStock] = useState<Item | null>(null);

  const create = useCreateItem();
  const update = useUpdateItem(item?.id ?? "");
  const movement = useCreateStockMovement();
  const mutation = isEditing ? update : create;

  // Registrar entrada exige permissão própria: sem ela, o campo não aparece, em vez de
  // aparecer e falhar depois de o item já ter sido criado.
  const canMoveStock = usePermissions("stock-movements:create");
  const showInitialStock = !isEditing && canMoveStock;

  // Criar item e registrar a entrada são duas chamadas: o formulário só libera quando as
  // duas terminam.
  const isPending = mutation.isPending || movement.isPending;

  const nameId = useId();
  const unitId = useId();
  const priceId = useId();
  const skuId = useId();
  const categoryId = useId();
  const descriptionId = useId();
  const minStockId = useId();
  const initialStockId = useId();

  function set(patch: Partial<ItemFormValues>) {
    setValues((current) => ({ ...current, ...patch }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    const result = itemSchema.safeParse(values);
    const stock = showInitialStock ? initialStockSchema.safeParse(initialStock) : undefined;

    // Os dois campos são validados antes de qualquer gravação: descobrir que a quantidade
    // era inválida depois de o item existir deixaria o cadastro pela metade.
    if (!result.success || (stock && !stock.success)) {
      const collected: ItemFormErrors = {};
      if (!result.success) {
        for (const issue of result.error.issues) {
          const field = issue.path[0];
          if (typeof field === "string" && !(field in collected)) {
            Object.assign(collected, { [field]: issue.message });
          }
        }
      }
      setErrors(collected);
      setInitialStockError(stock && !stock.success ? stock.error.issues[0]?.message : undefined);
      return;
    }

    setErrors({});
    setInitialStockError(undefined);

    const quantity = stock?.success ? stock.data : undefined;

    mutation.mutate(result.data, {
      onSuccess: (saved) => {
        if (quantity === undefined) {
          router.replace(`/items/${saved.id}`);
          return;
        }

        movement.mutate(
          { itemId: saved.id, type: "IN", quantity, reason: "Estoque inicial" },
          {
            onSuccess: () => router.replace(`/items/${saved.id}`),
            // O item já existe: repetir o formulário criaria um segundo. A tela passa a
            // oferecer o item criado e explica que só o saldo ficou de fora.
            onError: () => setCreatedWithoutStock(saved),
          },
        );
      },
    });
  }

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
            <fieldset disabled={isPending} className="min-w-0 space-y-6">
              <header className="space-y-1">
                <h2 className="text-foreground text-lg font-semibold">
                  {isEditing ? "Dados do item" : "Novo item"}
                </h2>
                <p className="text-text-secondary text-sm">
                  Nome, unidade e preço são obrigatórios.
                  {isEditing
                    ? " O saldo em estoque não muda por aqui: ele só se altera por movimentação."
                    : " O saldo começa pela quantidade inicial, registrada como uma entrada de estoque."}
                </p>
              </header>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={nameId}>
                    Nome <RequiredMark />
                  </Label>
                  <Input
                    id={nameId}
                    name="name"
                    placeholder="Ex: Café torrado 500g"
                    value={values.name}
                    aria-invalid={errors.name ? true : undefined}
                    onChange={(event) => set({ name: event.target.value })}
                  />
                  <FieldError message={errors.name} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={skuId}>SKU</Label>
                  <Input
                    id={skuId}
                    name="sku"
                    placeholder="Gerado automaticamente se vazio"
                    value={values.sku}
                    aria-invalid={errors.sku ? true : undefined}
                    onChange={(event) => set({ sku: event.target.value })}
                  />
                  <FieldError message={errors.sku} />
                  <p className="text-text-tertiary text-xs">Único dentro da sua empresa.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={priceId}>
                    Preço <RequiredMark />
                  </Label>
                  <Input
                    id={priceId}
                    name="price"
                    inputMode="decimal"
                    placeholder="12,90"
                    value={values.price}
                    aria-invalid={errors.price ? true : undefined}
                    onChange={(event) => set({ price: event.target.value })}
                  />
                  <FieldError message={errors.price} />
                  {!errors.price && parsedPrice !== null ? (
                    <p className="text-text-tertiary text-xs">{formatMoney(parsedPrice)}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor={unitId}>
                    Unidade <RequiredMark />
                  </Label>
                  <Input
                    id={unitId}
                    name="unit"
                    placeholder="un, kg, cx, L..."
                    value={values.unit}
                    aria-invalid={errors.unit ? true : undefined}
                    onChange={(event) => set({ unit: event.target.value })}
                  />
                  <FieldError message={errors.unit} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={categoryId}>Categoria</Label>
                  <Input
                    id={categoryId}
                    name="category"
                    placeholder="Ex: Bebidas"
                    value={values.category}
                    aria-invalid={errors.category ? true : undefined}
                    onChange={(event) => set({ category: event.target.value })}
                  />
                  <FieldError message={errors.category} />
                  <p className="text-text-tertiary text-xs">
                    É por ela que a listagem filtra o catálogo.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={minStockId}>Estoque mínimo</Label>
                  <Input
                    id={minStockId}
                    name="minStock"
                    inputMode="numeric"
                    placeholder="0"
                    value={values.minStock}
                    aria-invalid={errors.minStock ? true : undefined}
                    onChange={(event) => set({ minStock: event.target.value })}
                  />
                  <FieldError message={errors.minStock} />
                  <p className="text-text-tertiary text-xs">
                    O item é destacado na listagem quando o saldo fica abaixo disso. Zero desliga o
                    alerta.
                  </p>
                </div>
              </div>

              {showInitialStock ? (
                <div className="border-border space-y-2 border-t pt-6 sm:max-w-xs">
                  <Label htmlFor={initialStockId}>Quantidade inicial em estoque</Label>
                  <Input
                    id={initialStockId}
                    name="initialStock"
                    inputMode="numeric"
                    placeholder="0"
                    value={initialStock}
                    aria-invalid={initialStockError ? true : undefined}
                    onChange={(event) => setInitialStock(event.target.value)}
                  />
                  <FieldError message={initialStockError} />
                  <p className="text-text-tertiary text-xs leading-relaxed">Opcional.</p>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor={descriptionId}>Descrição</Label>
                <textarea
                  id={descriptionId}
                  name="description"
                  rows={3}
                  className="bg-input text-foreground border-input-border hover:border-input-border-hover focus-visible:border-input-border-focus focus-visible:ring-ring/50 aria-invalid:border-input-error w-full min-w-0 rounded-md border px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-[3px] motion-reduce:transition-none"
                  placeholder="Detalhes que ajudam a identificar o item."
                  value={values.description}
                  aria-invalid={errors.description ? true : undefined}
                  onChange={(event) => set({ description: event.target.value })}
                />
                <FieldError message={errors.description} />
              </div>

              <ApiErrorAlert error={mutation.error} />

              {createdWithoutStock ? (
                <div className="border-status-warning-border bg-status-warning-bg space-y-2 rounded-md border p-4">
                  <p className="text-status-warning-text text-sm font-medium">
                    O item foi criado, mas a quantidade inicial não foi registrada.
                  </p>
                  <ApiErrorAlert error={movement.error} />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => router.replace(`/items/${createdWithoutStock.id}`)}
                  >
                    Abrir o item
                  </Button>
                </div>
              ) : null}
            </fieldset>
          </CardContent>

          <div className="border-border flex flex-wrap items-center justify-end gap-3 border-t p-5">
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => router.push(item ? `/items/${item.id}` : "/items")}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={isPending}
              loadingText={isEditing ? "Salvando..." : "Criando item..."}
            >
              {isEditing ? "Salvar alterações" : "Criar item"}
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

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-text-danger text-xs">{message}</p>;
}
