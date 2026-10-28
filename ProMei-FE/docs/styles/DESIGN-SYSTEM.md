# Design System — CRM / Gestão Empresarial

> Guia de implementação visual e técnica para o painel SaaS multiempresa.

## 1. Objetivo

Este Design System define as bases visuais e os tokens necessários para manter consistência entre Figma e frontend. O produto é um SaaS/CRM multiempresa voltado inicialmente a MEIs e pequenas empresas, com módulos de estoque, itens, empresas, usuários, permissões, assinaturas e futuras integrações financeiras/fiscais.

Princípios: **clareza, confiança, organização, eficiência, escalabilidade e acessibilidade**.

---

## 2. Estrutura de tokens

Usar três níveis:

```text
Primitives → Semantic Tokens → Components
```

- **Primitives:** valores brutos de cor.
- **Semantic Tokens:** descrevem a função da cor (`text/primary`, `surface/default`).
- **Components:** consomem tokens semânticos (`button/primary/background`).

No Figma, criar as collections `Primitives` e `Semantic`, sendo `Semantic` com os modes **Light** e **Dark**.

---

## 3. Paleta principal — Blue

| Token | HEX |
|---|---|
| `blue/50` | `#EFF6FF` |
| `blue/100` | `#DBEAFE` |
| `blue/200` | `#BFDBFE` |
| `blue/300` | `#93C5FD` |
| `blue/400` | `#60A5FA` |
| `blue/500` | `#3B82F6` |
| `blue/600` | `#2563EB` |
| `blue/700` | `#1D4ED8` |
| `blue/800` | `#1E40AF` |
| `blue/900` | `#1E3A8A` |
| `blue/950` | `#172554` |

**Cor principal:** `blue/600` — `#2563EB`.

Use azul para ações principais, links, seleção, foco e identidade. Não use a cor de marca para substituir estados semânticos.

---

## 4. Neutros — Slate

| Token | HEX |
|---|---|
| `slate/0` | `#FFFFFF` |
| `slate/50` | `#F8FAFC` |
| `slate/100` | `#F1F5F9` |
| `slate/200` | `#E2E8F0` |
| `slate/300` | `#CBD5E1` |
| `slate/400` | `#94A3B8` |
| `slate/500` | `#64748B` |
| `slate/600` | `#475569` |
| `slate/700` | `#334155` |
| `slate/800` | `#1E293B` |
| `slate/850` | `#172033` |
| `slate/900` | `#0F172A` |
| `slate/950` | `#0B1120` |

---

## 5. Cores semânticas

### Success

`#22C55E` — operações concluídas, assinatura ativa, item disponível.

### Warning

`#F59E0B` — estoque baixo, pendência, vencimento próximo.

### Danger

`#EF4444` — erro, exclusão, cancelamento, estoque zerado.

### Info

`#0EA5E9` — informações, ajuda, onboarding e notificações informativas.

---

## 6. Semantic Tokens — Light / Dark

### Background e Surface

| Token | Light | Dark |
|---|---|---|
| `bg/page` | `#F8FAFC` | `#0B1120` |
| `bg/subtle` | `#F1F5F9` | `#0F172A` |
| `surface/default` | `#FFFFFF` | `#0F172A` |
| `surface/subtle` | `#F8FAFC` | `#172033` |
| `surface/raised` | `#FFFFFF` | `#172033` |
| `surface/hover` | `#F1F5F9` | `#1E293B` |
| `surface/selected` | `#EFF6FF` | `#172554` |

### Text

| Token | Light | Dark |
|---|---|---|
| `text/primary` | `#0F172A` | `#F8FAFC` |
| `text/secondary` | `#475569` | `#CBD5E1` |
| `text/tertiary` | `#64748B` | `#94A3B8` |
| `text/disabled` | `#94A3B8` | `#475569` |
| `text/inverse` | `#FFFFFF` | `#0F172A` |
| `text/brand` | `#2563EB` | `#60A5FA` |

### Border

| Token | Light | Dark |
|---|---|---|
| `border/subtle` | `#F1F5F9` | `#1E293B` |
| `border/default` | `#E2E8F0` | `#334155` |
| `border/strong` | `#CBD5E1` | `#475569` |
| `border/brand` | `#3B82F6` | `#60A5FA` |
| `border/danger` | `#EF4444` | `#F87171` |

---

## 7. Actions

### Primary

| Estado | Light | Dark |
|---|---|---|
| Default | `#2563EB` | `#3B82F6` |
| Hover | `#1D4ED8` | `#60A5FA` |
| Pressed | `#1E40AF` | `#2563EB` |
| Disabled | `#BFDBFE` | `#1E3A8A` |
| Text | `#FFFFFF` | `#FFFFFF` |

### Secondary

| Estado | Light | Dark |
|---|---|---|
| Background | `#FFFFFF` | `#1E293B` |
| Hover | `#F8FAFC` | `#334155` |
| Text | `#334155` | `#F1F5F9` |
| Border | `#CBD5E1` | `#475569` |

Ações destrutivas devem utilizar os tokens de `danger`, nunca a cor primária.

---

## 8. Status

| Status | Background Light | Text Light | Background Dark | Text Dark |
|---|---|---|---|---|
| Success | `#F0FDF4` | `#15803D` | `#052E16` | `#4ADE80` |
| Warning | `#FFFBEB` | `#B45309` | `#451A03` | `#FBBF24` |
| Danger | `#FEF2F2` | `#B91C1C` | `#450A0A` | `#F87171` |
| Info | `#F0F9FF` | `#0369A1` | `#082F49` | `#38BDF8` |

Exemplos: `Ativo`, `Em estoque`, `Estoque baixo`, `Pendente`, `Sem estoque`, `Cancelado`, `Informativo`, `Rascunho`.

---

## 9. Tipografia

Fonte recomendada: **Inter**.

| Style | Size | Weight | Line Height |
|---|---:|---:|---:|
| Display | 36px | 700 | 44px |
| H1 | 30px | 700 | 38px |
| H2 | 24px | 600 | 32px |
| H3 | 20px | 600 | 28px |
| H4 | 18px | 600 | 26px |
| Body LG | 16px | 400 | 24px |
| Body MD | 14px | 400 | 20px |
| Body SM | 12px | 400 | 18px |
| Label | 14px | 500 | 20px |
| Caption | 12px | 500 | 16px |

Evitar pesos excessivamente leves em dashboards densos.

---

## 10. Espaçamento

Adotar escala baseada em **4px**:

```text
space/1  = 4px
space/2  = 8px
space/3  = 12px
space/4  = 16px
space/5  = 20px
space/6  = 24px
space/8  = 32px
space/10 = 40px
space/12 = 48px
space/16 = 64px
```

Padrões recomendados: `8px` entre ícone e texto, `12–16px` internamente em controles, `16–24px` em cards e `24–32px` entre blocos de página.

---

## 11. Border Radius

```text
radius/sm   = 6px
radius/md   = 8px
radius/lg   = 12px
radius/xl   = 16px
radius/full = 9999px
```

Inputs e botões: `8px`. Cards: `12px`. Modais: `16px`. Badges: `9999px`.

---

## 12. Sidebar / Navegação

| Token | Light | Dark |
|---|---|---|
| `nav/bg` | `#FFFFFF` | `#0F172A` |
| `nav/border` | `#E2E8F0` | `#1E293B` |
| `nav/text` | `#475569` | `#CBD5E1` |
| `nav/icon` | `#64748B` | `#94A3B8` |
| `nav/item-hover` | `#F1F5F9` | `#1E293B` |
| `nav/item-active` | `#EFF6FF` | `#172554` |
| `nav/text-active` | `#1D4ED8` | `#93C5FD` |

Sugestão de agrupamento: Dashboard, Estoque, Produtos/Itens, Movimentações, Empresas, Funcionários, Permissões, Assinaturas e Configurações.

---

## 13. Inputs

Estados obrigatórios: `default`, `hover`, `focus`, `filled`, `disabled`, `error`.

| Token | Light | Dark |
|---|---|---|
| Background | `#FFFFFF` | `#0F172A` |
| Border | `#CBD5E1` | `#334155` |
| Hover | `#94A3B8` | `#475569` |
| Focus | `#3B82F6` | `#60A5FA` |
| Text | `#0F172A` | `#F8FAFC` |
| Placeholder | `#94A3B8` | `#64748B` |
| Disabled BG | `#F1F5F9` | `#1E293B` |
| Error | `#EF4444` | `#F87171` |

Focus ring recomendado: `2px`, usando azul com transparência.

---

## 14. Tabelas

| Token | Light | Dark |
|---|---|---|
| Background | `#FFFFFF` | `#0F172A` |
| Header | `#F8FAFC` | `#172033` |
| Row Hover | `#F8FAFC` | `#1E293B` |
| Row Selected | `#EFF6FF` | `#172554` |
| Divider | `#E2E8F0` | `#1E293B` |

Tabelas devem suportar seleção, ordenação, paginação, filtros, loading/skeleton, empty state e menu de ações.

---

## 15. Componentes mínimos

O Design System inicial deve possuir:

- Button: primary, secondary, ghost, destructive e icon;
- Input, Textarea, Select, Checkbox, Radio e Switch;
- Badge / Status;
- Tooltip;
- Dropdown / Menu;
- Modal / Dialog;
- Alert;
- Toast;
- Card;
- Tabs;
- Breadcrumb;
- Pagination;
- Data Table;
- Sidebar / Navigation;
- Avatar;
- Skeleton;
- Empty State;
- Loading / Spinner.

Cada componente deve contemplar estados `default`, `hover`, `focus`, `active`, `disabled` e, quando aplicável, `error` e `loading`.

---

## 16. Layout

Dashboard desktop recomendado:

```text
┌──────────────┬─────────────────────────────────────────┐
│              │ Header / Breadcrumb / Actions          │
│   Sidebar    ├─────────────────────────────────────────┤
│              │                                         │
│              │              Content                    │
│              │                                         │
└──────────────┴─────────────────────────────────────────┘
```

- Sidebar desktop: `240–280px` (implementado: `256px` / `w-64`).
- Conteúdo: responsivo, com largura máxima quando necessário.
- Grid: 12 colunas em desktop.
- Breakpoint: `lg` (`1024px`, padrão Tailwind) separa os dois modos — abaixo dele a sidebar
  vira drawer, a partir dele fica fixa. Suporte mínimo garantido: `360px` de largura.
- Mobile: sidebar convertida em drawer (overlay + slide-in), largura `85%` do viewport (não
  fixa em px) com teto de `320px` (`max-w-xs`) para não ficar exagerada em tablets próximos do
  breakpoint `lg`. Acionado por botão de menu no header. Implementação: `src/components/layout/`
  (`sidebar.tsx` — `Sidebar` desktop e `MobileSidebar` drawer —, `header.tsx`,
  `dashboard-shell.tsx` orquestrando o estado aberto/fechado) e `src/app/(dashboard)/layout.tsx`.
- Regra para novas telas: mobile-first, preferir unidades relativas (`%`, `vw`, `rem`) a `px`
  fixo — usar `px`/valor fixo só quando a largura *não pode* variar com a tela (ex.: sidebar de
  navegação em desktop, ícones, radius); sem largura fixa maior que o viewport em `360px`; usar
  `min-w-0` em containers flex que podem receber conteúdo longo (texto, breadcrumbs) para não
  estourar a largura da tela.

---

## 17. Tema por nicho (multi-tenant)

Não acoplar componentes diretamente a `blue/600`. A camada de marca é resolvida por **nicho**
da empresa (segmento: alimentício, saúde, ...), implementada como tokens CSS trocáveis em
runtime sem rebuild — especificação completa em
[temas/README.md](temas/README.md):

```text
blue/600 (ramp do nicho)
   ↓
--primary (CSS var, escopada por [data-niche])
   ↓
action/primary/default
   ↓
Button Primary
```

Tokens de marca (ver fórmula completa em [temas/README.md](temas/README.md#tokens-derivados-fórmula)):

```text
--primary
--primary-hover
--primary-pressed
--primary-disabled
--primary-foreground
--text-brand
--border-brand
```

Isso permite que cada empresa exiba a paleta do seu nicho sem modificar cores críticas de
`success`, `warning`, `danger` e `info` — essas permanecem fixas em todo nicho.

---

## 18. Dark Mode

Dark mode não deve ser uma simples inversão de cores. Manter hierarquia entre `background`, `surface`, `raised` e `hover`, evitando preto puro (`#000000`) como fundo padrão.

A preferência de tema pode ser `light`, `dark` ou `system` e deve ser aplicada por tokens/CSS Variables, não por estilos duplicados em componentes.

---

## 19. Acessibilidade

- Buscar conformidade com WCAG AA para contraste de texto e controles.
- Não representar estados apenas por cor; usar texto e/ou ícones.
- Todo controle interativo deve possuir estado de foco visível.
- Áreas clicáveis devem ter dimensões adequadas para desktop e touch.
- Inputs precisam de labels e mensagens de erro associadas.
- Ícones exclusivamente decorativos não devem competir com leitores de tela.

---

## 20. Convenção Figma

```text
Collections
├── Primitives
│   ├── Blue
│   ├── Slate
│   ├── Success
│   ├── Warning
│   ├── Danger
│   └── Info
│
└── Semantic
    ├── Background
    ├── Surface
    ├── Text
    ├── Border
    ├── Action
    ├── Status
    ├── Navigation
    ├── Input
    ├── Table
    ├── Overlay
    └── Focus

Semantic Modes
├── Light
└── Dark
```

Evitar nomes ligados ao valor visual como `blue-button`. Preferir nomes funcionais como `action/primary/default`.

---

## 21. Convenção no Frontend

A implementação deve expor tokens por CSS Variables:

```css
:root {
  --background: #f8fafc;
  --surface: #ffffff;
  --foreground: #0f172a;
  --primary: #2563eb;
  --primary-hover: #1d4ed8;
  --border: #e2e8f0;
  --danger: #ef4444;
}

.dark {
  --background: #0b1120;
  --surface: #0f172a;
  --foreground: #f8fafc;
  --primary: #3b82f6;
  --primary-hover: #60a5fa;
  --border: #334155;
  --danger: #f87171;
}
```

Tailwind deve consumir as variáveis semânticas em vez de espalhar HEX/RGB diretamente pelos componentes.

---

## 22. Regra de implementação

```text
❌ bg-blue-600 espalhado pela aplicação
❌ #2563EB diretamente em componentes
❌ cores diferentes inventadas em cada tela

✅ bg-primary
✅ text-foreground
✅ bg-surface
✅ border-default
✅ text-danger
```

O **Design System é a fonte de verdade**. Alterações globais devem ocorrer nos tokens e propagar para os componentes, reduzindo divergências entre Figma e frontend.
