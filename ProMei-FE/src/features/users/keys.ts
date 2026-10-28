/**
 * Chaves do cache de usuários.
 *
 * Ficam fora de `hooks.ts` porque quem invalida não é só esta feature: mudar um papel muda a
 * permissão efetiva de quem o tem, e `features/roles` precisa invalidar a lista de usuários.
 * Importar o módulo de hooks para isso criaria um ciclo entre as duas features.
 */
export const userKeys = {
  all: ["users"] as const,
  list: () => [...userKeys.all, "list"] as const,
  detail: (id: string) => [...userKeys.all, "detail", id] as const,
};
