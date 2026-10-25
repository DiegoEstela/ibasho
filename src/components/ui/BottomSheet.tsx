"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
};

/** Hoja modal estilo iOS: sube desde abajo en el teléfono y se centra en escritorio. */
export function BottomSheet({ open, onClose, title, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button
        aria-label="Cerrar"
        onClick={onClose}
        className="sheet-backdrop absolute inset-0 bg-ink/40"
      />
      <div className="sheet-panel relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:p-5 shadow-xl lg:rounded-3xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ink-soft/30 lg:hidden" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-11 items-center justify-center rounded-full text-ink-soft"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
