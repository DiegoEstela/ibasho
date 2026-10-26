"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { DEFAULT_TAB_HREFS, navModules, TAB_COUNT, type NavItem } from "./items";

const KEY = "ibasho.barra";

// Los módulos elegidos para la barra inferior se recuerdan en este dispositivo; sin almacenamiento, solo mientras dure la sesión.
const listeners = new Set<() => void>();
let inMemory: string | null = null;

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getRaw(): string {
  if (inMemory !== null) return inMemory;
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function save(hrefs: string[] | null) {
  inMemory = hrefs ? JSON.stringify(hrefs) : "";
  try {
    if (hrefs) localStorage.setItem(KEY, inMemory);
    else localStorage.removeItem(KEY);
  } catch {
    // Ignorar: la elección es una comodidad del dispositivo.
  }
  listeners.forEach((listener) => listener());
}

/** Lee lo guardado y lo valida: solo módulos que existen, sin repetir y en la cantidad exacta. */
function parse(raw: string): string[] {
  try {
    const list = JSON.parse(raw);
    const valid = new Set(navModules.filter((m) => m.available).map((m) => m.href));
    if (Array.isArray(list) && list.length === TAB_COUNT && new Set(list).size === TAB_COUNT && list.every((h) => valid.has(h))) return list;
  } catch {
    // Se usan los de siempre.
  }
  return DEFAULT_TAB_HREFS;
}

/** Los módulos de la barra inferior (en el orden elegido) y los que quedan en «Más». */
export function useTabPrefs() {
  const raw = useSyncExternalStore(subscribe, getRaw, () => "");
  const hrefs = useMemo(() => parse(raw), [raw]);

  const tabs = useMemo(() => hrefs.map((h) => navModules.find((m) => m.href === h)).filter((m): m is NavItem => !!m), [hrefs]);
  const more = useMemo(() => navModules.filter((m) => !hrefs.includes(m.href)), [hrefs]);

  const setTabs = useCallback((next: string[]) => save(next), []);
  const reset = useCallback(() => save(null), []);

  return { hrefs, tabs, more, setTabs, reset, isDefault: hrefs.join() === DEFAULT_TAB_HREFS.join() };
}
