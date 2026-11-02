"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { signedUrls } from "@/lib/viajes/storage";

/**
 * Enlaces ya listos para abrir facturas. Con un enlace real (<a target="_blank">) el móvil no bloquea la ventana,
 * cosa que sí pasa si se abre desde código después de esperar al servidor.
 */
export function useFileUrls(paths: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = [...new Set(paths.filter(Boolean))].sort().join("|");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    signedUrls(createClient(), key.split("|")).then((next) => {
      if (!cancelled) setUrls(next);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return urls;
}
