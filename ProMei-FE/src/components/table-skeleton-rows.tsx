/**
 * Linhas de esqueleto padrão das tabelas do painel, exibidas enquanto a primeira página
 * carrega. `label` é lido por leitor de tela (`sr-only`) — diga o que está carregando.
 */
export function TableSkeletonRows({
  colSpan,
  label,
  rows = 5,
}: {
  colSpan: number;
  label: string;
  rows?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }, (_, index) => (
        <tr key={index} className="border-border border-b last:border-b-0">
          <td colSpan={colSpan} className="px-4 py-4">
            <div className="bg-background-subtle h-5 w-full animate-pulse rounded motion-reduce:animate-none" />
            <span className="sr-only">{label}</span>
          </td>
        </tr>
      ))}
    </>
  );
}
