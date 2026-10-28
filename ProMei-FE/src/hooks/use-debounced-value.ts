"use client";

import { useEffect, useState } from "react";

/**
 * Valor que só acompanha o original depois de `delayMs` sem mudança.
 *
 * Usado para não transformar cada tecla digitada numa requisição — a consulta sai quando
 * a pessoa para de digitar, não enquanto digita.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
