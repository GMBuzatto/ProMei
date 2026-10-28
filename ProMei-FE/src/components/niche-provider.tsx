"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_NICHE, isNicheKey, NICHE_STORAGE_KEY, type NicheKey } from "@/lib/niches";

type NicheContextValue = {
  niche: NicheKey;
  setNiche: (niche: NicheKey) => void;
};

const NicheContext = createContext<NicheContextValue | undefined>(undefined);

/**
 * Fonte do nicho ativo. Hoje: escolha manual persistida em localStorage, só para
 * validar a troca de paleta sem rebuild (ver docs/styles/temas/README.md).
 * Futuro: inicializar a partir do segmento/categoria da empresa autenticada,
 * assim que a API expuser esse campo.
 */
export function NicheProvider({ children }: { children: ReactNode }) {
  const [niche, setNicheState] = useState<NicheKey>(DEFAULT_NICHE);

  useEffect(() => {
    const stored = window.localStorage.getItem(NICHE_STORAGE_KEY);
    if (isNicheKey(stored)) setNicheState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.niche = niche;
  }, [niche]);

  const setNiche = useCallback((next: NicheKey) => {
    setNicheState(next);
    window.localStorage.setItem(NICHE_STORAGE_KEY, next);
  }, []);

  const value = useMemo(() => ({ niche, setNiche }), [niche, setNiche]);

  return <NicheContext.Provider value={value}>{children}</NicheContext.Provider>;
}

export function useNiche() {
  const context = useContext(NicheContext);
  if (!context) {
    throw new Error("useNiche precisa ser usado dentro de <NicheProvider>");
  }
  return context;
}
