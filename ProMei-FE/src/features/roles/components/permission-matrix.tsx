"use client";

import { Checkbox } from "@/components/ui/checkbox";
import {
  actionLabel,
  allPermissions,
  columnPermissions,
  groupState,
  permissionKey,
  rowPermissions,
  toggleGroup,
  togglePermission,
  type GroupState,
  type Permission,
  type PermissionMatrix as Matrix,
} from "../matrix";

/**
 * A matriz recurso × ação (RF-12).
 *
 * Uma tabela e não uma lista de checkboxes porque a pergunta que se faz aqui é cruzada — "o
 * estoquista pode **editar** itens?" —, e essa resposta se lê na interseção. Os atalhos de
 * linha e de coluna existem pelo mesmo motivo: "tudo de itens" e "só leitura de tudo" são os
 * dois recortes que aparecem na prática.
 *
 * Em papel de sistema a matriz continua **visível e desabilitada**: quem administra precisa
 * saber o que o papel concede mesmo sem poder mudá-lo (a API recusa com
 * `PAPEL_DE_SISTEMA_IMUTAVEL`).
 */
export function PermissionMatrix({
  matrix,
  selected,
  onChange,
  disabled = false,
}: {
  matrix: Matrix;
  selected: Set<Permission>;
  onChange: (next: Set<Permission>) => void;
  disabled?: boolean;
}) {
  const everything = allPermissions(matrix);
  const total = everything.filter((permission) => selected.has(permission)).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-text-secondary text-sm">
          {total === 0
            ? "Nenhuma permissão marcada. Quem tiver este papel entra e não faz nada."
            : `${total} de ${everything.length} permissões marcadas.`}
        </p>

        <label className="text-foreground flex items-center gap-2 text-sm font-medium">
          <GroupCheckbox
            state={groupState(selected, everything)}
            disabled={disabled}
            onToggle={() => onChange(toggleGroup(selected, everything))}
          />
          Marcar tudo
        </label>
      </div>

      <div className="border-border overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[36rem] border-collapse text-left">
          <caption className="sr-only">
            Permissões por recurso e ação. Cada célula concede uma ação sobre um recurso.
          </caption>

          <thead>
            <tr className="border-border bg-surface-subtle border-b">
              <th
                scope="col"
                className="text-text-secondary px-4 py-3 text-xs font-medium tracking-wide uppercase"
              >
                Recurso
              </th>

              {matrix.actions.map((action) => {
                const column = columnPermissions(matrix, action);

                return (
                  <th key={action} scope="col" className="px-3 py-3 text-center">
                    <span className="text-text-secondary block text-xs font-medium tracking-wide uppercase">
                      {actionLabel(action)}
                    </span>
                    {/* Atalho da coluna: "só leitura de tudo" é um papel inteiro num clique. */}
                    <span className="mt-1 flex justify-center">
                      <GroupCheckbox
                        state={groupState(selected, column)}
                        disabled={disabled}
                        onToggle={() => onChange(toggleGroup(selected, column))}
                        aria-label={`${actionLabel(action)} em todos os recursos`}
                      />
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {matrix.rows.map((row) => {
              const rowKeys = rowPermissions(row);

              return (
                <tr key={row.resource} className="border-border border-b last:border-b-0">
                  <th scope="row" className="px-4 py-3 text-sm font-normal">
                    <label className="text-foreground flex items-center gap-2">
                      <GroupCheckbox
                        state={groupState(selected, rowKeys)}
                        disabled={disabled}
                        onToggle={() => onChange(toggleGroup(selected, rowKeys))}
                      />
                      {row.label}
                    </label>
                  </th>

                  {matrix.actions.map((action) => {
                    const permission = permissionKey(row.resource, action);

                    if (!row.actions.includes(action)) {
                      // A API não oferece este par: célula vazia, não checkbox morto.
                      return (
                        <td key={action} className="text-text-tertiary px-3 py-3 text-center">
                          <span aria-hidden="true">-</span>
                        </td>
                      );
                    }

                    return (
                      <td key={action} className="px-3 py-3">
                        <span className="flex justify-center">
                          <Checkbox
                            checked={selected.has(permission)}
                            disabled={disabled}
                            onChange={() => onChange(togglePermission(selected, permission))}
                            aria-label={`${actionLabel(action)} ${row.label}`}
                          />
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Checkbox de grupo (linha, coluna ou tudo).
 *
 * Grupo pela metade fica **indeterminado**, e não desmarcado: "algumas" e "nenhuma" são
 * estados diferentes, e o quadrado vazio faria o administrador achar que a linha está limpa
 * quando ela concede alguma coisa. O `indeterminate` só existe via DOM — daí o `ref`.
 */
function GroupCheckbox({
  state,
  disabled,
  onToggle,
  ...props
}: {
  state: GroupState;
  disabled?: boolean;
  onToggle: () => void;
} & Omit<React.ComponentProps<"input">, "onChange" | "checked" | "type">) {
  return (
    <Checkbox
      ref={(input) => {
        if (input) input.indeterminate = state === "some";
      }}
      checked={state === "all"}
      disabled={disabled}
      onChange={onToggle}
      {...props}
    />
  );
}
