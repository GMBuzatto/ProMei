"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * As credenciais que o Admin precisa repassar — exibidas **uma única vez** (RF-04).
 *
 * Sem e-mail no MVP, esta tela é o único lugar onde a senha temporária existe em texto: a API
 * guarda só o hash, e nem ela consegue mostrá-la de novo. Por isso o aviso é explícito e o
 * botão de copiar leva as duas linhas juntas — e-mail sem senha não serve para nada.
 *
 * A senha vale até o primeiro acesso: o usuário nasce com `mustChangePassword`, então a API
 * o bloqueia em tudo menos a própria troca.
 */
export function CredentialsPanel({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`E-mail: ${email}\nSenha temporária: ${password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard bloqueado (permissão, http): a senha continua visível para copiar à mão —
      // é o que importa. Um erro na tela aqui só assustaria.
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="bg-status-success-bg text-status-success-icon flex h-14 w-14 items-center justify-center rounded-full">
          <KeyRound className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="text-text-secondary text-sm leading-relaxed">
          Anote ou copie agora: esta senha <strong>não pode ser exibida de novo</strong>. Repasse ao
          usuário. Ele troca por uma própria no primeiro acesso.
        </p>
      </div>

      <dl className="border-border bg-surface-subtle divide-border divide-y rounded-lg border">
        <div className="flex flex-wrap items-center justify-between gap-2 p-3">
          <dt className="text-text-secondary text-xs tracking-wide uppercase">E-mail</dt>
          <dd className="text-foreground text-sm break-all">{email}</dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 p-3">
          <dt className="text-text-secondary text-xs tracking-wide uppercase">Senha temporária</dt>
          <dd className="text-foreground font-mono text-sm break-all">{password}</dd>
        </div>
      </dl>

      <Button type="button" variant="secondary" className="w-full" onClick={() => void copy()}>
        {copied ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
        {copied ? "Copiado" : "Copiar e-mail e senha"}
      </Button>
    </div>
  );
}
