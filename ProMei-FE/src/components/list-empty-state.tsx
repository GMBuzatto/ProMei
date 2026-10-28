import type { LucideIcon } from "lucide-react";

/**
 * Estado vazio padrão das listagens (docs/08 — mesmas telas, mesmo padrão).
 *
 * Antes cada lista reimplementava este bloco; qualquer ajuste de espaçamento ou tom
 * precisava ser caçado em cinco arquivos. Os textos continuam de cada tela — o que é
 * "vazio" e o que fazer a respeito é conhecimento do domínio, não do componente.
 */
export function ListEmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <span className="bg-background-subtle text-text-tertiary flex h-12 w-12 items-center justify-center rounded-full">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="text-foreground text-sm font-medium">{title}</p>
      <p className="text-text-secondary text-sm">{description}</p>
    </div>
  );
}
