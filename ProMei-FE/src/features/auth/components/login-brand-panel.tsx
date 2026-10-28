import { Boxes, FileText, ShieldCheck, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ProMeiWordmark } from "@/components/brand/promei-logo";

/**
 * Só o que o MVP já entrega (docs/02-escopo-e-mvp.md) — nada de funcionalidade futura.
 *
 * O `tint` de cada ícone sai de token semântico: marca, success e info. O mockup trazia um
 * roxo no terceiro item, mas roxo não existe no Design System e a camada de marca troca por
 * nicho (docs/styles/temas/README.md) — inventar um hex aqui quebraria as duas regras.
 */
const BENEFITS: ReadonlyArray<{
  icon: LucideIcon;
  title: string;
  description: string;
  tint: string;
}> = [
  {
    icon: Boxes,
    title: "Estoque inteligente",
    description: "Controle entradas, saídas e níveis de estoque.",
    tint: "bg-primary/10 border-primary/25 text-primary",
  },
  {
    icon: FileText,
    title: "Comprovantes de saída",
    description: "Registre movimentações e gere comprovantes de saída.",
    tint: "bg-status-success-bg border-status-success-border text-status-success-icon",
  },
  {
    icon: Users,
    title: "Multiempresa e permissões",
    description: "Gerencie sua empresa e permissões com segurança.",
    tint: "bg-status-info-bg border-status-info-border text-status-info-icon",
  },
];

/**
 * Pontos luminosos sobre as órbitas, em % do container dos anéis. Todos com `left` ≥ 50%:
 * abaixo disso cairiam na metade do container que fica fora do painel, invisível.
 */
const ORBIT_NODES = [
  { top: "9%", left: "79%", size: 5 },
  { top: "40%", left: "87%", size: 4 },
  { top: "82%", left: "88%", size: 4 },
  { top: "26%", left: "59%", size: 3 },
  { top: "61%", left: "74%", size: 5 },
  { top: "53%", left: "65%", size: 3 },
];

/**
 * Fundo abstrato: glow suave da cor primária, órbitas concêntricas com pequenos nós e malha
 * de pontos. Só CSS sobre tokens (`var(--primary)`, `var(--border)`) — sem imagem, foto ou
 * ilustração, e sem animação. Fica atrás do conteúdo e é invisível para leitores de tela.
 */
function BackgroundDecoration() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-40 -left-28 h-[540px] w-[540px] rounded-full bg-[radial-gradient(circle,var(--primary),transparent_70%)] opacity-[0.10] blur-2xl" />
      <div className="absolute -bottom-32 -left-24 h-[440px] w-[440px] rounded-full bg-[radial-gradient(circle,var(--primary),transparent_70%)] opacity-[0.08] blur-2xl" />

      {/*
       * Órbitas: o centro fica na borda esquerda do painel, então só a metade direita de
       * cada anel aparece — são arcos, não círculos inteiros, como no conceito visual. O
       * container tem 170% da largura do painel, logo o maior arco alcança 85% dela e ainda
       * para antes da divisória com a coluna de login (medida em %, vale em todo breakpoint).
       */}
      <div className="absolute top-1/2 left-0 aspect-square w-[170%] -translate-x-1/2 -translate-y-1/2">
        {["100%", "76%", "52%", "30%"].map((size) => (
          <div
            key={size}
            style={{ height: size, width: size }}
            className="border-border/60 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
          />
        ))}

        {ORBIT_NODES.map((node) => (
          <span
            key={`${node.top}-${node.left}`}
            style={{ top: node.top, left: node.left, height: node.size, width: node.size }}
            className="bg-primary absolute -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_10px_var(--primary)]"
          />
        ))}
      </div>

      <div className="absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black_5%,transparent_70%)] [background-size:26px_26px] opacity-50" />
    </div>
  );
}

export function LoginBrandPanel() {
  return (
    <section
      aria-labelledby="login-brand-headline"
      className="bg-background border-border relative hidden flex-col justify-between overflow-hidden border-r p-10 md:flex lg:p-14"
    >
      <BackgroundDecoration />

      <ProMeiWordmark className="relative z-10" />

      <div className="relative z-10 max-w-md py-12">
        <h1
          id="login-brand-headline"
          className="text-foreground text-4xl leading-[1.15] font-bold tracking-tight lg:text-[2.75rem]"
        >
          Gestão completa para o <span className="text-primary">seu negócio.</span>
        </h1>
        <p className="text-text-secondary mt-6 max-w-sm text-[15px] leading-relaxed">
          Controle estoque, movimentações e sua empresa em um único lugar. Mais controle, menos
          trabalho para crescer.
        </p>

        <ul className="mt-12 space-y-7">
          {BENEFITS.map(({ icon: Icon, title, description, tint }) => (
            <li key={title} className="flex gap-5">
              <span
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border ${tint}`}
              >
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <div className="min-w-0 pt-1">
                <p className="text-foreground text-[17px] font-semibold">{title}</p>
                <p className="text-text-secondary mt-1 text-sm leading-relaxed">{description}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-border relative z-10 border-t pt-6">
        <p className="text-text-secondary flex items-center gap-3 text-sm">
          <ShieldCheck className="text-text-tertiary h-5 w-5 shrink-0" aria-hidden="true" />
          Seguro, simples e feito para pequenas empresas.
        </p>
      </div>
    </section>
  );
}
