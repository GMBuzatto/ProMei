# Temas por Nicho

> Como a paleta de cores muda conforme o segmento (nicho) da empresa cliente — alimentício,
> saúde, etc. — sem rebuild. Ver também [DESIGN-SYSTEM.md](../DESIGN-SYSTEM.md) para tokens
> que **não** variam por nicho (tipografia, espaçamento, radius, componentes).

## Conceito

Cada empresa (tenant) tem um **nicho** — hoje só o tema `default` é real; os demais nesta
pasta são placeholders de exemplo até o time de design/produto definir as cores oficiais de
cada segmento. No futuro, o nicho vem de um campo da empresa (ex.: `category`/`segment`)
devolvido pela API — ver "Como o nicho é selecionado" abaixo.

**O que muda por nicho:** a camada de marca (cor primária e tudo que deriva dela — botões
primários, links, navegação ativa, seleção, foco). **O que não muda:** neutros (`slate`) e
cores semânticas (`success`/`warning`/`danger`/`info`) — mantidas fixas em todo nicho, porque
seu significado (erro é vermelho, sucesso é verde) não pode depender de branding. Essa regra
já estava prevista em [DESIGN-SYSTEM.md §17](../DESIGN-SYSTEM.md#17-tema-por-empresa-multi-tenant).

## Mecanismo (sem rebuild)

Tokens de marca são CSS Variables em `src/styles/globals.css`. O nicho ativo é um atributo
`data-niche="<chave>"` no `<html>`, ortogonal ao dark/light (classe `.dark` do `next-themes`):

```
:root                              → nicho default, light
.dark                               → nicho default, dark
[data-niche="alimenticio"]          → nicho alimentício, light
[data-niche="alimenticio"].dark     → nicho alimentício, dark
```

Como Tailwind consome os tokens via `var(--primary)` (não o valor em si — ver
[07-configuracao-ambiente.md](../../07-configuracao-ambiente.md) e
[16-configuracao-sem-hardcode.md](../../16-configuracao-sem-hardcode.md)), trocar o atributo
no `<html>` troca a cor renderizada **instantaneamente, no cliente, sem novo build**. É a
mesma técnica que o dark/light já usa, só que numa dimensão extra.

Provider: `src/components/niche-provider.tsx` (`NicheProvider` / `useNiche()`), registrado em
`src/app/layout.tsx`. Hoje persiste a escolha em `localStorage` só para permitir testar a troca
localmente — é um mecanismo temporário até existir a fonte real (ver abaixo). Um script inline
(`getNicheInitScript`, mesmo padrão do `next-themes`) aplica o `data-niche` salvo antes da
hidratação, evitando flash do tema default.

## Como o nicho é selecionado

- **Hoje:** `NicheProvider` inicializa com `default`; a troca manual é feita na tela de
  Configurações (`NicheSettings`, por segmento da empresa), que existe enquanto a fonte real
  — o segmento vindo da API — não está disponível;
- **Futuro:** quando a empresa autenticada carregar (ex.: resposta de `/companies/me` ou o
  payload retornado após login), o campo de segmento/categoria da empresa inicializa o
  `NicheProvider` com o nicho correspondente. Esse campo ainda não existe na API — é uma
  pendência do back-end (`ProMei-BE`), fora do escopo deste repositório;
- Nicho desconhecido/nulo → cai em `default` (fallback seguro, sempre funcional).

## Tokens derivados (fórmula)

Cada nicho define só a **rampa de cor da marca** (10 tons, mesma estrutura de `blue` em
[default.md](default.md)): `50, 200, 300, 400, 500, 600, 700, 800, 900, 950`. Os 13 tokens de
marca usados pelos componentes são sempre derivados da mesma forma — é a mesma relação que
`default` já usa com `blue`:

| Token | Light | Dark |
|---|---|---|
| `--primary` | tom `600` | tom `500` |
| `--primary-hover` | tom `700` | tom `400` |
| `--primary-pressed` | tom `800` | tom `600` |
| `--primary-disabled` | tom `200` | tom `900` |
| `--text-brand` | tom `600` | tom `400` |
| `--border-brand` | tom `500` | tom `400` |
| `--surface-selected` | tom `50` | tom `950` |
| `--nav-item-active` | tom `50` | tom `950` |
| `--nav-text-active` | tom `700` | tom `300` |
| `--nav-icon-active` | tom `600` | tom `400` |
| `--table-row-selected` | tom `50` | tom `950` |
| `--input-border-focus` | tom `500` | tom `400` |
| `--focus-ring` | tom `500` a 25% | tom `400` a 35% |

`--primary-foreground` fica `#FFFFFF` em todo nicho (todos os tons `500`-`600` têm contraste
suficiente para texto branco; se um nicho novo usar uma cor clara nesses tons, validar
contraste WCAG AA antes de aprovar).

## Nichos atuais

| Chave (`data-niche`) | Nome | Rampa | Status |
|---|---|---|---|
| `default` | Padrão (ProMei) | Blue | ✅ Real — ver [default.md](default.md) |
| `alimenticio` | Alimentício | Orange (placeholder) | ⚠️ Exemplo — ver [alimenticio.md](alimenticio.md), pendente de definição pelo time de design |
| `saude` | Saúde | Teal (placeholder) | ⚠️ Exemplo — ver [saude.md](saude.md), pendente de definição pelo time de design |

Os dois últimos existem só para provar o mecanismo (troca de paleta sem rebuild) e servir de
template — as cores **não** são uma decisão de marca aprovada.

## Como adicionar um nicho novo

1. Escolher a rampa de 10 tons (`50, 200, 300, 400, 500, 600, 700, 800, 900, 950`) — de
   preferência uma escala existente e testada (Tailwind, Radix Colors) em vez de inventar tons
   soltos;
2. Documentar em `docs/styles/temas/<chave>.md` (copiar a estrutura de
   [alimenticio.md](alimenticio.md)) e adicionar uma linha na tabela acima;
3. Registrar a chave em `src/lib/niches.ts` (`NICHES`);
4. Adicionar o bloco `[data-niche="<chave>"]` / `[data-niche="<chave>"].dark` em
   `src/styles/globals.css`, aplicando a fórmula da tabela acima;
5. Validar contraste (texto branco sobre `--primary`, texto do tom `600`/`700` sobre
   `--surface`) antes de aprovar.

Nunca declarar uma cor de nicho fora desses dois lugares (`niches.ts` + `globals.css`) — ver
regra de "nenhuma cor hardcoded" em
[16-configuracao-sem-hardcode.md](../../16-configuracao-sem-hardcode.md).
