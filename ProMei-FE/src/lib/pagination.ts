/**
 * Paginação das listagens.
 *
 * `DEFAULT_PAGE_SIZE`: tamanho de página padrão das tabelas do painel — o mesmo em toda
 * listagem, para o painel inteiro paginar igual (uma tela com 10 e outra com 25 leria como
 * descuido, não como decisão).
 *
 * `API_MAX_PAGE_SIZE`: teto que a API aceita em `?limit=` (docs/08 — máx. 100). Usado por
 * quem precisa da maior página possível (varreduras, selects de plano), em vez de um `100`
 * mágico que nada ligaria ao contrato da API.
 */
export const DEFAULT_PAGE_SIZE = 10;

export const API_MAX_PAGE_SIZE = 100;
