"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useEffect } from "react";
import { useUser } from "@/features/auth/context";
import { ProMeiLogo } from "@/components/brand/promei-logo";
import { SidebarUser } from "@/components/layout/sidebar-user";
import { filterNavItems, NAV_ITEMS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useUser();

  // Menu conforme as permissões do usuário — a API continua sendo a autoridade.
  const items = filterNavItems(NAV_ITEMS, user);

  return (
    // `shrink-0`: dentro da coluna rolável, o menu não pode ser comprimido para caber — quando
    // não cabe, quem resolve é a rolagem.
    <nav aria-label="Navegação principal" className="flex shrink-0 flex-col gap-1 p-3">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-nav-item-active text-nav-text-active"
                : "text-nav-text hover:bg-nav-item-hover hover:text-nav-text-hover",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                isActive ? "text-nav-icon-active" : "text-nav-icon",
              )}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Sidebar fixa em desktop (≥ lg). Some abaixo desse breakpoint — ver <MobileSidebar>. */
export function Sidebar() {
  return (
    // `sticky top-0` + `h-screen`: a sidebar acompanha a rolagem da página em vez de subir
    // junto com ela. Sem isso, numa tela longa (histórico, listagem cheia) o rodapé da
    // navegação — incluindo a saída — só reaparecia depois de rolar tudo de volta.
    <aside className="bg-nav-background border-nav-border hidden w-64 shrink-0 border-r lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
      <div className="border-nav-border flex h-16 shrink-0 items-center gap-3 border-b px-4">
        <ProMeiLogo size={32} />
        <span className="text-foreground text-base font-bold tracking-tight">
          Pro<span className="text-primary">Mei</span>
        </span>
      </div>
      {/* Coluna flex **dentro** da área rolável: o `mt-auto` do bloco de saída empurra ele
          para o fim da tela enquanto sobra espaço e se anula quando o menu enche — aí ele
          volta a ser o último item da lista, rolando junto em vez de virar barra fixa. */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        <SidebarNav />
        <SidebarUser />
      </div>
    </aside>
  );
}

/** Drawer de navegação para mobile/tablet (< lg), acionado pelo botão de menu do header. */
export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;

    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-40 lg:hidden",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
      aria-hidden={!open}
    >
      <div
        onClick={onClose}
        className={cn(
          "bg-overlay absolute inset-0 transition-opacity",
          open ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navegação principal"
        className={cn(
          "bg-nav-background absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col shadow-xl transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="border-nav-border flex h-16 shrink-0 items-center justify-between border-b px-4">
          <div className="flex items-center gap-3">
            <ProMeiLogo size={32} />
            <span className="text-foreground text-base font-bold tracking-tight">
              Pro<span className="text-primary">Mei</span>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar navegação"
            className="text-text-secondary hover:bg-surface-hover hover:text-foreground flex h-9 w-9 items-center justify-center rounded-md transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto">
          <SidebarNav onNavigate={onClose} />
          <SidebarUser onNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}
