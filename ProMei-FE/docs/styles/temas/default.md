# Tema — Default (Figma)

> Documento de referência para configuração das **paletas de cores** e **Figma Variables** do
> produto. Este é o tema **`default`**: usado quando a empresa não tem nicho definido e é a
> base de fallback de todos os outros nichos. Ver [../temas/README.md](README.md) para como
> este tema se relaciona com os demais (`alimenticio`, `saude`, ...).

---

## 1. Estrutura recomendada

Criar duas Collections no Figma:

### `Primitives`

Cores-base do Design System. Não utilizar diretamente nos componentes quando existir um token semântico equivalente.

### `Semantic`

Criar dois Modes:

- `Light`
- `Dark`

Os componentes devem utilizar preferencialmente os tokens desta Collection.

---

# 2. Primitives

## 2.1 Brand — Blue

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

**Cor principal da marca:** `blue/600`

---

## 2.2 Neutral — Slate

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

## 2.3 Success — Green

| Token | HEX |
|---|---|
| `green/50` | `#F0FDF4` |
| `green/100` | `#DCFCE7` |
| `green/200` | `#BBF7D0` |
| `green/400` | `#4ADE80` |
| `green/500` | `#22C55E` |
| `green/600` | `#16A34A` |
| `green/700` | `#15803D` |
| `green/900` | `#14532D` |
| `green/950` | `#052E16` |

---

## 2.4 Warning — Amber

| Token | HEX |
|---|---|
| `amber/50` | `#FFFBEB` |
| `amber/100` | `#FEF3C7` |
| `amber/200` | `#FDE68A` |
| `amber/400` | `#FBBF24` |
| `amber/500` | `#F59E0B` |
| `amber/600` | `#D97706` |
| `amber/700` | `#B45309` |
| `amber/900` | `#78350F` |
| `amber/950` | `#451A03` |

---

## 2.5 Danger — Red

| Token | HEX |
|---|---|
| `red/50` | `#FEF2F2` |
| `red/100` | `#FEE2E2` |
| `red/200` | `#FECACA` |
| `red/400` | `#F87171` |
| `red/500` | `#EF4444` |
| `red/600` | `#DC2626` |
| `red/700` | `#B91C1C` |
| `red/900` | `#7F1D1D` |
| `red/950` | `#450A0A` |

---

## 2.6 Info — Sky

| Token | HEX |
|---|---|
| `sky/50` | `#F0F9FF` |
| `sky/100` | `#E0F2FE` |
| `sky/200` | `#BAE6FD` |
| `sky/400` | `#38BDF8` |
| `sky/500` | `#0EA5E9` |
| `sky/600` | `#0284C7` |
| `sky/700` | `#0369A1` |
| `sky/900` | `#0C4A6E` |
| `sky/950` | `#082F49` |

---

# 3. Semantic — Light / Dark

## Background

| Token | Light | Dark |
|---|---|---|
| `background/page` | `slate/50` | `slate/950` |
| `background/subtle` | `slate/100` | `slate/900` |
| `background/disabled` | `slate/100` | `slate/800` |
| `background/inverse` | `slate/900` | `slate/50` |

## Surface

| Token | Light | Dark |
|---|---|---|
| `surface/default` | `slate/0` | `slate/900` |
| `surface/subtle` | `slate/50` | `slate/850` |
| `surface/raised` | `slate/0` | `slate/850` |
| `surface/hover` | `slate/100` | `slate/800` |
| `surface/selected` | `blue/50` | `blue/950` |

## Text

| Token | Light | Dark |
|---|---|---|
| `text/primary` | `slate/900` | `slate/50` |
| `text/secondary` | `slate/600` | `slate/300` |
| `text/tertiary` | `slate/500` | `slate/400` |
| `text/disabled` | `slate/400` | `slate/600` |
| `text/inverse` | `slate/0` | `slate/900` |
| `text/brand` | `blue/600` | `blue/400` |
| `text/success` | `green/700` | `green/400` |
| `text/warning` | `amber/700` | `amber/400` |
| `text/danger` | `red/600` | `red/400` |
| `text/info` | `sky/700` | `sky/400` |

## Border

| Token | Light | Dark |
|---|---|---|
| `border/subtle` | `slate/100` | `slate/800` |
| `border/default` | `slate/200` | `slate/700` |
| `border/strong` | `slate/300` | `slate/600` |
| `border/disabled` | `slate/200` | `slate/800` |
| `border/brand` | `blue/500` | `blue/400` |
| `border/danger` | `red/500` | `red/400` |

---

# 4. Actions

## Primary

| Token | Light | Dark |
|---|---|---|
| `action/primary/default` | `blue/600` | `blue/500` |
| `action/primary/hover` | `blue/700` | `blue/400` |
| `action/primary/pressed` | `blue/800` | `blue/600` |
| `action/primary/disabled` | `blue/200` | `blue/900` |
| `action/primary/text` | `slate/0` | `slate/0` |

## Secondary

| Token | Light | Dark |
|---|---|---|
| `action/secondary/default` | `slate/0` | `slate/800` |
| `action/secondary/hover` | `slate/50` | `slate/700` |
| `action/secondary/pressed` | `slate/100` | `slate/600` |
| `action/secondary/text` | `slate/700` | `slate/100` |
| `action/secondary/border` | `slate/300` | `slate/600` |

---

# 5. Status

## Success

| Token | Light | Dark |
|---|---|---|
| `status/success/background` | `green/50` | `green/950` |
| `status/success/text` | `green/700` | `green/400` |
| `status/success/icon` | `green/600` | `green/400` |
| `status/success/border` | `green/200` | `green/900` |

## Warning

| Token | Light | Dark |
|---|---|---|
| `status/warning/background` | `amber/50` | `amber/950` |
| `status/warning/text` | `amber/700` | `amber/400` |
| `status/warning/icon` | `amber/600` | `amber/400` |
| `status/warning/border` | `amber/200` | `amber/900` |

## Danger

| Token | Light | Dark |
|---|---|---|
| `status/danger/background` | `red/50` | `red/950` |
| `status/danger/text` | `red/700` | `red/400` |
| `status/danger/icon` | `red/600` | `red/400` |
| `status/danger/border` | `red/200` | `red/900` |

## Info

| Token | Light | Dark |
|---|---|---|
| `status/info/background` | `sky/50` | `sky/950` |
| `status/info/text` | `sky/700` | `sky/400` |
| `status/info/icon` | `sky/600` | `sky/400` |
| `status/info/border` | `sky/200` | `sky/900` |

---

# 6. Navigation

| Token | Light | Dark |
|---|---|---|
| `navigation/background` | `slate/0` | `slate/900` |
| `navigation/border` | `slate/200` | `slate/800` |
| `navigation/text` | `slate/600` | `slate/300` |
| `navigation/text-hover` | `slate/900` | `slate/50` |
| `navigation/icon` | `slate/500` | `slate/400` |
| `navigation/item-hover` | `slate/100` | `slate/800` |
| `navigation/item-active` | `blue/50` | `blue/950` |
| `navigation/text-active` | `blue/700` | `blue/300` |
| `navigation/icon-active` | `blue/600` | `blue/400` |

---

# 7. Inputs

| Token | Light | Dark |
|---|---|---|
| `input/background` | `slate/0` | `slate/900` |
| `input/border` | `slate/300` | `slate/700` |
| `input/border-hover` | `slate/400` | `slate/600` |
| `input/border-focus` | `blue/500` | `blue/400` |
| `input/text` | `slate/900` | `slate/50` |
| `input/placeholder` | `slate/400` | `slate/500` |
| `input/disabled-background` | `slate/100` | `slate/800` |
| `input/error` | `red/500` | `red/400` |

---

# 8. Tables

| Token | Light | Dark |
|---|---|---|
| `table/background` | `slate/0` | `slate/900` |
| `table/header` | `slate/50` | `slate/850` |
| `table/row` | `slate/0` | `slate/900` |
| `table/row-hover` | `slate/50` | `slate/800` |
| `table/row-selected` | `blue/50` | `blue/950` |
| `table/divider` | `slate/200` | `slate/800` |

---

# 9. Overlay e Focus

| Token | Light | Dark |
|---|---|---|
| `overlay/default` | `#0F172A` 40% | `#000000` 60% |
| `focus/ring` | `#3B82F6` 25% | `#60A5FA` 35% |

---

# 10. Especificação de uso

### Brand

Azul é a identidade principal do produto e deve ser utilizado para:

- ações primárias;
- links;
- navegação ativa;
- foco;
- seleção;
- checkboxes;
- switches;
- elementos de identidade.

### Neutral

Utilizar para:

- backgrounds;
- surfaces;
- cards;
- textos;
- bordas;
- divisores;
- estados desabilitados.

### Semantic

As cores semânticas possuem significado fixo:

- **Green:** sucesso, ativo, disponível, em estoque;
- **Amber:** atenção, pendência, estoque baixo;
- **Red:** erro, exclusão, cancelamento, indisponibilidade;
- **Sky:** informação, ajuda e estados informativos.

Não utilizar cores semânticas como decoração ou identidade da marca.

---

# 11. Organização no Figma

```text
Primitives
├── Blue
├── Slate
├── Green
├── Amber
├── Red
└── Sky

Semantic
├── Background
├── Surface
├── Text
├── Border
├── Action
│   ├── Primary
│   └── Secondary
├── Status
│   ├── Success
│   ├── Warning
│   ├── Danger
│   └── Info
├── Navigation
├── Input
├── Table
├── Overlay
└── Focus
```

A Collection `Semantic` deve possuir os Modes:

```text
Light
Dark
```

## Regra principal

Nos componentes e layouts do Figma, utilizar os tokens de **Semantic**.

Os valores de **Primitives** funcionam como a fundação da paleta e devem alimentar os aliases semânticos.
